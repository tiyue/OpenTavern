// ==================== State Initialization Load Helpers ====================
async function loadInitialStateSnapshot() {
    var saved = null;

    try {
        saved = await StorageService.loadAll();
        if (saved) {
            console.log('[Storage] initState: loaded via StorageService, backend=', StorageService.getBackend());
        }
    } catch (e) {
        console.warn('[Storage] StorageService.loadAll error in initState, will try LS compat', e);
    }

    if (!saved) {
        var lsData = loadAll();
        if (lsData) saved = lsData;
    }

    return saved;
}

function applySavedStateSnapshot(saved) {
    if (!saved) {
        console.log('[Storage] No previous data found, starting fresh');
        return;
    }

    if (saved.settings) {
        Object.keys(saved.settings).forEach(function(key) {
            state.settings[key] = saved.settings[key];
        });
    }
    if (isSavedStateObjectMap(saved.conversations)) {
        state.conversations = saved.conversations;
    }
    if (saved.conversationOrder || saved.conversations) {
        state.conversationOrder = normalizeSavedStateConversationOrder(saved.conversationOrder, state.conversations);
    }
    if (typeof saved.activeConvId === 'string' && state.conversations[saved.activeConvId]) {
        state.activeConvId = saved.activeConvId;
    }
    if (isSavedStateObjectMap(saved.worldBooks)) state.worldBooks = saved.worldBooks;
    if (isSavedStateObjectMap(saved.characters)) state.characters = saved.characters;
    if (typeof saved.charactersMigrated !== 'undefined') {
        state._charactersMigrated = normalizeSavedStateBoolean(saved.charactersMigrated);
    }
}

function logInitialStateLoadResult(saved, migrationResult) {
    console.log('[Storage] Final load state after init:', {
        conversationsCount: Object.keys(state.conversations || {}).length,
        activeConvId: state.activeConvId,
        loadedFrom: saved && saved._loadedFrom,
        migrationResult
    });
}
