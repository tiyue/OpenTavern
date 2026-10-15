/**
 * 新手导读（文件：59-new-chat-first-message.js）
 *
 * 负责什么：这是“新建聊天流程”中的“新建、聊天、第一条、消息”部分。
 * 在程序中的位置：它处理角色选择、群聊多选、首条消息、世界书关联和会话归档。
 * 从哪里开始看：主要从 `appendCharacterFirstMessage(conv, character, options)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：新会话只有在角色与初始数据准备完成后才能保存和切换。
 */
// ==================== New Chat First Message Helpers ====================
function appendCharacterFirstMessage(conv, character, options) {
    options = options || {};
    if (!conv || !character || !character.first_mes) return;
    var charName = character.name;
    var userName = state.settings.userName || 'User';
    if (typeof ensureConversationMvu === 'function') ensureConversationMvu(conv, { rebuildInitial: true, greetingText: character.first_mes, character: character });
    var firstMes = replacePlaceholders(character.first_mes, charName, userName, { conv: conv });
    if (!firstMes) return;

    var msg = { role: 'assistant', content: firstMes, id: makeId() };
    if (options.speaker) msg.speaker = options.speaker;
    conv.messages.push(msg);
    normalizeConversationMessageIdentity(conv);
}
