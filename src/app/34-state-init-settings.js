// ==================== State Initialization Settings Helpers ====================
function ensureStateSettingDefaults() {
    if (!state.settings.lang) state.settings.lang = 'zh-CN';

    if (typeof state.settings.uiTheme === 'undefined') {
        state.settings.uiTheme = 'new-light';
    }
    if (typeof normalizeUiTheme === 'function') {
        state.settings.uiTheme = normalizeUiTheme(state.settings.uiTheme);
    }
    if (typeof cacheUiTheme === 'function') {
        cacheUiTheme(state.settings.uiTheme);
    }
    if (typeof state.settings.lowPowerMode === 'undefined') {
        state.settings.lowPowerMode = false;
    }
    if (typeof state.settings.ollamaCompatMode !== 'boolean') {
        state.settings.ollamaCompatMode = false;
    }
    if (typeof state.settings.twoStageEnabled !== 'boolean') {
        state.settings.twoStageEnabled = false;
    }
    if (typeof state.settings.twoStageTemperature !== 'number') {
        state.settings.twoStageTemperature = 0.3;
    }
    if (typeof state.settings.twoStageTopP !== 'number') {
        state.settings.twoStageTopP = 0.85;
    }
    if (typeof state.settings.twoStageIncludeRecentContext !== 'boolean') {
        state.settings.twoStageIncludeRecentContext = false;
    }
    if (!state.settings.twoStageSystemPrompt) {
        state.settings.twoStageSystemPrompt = DEFAULT_TWO_STAGE_PROMPT;
    }
    if (typeof state.settings.requestCotEnabled !== 'boolean') {
        state.settings.requestCotEnabled = false;
    }
    if (typeof state.settings.showCotEnabled !== 'boolean') {
        state.settings.showCotEnabled = true;
    }
    if (typeof state.settings.postHistoryInstructions !== 'string') {
        state.settings.postHistoryInstructions = '';
    }
    if (typeof state.settings.twoStagePostHistoryInstructions !== 'string') {
        state.settings.twoStagePostHistoryInstructions = '';
    }
    if (typeof state.settings.summaryPrompt !== 'string') {
        state.settings.summaryPrompt = '';
    }
}

function applyStartupUiPreferences() {
    if (typeof applyUiTheme === 'function') {
        applyUiTheme(state.settings.uiTheme);
    }

    if (typeof applyPerformanceMode === 'function') {
        applyPerformanceMode(state.settings.lowPowerMode);
    }
}

function applyApiKeyPersistencePolicy() {
    var hadApiKey = !!(state.settings && state.settings.apiKey);
    if (typeof state.settings.saveApiKey === 'undefined') {
        state.settings.saveApiKey = hadApiKey;
    }
    if (!state.settings.saveApiKey) {
        state.settings.apiKey = '';
        state.settings.summarizeApiKey = '';
    }
}
