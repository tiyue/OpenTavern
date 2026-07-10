// ==================== Cloud Sync Apply Conversations ====================
function normalizeCloudSyncRestoredConversations() {
    Object.values(state.conversations || {}).forEach(function(conv) {
        try { normalizeConversation(conv); } catch (_) {}
    });
}

function ensureCloudSyncRestoredActiveConversation() {
    if (state.activeConvId && state.conversations[state.activeConvId]) return;

    var first = getFirstAvailableConversationId(state.conversationOrder, state.conversations);

    if (first) {
        state.activeConvId = first;
        return;
    }

    var conv = defaultConversation();
    state.conversations[conv.id] = conv;
    state.conversationOrder = [conv.id];
    state.activeConvId = conv.id;
}
