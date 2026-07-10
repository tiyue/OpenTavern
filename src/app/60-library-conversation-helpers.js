// ==================== Library Conversation Helpers ====================
function findMostRecentConversationForCharacter(characterName) {
    if (!characterName) return null;

    var recentId = null;
    var recentTime = 0;
    var order = getConversationIdsWithMissingFallback(state.conversationOrder, state.conversations);
    order.forEach(function(id) {
        var conv = state.conversations && state.conversations[id];
        if (conv && conv.character && conv.character.name === characterName) {
            var t = getConversationActivityTimestamp(conv);
            if (!recentId || t > recentTime) {
                recentTime = t;
                recentId = id;
            }
        }
    });
    return recentId ? state.conversations[recentId] : null;
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
    var nextId = getMostRecentConversationIdFromOrder(
        getConversationIdsWithMissingFallback(state.conversationOrder, state.conversations),
        state.conversations
    );
    if (nextId) {
        state.activeConvId = nextId;
        return;
    }
    state.activeConvId = createDefaultLibraryConversation().id;
}

function deleteConversationFromLibraryState(id) {
    removeConversationFromLibraryState(id);
    ensureLibraryActiveConversationAfterDelete(id);
}
