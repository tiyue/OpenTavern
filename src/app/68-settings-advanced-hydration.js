// ==================== Settings Advanced Hydration ====================
function hydrateTwoStageSettings() {
    if (dom.twoStageEnabled) dom.twoStageEnabled.checked = !!state.settings.twoStageEnabled;
    if (dom.twoStageTemperature) dom.twoStageTemperature.value = state.settings.twoStageTemperature;
    if (dom.twoStageTempVal) dom.twoStageTempVal.textContent = state.settings.twoStageTemperature;
    if (dom.twoStageTopP) dom.twoStageTopP.value = state.settings.twoStageTopP;
    if (dom.twoStageTopPVal) dom.twoStageTopPVal.textContent = state.settings.twoStageTopP;
    if (dom.twoStageIncludeRecentContext) dom.twoStageIncludeRecentContext.checked = !!state.settings.twoStageIncludeRecentContext;
    if (dom.twoStageSystemPrompt) dom.twoStageSystemPrompt.value = state.settings.twoStageSystemPrompt || DEFAULT_TWO_STAGE_PROMPT;
    if (dom.twoStagePostHistoryInstructions) dom.twoStagePostHistoryInstructions.value = state.settings.twoStagePostHistoryInstructions || '';
    if (dom.requestCotEnabled) dom.requestCotEnabled.checked = !!state.settings.requestCotEnabled;
    if (dom.showCotEnabled) dom.showCotEnabled.checked = state.settings.showCotEnabled !== false;
    bindTwoStageRestoreButton();
}

function bindTwoStageRestoreButton() {
    if (dom.restoreTwoStagePromptBtn && dom.twoStageSystemPrompt) {
        dom.restoreTwoStagePromptBtn.onclick = function() {
            dom.twoStageSystemPrompt.value = DEFAULT_TWO_STAGE_PROMPT;
            state.settings.twoStageSystemPrompt = DEFAULT_TWO_STAGE_PROMPT;
            persistState(true);
        };
    }
}

function hydrateSummarySettings() {
    dom.summaryEnabled.checked = state.settings.summaryEnabled !== false;
    if (dom.summaryThreshold) {
        dom.summaryThreshold.value = state.settings.summaryThreshold || 12;
        if (dom.summaryThresholdVal) {
            dom.summaryThresholdVal.textContent = state.settings.summaryThreshold || 12;
        }
        updateSummaryThresholdWarning();
    }
    if (dom.summaryMaxWords) {
        dom.summaryMaxWords.value = (state.settings.summaryMaxWords != null ? state.settings.summaryMaxWords : 0);
        dom.summaryMaxWords.addEventListener('input', function() {
            state.settings.summaryMaxWords = parseInt(this.value) || 0;
        });
    }
    if (dom.summaryPrompt) dom.summaryPrompt.value = state.settings.summaryPrompt || '';
}

function hydrateWorldInfoBudgetSettings() {
    dom.worldInfoBudgetEnabled.checked = state.settings.worldInfoBudgetEnabled !== false;
    dom.worldInfoBudget.value = state.settings.worldInfoBudget || 2048;
    dom.worldInfoBudgetVal.textContent = state.settings.worldInfoBudget || 2048;
}

function hydrateThemePerformanceSettings() {
    if (dom.uiTheme) {
        dom.uiTheme.value = state.settings.uiTheme || 'new-light';
    }
    if (dom.lowPowerMode) {
        dom.lowPowerMode.checked = !!state.settings.lowPowerMode;
    }
}

function hydrateSummarizationApiSettings() {
    dom.summarizeUseMainAPI.checked = state.settings.summarizeUseMainAPI !== false;
    dom.summarizeApiEndpoint.value = state.settings.summarizeApiEndpoint || '';
    dom.summarizeApiKey.value = state.settings.summarizeApiKey || '';
    dom.summarizeModel.value = state.settings.summarizeModel || 'deepseek-v4-flash';
}
