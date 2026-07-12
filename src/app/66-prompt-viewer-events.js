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
function refreshPromptViewer() {
    try {
        var messages;
        if (currentPromptViewerStage === 'second') {
            var conv = getActiveConv();
            var latestMain = findLatestMainAssistantMessage(conv);
            messages = buildMessagesForSecondStage(latestMain);
        } else {
            messages = buildMessagesForAPI();
        }
        var text = formatPromptMessages(messages);
        dom.promptViewerContent.textContent = text || t('no_messages_to_send');
    } catch (err) {
        console.error('showFullPrompt error:', err);
        alert('鏃犳硶鐢熸垚鎻愮ず璇嶉瑙堬細' + (err.message || err));
    }
}

function showFullPrompt() {
    setPromptStageButtons('main');
    refreshPromptViewer();
    dom.promptViewerModal.classList.remove('hidden');
}

function closePromptViewer() {
    dom.promptViewerModal.classList.add('hidden');
}

function bindPromptViewerEvents() {
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
