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
