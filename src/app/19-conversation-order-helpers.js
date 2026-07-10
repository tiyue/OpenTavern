// ==================== Conversation Order Helpers ====================
function getConversationIdsWithMissingFallback(order, conversations) {
    var ids = Array.isArray(order) ? order.slice() : [];
    var knownConversations = conversations || {};
    var seen = Object.create(null);
    ids = ids.filter(function(id) {
        if (!knownConversations[id] || seen[id]) return false;
        seen[id] = true;
        return true;
    });
    Object.keys(knownConversations).forEach(function(id) {
        if (seen[id]) return;
        ids.push(id);
        seen[id] = true;
    });
    return ids;
}

function getFirstAvailableConversationId(order, conversations) {
    return getConversationIdsWithMissingFallback(order, conversations)[0] || null;
}

function getValidConversationIdOrFallback(activeId, order, conversations) {
    var knownConversations = conversations || {};
    if (typeof activeId === 'string' && knownConversations[activeId]) return activeId;
    return getFirstAvailableConversationId(order, knownConversations);
}
