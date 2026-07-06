// ==================== Settings Integration Hydration ====================
function hydrateSillyTavernPresetSettings() {
    ensureSillyTavernPresetSettings();
    renderSillyTavernPresetSettings();
}

function hydrateComfySettingsControls() {
    ensureComfySettings();
    if (dom.comfyEnabled) dom.comfyEnabled.checked = !!state.settings.comfyEnabled;
    if (dom.comfyServer) dom.comfyServer.value = state.settings.comfyServer || 'http://127.0.0.1:8188';
    if (dom.comfyPositiveNodeId) dom.comfyPositiveNodeId.value = state.settings.comfyPositiveNodeId || '';
    if (dom.comfyNegativeNodeId) dom.comfyNegativeNodeId.value = state.settings.comfyNegativeNodeId || '';
    if (dom.comfySeedNodeId) dom.comfySeedNodeId.value = state.settings.comfySeedNodeId || '';
    if (dom.comfyNegativePrompt) dom.comfyNegativePrompt.value = state.settings.comfyNegativePrompt || '';
    if (dom.comfyPromptTemplate) dom.comfyPromptTemplate.value = state.settings.comfyPromptTemplate || '';
    updateComfyWorkflowStatus();
}
