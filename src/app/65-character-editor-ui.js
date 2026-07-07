// ==================== Character Editor UI ====================
function openCharacterEditor() {
    var conv = getActiveConv();
    var c = conv && conv.character;
    hydrateCharacterEditorForm(c);
    dom.charEditorModal.classList.remove('hidden');
}

function saveCharacterEdits() {
    var conv = getActiveConv();
    if (!conv) return;

    var wasNew = !conv.character || !conv.character.name || conv.character.name === 'Unnamed';
    var character = buildCharacterFromEditorForm(conv.character);
    conv.character = character;

    registerEditedCharacter(character);

    if (shouldSeedEditedCharacterFirstMessage(conv, character, wasNew)) {
        var charName = character.name;
        var userName = state.settings.userName || 'User';
        var firstMes = replacePlaceholders(character.first_mes, charName, userName);
        if (firstMes) conv.messages.push({ role: 'assistant', content: firstMes });
    }

    updateEditedCharacterConversationTitle(conv, character, wasNew);
    conv.updated = Date.now();
    persistState();

    if (typeof renderLibraryGrids === 'function') {
        renderLibraryGrids();
    }

    dom.charEditorModal.classList.add('hidden');

    renderCharacterUI();
    renderMessagesOnly();
    renderConversationListOnly();
    appStore.notify('conversations');
}
