/**
 * 新手导读（文件：59-conversation-timestamp-helpers.js）
 *
 * 负责什么：这是“新建聊天流程”中的“会话、时间、辅助函数”部分。
 * 在程序中的位置：它处理角色选择、群聊多选、首条消息、世界书关联和会话归档。
 * 从哪里开始看：主要从 `getConversationActivityTimestamp(conv)`、`getMostRecentConversationIdFromOrder(order, conversations)`、`getLastMessageActivityTimestamp(conv)`、`getMessageActivityTimestamp(msg)`、`normalizeConversationActivityTimestamp(value)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：新会话只有在角色与初始数据准备完成后才能保存和切换。
 */
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
