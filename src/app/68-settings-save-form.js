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

function readSummarySettingsFromForm() {
    ensureSillyTavernPresetSettings();
    state.settings.summaryEnabled = dom.summaryEnabled.checked;
    if (dom.summaryThreshold) state.settings.summaryThreshold = parseInt(dom.summaryThreshold.value) || 12;
    if (dom.summaryMaxWords) state.settings.summaryMaxWords = parseInt(dom.summaryMaxWords.value) || 0;
    if (dom.summaryPrompt) state.settings.summaryPrompt = dom.summaryPrompt.value.trim();
}

function readWorldInfoBudgetSettingsFromForm() {
    state.settings.worldInfoBudgetEnabled = dom.worldInfoBudgetEnabled.checked;
    state.settings.worldInfoBudget = parseInt(dom.worldInfoBudget.value) || 2048;
}

function readUiBehaviorSettingsFromForm() {
    state.settings.uiTheme = dom.uiTheme ? (dom.uiTheme.value || 'new-light') : 'new-light';
    state.settings.uiTheme = typeof normalizeUiTheme === 'function' ? normalizeUiTheme(state.settings.uiTheme) : state.settings.uiTheme;
    if (typeof cacheUiTheme === 'function') cacheUiTheme(state.settings.uiTheme);
    state.settings.lowPowerMode = dom.lowPowerMode ? !!dom.lowPowerMode.checked : false;
}

function readSummarizationApiSettingsFromForm() {
    state.settings.summarizeUseMainAPI = dom.summarizeUseMainAPI.checked;
    state.settings.summarizeApiEndpoint = dom.summarizeApiEndpoint.value.trim();
    state.settings.summarizeApiKey = dom.summarizeApiKey.value.trim();
    state.settings.summarizeModel = dom.summarizeModel.value.trim() || 'deepseek-v4-flash';
}

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

function readWebLLMSettingsFromForm() {
    var backendSel = document.getElementById('inferenceBackend');
    var webllmSel = document.getElementById('webllmModel');
    if (backendSel) state.settings.inferenceBackend = backendSel.value || 'remote-api';
    if (webllmSel) state.settings.webllmModel = webllmSel.value || 'Llama-3.2-1B-Instruct-q4f16_1-MLC';
}

function readSettingsFormIntoState() {
    readMainSettingsFromForm();
    readSummarySettingsFromForm();
    readWorldInfoBudgetSettingsFromForm();
    readUiBehaviorSettingsFromForm();
    readSummarizationApiSettingsFromForm();
    readComfySettingsFromForm();
    readCloudSyncSettingsFromForm();
    readWebLLMSettingsFromForm();
}
