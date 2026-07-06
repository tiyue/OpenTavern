function closeSettings() {
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
    ensureSillyTavernPresetSettings();
    state.settings.summaryEnabled = dom.summaryEnabled.checked;
    if (dom.summaryThreshold) {
        state.settings.summaryThreshold = parseInt(dom.summaryThreshold.value) || 12;
    }
    if (dom.summaryMaxWords) {
        state.settings.summaryMaxWords = parseInt(dom.summaryMaxWords.value) || 0;
    }
    if (dom.summaryPrompt) state.settings.summaryPrompt = dom.summaryPrompt.value.trim();

    // World Info Budget
    state.settings.worldInfoBudgetEnabled = dom.worldInfoBudgetEnabled.checked;
    state.settings.worldInfoBudget = parseInt(dom.worldInfoBudget.value) || 2048;

    // 界面主题
    state.settings.uiTheme = dom.uiTheme ? (dom.uiTheme.value || 'new-light') : 'new-light';
    state.settings.uiTheme = typeof normalizeUiTheme === 'function' ? normalizeUiTheme(state.settings.uiTheme) : state.settings.uiTheme;
    if (typeof cacheUiTheme === 'function') cacheUiTheme(state.settings.uiTheme);

    // 效能模式（低功耗）
    state.settings.lowPowerMode = dom.lowPowerMode ? !!dom.lowPowerMode.checked : false;

    // Summarization API
    state.settings.summarizeUseMainAPI = dom.summarizeUseMainAPI.checked;
    state.settings.summarizeApiEndpoint = dom.summarizeApiEndpoint.value.trim();
    state.settings.summarizeApiKey = dom.summarizeApiKey.value.trim();
    state.settings.summarizeModel = dom.summarizeModel.value.trim() || 'deepseek-v4-flash';

    // ComfyUI txt2img
    ensureComfySettings();
    if (dom.comfyEnabled) state.settings.comfyEnabled = !!dom.comfyEnabled.checked;
    if (dom.comfyServer) state.settings.comfyServer = normalizeComfyServer(dom.comfyServer.value);
    if (dom.comfyPositiveNodeId) state.settings.comfyPositiveNodeId = dom.comfyPositiveNodeId.value.trim();
    if (dom.comfyNegativeNodeId) state.settings.comfyNegativeNodeId = dom.comfyNegativeNodeId.value.trim();
    if (dom.comfySeedNodeId) state.settings.comfySeedNodeId = dom.comfySeedNodeId.value.trim();
    if (dom.comfyNegativePrompt) state.settings.comfyNegativePrompt = dom.comfyNegativePrompt.value.trim();
    if (dom.comfyPromptTemplate) state.settings.comfyPromptTemplate = dom.comfyPromptTemplate.value.trim() || defaultSettings().comfyPromptTemplate;

    // Cloud Sync
    ensureCloudSyncSettings();
    if (dom.cloudSyncEnabled) state.settings.cloudSyncEnabled = !!dom.cloudSyncEnabled.checked;
    if (dom.cloudSyncAutoUpload) state.settings.cloudSyncAutoUpload = !!dom.cloudSyncAutoUpload.checked;
    if (dom.cloudSyncEndpoint) state.settings.cloudSyncEndpoint = dom.cloudSyncEndpoint.value.trim() || '/api/sync';
    if (dom.cloudSyncToken) state.settings.cloudSyncToken = dom.cloudSyncToken.value.trim();
    if (dom.cloudSyncEncrypted) state.settings.cloudSyncEncrypted = !!dom.cloudSyncEncrypted.checked;
    if (dom.cloudSyncPassphrase) state.settings.cloudSyncPassphrase = dom.cloudSyncPassphrase.value;

    // WebLLM 后端（从表单读取）
    var backendSel2 = document.getElementById('inferenceBackend');
    var webllmSel2 = document.getElementById('webllmModel');
    if (backendSel2) {
        state.settings.inferenceBackend = backendSel2.value || 'remote-api';
    }
    if (webllmSel2) {
        state.settings.webllmModel = webllmSel2.value || 'Llama-3.2-1B-Instruct-q4f16_1-MLC';
    }

    persistState();
    dom.settingsModal.classList.add('hidden');

    // 立即应用界面主题
    if (typeof applyUiTheme === 'function') {
        applyUiTheme(state.settings.uiTheme);
    }

    // 立即应用效能模式（暂停/恢复 shader + 应用 CSS 类）
    if (typeof applyPerformanceMode === 'function') {
        applyPerformanceMode(state.settings.lowPowerMode);
    }
    updateInputState();

    // 设置变更后清理相关缓存，确保 token 条和世界书激活正确刷新
    var conv = getActiveConv();
    if (conv) {
        conv._wiCache = null;
    }
    renderTokenBar();

    // 关键修复：用户在中途修改总结阈值后，关闭设置时主动检查一次
    // 让改阈值能立即对当前对话产生效果（尤其是调低阈值时）
    if (state.settings.summaryEnabled) {
        setTimeout(function() { autoSummarize(); }, 120);
    }

    // 显式通知 settings 变更
    appStore.notify('settings');
}
