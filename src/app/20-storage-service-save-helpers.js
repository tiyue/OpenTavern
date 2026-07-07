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
            setTimeout(() => { try { if (typeof updateStorageInfo === 'function') updateStorageInfo(); } catch(_) {} }, 60);
        });
    }
}
