// ==================== Settings Basic Hydration ====================
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
