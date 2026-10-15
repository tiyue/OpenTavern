/**
 * 新手导读（文件：68-settings-advanced-hydration.js）
 *
 * 负责什么：这是“设置界面”中的“设置、高级设置、表单回填”部分。
 * 在程序中的位置：它把当前设置填入表单，读取用户修改，再触发保存后的联动效果。
 * 从哪里开始看：主要从 `hydrateTwoStageSettings(无参数)`、`bindTwoStageRestoreButton(无参数)`、`hydrateSummarySettings(无参数)`、`hydrateWorldInfoBudgetSettings(无参数)`、`hydrateThemePerformanceSettings(无参数)`、`hydrateSummarizationApiSettings(无参数)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：表单值都是字符串或勾选状态，写回前要转换成正确的数字、布尔值和枚举。
 */
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
