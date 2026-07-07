// ==================== Settings Save Main Form ====================
function readMainSettingsFromForm() {
    state.settings.apiEndpoint = readTrimmedControlValue(dom.apiEndpoint);
    state.settings.apiKey = readTrimmedControlValue(dom.apiKey);
    state.settings.saveApiKey = readCheckboxControlValue(dom.saveApiKey, false);
    state.settings.ollamaCompatMode = readCheckboxControlValue(dom.ollamaCompatMode, false);
    state.settings.model = readTrimmedControlValueOr(dom.modelName, 'gpt-4o');
    state.settings.contextLength = readIntegerControlValue(dom.contextLength, 20);
    state.settings.maxTokens = readIntegerControlValue(dom.maxTokens, 1024);
    state.settings.temperature = readFloatControlValue(dom.temperature, 0.7);
    state.settings.topP = readFloatControlValue(dom.topP, 0.9);
    state.settings.userName = readTrimmedControlValueOr(dom.userName, 'User');
    state.settings.systemPrompt = readTrimmedControlValue(dom.systemPrompt);
    if (dom.postHistoryInstructions) state.settings.postHistoryInstructions = readTrimmedControlValue(dom.postHistoryInstructions);
    if (dom.twoStageEnabled) state.settings.twoStageEnabled = readCheckboxControlValue(dom.twoStageEnabled, false);
    if (dom.twoStageTemperature) state.settings.twoStageTemperature = readFiniteFloatControlValue(dom.twoStageTemperature, 0.3);
    if (dom.twoStageTopP) state.settings.twoStageTopP = readFiniteFloatControlValue(dom.twoStageTopP, 0.85);
    if (dom.twoStageIncludeRecentContext) state.settings.twoStageIncludeRecentContext = readCheckboxControlValue(dom.twoStageIncludeRecentContext, false);
    if (dom.twoStageSystemPrompt) state.settings.twoStageSystemPrompt = readTrimmedControlValueOr(dom.twoStageSystemPrompt, DEFAULT_TWO_STAGE_PROMPT);
    if (dom.twoStagePostHistoryInstructions) state.settings.twoStagePostHistoryInstructions = readTrimmedControlValue(dom.twoStagePostHistoryInstructions);
    if (dom.requestCotEnabled) state.settings.requestCotEnabled = readCheckboxControlValue(dom.requestCotEnabled, false);
    if (dom.showCotEnabled) state.settings.showCotEnabled = readCheckboxControlValue(dom.showCotEnabled, false);
    if (dom.userDescription) state.settings.userDescription = readTrimmedControlValue(dom.userDescription);
}
