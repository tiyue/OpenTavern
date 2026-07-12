/**
 * 新手导读（文件：32-group-chat-message-helpers.js）
 *
 * 负责什么：这是“会话与群聊模型”中的“群聊、消息、辅助函数”部分。
 * 在程序中的位置：它描述单聊、群聊、成员和发言人，并生成模型所需的群聊上下文。
 * 从哪里开始看：主要从 `getMessageSenderName(msg, conv)`、`parseGroupMention(text, conv)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：消息中的角色、speaker 和成员标识各有用途，不能互相替代。
 */
// ==================== Group Chat Message Helpers ====================
function getMessageSenderName(msg, conv) {
    if (!msg) return t('sender_assistant');

    if (msg.role === 'user') {
        return state.settings.userName || t('sender_you');
    }

    if (msg.speaker) {
        return msg.speaker;
    }

    if (isGroupChat(conv)) {
        var members = getGroupMembers(conv);
        if (members.length > 0) {
            return members[0].character.name;
        }
        return 'Assistant';
    }

    return conv && conv.character ? conv.character.name : t('sender_assistant');
}

function parseGroupMention(text, conv) {
    if (!isGroupChat(conv) || !text) return null;

    var match = text.match(/@([^\s@，,。.!?]+)/);
    if (!match) return null;

    var mentionedName = match[1].trim();
    var members = getGroupMembers(conv);

    var found = members.find(m => m.character.name === mentionedName);
    if (!found) {
        var lower = mentionedName.toLowerCase();
        found = members.find(m => m.character.name.toLowerCase() === lower);
    }

    return found ? found.character : null;
}
