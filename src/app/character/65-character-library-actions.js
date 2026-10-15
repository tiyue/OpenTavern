/**
 * 新手导读（文件：65-character-library-actions.js）
 *
 * 负责什么：这是“角色编辑与移动端界面”中的“角色、资料库、操作”部分。
 * 在程序中的位置：它显示角色资料、编辑表单、导出操作和移动端侧边栏。
 * 从哪里开始看：主要从 `removeCharacter(无参数)`、`deleteCharacterFromLibrary(nameOrKey)`、`getCharacterLibraryPersistConversationOrder(order, conversations)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：编辑的是共享角色数据，保存后可能影响使用该角色的多个会话。
 */
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
