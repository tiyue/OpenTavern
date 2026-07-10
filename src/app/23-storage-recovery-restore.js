// ==================== Storage Candidate Restore ====================
function applyStorageRecoveryData(data) {
    if (data.settings) {
        Object.keys(data.settings).forEach(function(key) {
            state.settings[key] = data.settings[key];
        });
    }
    if (data.conversations) state.conversations = data.conversations;
    if (data.conversationOrder || data.conversations) {
        state.conversationOrder = getStorageRecoveryConversationOrder(data.conversationOrder, state.conversations);
    }
    state.activeConvId = getStorageRecoveryActiveConversationId(data.activeConvId);
    if (data.worldBooks) state.worldBooks = data.worldBooks;
    if (data.characters) state.characters = data.characters;
    if (typeof data.charactersMigrated !== 'undefined') {
        state._charactersMigrated = !!data.charactersMigrated;
    }
}

function buildStorageRecoverySaveSnapshot() {
    return {
        settings: getSafeSettingsForPersist(),
        conversations: state.conversations,
        conversationOrder: getStorageRecoveryConversationOrder(state.conversationOrder, state.conversations),
        activeConvId: state.activeConvId,
        worldBooks: state.worldBooks || {},
        characters: state.characters || {},
        charactersMigrated: !!state._charactersMigrated,
        lastSaved: Date.now()
    };
}

function getStorageRecoveryConversationOrder(order, conversations) {
    return getConversationIdsWithMissingFallback(order, conversations);
}

function getStorageRecoveryActiveConversationId(activeId) {
    return getValidConversationIdOrFallback(activeId, state.conversationOrder, state.conversations);
}

async function restoreFromStorageCandidate(candidate) {
    if (!candidate || !candidate.data) return;

    const data = candidate.data;
    const msg = `确定从「${candidate.backend}」恢复吗？\n\n` +
                `最后保存: ${candidate.lastSaved ? new Date(candidate.lastSaved).toLocaleString() : '未知'}\n` +
                `对话: ${candidate.convCount}  角色卡: ${candidate.charCount}  世界书: ${candidate.wbCount}\n\n` +
                `当前未保存的数据将会丢失，建议先点“Export All”备份！`;

    if (!await showGlassConfirm(msg, { title: '\u6062\u590d\u5b58\u50a8\u6570\u636e', danger: true, okText: '\u6062\u590d' })) return;

    try {
        applyStorageRecoveryData(data);

        const dataToSave = buildStorageRecoverySaveSnapshot();
        if (typeof StorageService !== 'undefined' && typeof StorageService.saveAll === 'function') {
            await StorageService.saveAll(dataToSave);
        } else {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToSave));
        }

        alert(`已从 ${candidate.backend} 恢复成功！页面即将刷新...`);
        location.reload();
    } catch (err) {
        console.error('[Recovery] restore failed:', err);
        alert('恢复失败：' + (err.message || err));
    }
}
