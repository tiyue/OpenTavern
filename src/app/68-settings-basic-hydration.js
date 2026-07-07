// ==================== Settings Basic Hydration ====================
function hydratePrimaryApiSettings() {
    hydrateValueControl(dom.apiEndpoint, state.settings.apiEndpoint);
    hydrateValueControl(dom.apiKey, state.settings.apiKey);
    hydrateCheckboxControl(dom.saveApiKey, state.settings.saveApiKey);
    hydrateCheckboxControl(dom.ollamaCompatMode, state.settings.ollamaCompatMode);
    hydrateValueControl(dom.modelName, state.settings.model);
}

function hydrateGenerationSettings() {
    hydrateValueAndLabelControl(dom.contextLength, dom.contextLenVal, state.settings.contextLength);
    hydrateValueAndLabelControl(dom.maxTokens, dom.maxTokensVal, state.settings.maxTokens);
    hydrateValueAndLabelControl(dom.temperature, dom.tempVal, state.settings.temperature);
    hydrateValueAndLabelControl(dom.topP, dom.topPVal, state.settings.topP);
}

function hydratePromptSettings() {
    hydrateValueControl(dom.userName, state.settings.userName);
    hydrateValueControl(dom.systemPrompt, state.settings.systemPrompt);
    hydrateValueControl(dom.postHistoryInstructions, state.settings.postHistoryInstructions || '');
    hydrateValueControl(dom.userDescription, state.settings.userDescription || '');
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
