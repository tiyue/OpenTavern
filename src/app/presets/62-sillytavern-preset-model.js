/**
 * 新手导读（文件：62-sillytavern-preset-model.js）
 *
 * 负责什么：这是“SillyTavern 预设”中的“SillyTavern、预设、数据模型”部分。
 * 在程序中的位置：它导入、规范化、排序并运行 SillyTavern 格式的提示词预设。
 * 从哪里开始看：主要从 `defaultSillyTavernPreset(无参数)`、`ensureSillyTavernPresetSettings(无参数)`、`normalizePromptRole(role)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：预设顺序与启用状态决定最终提示词，未知字段应尽量保留以便再次导出。
 */
// ==================== SillyTavern Preset Model ====================
function defaultSillyTavernPreset() {
    return {
        name: '',
        importedAt: '',
        prompts: [],
        promptOrder: [],
        regexScripts: [],
        regexScriptsEnabled: false,
        regexScriptsPrompted: false
    };
}

function ensureSillyTavernPresetSettings() {
    if (!state.settings) state.settings = defaultSettings();
    if (typeof ensurePresetLibrary === 'function') ensurePresetLibrary(state.settings);
    if (typeof state.settings.twoStageEnabled !== 'boolean') state.settings.twoStageEnabled = false;
    if (typeof state.settings.twoStageTemperature !== 'number') state.settings.twoStageTemperature = 0.3;
    if (typeof state.settings.twoStageTopP !== 'number') state.settings.twoStageTopP = 0.85;
    if (typeof state.settings.twoStageIncludeRecentContext !== 'boolean') state.settings.twoStageIncludeRecentContext = false;
    if (!state.settings.twoStageSystemPrompt) state.settings.twoStageSystemPrompt = DEFAULT_TWO_STAGE_PROMPT;
    if (typeof state.settings.requestCotEnabled !== 'boolean') state.settings.requestCotEnabled = false;
    if (typeof state.settings.showCotEnabled !== 'boolean') state.settings.showCotEnabled = true;
    if (typeof state.settings.postHistoryInstructions !== 'string') state.settings.postHistoryInstructions = '';
    if (typeof state.settings.twoStagePostHistoryInstructions !== 'string') state.settings.twoStagePostHistoryInstructions = '';
    if (typeof state.settings.summaryPrompt !== 'string') state.settings.summaryPrompt = '';
    if (!state.settings.sillyTavernPreset || typeof state.settings.sillyTavernPreset !== 'object') {
        state.settings.sillyTavernPreset = defaultSillyTavernPreset();
    }
    var preset = state.settings.sillyTavernPreset;
    if (!Array.isArray(preset.prompts)) preset.prompts = [];
    if (!Array.isArray(preset.promptOrder)) preset.promptOrder = [];
    if (!Array.isArray(preset.regexScripts)) preset.regexScripts = [];
    preset.regexScripts = preset.regexScripts.filter(function(script) {
        return script && typeof script === 'object' && !Array.isArray(script);
    });
    if (typeof preset.regexScriptsEnabled !== 'boolean') preset.regexScriptsEnabled = false;
    if (typeof preset.regexScriptsPrompted !== 'boolean') preset.regexScriptsPrompted = false;
    preset.name = String(preset.name || '');
    preset.importedAt = String(preset.importedAt || '');
    preset.promptOrder = preset.promptOrder.map(function(item, idx) {
        item = item || {};
        return Object.assign({}, item, {
            identifier: String(item.identifier || item.id || item.name || ''),
            enabled: item.enabled !== false,
            order: typeof item.order === 'number' ? item.order : idx,
            role: item.role != null ? String(item.role) : '',
            position: item.position != null ? item.position : item.injection_position,
            depth: item.depth != null ? item.depth : item.injection_depth
        });
    }).filter(function(item) { return item.identifier; });
    preset.prompts = preset.prompts.map(function(p, idx) {
        p = p || {};
        var id = String(p.id || p.identifier || p.name || ('prompt_' + idx));
        return Object.assign({}, p, {
            id: id,
            identifier: String(p.identifier || id),
            name: String(p.name || p.identifier || id),
            role: normalizePromptRole(p.role || 'system'),
            content: String(p.content || ''),
            enabled: p.enabled !== false,
            order: typeof p.order === 'number' ? p.order : idx,
            position: p.position != null ? p.position : p.injection_position,
            depth: p.depth != null ? p.depth : p.injection_depth,
            injection_position: p.injection_position != null ? p.injection_position : p.position,
            injection_depth: p.injection_depth != null ? p.injection_depth : p.depth
        });
    });
    return preset;
}

function normalizePromptRole(role) {
    var r = String(role || 'system').toLowerCase().trim();
    if (r === '0') return 'system';
    if (r === '1') return 'user';
    if (r === '2') return 'assistant';
    if (r === 'user' || r === 'assistant' || r === 'system') return r;
    return 'system';
}
