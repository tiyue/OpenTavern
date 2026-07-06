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

function resetStorageServiceOPFSState(service) {
    service._opfsReadableAvailable = false;
    service._opfsMirrorAvailable = false;
    service._opfsSkipped = false;
    service._opfsSkippedReason = null;
    service._opfsFailed = false;
    service._opfsFailureReason = null;
}

function markStorageServiceOPFSSkipped(service, reason) {
    service._opfsSkipped = true;
    service._opfsSkippedReason = reason;
    service._opfsFailed = false;
    service._opfsFailureReason = null;
}

async function initStorageServiceOPFS(service) {
    try {
        if (!service._useOPFS) {
            markStorageServiceOPFSSkipped(service, 'disabled');
            return;
        }
        if (storageIsFileProtocol()) {
            markStorageServiceOPFSSkipped(service, 'file-protocol');
            return;
        }
        if (!window.isSecureContext) throw new Error('insecure-context');
        if (!navigator.storage || !navigator.storage.getDirectory) throw new Error('OPFS not supported');

        await OPFSStorage._getRoot();
        service._opfsReadableAvailable = true;

        if (service._isSafari()) {
            service._opfsFailed = true;
            service._opfsFailureReason = 'Safari OPFS writes are disabled; IndexedDB is canonical.';
            console.warn('[Storage] Safari detected: OPFS will be read for recovery only, not used for writes.');
            return;
        }

        const probe = await OPFSStorage.probeWritable();
        if (probe && probe.ok) {
            service._opfsMirrorAvailable = true;
            console.log('[Storage] OPFS writable mirror initialized successfully');
        } else {
            service._opfsFailed = true;
            service._opfsFailureReason = (probe && probe.reason) || 'OPFS write probe failed';
            console.warn('[Storage] OPFS write probe failed; keeping IndexedDB/localStorage canonical:', service._opfsFailureReason);
        }
    } catch (e) {
        const msg = e && e.message ? e.message : String(e);
        if (storageIsFileProtocol() || /file:|file-protocol|blocked on file/i.test(msg)) {
            markStorageServiceOPFSSkipped(service, 'file-protocol');
            return;
        }
        service._opfsFailed = true;
        service._opfsFailureReason = msg;
        console.info('[Storage] OPFS unavailable; IndexedDB/localStorage remain canonical:', msg);
    }
}
