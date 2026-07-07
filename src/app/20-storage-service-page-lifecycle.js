// ==================== StorageService Page Lifecycle Helpers ====================
function flushStorageServiceSnapshotToLocal(service) {
    const snapshot = service._lastSaveSnapshot;
    if (!snapshot) return;
    service._tryWriteLocalSnapshot(snapshot);
    console.log('[Storage] pagehide: sync-flushed snapshot to localStorage');
}

function persistStorageServicePageHide(service) {
    try { flushStorageServiceSnapshotToLocal(service); } catch (_) {}
    try { if (typeof persistState === 'function') persistState(true); } catch (_) {}
}

function persistStorageServiceVisibilityState() {
    if (!document.hidden) return;
    try { if (typeof persistState === 'function') persistState(true); } catch (_) {}
}

function bindStorageServicePageLifecycleHandlers(service) {
    window.addEventListener('pagehide', () => {
        persistStorageServicePageHide(service);
    });

    document.addEventListener('visibilitychange', () => {
        persistStorageServiceVisibilityState();
    });

    console.log('[Storage] pagehide/visibilitychange snapshot handlers installed');
}
