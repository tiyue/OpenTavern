// ==================== Conversation Timestamp Helpers ====================
function getConversationActivityTimestamp(conv) {
    if (!conv) return 0;
    return Math.max(
        normalizeConversationActivityTimestamp(conv.updated),
        getLastMessageActivityTimestamp(conv),
        normalizeConversationActivityTimestamp(conv.created),
        0
    );
}

function getMostRecentConversationIdFromOrder(order, conversations) {
    var ids = Array.isArray(order) ? order : [];
    var bestId = null;
    var bestTime = -1;
    ids.forEach(function(id) {
        var conv = conversations && conversations[id];
        if (!conv) return;
        var timestamp = getConversationActivityTimestamp(conv);
        if (!bestId || timestamp > bestTime) {
            bestId = id;
            bestTime = timestamp;
        }
    });
    return bestId;
}

function getLastMessageActivityTimestamp(conv) {
    var messages = Array.isArray(conv && conv.messages) ? conv.messages : [];
    var latest = 0;
    for (var i = 0; i < messages.length; i++) {
        latest = Math.max(latest, getMessageActivityTimestamp(messages[i]));
    }
    return latest;
}

function getMessageActivityTimestamp(msg) {
    if (!msg) return 0;
    return Math.max(
        normalizeConversationActivityTimestamp(msg.updated),
        normalizeConversationActivityTimestamp(msg.updatedAt),
        normalizeConversationActivityTimestamp(msg.modified),
        normalizeConversationActivityTimestamp(msg.modifiedAt),
        normalizeConversationActivityTimestamp(msg.created),
        normalizeConversationActivityTimestamp(msg.createdAt),
        normalizeConversationActivityTimestamp(msg.timestamp),
        normalizeConversationActivityTimestamp(msg.time),
        normalizeConversationActivityTimestamp(msg.date),
        normalizeConversationActivityTimestamp(msg.sendDate),
        normalizeConversationActivityTimestamp(msg.send_date),
        0
    );
}

function normalizeConversationActivityTimestamp(value) {
    var timestamp = Number(value);
    if (Number.isFinite(timestamp) && timestamp > 0) {
        return timestamp >= 1000000000 && timestamp < 1000000000000 ? timestamp * 1000 : timestamp;
    }
    if (typeof value === 'string' && value.trim()) {
        var parsed = Date.parse(value);
        if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
    return 0;
}
