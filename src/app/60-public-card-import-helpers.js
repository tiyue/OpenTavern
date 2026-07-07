// ==================== Public Card Import Helpers ====================
function applyPublicCardImportMetadata(character, cardMeta) {
    if (cardMeta && cardMeta.previewImage) {
        character.previewImage = resolvePublicCardImageUrl(cardMeta);
    }
    if (cardMeta && cardMeta.author && !character.author) {
        character.author = cardMeta.author;
    }
}

function storeImportedPublicCardCharacter(character) {
    const key = character.name.trim().toLowerCase();
    if (!state.characters) state.characters = {};
    state.characters[key] = JSON.parse(JSON.stringify(character));
}

function refreshOpenNewChatPickerAfterPublicCardImport() {
    const picker = document.getElementById('newChatPickerList');
    const pickerModal = document.getElementById('newChatPickerModal');
    if (picker && pickerModal && !pickerModal.classList.contains('hidden')) {
        showNewChatCharacterPicker();
    }
}

function refreshPublicCardImportViews() {
    if (currentView === 'library' && typeof renderLibraryGrids === 'function') {
        renderLibraryGrids();
    }
    refreshOpenNewChatPickerAfterPublicCardImport();
}
