// ==================== New Chat Finalization Helpers ====================
function initializeNewConversationRuntimeState(conv) {
    if (conv._wiBudgetWarning) conv._wiBudgetWarning = false;
    conv._lastRenderedVisibleCount = 0;
    conv._showAllMessages = false;
    conv._historyWindow = 150;
    conv._historyScrollHandler = null;
    conv._wiCache = null;
}

function registerNewConversation(conv) {
    state.conversations[conv.id] = conv;
    state.conversationOrder.unshift(conv.id);
    state.activeConvId = conv.id;
    initializeNewConversationRuntimeState(conv);
}

function renderNewConversationState(conv) {
    if (dom.messagesContainer) dom.messagesContainer.innerHTML = '';
    persistState();
    requestRender('activeConvId');
    renderTokenBar();

    if (!(conv && isGroupChat(conv))) {
        if (typeof clearPendingGroupMention === 'function') clearPendingGroupMention();
    }
}

function finalizeNewConversationUi() {
    if (currentView === 'library') {
        switchView('chat');
    }

    if (isMobile()) closeSidebar();
}
