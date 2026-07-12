/**
 * 新手导读（文件：22-cloud-sync-apply-conversations.js）
 *
 * 负责什么：这是“云同步系统”中的“云同步、应用数据、多个会话”部分。
 * 在程序中的位置：它把本地快照加密后上传，或下载远端快照并合并回应用状态。
 * 从哪里开始看：主要从 `normalizeCloudSyncRestoredConversations(无参数)`、`ensureCloudSyncRestoredActiveConversation(无参数)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：不要记录令牌、密码或明文快照；冲突处理必须防止较旧数据覆盖新数据。
 */
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
