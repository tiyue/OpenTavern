// ==================== App Init Storage ====================
async function initializeStorageAndState() {
    if (StorageService && typeof StorageService.init === 'function') {
        try {
            await StorageService.init();
        } catch (e) {
            console.warn('[init] Storage init error (non-fatal)', e);
        }
    }
    try {
        await initState();
    } catch (e) {
        recoverAppStateAfterInitFailure(e);
    }
}

function recoverAppStateAfterInitFailure(error) {
    console.error('[init] initState failed (will continue with empty state):', error);
    ensureFallbackConversation();
}

function ensureFallbackConversation() {
    if (state.conversations && Object.keys(state.conversations).length > 0) return;

    var def = (typeof defaultConversation === 'function')
        ? defaultConversation()
        : { id: 'c-' + Date.now(), messages: [] };
    state.conversations = state.conversations || {};
    state.conversations[def.id] = def;
    state.activeConvId = def.id;
    state.conversationOrder = [def.id];
}
