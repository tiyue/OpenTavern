/**
 * 新手导读（文件：22-cloud-sync-normalize.js）
 *
 * 负责什么：这是“云同步系统”中的“云同步、规范化”部分。
 * 在程序中的位置：它把本地快照加密后上传，或下载远端快照并合并回应用状态。
 * 从哪里开始看：主要从 `isCloudSyncObjectMap(value)`、`normalizeCloudSyncObjectMap(value)`、`normalizeCloudSyncTimestamp(value)`、`normalizeCloudSyncBoolean(value)`、`normalizeCloudSyncConversationOrder(data)`、`normalizeCloudSyncActiveConversation(data)`，以及另外 1 个内部步骤 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：不要记录令牌、密码或明文快照；冲突处理必须防止较旧数据覆盖新数据。
 */
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
