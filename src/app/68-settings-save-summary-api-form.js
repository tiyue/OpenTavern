// ==================== Settings Save Summarization API Form ====================
function readSummarizationApiSettingsFromForm() {
    state.settings.summarizeUseMainAPI = readCheckboxControlValue(dom.summarizeUseMainAPI, false);
    state.settings.summarizeApiEndpoint = readTrimmedControlValue(dom.summarizeApiEndpoint);
    state.settings.summarizeApiKey = readTrimmedControlValue(dom.summarizeApiKey);
    state.settings.summarizeModel = readTrimmedControlValueOr(dom.summarizeModel, 'deepseek-v4-flash');
}
