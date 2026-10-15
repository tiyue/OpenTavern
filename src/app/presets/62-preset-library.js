// A selected library entry remains the legacy preset object used by consumers.
function ensurePresetLibrary(settings) {
    settings = settings || state.settings;
    if (!Array.isArray(settings.presetLibrary)) {
        var legacy = settings.sillyTavernPreset || defaultSillyTavernPreset();
        settings.presetLibrary = [Object.assign({}, legacy, { id: 'legacy-preset', name: legacy.name || '默认预设' })];
        settings.activePresetId = 'legacy-preset';
    }
    settings.presetLibrary = settings.presetLibrary.filter(function(preset) { return preset && typeof preset === 'object' && !Array.isArray(preset); });
    var used = new Set();
    settings.presetLibrary.forEach(function(preset, index) {
        if (!preset.id || used.has(preset.id)) preset.id = 'preset-' + index;
        used.add(preset.id);
        if (!Array.isArray(preset.prompts)) preset.prompts = [];
        if (!Array.isArray(preset.promptOrder)) preset.promptOrder = [];
        if (!Array.isArray(preset.regexScripts)) preset.regexScripts = [];
    });
    if (!settings.presetLibrary.length) settings.presetLibrary.push(Object.assign(defaultSillyTavernPreset(), { id: 'default-preset', name: '默认预设' }));
    var selected = settings.presetLibrary.find(function(preset) { return preset.id === settings.activePresetId; }) || settings.presetLibrary[0];
    settings.activePresetId = selected.id;
    settings.sillyTavernPreset = selected;
    return settings.presetLibrary;
}

function selectLibraryPreset(id) {
    var settings = state.settings;
    var preset = ensurePresetLibrary(settings).find(function(item) { return item.id === id; });
    if (!preset) throw new Error('预设不存在');
    settings.activePresetId = id;
    settings.sillyTavernPreset = preset;
    persistState(true);
    renderSillyTavernPresetSettings();
    renderTokenBar();
    appStore.notify('settings');
}

function addLibraryPreset(preset) {
    var library = ensurePresetLibrary();
    preset.id = makeId();
    library.push(preset);
    selectLibraryPreset(preset.id);
    return preset;
}

function removeLibraryPreset(id) {
    var library = ensurePresetLibrary();
    state.settings.presetLibrary = library.filter(function(item) { return item.id !== id; });
    ensurePresetLibrary();
    selectLibraryPreset(state.settings.activePresetId);
}

function validatePresetPrompt(prompt) {
    if (!prompt || !String(prompt.name || '').trim()) throw new Error('条目名称不能为空');
    if (!['system', 'user', 'assistant'].includes(prompt.role)) throw new Error('消息角色无效');
    if (!['before_history', 'after_history', 'in_chat'].includes(prompt.position)) throw new Error('注入位置无效');
    if (!Number.isInteger(prompt.depth) || prompt.depth < 0 || prompt.depth > 1000) throw new Error('深度须为 0–1000 的整数');
    if (String(prompt.content || '').length > 500000) throw new Error('条目正文过长');
    return prompt;
}

function importPresetLibraryData(raw) {
    if (!raw || raw.type !== 'opentavern-preset-library' || !Array.isArray(raw.presets) || raw.presets.length > 200) throw new Error('预设库格式无效');
    var activeId;
    var presets = raw.presets.map(function(item) {
        if (!item || typeof item !== 'object' || !Array.isArray(item.prompts) || !Array.isArray(item.regexScripts)) throw new Error('预设格式无效');
        var copy = JSON.parse(JSON.stringify(item));
        copy.id = makeId();
        if (item.id === raw.activePresetId) activeId = copy.id;
        copy.regexScriptsEnabled = false;
        copy.regexScriptsPrompted = false;
        copy.regexScripts.forEach(validateRegexScript);
        copy.prompts.forEach(function(prompt) {
            if (!isCardRuntimeRecord(prompt) || typeof prompt.content !== 'string') throw new Error('预设条目格式无效');
            validatePresetPrompt(Object.assign({}, prompt, { position: getSillyTavernPresetPlacement(prompt, 'before_history'), depth: parseSillyTavernDepth(prompt) }));
        });
        return copy;
    });
    Object.defineProperty(presets, 'activePresetId', { value: activeId || (presets[0] && presets[0].id) });
    return presets;
}

function getLibraryPromptOrder(preset) {
    var prompts = preset.prompts.slice().sort(function(a, b) { return (a.order || 0) - (b.order || 0); });
    var result = [];
    preset.promptOrder.slice().sort(function(a, b) { return (a.order || 0) - (b.order || 0); }).forEach(function(item) {
        var prompt = prompts.find(function(p) { return (p.identifier || p.id) === item.identifier; });
        if (prompt && result.indexOf(prompt) < 0) result.push(prompt);
    });
    return result.concat(prompts.filter(function(prompt) { return result.indexOf(prompt) < 0; }));
}

function moveLibraryPrompt(preset, prompt, direction) {
    var prompts = getLibraryPromptOrder(preset);
    var from = prompts.indexOf(prompt), to = from + direction;
    if (from < 0 || to < 0 || to >= prompts.length) return;
    var ordered = preset.promptOrder.slice().sort(function(a, b) { return (a.order || 0) - (b.order || 0); });
    prompts.forEach(function(p) {
        if (!ordered.some(function(item) { return item.identifier === (p.identifier || p.id); })) ordered.push({ identifier: p.identifier || p.id, enabled: p.enabled !== false });
    });
    var a = ordered.findIndex(function(item) { return item.identifier === (prompt.identifier || prompt.id); });
    var b = ordered.findIndex(function(item) { return item.identifier === (prompts[to].identifier || prompts[to].id); });
    var moved = ordered[a]; ordered[a] = ordered[b]; ordered[b] = moved;
    ordered.forEach(function(item, index) { item.order = index; });
    preset.promptOrder = ordered;
    getLibraryPromptOrder(preset).forEach(function(p, index) { p.order = index; });
}
