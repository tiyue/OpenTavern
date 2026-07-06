// ==================== SillyTavern Preset Model ====================
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
