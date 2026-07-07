// ==================== State Initialization Normalization Helpers ====================
function isSavedStateObjectMap(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeSavedStateConversationOrder(order, conversations) {
    var conversationIds = Object.keys(conversations || {});
    var knownIds = Object.create(null);
    var seenIds = Object.create(null);
    var result = [];

    conversationIds.forEach(function(id) {
        knownIds[id] = true;
    });

    if (Array.isArray(order)) {
        order.forEach(function(id) {
            if (typeof id !== 'string' || !knownIds[id] || seenIds[id]) return;
            seenIds[id] = true;
            result.push(id);
        });
    }

    conversationIds.forEach(function(id) {
        if (seenIds[id]) return;
        seenIds[id] = true;
        result.push(id);
    });

    return result;
}

function normalizeSavedStateBoolean(value) {
    if (value === true || value === 1) return true;
    if (typeof value === 'string') {
        var normalized = value.trim().toLowerCase();
        return normalized === 'true' || normalized === 'yes' || normalized === '1';
    }
    return false;
}
