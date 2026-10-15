/**
 * 新手导读（文件：59-new-chat-archive.js）
 *
 * 负责什么：这是“新建聊天流程”中的“新建、聊天、归档”部分。
 * 在程序中的位置：它处理角色选择、群聊多选、首条消息、世界书关联和会话归档。
 * 从哪里开始看：主要从 `archiveCurrentConversation(无参数)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：新会话只有在角色与初始数据准备完成后才能保存和切换。
 */
// ==================== New Chat Archive Helpers ====================
function archiveCurrentConversation() {
    var conv = getActiveConv();
    if (!conv) return;
    var hasMessages = conv.messages.some(function(m) { return m.role !== 'system'; });
    if (!hasMessages) { alert(t('nothing_to_archive')); return; }
    var clone = JSON.parse(JSON.stringify(conv));
    clone.id = makeId();
    clone.title = conv.title + ' ' + t('copy_of');
    clone.created = Date.now();
    clone.updated = Date.now();
    state.conversations[clone.id] = clone;
    state.conversationOrder.unshift(clone.id);
    persistState();
    renderConversationList();
}
