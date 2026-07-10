// ==================== StorageService Quota Backup Helpers ====================
function buildStorageQuotaBackupName(date) {
    const ts = (date || new Date()).toISOString().replace(/[:.]/g, '-');
    return `opentavern-backup-quota-${ts}.json`;
}

function buildStorageQuotaBackupSnapshot() {
    return {
        settings: state ? getSafeSettingsForPersist() : {},
        conversations: state ? state.conversations : {},
        conversationOrder: state ? getStorageQuotaBackupConversationOrder(state.conversationOrder, state.conversations) : [],
        activeConvId: state ? getValidConversationIdOrFallback(state.activeConvId, state.conversationOrder, state.conversations) : null,
        worldBooks: state ? (state.worldBooks || {}) : {},
        characters: state ? (state.characters || {}) : {},
        lastSaved: Date.now()
    };
}

function getStorageQuotaBackupConversationOrder(order, conversations) {
    return getConversationIdsWithMissingFallback(order, conversations);
}

function exportStorageQuotaBackup(data, filename) {
    if (typeof downloadJsonFile === 'function') {
        downloadJsonFile(data, filename);
    } else {
        downloadStorageQuotaBackupBlob(data, filename);
    }
}

function downloadStorageQuotaBackupBlob(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
}
