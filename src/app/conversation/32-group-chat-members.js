/**
 * 新手导读（文件：32-group-chat-members.js）
 *
 * 负责什么：这是“会话与群聊模型”中的“群聊、成员”部分。
 * 在程序中的位置：它描述单聊、群聊、成员和发言人，并生成模型所需的群聊上下文。
 * 从哪里开始看：主要从 `isGroupChat(conv)`、`getGroupMembers(conv)`、`normalizeConversation(conv)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：消息中的角色、speaker 和成员标识各有用途，不能互相替代。
 */
// ==================== Group Chat Members ====================
function isGroupChat(conv) {
    return !!(conv && conv.group && Array.isArray(conv.group.members) && conv.group.members.length >= 2);
}

function getGroupMembers(conv) {
    if (!conv || !conv.group || !Array.isArray(conv.group.members)) return [];
    return conv.group.members
        .slice()
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

function normalizeConversation(conv) {
    if (!conv) return conv;
    normalizeConversationMessageIdentity(conv);
    refreshSummaryValidity(conv);
    if (typeof normalizeConversationFavorites === 'function') normalizeConversationFavorites(conv);

    if (typeof conv.group === 'undefined') {
        conv.group = null;
    }

    if (conv.group && Array.isArray(conv.group.members)) {
        conv.group.members.forEach((m, idx) => {
            if (typeof m.order !== 'number') m.order = idx;
            if (typeof m.muted !== 'boolean') m.muted = false;
        });
    }

    return conv;
}
