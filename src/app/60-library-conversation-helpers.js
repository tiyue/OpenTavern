// ==================== Library Conversation Helpers ====================
function findMostRecentConversationForCharacter(characterName) {
    if (!characterName) return null;

    var recentConv = null;
    var recentTime = 0;
    Object.values(state.conversations || {}).forEach(function(conv) {
        if (conv && conv.character && conv.character.name === characterName) {
            var t = conv.updated || conv.created || 0;
            if (t > recentTime) {
                recentTime = t;
                recentConv = conv;
            }
        }
    });
    return recentConv;
}

function getConversationDisplayCharacterName(conv) {
    if (conv && conv.character && conv.character.name) return conv.character.name;
    if (!conv || !isGroupChat(conv) || !conv.group || !Array.isArray(conv.group.members)) return null;

    var firstMember = conv.group.members[0];
    if (!firstMember || !firstMember.character || !firstMember.character.name) return null;
    return firstMember.character.name;
}

function resetConversationRuntimeState(conv) {
    if (!conv) return;
    conv._showAllMessages = false;
    conv._lastRenderedVisibleCount = 0;
    conv._historyWindow = 150;
    conv._historyScrollHandler = null;
    conv._wiCache = null;
}
