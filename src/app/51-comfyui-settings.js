// ==================== ComfyUI Settings ====================
function ensureComfySettings() {
    if (!state.settings) state.settings = defaultSettings();
    var defs = defaultSettings();
    [
        'comfyEnabled',
        'comfyServer',
        'comfyWorkflow',
        'comfyWorkflowName',
        'comfyPositiveNodeId',
        'comfyNegativeNodeId',
        'comfySeedNodeId',
        'comfyNegativePrompt',
        'comfyPromptTemplate'
    ].forEach(function(key) {
        if (state.settings[key] === undefined || state.settings[key] === null) {
            state.settings[key] = defs[key];
        }
    });
    state.settings.comfyServer = String(state.settings.comfyServer || defs.comfyServer);
    state.settings.comfyWorkflowName = String(state.settings.comfyWorkflowName || '');
    state.settings.comfyPositiveNodeId = String(state.settings.comfyPositiveNodeId || '');
    state.settings.comfyNegativeNodeId = String(state.settings.comfyNegativeNodeId || '');
    state.settings.comfySeedNodeId = String(state.settings.comfySeedNodeId || '');
    state.settings.comfyNegativePrompt = String(state.settings.comfyNegativePrompt || '');
    state.settings.comfyPromptTemplate = String(state.settings.comfyPromptTemplate || defs.comfyPromptTemplate);
    return state.settings;
}

function normalizeComfyServer(url) {
    url = String(url || '').trim() || 'http://127.0.0.1:8188';
    return url.replace(/\/+$/, '');
}
