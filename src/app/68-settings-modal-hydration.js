// ==================== Settings Modal Hydration ====================
function hydratePrimaryApiSettings() {
    dom.apiEndpoint.value = state.settings.apiEndpoint;
    dom.apiKey.value = state.settings.apiKey;
    if (dom.saveApiKey) dom.saveApiKey.checked = !!state.settings.saveApiKey;
    if (dom.ollamaCompatMode) dom.ollamaCompatMode.checked = !!state.settings.ollamaCompatMode;
    dom.modelName.value = state.settings.model;
}

function hydrateGenerationSettings() {
    dom.contextLength.value = state.settings.contextLength;
    dom.contextLenVal.textContent = state.settings.contextLength;
    dom.maxTokens.value = state.settings.maxTokens;
    dom.maxTokensVal.textContent = state.settings.maxTokens;
    dom.temperature.value = state.settings.temperature;
    dom.tempVal.textContent = state.settings.temperature;
    dom.topP.value = state.settings.topP;
    dom.topPVal.textContent = state.settings.topP;
}

function hydratePromptSettings() {
    dom.userName.value = state.settings.userName;
    dom.systemPrompt.value = state.settings.systemPrompt;
    if (dom.postHistoryInstructions) dom.postHistoryInstructions.value = state.settings.postHistoryInstructions || '';
    if (dom.userDescription) dom.userDescription.value = state.settings.userDescription || '';
    bindSettingsPromptShortcutButtons();
}

function bindSettingsPromptShortcutButtons() {
    if (dom.fillRoleplayPromptBtn) {
        dom.fillRoleplayPromptBtn.onclick = function() {
            dom.systemPrompt.value = BASE_SYSTEM_PROMPT;
            state.settings.systemPrompt = BASE_SYSTEM_PROMPT;
            persistState(true);
        };
    }
    if (dom.fillPostHistoryBtn && dom.postHistoryInstructions) {
        dom.fillPostHistoryBtn.onclick = function() {
            dom.postHistoryInstructions.value = DEFAULT_FIRST_STAGE_POST_HISTORY_INSTRUCTIONS;
            state.settings.postHistoryInstructions = DEFAULT_FIRST_STAGE_POST_HISTORY_INSTRUCTIONS;
            persistState(true);
        };
    }
}

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

    if (dom.restoreTwoStagePromptBtn && dom.twoStageSystemPrompt) {
        dom.restoreTwoStagePromptBtn.onclick = function() {
            dom.twoStageSystemPrompt.value = DEFAULT_TWO_STAGE_PROMPT;
            state.settings.twoStageSystemPrompt = DEFAULT_TWO_STAGE_PROMPT;
            persistState(true);
        };
    }
}

function hydrateSillyTavernPresetSettings() {
    ensureSillyTavernPresetSettings();
    renderSillyTavernPresetSettings();
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

function hydrateComfySettingsControls() {
    ensureComfySettings();
    if (dom.comfyEnabled) dom.comfyEnabled.checked = !!state.settings.comfyEnabled;
    if (dom.comfyServer) dom.comfyServer.value = state.settings.comfyServer || 'http://127.0.0.1:8188';
    if (dom.comfyPositiveNodeId) dom.comfyPositiveNodeId.value = state.settings.comfyPositiveNodeId || '';
    if (dom.comfyNegativeNodeId) dom.comfyNegativeNodeId.value = state.settings.comfyNegativeNodeId || '';
    if (dom.comfySeedNodeId) dom.comfySeedNodeId.value = state.settings.comfySeedNodeId || '';
    if (dom.comfyNegativePrompt) dom.comfyNegativePrompt.value = state.settings.comfyNegativePrompt || '';
    if (dom.comfyPromptTemplate) dom.comfyPromptTemplate.value = state.settings.comfyPromptTemplate || '';
    updateComfyWorkflowStatus();
}
