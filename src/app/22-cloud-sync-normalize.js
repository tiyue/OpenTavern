// ==================== Cloud Sync Snapshot Normalization ====================
function isCloudSyncObjectMap(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeCloudSyncObjectMap(value) {
    return isCloudSyncObjectMap(value) ? value : {};
}

function normalizeCloudSyncTimestamp(value) {
    var timestamp = Number(value);
    return Number.isFinite(timestamp) ? timestamp : Date.now();
}

function normalizeCloudSyncBoolean(value) {
    if (value === true || value === 1) return true;
    if (typeof value === 'string') {
        var normalized = value.trim().toLowerCase();
        return normalized === 'true' || normalized === 'yes' || normalized === '1';
    }
    return false;
}

function normalizeCloudSyncConversationOrder(data) {
    var conversationIds = Object.keys(data.conversations || {});
    var knownIds = Object.create(null);
    var seenIds = Object.create(null);
    var order = [];

    conversationIds.forEach(function(id) {
        knownIds[id] = true;
    });

    if (Array.isArray(data.conversationOrder)) {
        data.conversationOrder.forEach(function(id) {
            if (typeof id !== 'string' || !knownIds[id] || seenIds[id]) return;
            seenIds[id] = true;
            order.push(id);
        });
    }

    conversationIds.forEach(function(id) {
        if (seenIds[id]) return;
        seenIds[id] = true;
        order.push(id);
    });

    data.conversationOrder = order;
}

function normalizeCloudSyncActiveConversation(data) {
    if (typeof data.activeConvId === 'string' && Object.prototype.hasOwnProperty.call(data.conversations, data.activeConvId)) return;
    data.activeConvId = data.conversationOrder[0] || null;
}

function normalizeCloudSyncSnapshot(raw) {
    var data = raw && raw.data !== undefined ? raw.data : raw;
    if (data && data.snapshot !== undefined) data = data.snapshot;
    if (!isCloudSyncObjectMap(data)) throw new Error('云端快照为空或格式无效。');
    if (data.encrypted === true) return data;

    data.settings = normalizeCloudSyncObjectMap(data.settings);
    data.conversations = normalizeCloudSyncObjectMap(data.conversations);
    data.characters = normalizeCloudSyncObjectMap(data.characters);
    data.worldBooks = normalizeCloudSyncObjectMap(data.worldBooks);
    normalizeCloudSyncConversationOrder(data);
    normalizeCloudSyncActiveConversation(data);
    data.charactersMigrated = normalizeCloudSyncBoolean(data.charactersMigrated);
    data.lastSaved = normalizeCloudSyncTimestamp(data.lastSaved);
    return data;
}
