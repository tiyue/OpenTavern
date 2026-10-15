/**
 * 新手导读（文件：20-storage-service-save-helpers.js）
 *
 * 负责什么：这是“本地存储系统”中的“存储、存储服务、保存、辅助函数”部分。
 * 在程序中的位置：它在 OPFS、IndexedDB 和 localStorage 之间读写同一份应用快照。
 * 从哪里开始看：主要从 `isDangerouslyEmptyStorageSnapshot(data)`、`saveStorageServiceLocalHistorySnapshot(service, data)`、`mirrorStorageServiceSnapshotToOPFS(service, data)`、`scheduleStorageServiceInfoRefresh(无参数)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：这是用户数据安全相关代码；任何修改都要考虑写入失败、旧数据和回退路径。
 */
// ==================== StorageService Save Helpers ====================
function isDangerouslyEmptyStorageSnapshot(data) {
    const convs = Object.values((data && data.conversations) || {});
    const hasChars = Object.keys((data && data.characters) || {}).length > 0;
    const hasWorldBooks = Object.keys((data && data.worldBooks) || {}).length > 0;
    if (hasChars || hasWorldBooks) return false;
    if (convs.length === 0) return true;
    if (convs.length > 1) return false;
    const c = convs[0] || {};
    return (!Array.isArray(c.messages) || c.messages.length === 0) && !c.character && !c.title;
}

function saveStorageServiceLocalHistorySnapshot(service, data) {
    try {
        if (!service._isValidSnapshot(data)) return;
        const raw = JSON.stringify(data);
        const ts = service._snapshotTime(data) || Date.now();
        localStorage.setItem(STORAGE_BACKUP_PREFIX + ts, raw);
        const keys = Object.keys(localStorage)
            .filter(k => k.startsWith(STORAGE_BACKUP_PREFIX))
            .sort()
            .reverse();
        keys.slice(5).forEach(k => { try { localStorage.removeItem(k); } catch (_) {} });
    } catch (_) {}
}

function mirrorStorageServiceSnapshotToOPFS(service, data) {
    if (service._opfsMirrorAvailable && !service._isSafari()) {
        OPFSStorage.saveAll(service._cloneForPersist(data)).catch((e) => {
            service._opfsMirrorAvailable = false;
            service._opfsFailed = true;
            service._opfsFailureReason = e && e.message ? e.message : String(e);
            console.warn('[Storage] OPFS mirror write failed; canonical data remains safe:', e && e.message);
            scheduleStorageServiceInfoRefresh();
        });
    }
}

function scheduleStorageServiceInfoRefresh() {
    setTimeout(() => { try { if (typeof updateStorageInfo === 'function') updateStorageInfo(); } catch(_) {} }, 60);
}
