/**
 * 新手导读（文件：68-settings-basic-hydration.js）
 *
 * 负责什么：这是“设置界面”中的“设置、基础设置、表单回填”部分。
 * 在程序中的位置：它把当前设置填入表单，读取用户修改，再触发保存后的联动效果。
 * 从哪里开始看：主要从 `hydratePrimaryApiSettings(无参数)`、`hydrateGenerationSettings(无参数)`、`hydratePromptSettings(无参数)`、`bindSettingsPromptShortcutButtons(无参数)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：表单值都是字符串或勾选状态，写回前要转换成正确的数字、布尔值和枚举。
 */
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
