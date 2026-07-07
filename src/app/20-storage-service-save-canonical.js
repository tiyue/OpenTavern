// ==================== StorageService Canonical Save Helpers ====================
async function trySaveStorageServiceIDBCanonical(service, data) {
    if (!service._idbAvailable) return { saved: false, error: null };
    try {
        await IDBStorage.saveAll(data, { fresh: service._idbFailed });
        service._idbFailed = false;
        service._idbFailureReason = null;
        service._idbAvailable = true;
        service._primaryBackend = 'idb';
        service._lastUsedBackend = 'idb';
        return { saved: true, error: null };
    } catch (e) {
        service._idbFailed = true;
        service._idbFailureReason = e && e.message ? e.message : String(e);
        service._primaryBackend = 'idb';
        console.warn('[Storage] IndexedDB save failed after retry; localStorage emergency snapshot will still be written:', e && e.message);
        return { saved: false, error: e };
    }
}

function markStorageServiceLocalStorageCanonical(service, saved) {
    if (!saved) return false;
    service._primaryBackend = 'localStorage';
    service._lastUsedBackend = 'localStorage';
    return true;
}

function throwStorageServiceCanonicalSaveFailure(service, lastError, data) {
    if (lastError && service._isQuotaError(lastError)) service._handleQuotaExceeded(lastError, data);
    const err = lastError || new Error('All canonical storage backends failed');
    console.error('[Storage] All canonical save backends failed:', err);
    throw err;
}
