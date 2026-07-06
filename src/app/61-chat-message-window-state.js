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
