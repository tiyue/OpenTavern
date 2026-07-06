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
