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
    const idbResult = await trySaveStorageServiceIDBCanonical(service, data);
    let savedCanonical = idbResult.saved;

    const lsOk = service._tryWriteLocalSnapshot(data);
    if (!savedCanonical) savedCanonical = markStorageServiceLocalStorageCanonical(service, lsOk);

    mirrorStorageServiceSnapshotToOPFS(service, data);
    scheduleStorageServiceInfoRefresh();

    if (savedCanonical) return;
    throwStorageServiceCanonicalSaveFailure(service, idbResult.error, data);
}
