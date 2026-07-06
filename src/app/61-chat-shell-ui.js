function renderTokenBar() {
    var conv = getActiveConv();
    if (!conv) return;
    if (!dom.tokenCount || !dom.tokenMax || !dom.tokenBar) return;
    // 【核心修复2】必须使用 buildMessagesForAPI 的实际输出，而不是存储层消息总数
    var apiMessages = buildMessagesForAPI();
    var msgCount = apiMessages.filter(function(m) { return m.role !== 'system'; }).length;
    var max = state.settings.contextLength;
    dom.tokenCount.textContent = msgCount;
    dom.tokenMax.textContent = 'max ' + max + ' ' + t('msgs_label');
    var pct = Math.min(100, (msgCount / max) * 100);
    dom.tokenBar.style.width = pct + '%';
    var themed = document.body && (document.body.classList.contains('theme-new-light') || document.body.classList.contains('theme-new-dark'));
    if (themed) {
        dom.tokenBar.style.background = pct > 80 ? '#ef4444' : '#D56C4E';
    } else {
        dom.tokenBar.style.background = pct > 80 ? '#ef4444' : pct > 50 ? '#f59e0b' : 'rgba(245,158,11,0.5)';
    }
}

function renderAll() {
    renderConversationList();
    renderCharacterCard();
    renderMessages();
    renderTopBar();
    renderTokenBar();
    updateInputState();
    renderWorldInfoBudgetWarning();
}

function updateInputState() {
    var useLocal = isWebLLMBackend();
    var hasApiKey = !!(state.settings.apiKey && state.settings.apiEndpoint);
    // 本地 WebLLM 模式不需要远程 API Key
    var canSend = useLocal || hasApiKey;
    ensureComfySettings();
    var showComfy = !!state.settings.comfyEnabled;
    var canComfy = !!getActiveConv() && showComfy && !!state.settings.comfyWorkflow && !state.isGenerating && !comfyIsGenerating;
    dom.messageInput.disabled = !canSend || state.isGenerating;
    dom.sendBtn.disabled = !canSend || state.isGenerating;
    if (dom.comfyGenerateBtn) dom.comfyGenerateBtn.disabled = !canComfy;
    if (state.isGenerating) {
        dom.stopBtn.classList.remove('hidden');
        dom.sendBtn.classList.add('hidden');
        if (dom.comfyGenerateBtn) dom.comfyGenerateBtn.classList.add('hidden');
    } else {
        dom.stopBtn.classList.add('hidden');
        dom.sendBtn.classList.remove('hidden');
        if (dom.comfyGenerateBtn) dom.comfyGenerateBtn.classList.toggle('hidden', !showComfy);
    }
    if (!canSend && !state.isGenerating) {
        dom.messageInput.placeholder = t('input_placeholder_no_api');
    } else if (state.isGenerating) {
        dom.messageInput.placeholder = t('input_placeholder_waiting');
    } else {
        dom.messageInput.placeholder = t('input_placeholder');
    }
}
