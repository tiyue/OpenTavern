/**
 * 新手导读（文件：20-storage-service-quota-backup.js）
 *
 * 负责什么：这是“本地存储系统”中的“存储、存储服务、容量配额、备份”部分。
 * 在程序中的位置：它在 OPFS、IndexedDB 和 localStorage 之间读写同一份应用快照。
 * 从哪里开始看：主要从 `buildStorageQuotaBackupName(date)`、`buildStorageQuotaBackupSnapshot(无参数)`、`getStorageQuotaBackupConversationOrder(order, conversations)`、`exportStorageQuotaBackup(data, filename)`、`downloadStorageQuotaBackupBlob(data, filename)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：这是用户数据安全相关代码；任何修改都要考虑写入失败、旧数据和回退路径。
 */
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
