/**
 * 新手导读（文件：61-chat-shell-ui.js）
 *
 * 负责什么：这是“聊天消息渲染”中的“聊天、程序外壳、界面”部分。
 * 在程序中的位置：它把会话消息转换为气泡、状态栏、附件、思考块和二段选项。
 * 从哪里开始看：主要从 `renderTokenBar(无参数)`、`renderAll(无参数)`、`updateInputState(无参数)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：模型文本属于外部内容，插入 HTML 前必须经过统一转义或安全格式化。
 */
// 聊天外壳界面：更新 Token 使用量、整体渲染和输入区可用状态。
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
    ensureImageGenerationSettings();
    var showImageGeneration = !!state.settings.imageGenerationEnabled;
    var canGenerateImage = !!getActiveConv() && showImageGeneration && !state.isGenerating && !imageGenerationIsGenerating;
    dom.messageInput.disabled = !canSend || state.isGenerating;
    dom.sendBtn.disabled = !canSend || state.isGenerating;
    if (dom.imageGenerationBtn) dom.imageGenerationBtn.disabled = !canGenerateImage;
    if (state.isGenerating) {
        dom.stopBtn.classList.remove('hidden');
        dom.sendBtn.classList.add('hidden');
        if (dom.imageGenerationBtn) dom.imageGenerationBtn.classList.add('hidden');
    } else {
        dom.stopBtn.classList.add('hidden');
        dom.sendBtn.classList.remove('hidden');
        if (dom.imageGenerationBtn) dom.imageGenerationBtn.classList.toggle('hidden', !showImageGeneration);
    }
    if (!canSend && !state.isGenerating) {
        dom.messageInput.placeholder = t('input_placeholder_no_api');
    } else if (state.isGenerating) {
        dom.messageInput.placeholder = t('input_placeholder_waiting');
    } else {
        dom.messageInput.placeholder = t('input_placeholder');
    }
}
