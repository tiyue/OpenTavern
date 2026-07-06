// ==================== SillyTavern Preset UI ====================
function defaultSillyTavernPreset() {
    return { name: '', importedAt: '', prompts: [], promptOrder: [] };
}

function ensureSillyTavernPresetSettings() {
    if (!state.settings) state.settings = defaultSettings();
    if (typeof state.settings.twoStageEnabled !== 'boolean') state.settings.twoStageEnabled = false;
    if (typeof state.settings.twoStageTemperature !== 'number') state.settings.twoStageTemperature = 0.3;
    if (typeof state.settings.twoStageTopP !== 'number') state.settings.twoStageTopP = 0.85;
    if (typeof state.settings.twoStageIncludeRecentContext !== 'boolean') state.settings.twoStageIncludeRecentContext = false;
    if (!state.settings.twoStageSystemPrompt) state.settings.twoStageSystemPrompt = DEFAULT_TWO_STAGE_PROMPT;
    if (typeof state.settings.requestCotEnabled !== 'boolean') state.settings.requestCotEnabled = false;
    if (typeof state.settings.showCotEnabled !== 'boolean') state.settings.showCotEnabled = true;
    if (typeof state.settings.ollamaCompatMode !== 'boolean') state.settings.ollamaCompatMode = false;
    if (typeof state.settings.postHistoryInstructions !== 'string') state.settings.postHistoryInstructions = '';
    if (typeof state.settings.twoStagePostHistoryInstructions !== 'string') state.settings.twoStagePostHistoryInstructions = '';
    if (typeof state.settings.summaryPrompt !== 'string') state.settings.summaryPrompt = '';
    if (!state.settings.sillyTavernPreset || typeof state.settings.sillyTavernPreset !== 'object') {
        state.settings.sillyTavernPreset = defaultSillyTavernPreset();
    }
    var preset = state.settings.sillyTavernPreset;
    if (!Array.isArray(preset.prompts)) preset.prompts = [];
    if (!Array.isArray(preset.promptOrder)) preset.promptOrder = [];
    preset.name = String(preset.name || '');
    preset.importedAt = String(preset.importedAt || '');
    preset.promptOrder = preset.promptOrder.map(function(item, idx) {
        item = item || {};
        return {
            identifier: String(item.identifier || item.id || item.name || ''),
            enabled: item.enabled !== false,
            order: typeof item.order === 'number' ? item.order : idx,
            role: item.role != null ? String(item.role) : '',
            position: item.position != null ? item.position : item.injection_position,
            depth: item.depth != null ? item.depth : item.injection_depth
        };
    }).filter(function(item) { return item.identifier; });
    preset.prompts = preset.prompts.map(function(p, idx) {
        p = p || {};
        var id = String(p.id || p.identifier || p.name || ('prompt_' + idx));
        return {
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
        };
    }).filter(function(p) { return p.content.trim(); });
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

function getSillyTavernPromptOrderItems(promptOrder) {
    var items = [];
    function addOrderArray(arr) {
        if (!Array.isArray(arr)) return;
        arr.forEach(function(item, idx) {
            if (typeof item === 'string') {
                items.push({ identifier: item, enabled: true, order: idx });
            } else if (item && typeof item === 'object') {
                items.push({
                    identifier: item.identifier || item.id || item.name || '',
                    enabled: item.enabled !== false,
                    order: typeof item.order === 'number' ? item.order : idx,
                    role: item.role != null ? item.role : '',
                    position: item.position != null ? item.position : item.injection_position,
                    depth: item.depth != null ? item.depth : item.injection_depth
                });
            }
        });
    }

    if (Array.isArray(promptOrder)) {
        promptOrder.forEach(function(group) {
            if (group && Array.isArray(group.order)) addOrderArray(group.order);
            else addOrderArray([group]);
        });
    } else if (promptOrder && typeof promptOrder === 'object') {
        if (Array.isArray(promptOrder.order)) addOrderArray(promptOrder.order);
        Object.keys(promptOrder).forEach(function(key, idx) {
            var value = promptOrder[key];
            if (key === 'order') return;
            if (value && typeof value === 'object' && !Array.isArray(value)) {
                items.push({
                    identifier: value.identifier || key,
                    enabled: value.enabled !== false,
                    order: typeof value.order === 'number' ? value.order : idx,
                    role: value.role != null ? value.role : '',
                    position: value.position != null ? value.position : value.injection_position,
                    depth: value.depth != null ? value.depth : value.injection_depth
                });
            } else if (typeof value === 'boolean') {
                items.push({ identifier: key, enabled: value, order: idx });
            }
        });
    }
    return items;
}

function normalizeSillyTavernPreset(raw) {
    if (!raw || typeof raw !== 'object') throw new Error(t('settings_st_preset_import_error'));
    var src = raw.data && Array.isArray(raw.data.prompts) ? raw.data : raw;
    var promptRows = Array.isArray(src.prompts) ? src.prompts.slice() : [];

    if (promptRows.length === 0) {
        ['main_prompt', 'nsfw_prompt', 'jailbreak_prompt', 'impersonation_prompt', 'new_chat_prompt', 'new_group_chat_prompt'].forEach(function(key) {
            if (typeof src[key] === 'string' && src[key].trim()) {
                promptRows.push({ identifier: key, name: key.replace(/_/g, ' '), role: 'system', content: src[key] });
            }
        });
    }

    var orderItems = getSillyTavernPromptOrderItems(src.prompt_order);
    var orderMap = {};
    orderItems.forEach(function(item, idx) {
        var id = String(item.identifier || '');
        if (!id) return;
        orderMap[id] = {
            enabled: item.enabled !== false,
            order: typeof item.order === 'number' ? item.order : idx,
            role: item.role,
            position: item.position,
            depth: item.depth
        };
        orderMap[id.toLowerCase()] = orderMap[id];
    });

    var usedIds = {};
    var prompts = promptRows.map(function(p, idx) {
        p = p || {};
        var baseId = String(p.identifier || p.id || p.name || ('prompt_' + idx));
        var id = baseId;
        if (usedIds[id]) id = id + '_' + idx;
        usedIds[id] = true;
        var content = p.content != null ? p.content : (p.prompt != null ? p.prompt : (p.text != null ? p.text : p.value));
        content = String(content || '');
        var ordered = orderMap[baseId] || orderMap[id] || orderMap[baseId.toLowerCase()] || orderMap[id.toLowerCase()];
        return {
            id: id,
            identifier: String(p.identifier || id),
            name: String(p.name || p.identifier || id),
            role: normalizePromptRole(p.role || (ordered && ordered.role) || 'system'),
            content: content,
            enabled: ordered ? ordered.enabled : p.enabled !== false,
            order: ordered ? ordered.order : idx,
            position: p.position != null ? p.position : (p.injection_position != null ? p.injection_position : (ordered ? ordered.position : undefined)),
            depth: p.depth != null ? p.depth : (p.injection_depth != null ? p.injection_depth : (ordered ? ordered.depth : undefined)),
            injection_position: p.injection_position != null ? p.injection_position : (ordered ? ordered.position : undefined),
            injection_depth: p.injection_depth != null ? p.injection_depth : (ordered ? ordered.depth : undefined)
        };
    }).filter(function(p) { return p.content.trim(); });

    prompts.sort(function(a, b) { return (a.order || 0) - (b.order || 0); });
    if (prompts.length === 0) throw new Error(t('settings_st_preset_import_error'));

    return {
        name: String(src.name || src.preset_name || raw.name || 'SillyTavern Preset'),
        importedAt: new Date().toISOString(),
        promptOrder: orderItems.map(function(item, idx) {
            return {
                identifier: String(item.identifier || ''),
                enabled: item.enabled !== false,
                order: typeof item.order === 'number' ? item.order : idx,
                role: item.role != null ? String(item.role) : '',
                position: item.position,
                depth: item.depth
            };
        }).filter(function(item) { return item.identifier; }),
        prompts: prompts.map(function(p, idx) {
            p.order = idx;
            return p;
        })
    };
}
