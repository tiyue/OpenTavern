// ==================== Settings Integration Hydration ====================
function hydrateSillyTavernPresetSettings() {
    ensureSillyTavernPresetSettings();
    renderSillyTavernPresetSettings();
}

function hydrateComfySettingsControls() {
    ensureComfySettings();
    hydrateCheckboxControl(dom.comfyEnabled, state.settings.comfyEnabled);
    hydrateValueControl(dom.comfyServer, state.settings.comfyServer || 'http://127.0.0.1:8188');
    hydrateValueControl(dom.comfyPositiveNodeId, state.settings.comfyPositiveNodeId || '');
    hydrateValueControl(dom.comfyNegativeNodeId, state.settings.comfyNegativeNodeId || '');
    hydrateValueControl(dom.comfySeedNodeId, state.settings.comfySeedNodeId || '');
    hydrateValueControl(dom.comfyNegativePrompt, state.settings.comfyNegativePrompt || '');
    hydrateValueControl(dom.comfyPromptTemplate, state.settings.comfyPromptTemplate || '');
    updateComfyWorkflowStatus();
}
