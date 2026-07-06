// ==================== Chat Message Renderer ====================
function renderMessages() {
    var conv = getActiveConv();
    if (!conv) return;
    var container = dom.messagesContainer;
    if (!container) return;

    clearMessageContainerAfterConversationSwitch(container, conv);

    var allMessages = getRenderableChatMessages(conv);
    if (allMessages.length === 0) {
        renderChatMessageEmptyState(container);
        return;
    }
    setChatMessageEmptyStateVisible(false);

    var windowState = getChatMessageWindowState(conv, allMessages);
    if (canIncrementalRenderChatMessages(windowState)) {
        appendIncrementalChatMessages(container, conv, windowState);
        ensureHistoryLoadUI(container, conv, allMessages, windowState.startIdx);
        return;
    }

    renderChatMessageWindow(container, conv, allMessages, windowState);
}

function renderMessagesFullHistory(conv) {
    if (conv) {
        conv._lastRenderedVisibleCount = 0;
    }
    var container = dom.messagesContainer;
    var messages = getRenderableChatMessages(conv);
    var html = renderChatMessagesHtml(messages, conv);

    container.innerHTML = html;
    container.scrollTop = container.scrollHeight;
}
