/**
 * 新手导读（文件：52-conversation-save.js）
 *
 * 负责什么：这是“回复生成主流程”中的“会话、保存”部分。
 * 在程序中的位置：它串联提示词、模型调用、流式气泡、消息保存和可选的二段生成。
 * 从哪里开始看：主要从 `saveCurrentConversation(无参数)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：主回复与二段结果必须保持独立并通过 parentId 关联，避免选项混入正文。
 */
// ==================== Conversation Save Helpers ====================
function saveCurrentConversation() {
    var conv = getActiveConv();
    if (!conv) return;
    var hasMessages = conv.messages.some(function(m) { return m.role !== 'system'; });
    if (!hasMessages) return;
    conv.updated = Date.now();
    if (conv.title === t('title_new_chat_match')) {
        var firstUser = conv.messages.find(function(m) { return m.role === 'user'; });
        if (firstUser) {
            conv.title = firstUser.content.slice(0, 50) + (firstUser.content.length > 50 ? '...' : '');
        } else {
            conv.title = t('chat_title_default') + new Date(conv.created).toLocaleDateString();
        }
    }
    persistState();
}
