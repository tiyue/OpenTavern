// ==================== Character Import Conversation Helpers ====================
function prepareConversationForImportedCharacter() {
    var conv = getActiveConv();
    if (!conv) {
        newConversation();
        conv = getActiveConv();
    }

    var hasMsgs = conv.messages.some(function(m) { return m.role !== 'system'; });
    if (!hasMsgs) return conv;

    saveCurrentConversation();
    var oldWorldInfo = conv.worldInfo ? JSON.parse(JSON.stringify(conv.worldInfo)) : null;
    var oldWorldBookIds = Array.isArray(conv.worldBookIds) ? conv.worldBookIds.slice() : [];
    var newConv = defaultConversation();
    state.conversations[newConv.id] = newConv;
    state.conversationOrder.unshift(newConv.id);
    state.activeConvId = newConv.id;

    if (oldWorldInfo) newConv.worldInfo = oldWorldInfo;
    if (oldWorldBookIds.length > 0) newConv.worldBookIds = oldWorldBookIds;
    return newConv;
}

function applyImportedCharacterToConversation(conv, character) {
    conv.character = character;
    conv.title = t('chat_with') + character.name;
    conv.messages = [];
    currentCharacterName = character.name;
}

function attachEmbeddedCharacterBook(json, character, conv) {
    var embeddedBook = null;
    try {
        embeddedBook = importCharacterBookFromCard(json, character.name);
        if (embeddedBook) {
            conv.worldBookIds = conv.worldBookIds || [];
            if (!conv.worldBookIds.includes(embeddedBook.id)) {
                conv.worldBookIds.push(embeddedBook.id);
            }
        }
    } catch (e) {
        console.warn('Failed to import embedded character book; character import continues:', e);
    }
    return embeddedBook;
}

function registerImportedCharacter(character) {
    if (!character.name) return;
    var key = character.name.trim().toLowerCase();
    if (!state.characters) state.characters = {};
    state.characters[key] = JSON.parse(JSON.stringify(character));
}

function addImportedCharacterFirstMessage(conv, character) {
    var charName = character.name;
    var userName = state.settings.userName || 'User';
    var firstMes = replacePlaceholders(character.first_mes, charName, userName);
    if (firstMes) {
        conv.messages.push({ role: 'assistant', content: firstMes });
    }
}
