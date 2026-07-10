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
    data.conversationOrder = getConversationIdsWithMissingFallback(data.conversationOrder, data.conversations);
}

function normalizeCloudSyncActiveConversation(data) {
    data.activeConvId = getValidConversationIdOrFallback(data.activeConvId, data.conversationOrder, data.conversations);
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
