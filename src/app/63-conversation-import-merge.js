// ==================== Conversation Import Merge Helpers ====================
function mergeImportedTopLevelCharacters(characters) {
    if (!characters || typeof characters !== 'object') return;
    if (!state.characters) state.characters = {};

    Object.keys(characters).forEach(function(key) {
        if (!state.characters[key]) {
            state.characters[key] = cloneConversationImportValue(characters[key]);
        }
    });
}

function registerImportedConversationCharacters(importedConvs) {
    if (typeof migrateCharactersToRegistry === 'function') {
        migrateCharactersToRegistry(importedConvs);
        return;
    }

    if (!state.characters) state.characters = {};
    importedConvs.forEach(function(conv) {
        registerImportedCharacter(conv.character);
        if (conv.group && Array.isArray(conv.group.members)) {
            conv.group.members.forEach(function(member) {
                registerImportedCharacter(member && member.character);
            });
        }
    });
}

function registerImportedCharacter(char) {
    if (!char || !char.name) return;
    var key = char.name.trim().toLowerCase();
    if (!state.characters[key]) {
        state.characters[key] = cloneConversationImportValue(char);
    }
}

function mergeImportedWorldBooks(worldBooks) {
    if (!worldBooks || typeof worldBooks !== 'object') return;
    if (!state.worldBooks) state.worldBooks = {};

    Object.keys(worldBooks).forEach(function(wbId) {
        if (!state.worldBooks[wbId]) {
            state.worldBooks[wbId] = cloneConversationImportValue(worldBooks[wbId]);
        }
    });
}

function applySuccessfulConversationImport(data, importResult) {
    mergeImportedTopLevelCharacters(data.characters);
    registerImportedConversationCharacters(importResult.conversations);
    mergeImportedWorldBooks(data.worldBooks);

    persistState(true);
    if (typeof updateStorageInfo === 'function') updateStorageInfo();

    if (typeof renderLibraryGrids === 'function') renderLibraryGrids();
    if (typeof renderMyCards === 'function') renderMyCards();

    if (!state.activeConvId && state.conversationOrder.length > 0) {
        state.activeConvId = state.conversationOrder[0];
    }
    persistState(true);
    requestRender('activeConvId');
}
