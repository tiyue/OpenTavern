/**
 * 新手导读（文件：59-new-chat-finalize.js）
 *
 * 负责什么：这是“新建聊天流程”中的“新建、聊天、收尾”部分。
 * 在程序中的位置：它处理角色选择、群聊多选、首条消息、世界书关联和会话归档。
 * 从哪里开始看：主要从 `initializeNewConversationRuntimeState(conv)`、`registerNewConversation(conv)`、`renderNewConversationState(conv)`、`finalizeNewConversationUi(无参数)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：新会话只有在角色与初始数据准备完成后才能保存和切换。
 */
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
