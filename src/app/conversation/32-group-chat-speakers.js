/**
 * 新手导读（文件：32-group-chat-speakers.js）
 *
 * 负责什么：这是“会话与群聊模型”中的“群聊、发言人”部分。
 * 在程序中的位置：它描述单聊、群聊、成员和发言人，并生成模型所需的群聊上下文。
 * 从哪里开始看：主要从 `getNextGroupSpeaker(conv)`、`getCurrentSpeakerCharacter(conv)`、`getCurrentGeneratingSpeakerName(conv)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：消息中的角色、speaker 和成员标识各有用途，不能互相替代。
 */
// ==================== Group Chat Speaker Helpers ====================
function getNextGroupSpeaker(conv) {
    if (!isGroupChat(conv)) return null;

    var members = getGroupMembers(conv).filter(m => !m.muted);
    if (members.length === 0) return null;

    var lastAssistant = [...(conv.messages || [])].reverse().find(m =>
        m.role === 'assistant' && m.speaker
    );

    var lastIndex = -1;
    if (lastAssistant && lastAssistant.speaker) {
        var sp = lastAssistant.speaker;
        lastIndex = members.findIndex(m => m.character.name === sp);
        if (lastIndex === -1) {
            var lower = sp.toLowerCase();
            lastIndex = members.findIndex(m => (m.character.name || '').toLowerCase() === lower);
        }
    }

    var nextIndex = (lastIndex + 1) % members.length;
    return members[nextIndex] ? members[nextIndex].character : members[0].character;
}

function getCurrentSpeakerCharacter(conv) {
    if (!isGroupChat(conv)) return conv.character;

    if (conv._nextGroupSpeaker) {
        return conv._nextGroupSpeaker;
    }

    return getNextGroupSpeaker(conv);
}

function getCurrentGeneratingSpeakerName(conv) {
    if (!isGroupChat(conv)) {
        return conv.character ? conv.character.name : t('sender_assistant');
    }

    if (conv._nextGroupSpeaker) {
        return conv._nextGroupSpeaker.name;
    }

    var speakerChar = getNextGroupSpeaker(conv);
    return speakerChar ? speakerChar.name : 'Assistant';
}
