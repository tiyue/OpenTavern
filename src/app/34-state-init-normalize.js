// ==================== State Initialization Normalization Helpers ====================
function isSavedStateObjectMap(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeSavedStateConversationOrder(order, conversations) {
    return getConversationIdsWithMissingFallback(order, conversations);
}

function normalizeSavedStateBoolean(value) {
    if (value === true || value === 1) return true;
    if (typeof value === 'string') {
        var normalized = value.trim().toLowerCase();
        return normalized === 'true' || normalized === 'yes' || normalized === '1';
    }
    return false;
}
