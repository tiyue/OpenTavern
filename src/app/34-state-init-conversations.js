// ==================== State Initialization Conversation Helpers ====================
function migrateCharacterRegistryOnStartup() {
    if (!state.characters) state.characters = {};
    if (state._charactersMigrated) return;

    migrateCharactersToRegistry(state.conversations || {});
    state._charactersMigrated = true;

    if (StorageService && StorageService._hasUserData && StorageService._hasUserData(state) && typeof persistState === 'function') {
        persistState(true);
    }
}

function ensureActiveConversationOnStartup() {
    var hasAnyConv = Object.keys(state.conversations || {}).length > 0;

    if (!state.activeConvId || !state.conversations[state.activeConvId]) {
        if (hasAnyConv) {
            recoverActiveConversationFromExistingData();
        }

        if (!state.activeConvId || !state.conversations[state.activeConvId]) {
            createStartupDefaultConversation();
        }
    }
}

function recoverActiveConversationFromExistingData() {
    var firstId = getFirstAvailableConversationId(state.conversationOrder, state.conversations);
    if (firstId) {
        state.activeConvId = firstId;
        console.log('[Storage] Recovered activeConvId from existing conversations:', firstId);
    } else {
        state.activeConvId = null;
    }
}

function createStartupDefaultConversation() {
    console.log('[Storage] No valid conversations found, creating a brand new default one');
    var conv = defaultConversation();
    state.conversations[conv.id] = conv;
    state.conversationOrder.unshift(conv.id);
    state.activeConvId = conv.id;
}
