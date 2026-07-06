// ==================== StorageService Initialization ====================
function installStorageServicePageHideHandler(service) {
    if (service._pageHideInstalled) return;
    service._pageHideInstalled = true;

    window.addEventListener('pagehide', () => {
        try {
            const snapshot = service._lastSaveSnapshot;
            if (snapshot) {
                service._tryWriteLocalSnapshot(snapshot);
                console.log('[Storage] pagehide: sync-flushed snapshot to localStorage');
            }
        } catch (_) {}
        try { if (typeof persistState === 'function') persistState(true); } catch (_) {}
    });

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            try { if (typeof persistState === 'function') persistState(true); } catch (_) {}
        }
    });

    console.log('[Storage] pagehide/visibilitychange snapshot handlers installed');
}

async function initStorageService(service) {
    service._installPageHideHandler();

    service._idbAvailable = false;
    service._idbFailed = false;
    service._lastUsedBackend = null;

    await initStorageServiceIDB(service);
    resetStorageServiceOPFSState(service);
    await initStorageServiceOPFS(service);
}

async function initStorageServiceIDB(service) {
    try {
        if ('indexedDB' in window) {
            await IDBStorage._open();
            service._idbAvailable = true;
            service._primaryBackend = 'idb';
            console.log('[Storage] IndexedDB primary backend initialized successfully');
        } else {
            throw new Error('IndexedDB not supported');
        }
    } catch (e) {
        service._idbFailed = true;
        service._idbFailureReason = e && e.message ? e.message : String(e);
        service._primaryBackend = 'localStorage';
        console.warn('[Storage] IndexedDB unavailable; localStorage is the emergency primary:', e && e.message);
    }
}
