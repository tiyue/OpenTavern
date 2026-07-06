// ==================== New Chat Picker Model Helpers ====================
function getNewChatPickerCharacterKey(character) {
    return (character && character.name || '').trim().toLowerCase();
}
