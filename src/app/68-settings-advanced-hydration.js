// ==================== Settings Advanced Hydration ====================
function hydrateTwoStageSettings() {
    hydrateCheckboxControl(dom.twoStageEnabled, state.settings.twoStageEnabled);
    hydrateValueAndLabelControl(dom.twoStageTemperature, dom.twoStageTempVal, state.settings.twoStageTemperature);
    hydrateValueAndLabelControl(dom.twoStageTopP, dom.twoStageTopPVal, state.settings.twoStageTopP);
    hydrateCheckboxControl(dom.twoStageIncludeRecentContext, state.settings.twoStageIncludeRecentContext);
    hydrateValueControl(dom.twoStageSystemPrompt, state.settings.twoStageSystemPrompt || DEFAULT_TWO_STAGE_PROMPT);
    hydrateValueControl(dom.twoStagePostHistoryInstructions, state.settings.twoStagePostHistoryInstructions || '');
    hydrateCheckboxControl(dom.requestCotEnabled, state.settings.requestCotEnabled);
    hydrateCheckboxControlDefaultOn(dom.showCotEnabled, state.settings.showCotEnabled);
    bindTwoStageRestoreButton();
}

function bindTwoStageRestoreButton() {
    bindDefaultPromptRestoreButton(dom.restoreTwoStagePromptBtn, dom.twoStageSystemPrompt, DEFAULT_TWO_STAGE_PROMPT);
}

function hydrateSummarySettings() {
    hydrateCheckboxControlDefaultOn(dom.summaryEnabled, state.settings.summaryEnabled);
    if (dom.summaryThreshold) {
        hydrateValueAndLabelControl(dom.summaryThreshold, dom.summaryThresholdVal, state.settings.summaryThreshold || 12);
        updateSummaryThresholdWarning();
    }
    hydrateValueControl(dom.summaryMaxWords, state.settings.summaryMaxWords != null ? state.settings.summaryMaxWords : 0);
    hydrateValueControl(dom.summaryPrompt, state.settings.summaryPrompt || '');
}

function hydrateWorldInfoBudgetSettings() {
    hydrateCheckboxControlDefaultOn(dom.worldInfoBudgetEnabled, state.settings.worldInfoBudgetEnabled);
    hydrateValueAndLabelControl(dom.worldInfoBudget, dom.worldInfoBudgetVal, state.settings.worldInfoBudget || 2048);
}

function hydrateThemePerformanceSettings() {
    hydrateValueControl(dom.uiTheme, state.settings.uiTheme || 'new-light');
    hydrateCheckboxControl(dom.lowPowerMode, state.settings.lowPowerMode);
}

function hydrateSummarizationApiSettings() {
    hydrateCheckboxControlDefaultOn(dom.summarizeUseMainAPI, state.settings.summarizeUseMainAPI);
    hydrateValueControl(dom.summarizeApiEndpoint, state.settings.summarizeApiEndpoint || '');
    hydrateValueControl(dom.summarizeApiKey, state.settings.summarizeApiKey || '');
    hydrateValueControl(dom.summarizeModel, state.settings.summarizeModel || 'deepseek-v4-flash');
}
