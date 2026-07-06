// ==================== Conversation Import Helpers ====================
function getConversationImportRecords(data) {
    return data && Array.isArray(data.conversations) ? data.conversations : null;
}

function cloneConversationImportValue(value) {
    return JSON.parse(JSON.stringify(value));
}

function importConversationRecords(convsToImport) {
    var imported = 0;
    var skipped = 0;
    var importedConvs = [];

    convsToImport.forEach(function(conv) {
        if (!conv.id || !Array.isArray(conv.messages)) return;

        var incoming = cloneConversationImportValue(conv);
        if (state.conversations[incoming.id]) {
            incoming.id = makeId();
            skipped++;
        }

        state.conversations[incoming.id] = incoming;
        if (state.conversationOrder.indexOf(incoming.id) === -1) {
            state.conversationOrder.unshift(incoming.id);
        }
        importedConvs.push(incoming);
        imported++;
    });

    return { imported, skipped, conversations: importedConvs };
}

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

function buildConversationImportSuccessMessage(imported, skipped) {
    var msg = t('import_conv_success') + imported + t('import_conv_success_suffix');
    if (skipped > 0) msg += ' ' + skipped + t('import_conv_duplicate');
    return msg;
}
