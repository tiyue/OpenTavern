// ==================== StorageService Backend Clear Helpers ====================
async function clearStorageServiceOPFS(service, emptyData, cleared) {
    try {
        if (typeof OPFSStorage !== 'undefined' && typeof OPFSStorage.saveAll === 'function' && service._opfsMirrorAvailable && !service._isSafari()) {
            await OPFSStorage.saveAll(emptyData).catch(() => {});
        }
        if (typeof OPFSStorage !== 'undefined' && typeof OPFSStorage.clear === 'function') {
            try { await OPFSStorage.clear(); } catch (_) {}
        }
        cleared.opfs = true;
    } catch (e) {
        console.warn('[Storage] OPFS clear/reset error:', e);
    }
}

async function clearStorageServiceIDB(cleared) {
    try {
        if (typeof IDBStorage !== 'undefined' && typeof IDBStorage.clear === 'function') {
            await IDBStorage.clear();
            cleared.idb = true;
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
            cleared.legacyIdb = true;
        }
    } catch (e) {
        console.warn('[Storage] legacy IDB clear error:', e);
    }
}

async function clearStorageServiceWebLLMCache(cleared) {
    try {
        if (typeof clearWebLLMCache === 'function') {
            await clearWebLLMCache({ silent: true });
            cleared.webllm = true;
        }
    } catch (e) {}
}
