/**
 * 新手导读（文件：66-prompt-viewer-events.js）
 *
 * 负责什么：这是“导入与弹窗事件”中的“提示词、查看器、事件”部分。
 * 在程序中的位置：它把文件选择、提示词查看器和总结管理器的按钮连接到业务函数。
 * 从哪里开始看：主要从 `refreshPromptViewer(无参数)`、`showFullPrompt(无参数)`、`closePromptViewer(无参数)`、`bindPromptViewerEvents(无参数)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：事件处理函数要防止重复触发，并在异步操作期间正确显示状态。
 */
// ==================== Prompt Viewer Events ====================
var promptViewerRequestId = 0;
async function refreshPromptViewer() {
    var requestId = ++promptViewerRequestId;
    var conversationId = typeof getActiveConv === 'function' ? (getActiveConv() || {}).id : null;
    try {
        var selector = typeof document !== 'undefined' ? document.getElementById('promptViewSource') : null;
        if (selector && selector.value === 'actual') {
            var recent = recentRequestDiagnostics.filter(function(item) { return item.conversationId === conversationId && (currentPromptViewerStage === 'second' ? item.stage === 'second' : item.stage !== 'second' && item.stage !== 'summary'); }).slice(-1)[0];
            dom.promptViewerContent.textContent = recent ? JSON.stringify(recent, null, 2) : '当前会话暂无该阶段的实际请求。';
            return;
        }
        var messages;
        var conv = typeof getActiveConv === 'function' ? JSON.parse(JSON.stringify(getActiveConv())) : null;
        if (currentPromptViewerStage === 'second') {
            var latestMain = findLatestMainAssistantMessage(conv);
            messages = buildMessagesForSecondStage(latestMain, conv);
        } else {
            messages = typeof buildMessagesForAPIAsync === 'function' ? await buildMessagesForAPIAsync(conv, { preview: true }) : buildMessagesForAPI(conv, { preview: true });
        }
        if (typeof postProcessPromptMessages === 'function') messages = postProcessPromptMessages(messages, state.settings.promptPostProcessing, state.settings.apiEndpoint);
        if (requestId !== promptViewerRequestId || typeof getActiveConv === 'function' && conversationId !== (getActiveConv() || {}).id) return;
        var text = '下一次预览（只读，含随机宏的结果可能变化）\n估算 Token：' + Math.ceil(messages.reduce(function(count, message) { return count + message.content.length; }, 0) / 2) + '\n\n' + formatPromptMessages(messages);
        dom.promptViewerContent.textContent = text || t('no_messages_to_send');
    } catch (err) {
        console.error('showFullPrompt error:', err);
        if (requestId === promptViewerRequestId) dom.promptViewerContent.textContent = '无法生成提示词预览：' + (err.message || err);
    }
}

function showFullPrompt() {
    setPromptStageButtons('main');
    refreshPromptViewer();
    dom.promptViewerModal.classList.remove('hidden');
}

function closePromptViewer() {
    promptViewerRequestId++;
    dom.promptViewerModal.classList.add('hidden');
}

function bindPromptViewerEvents() {
    if (dom.promptStageMainBtn && dom.promptStageMainBtn.parentElement) {
    var choice = document.createElement('select');
    choice.id = 'promptViewSource'; choice.setAttribute('aria-label', '诊断来源'); choice.className = 'feature-source-select';
    choice.innerHTML = '<option value="preview">下一次预览</option><option value="actual">最近实际请求</option>';
    choice.onchange = refreshPromptViewer;
    dom.promptStageMainBtn.parentElement.appendChild(choice);
    }
    dom.viewPromptBtn.addEventListener('click', showFullPrompt);
    if (dom.promptStageMainBtn) dom.promptStageMainBtn.addEventListener('click', function() {
        setPromptStageButtons('main');
        refreshPromptViewer();
    });
    if (dom.promptStageSecondBtn) dom.promptStageSecondBtn.addEventListener('click', function() {
        setPromptStageButtons('second');
        refreshPromptViewer();
    });
    dom.promptViewerCloseBtn.addEventListener('click', closePromptViewer);
    dom.promptViewerBackdrop.addEventListener('click', closePromptViewer);
    dom.copyPromptBtn.addEventListener('click', copyPromptViewerText);
}
