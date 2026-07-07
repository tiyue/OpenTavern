// ==================== StorageService Save Pipeline ====================
async function saveStorageServiceData(service, data) {
    data = service._cloneForPersist(data);

    const previous = await service._readNewestStoredSnapshotNoSync().catch(() => null);
    if (previous && previous.data) service._saveLocalHistorySnapshot(previous.data);

    if (service._isDangerouslyEmptySnapshot(data) && previous && service._hasUserData(previous.data)) {
        console.warn('[Storage] Refusing to overwrite existing user data with an empty startup snapshot.');
        service._lastSaveSnapshot = previous.data;
        await service._syncSnapshotToAvailableBackends(previous.data, previous.backend || 'unknown').catch(() => {});
        return;
    }

    service._lastSaveSnapshot = data;
    let savedCanonical = false;
    let lastError = null;

    if (service._idbAvailable) {
        try {
            await IDBStorage.saveAll(data, { fresh: service._idbFailed });
            service._idbFailed = false;
            service._idbFailureReason = null;
            service._idbAvailable = true;
            service._primaryBackend = 'idb';
            service._lastUsedBackend = 'idb';
            savedCanonical = true;
        } catch (e) {
            lastError = e;
            service._idbFailed = true;
            service._idbFailureReason = e && e.message ? e.message : String(e);
            service._primaryBackend = 'idb';
            console.warn('[Storage] IndexedDB save failed after retry; localStorage emergency snapshot will still be written:', e && e.message);
        }
    }

    const lsOk = service._tryWriteLocalSnapshot(data);
    if (!savedCanonical && lsOk) {
        service._primaryBackend = 'localStorage';
        service._lastUsedBackend = 'localStorage';
        savedCanonical = true;
    }

    mirrorStorageServiceSnapshotToOPFS(service, data);
    setTimeout(() => { try { if (typeof updateStorageInfo === 'function') updateStorageInfo(); } catch(_) {} }, 60);

    if (savedCanonical) return;

    if (lastError && service._isQuotaError(lastError)) service._handleQuotaExceeded(lastError, data);
    const err = lastError || new Error('All canonical storage backends failed');
    console.error('[Storage] All canonical save backends failed:', err);
    throw err;
}
