/**
 * 新手导读（文件：61-chat-message-window-state.js）
 *
 * 负责什么：这是“聊天消息渲染”中的“聊天、消息、窗口、状态”部分。
 * 在程序中的位置：它把会话消息转换为气泡、状态栏、附件、思考块和二段选项。
 * 从哪里开始看：主要从 `getRenderableChatMessages(conv)`、`clearMessageContainerAfterConversationSwitch(container, conv)`、`getChatMessageWindowState(conv, allMessages)`、`canIncrementalRenderChatMessages(windowState)`、`setChatMessageEmptyStateVisible(visible)`、`renderChatMessageEmptyState(container)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：模型文本属于外部内容，插入 HTML 前必须经过统一转义或安全格式化。
 */
// ==================== Chat Message Window State ====================
const DEFAULT_CHAT_HISTORY_WINDOW = 150;

function getRenderableChatMessages(conv) {
    return conv && Array.isArray(conv.messages)
        ? conv.messages.filter(function(m) { return m.role !== 'system'; })
        : [];
}

function clearMessageContainerAfterConversationSwitch(container, conv) {
    if ((conv._lastRenderedVisibleCount || 0) === 0 && container.children.length > 0) {
        container.innerHTML = '';
    }
}

function getChatMessageWindowState(conv, allMessages) {
    var historyWindow = conv._historyWindow || DEFAULT_CHAT_HISTORY_WINDOW;
    var showAll = !!conv._showAllMessages;
    if (showAll) historyWindow = Infinity;

    var startIdx = Math.max(0, allMessages.length - historyWindow);
    var visibleMessages = allMessages.slice(startIdx);
    var lastRenderedCount = conv._lastRenderedVisibleCount || 0;
    var currentVisibleCount = visibleMessages.length;

    return {
        showAll: showAll,
        startIdx: startIdx,
        visibleMessages: visibleMessages,
        lastRenderedCount: lastRenderedCount,
        currentVisibleCount: currentVisibleCount
    };
}

function canIncrementalRenderChatMessages(windowState) {
    return windowState.currentVisibleCount > windowState.lastRenderedCount &&
        !state.isGenerating &&
        !windowState.showAll;
}

function setChatMessageEmptyStateVisible(visible) {
    if (dom.emptyState) dom.emptyState.style.display = visible ? '' : 'none';
    if (dom.tokenInfo) dom.tokenInfo.classList.toggle('hidden', !!visible);
}

function renderChatMessageEmptyState(container) {
    container.innerHTML = '';
    setChatMessageEmptyStateVisible(true);
}
