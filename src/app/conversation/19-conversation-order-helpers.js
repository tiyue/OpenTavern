/**
 * 新手导读（文件：19-conversation-order-helpers.js）
 *
 * 负责什么：这是“会话排序辅助”中的“会话、顺序、辅助函数”部分。
 * 在程序中的位置：它计算会话显示顺序，供资料库和聊天列表共同使用。
 * 从哪里开始看：主要从 `getConversationIdsWithMissingFallback(order, conversations)`、`getFirstAvailableConversationId(order, conversations)`、`getValidConversationIdOrFallback(activeId, order, conversations)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：排序字段可能来自旧数据，比较前必须保留兼容和默认值处理。
 */
// ==================== Conversation Order Helpers ====================
function getConversationIdsWithMissingFallback(order, conversations) {
    var ids = Array.isArray(order) ? order.slice() : [];
    var knownConversations = conversations || {};
    var seen = Object.create(null);
    ids = ids.filter(function(id) {
        if (!Object.prototype.hasOwnProperty.call(knownConversations, id) || !knownConversations[id] || seen[id]) return false;
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
    if (typeof activeId === 'string' && Object.prototype.hasOwnProperty.call(knownConversations, activeId) && knownConversations[activeId]) return activeId;
    return getFirstAvailableConversationId(order, knownConversations);
}
