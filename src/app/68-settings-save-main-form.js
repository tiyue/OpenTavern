// ==================== Settings Save Main Form ====================
function readMainSettingsFromForm() {
    state.settings.apiEndpoint = dom.apiEndpoint.value.trim();
    state.settings.apiKey = dom.apiKey.value.trim();
    state.settings.saveApiKey = dom.saveApiKey ? !!dom.saveApiKey.checked : false;
    state.settings.ollamaCompatMode = dom.ollamaCompatMode ? !!dom.ollamaCompatMode.checked : false;
    state.settings.model = dom.modelName.value.trim() || 'gpt-4o';
    state.settings.contextLength = parseInt(dom.contextLength.value) || 20;
    state.settings.maxTokens = parseInt(dom.maxTokens.value) || 1024;
    state.settings.temperature = parseFloat(dom.temperature.value) || 0.7;
    state.settings.topP = parseFloat(dom.topP.value) || 0.9;
    state.settings.userName = dom.userName.value.trim() || 'User';
    state.settings.systemPrompt = dom.systemPrompt.value.trim();
    if (dom.postHistoryInstructions) state.settings.postHistoryInstructions = dom.postHistoryInstructions.value.trim();
    if (dom.twoStageEnabled) state.settings.twoStageEnabled = !!dom.twoStageEnabled.checked;
    if (dom.twoStageTemperature) state.settings.twoStageTemperature = Number.isFinite(parseFloat(dom.twoStageTemperature.value)) ? parseFloat(dom.twoStageTemperature.value) : 0.3;
    if (dom.twoStageTopP) state.settings.twoStageTopP = Number.isFinite(parseFloat(dom.twoStageTopP.value)) ? parseFloat(dom.twoStageTopP.value) : 0.85;
    if (dom.twoStageIncludeRecentContext) state.settings.twoStageIncludeRecentContext = !!dom.twoStageIncludeRecentContext.checked;
    if (dom.twoStageSystemPrompt) state.settings.twoStageSystemPrompt = dom.twoStageSystemPrompt.value.trim() || DEFAULT_TWO_STAGE_PROMPT;
    if (dom.twoStagePostHistoryInstructions) state.settings.twoStagePostHistoryInstructions = dom.twoStagePostHistoryInstructions.value.trim();
    if (dom.requestCotEnabled) state.settings.requestCotEnabled = !!dom.requestCotEnabled.checked;
    if (dom.showCotEnabled) state.settings.showCotEnabled = !!dom.showCotEnabled.checked;
    if (dom.userDescription) state.settings.userDescription = dom.userDescription.value.trim();
}
