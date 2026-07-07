// ==================== Settings Save Summarization API Form ====================
function readSummarizationApiSettingsFromForm() {
    state.settings.summarizeUseMainAPI = dom.summarizeUseMainAPI.checked;
    state.settings.summarizeApiEndpoint = dom.summarizeApiEndpoint.value.trim();
    state.settings.summarizeApiKey = dom.summarizeApiKey.value.trim();
    state.settings.summarizeModel = dom.summarizeModel.value.trim() || 'deepseek-v4-flash';
}
