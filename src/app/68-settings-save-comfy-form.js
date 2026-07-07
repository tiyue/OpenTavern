// ==================== Settings Save ComfyUI Form ====================
function readComfySettingsFromForm() {
    ensureComfySettings();
    if (dom.comfyEnabled) state.settings.comfyEnabled = !!dom.comfyEnabled.checked;
    if (dom.comfyServer) state.settings.comfyServer = normalizeComfyServer(dom.comfyServer.value);
    if (dom.comfyPositiveNodeId) state.settings.comfyPositiveNodeId = dom.comfyPositiveNodeId.value.trim();
    if (dom.comfyNegativeNodeId) state.settings.comfyNegativeNodeId = dom.comfyNegativeNodeId.value.trim();
    if (dom.comfySeedNodeId) state.settings.comfySeedNodeId = dom.comfySeedNodeId.value.trim();
    if (dom.comfyNegativePrompt) state.settings.comfyNegativePrompt = dom.comfyNegativePrompt.value.trim();
    if (dom.comfyPromptTemplate) state.settings.comfyPromptTemplate = dom.comfyPromptTemplate.value.trim() || defaultSettings().comfyPromptTemplate;
}
