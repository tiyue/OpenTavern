// ==================== Settings Save ComfyUI Form ====================
function readComfySettingsFromForm() {
    ensureComfySettings();
    if (dom.comfyEnabled) state.settings.comfyEnabled = readCheckboxControlValue(dom.comfyEnabled, false);
    if (dom.comfyServer) state.settings.comfyServer = normalizeComfyServer(readControlValue(dom.comfyServer));
    if (dom.comfyPositiveNodeId) state.settings.comfyPositiveNodeId = readTrimmedControlValue(dom.comfyPositiveNodeId);
    if (dom.comfyNegativeNodeId) state.settings.comfyNegativeNodeId = readTrimmedControlValue(dom.comfyNegativeNodeId);
    if (dom.comfySeedNodeId) state.settings.comfySeedNodeId = readTrimmedControlValue(dom.comfySeedNodeId);
    if (dom.comfyNegativePrompt) state.settings.comfyNegativePrompt = readTrimmedControlValue(dom.comfyNegativePrompt);
    if (dom.comfyPromptTemplate) state.settings.comfyPromptTemplate = readTrimmedControlValueOr(dom.comfyPromptTemplate, defaultSettings().comfyPromptTemplate);
}
