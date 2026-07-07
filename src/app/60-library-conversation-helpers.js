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

function removeConversationFromLibraryState(id) {
    delete state.conversations[id];
    state.conversationOrder = (state.conversationOrder || []).filter(function(x) { return x !== id; });
}

function createDefaultLibraryConversation() {
    var conv = defaultConversation();
    state.conversations[conv.id] = conv;
    state.conversationOrder.push(conv.id);
    return conv;
}

function ensureLibraryActiveConversationAfterDelete(deletedId) {
    if (state.activeConvId !== deletedId) return;
    if (state.conversationOrder.length > 0) {
        state.activeConvId = state.conversationOrder[0];
        return;
    }
    state.activeConvId = createDefaultLibraryConversation().id;
}

function deleteConversationFromLibraryState(id) {
    removeConversationFromLibraryState(id);
    ensureLibraryActiveConversationAfterDelete(id);
}
