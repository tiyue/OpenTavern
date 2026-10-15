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
    if (getActiveConv() !== conv) return;
    if (dom.messagesContainer) dom.messagesContainer.innerHTML = '';
    requestRender('activeConvId');
    renderTokenBar();

    if (!(conv && isGroupChat(conv))) {
        if (typeof clearPendingGroupMention === 'function') clearPendingGroupMention();
    }
}

// Register prepared conversations and their imported library records only after a reliable ACK.
async function persistPreparedConversation(candidate, options) {
    options = options || {};
    var previous = options.previous || null;
    var roots = { conversations: state.conversations, characters: state.characters, worldBooks: state.worldBooks };
    var beforeActive = state.activeConvId;
    var source = previous ? JSON.stringify(sanitizeCloudSyncSignatureConversation(previous)) : null;
    var records = [];
    if (options.character && options.character.name) records.push({ container: 'characters', key: options.character.name.trim().toLowerCase(), value: options.character });
    if (options.worldBook) records.push({ container: 'worldBooks', key: options.worldBook.id, value: options.worldBook });
    records.forEach(function(record) {
        record.hadValue = Object.prototype.hasOwnProperty.call(state[record.container] || {}, record.key);
        record.previous = record.hadValue ? JSON.stringify(state[record.container][record.key]) : null;
    });
    if (previous && previous._messageCommitInProgress) throw new Error('当前会话正在保存，请稍后重试。');
    function set(object, key, value) { Object.defineProperty(object, key, { value: value, writable: true, enumerable: true, configurable: true }); }
    function check() {
        Object.keys(roots).forEach(function(key) { if (state[key] !== roots[key]) throw new Error('数据已被恢复或清空，请重试。'); });
        var exists = Object.prototype.hasOwnProperty.call(state.conversations, candidate.id);
        if (previous ? !exists || state.conversations[candidate.id] !== previous || JSON.stringify(sanitizeCloudSyncSignatureConversation(previous)) !== source : exists) throw new Error('会话已变化，请重试。');
        if (state.activeConvId !== beforeActive) throw new Error('当前会话已切换，请重试。');
        records.forEach(function(record) {
            var hadValue = Object.prototype.hasOwnProperty.call(state[record.container] || {}, record.key);
            if (hadValue !== record.hadValue || hadValue && JSON.stringify(state[record.container][record.key]) !== record.previous) throw new Error('角色或世界书已变化，请重试。');
        });
    }
    function merge(snapshot, live) {
        if (!snapshot.conversations) snapshot.conversations = {};
        set(snapshot.conversations, candidate.id, live ? candidate : JSON.parse(JSON.stringify(candidate)));
        snapshot.conversationOrder = getConversationIdsWithMissingFallback([candidate.id].concat(snapshot.conversationOrder || []), snapshot.conversations);
        if (snapshot.activeConvId === beforeActive) snapshot.activeConvId = candidate.id;
        records.forEach(function(record) {
            if (!snapshot[record.container]) snapshot[record.container] = {};
            set(snapshot[record.container], record.key, JSON.parse(JSON.stringify(record.value)));
        });
        return snapshot;
    }
    check();
    var release = typeof beginStorageReplacement === 'function' ? beginStorageReplacement() : null;
    if (previous) Object.defineProperty(previous, '_messageCommitInProgress', { value: true, writable: true, configurable: true, enumerable: false });
    var committed = false;
    try {
        await persistState(true, {
            throwOnError: true,
            transformSnapshot: function(snapshot) { return merge(snapshot, false); },
            beforePersist: check,
            onPersistSuccess: function() {
                check();
                var applied = merge({ conversations: state.conversations, conversationOrder: state.conversationOrder, activeConvId: state.activeConvId, characters: state.characters, worldBooks: state.worldBooks }, true);
                state.conversationOrder = applied.conversationOrder;
                state.activeConvId = applied.activeConvId;
                state.characters = applied.characters;
                state.worldBooks = applied.worldBooks;
                initializeNewConversationRuntimeState(candidate);
                committed = true;
            },
            commitPendingSnapshot: function(snapshot) { merge(snapshot, false); }
        });
    } finally {
        if (previous) delete previous._messageCommitInProgress;
        if (release) release();
    }
    if (committed && typeof pruneCardRuntimeInstances === 'function') {
        try { pruneCardRuntimeInstances(); } catch (error) { reportPersistPostSaveError('conversation runtime cleanup', error); }
    }
    return candidate;
}

function finalizeNewConversationUi() {
    if (currentView === 'library') {
        switchView('chat');
    }

    if (isMobile()) closeSidebar();
}
