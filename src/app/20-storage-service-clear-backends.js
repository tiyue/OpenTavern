// ==================== StorageService Backend Clear Helpers ====================
async function clearStorageServiceOPFS(service, emptyData, cleared) {
    try {
        if (canResetStorageServiceOPFSBeforeClear(service)) await runStorageServiceBackendClear(function() {
            return OPFSStorage.saveAll(emptyData);
        });
        if (typeof OPFSStorage !== 'undefined' && hasStorageServiceBackendMethod(OPFSStorage, 'clear')) await runStorageServiceBackendClear(function() {
            return OPFSStorage.clear();
        });
        markStorageServiceBackendCleared(cleared, 'opfs');
    } catch (e) {
        console.warn('[Storage] OPFS clear/reset error:', e);
    }
}

async function clearStorageServiceIDB(cleared) {
    try {
        if (typeof IDBStorage !== 'undefined' && hasStorageServiceBackendMethod(IDBStorage, 'clear')) {
            await IDBStorage.clear();
            markStorageServiceBackendCleared(cleared, 'idb');
        }
    } catch (e) {
        console.warn('[Storage] IDB clear/reset error:', e);
    }
}

function clearStorageServiceLocalSnapshot(emptyData, cleared) {
    try {
        removeStorageServiceLocalClearKeys();
        try { writeStorageServiceLocalEmptySnapshot(emptyData); } catch (_) {}
        cleared.ls = true;
    } catch (e) {}
}

async function clearStorageServiceLegacyIDB(cleared) {
    try {
        if ('indexedDB' in window) {
            await new Promise((resolve) => {
                const req = indexedDB.deleteDatabase('OpenTavernDB');
                req.onsuccess = req.onerror = req.onblocked = () => resolve();
            });
            markStorageServiceBackendCleared(cleared, 'legacyIdb');
        }
    } catch (e) {
        console.warn('[Storage] legacy IDB clear error:', e);
    }
}

async function clearStorageServiceWebLLMCache(cleared) {
    try {
        if (typeof clearWebLLMCache === 'function') {
            await clearWebLLMCache({ silent: true });
            markStorageServiceBackendCleared(cleared, 'webllm');
        }
    } catch (e) {}
}
