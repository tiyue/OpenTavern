// ==================== New Chat Single Character Helpers ====================
function configureSingleCharacterConversation(conv, character) {
    if (!conv || !character) return;
    conv.character = JSON.parse(JSON.stringify(character));
    currentCharacterName = character.name;
    appendCharacterFirstMessage(conv, conv.character);
    conv.title = t('chat_with') + conv.character.name;
}
