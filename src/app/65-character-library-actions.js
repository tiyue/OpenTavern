// ==================== Character Library Actions ====================
async function removeCharacter() {
    if (!await showGlassConfirm(t('char_remove_confirm'), { title: '\u79fb\u9664\u89d2\u8272\u5361', danger: true, okText: '\u79fb\u9664' })) return;
    var conv = getActiveConv();
    if (!conv) return;
    conv.character = null;
    if (conv.title.indexOf(t('chat_with')) === 0) {
        conv.title = t('new_chat_title');
    }
    conv.updated = Date.now();
    persistState();
    requestFullRender();
}

function deleteCharacterFromLibrary(nameOrKey) {
    if (!nameOrKey) return;
    const key = nameOrKey.trim().toLowerCase();

    if (!state.characters || !state.characters[key]) return;

    delete state.characters[key];
    if (typeof removeMyCardKeyFromOrder === 'function') {
        removeMyCardKeyFromOrder(key);
    }
    persistState(true);

    try {
        const directData = {
            settings: (typeof getSafeSettingsForPersist === 'function' ? getSafeSettingsForPersist() : (state.settings || {})),
            conversations: state.conversations || {},
            conversationOrder: getCharacterLibraryPersistConversationOrder(state.conversationOrder, state.conversations),
            activeConvId: getValidConversationIdOrFallback(state.activeConvId, state.conversationOrder, state.conversations),
            worldBooks: state.worldBooks || {},
            characters: state.characters || {},
            charactersMigrated: !!state._charactersMigrated,
            lastSaved: Date.now()
        };
        if (StorageService) {
            StorageService._lastSaveSnapshot = directData;
        }
        if (StorageService && typeof StorageService.saveAll === 'function') {
            StorageService.saveAll(directData);
        } else {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(directData));
        }
    } catch (e) {
        console.warn('[DeleteCard] direct persist fallback failed:', e);
    }

    if (typeof renderLibraryGrids === 'function') {
        renderLibraryGrids();
    }

    const pickerList = document.getElementById('newChatPickerList');
    if (pickerList && !document.getElementById('newChatPickerModal').classList.contains('hidden')) {
        showNewChatCharacterPicker();
    }
}

function getCharacterLibraryPersistConversationOrder(order, conversations) {
    return getConversationIdsWithMissingFallback(order, conversations);
}
