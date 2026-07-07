// ==================== StorageService Load Pipeline ====================
async function readNewestStorageServiceSnapshotNoSync(service) {
    const candidates = await collectStorageServiceSnapshotCandidates(service, {
        includeLegacy: false,
        warnOPFS: false,
        warnIDB: false
    });
    return service._pickNewest(candidates);
}

async function loadStorageServiceData(service, options) {
    options = options || {};
    const shouldSync = options.sync !== false;
    const candidates = await collectStorageServiceSnapshotCandidates(service, options);
    const picked = service._pickNewest(candidates);
    if (!picked) return null;

    service._lastLoadedBackend = picked.backend;
    service._lastUsedBackend = service.getBackend();
    service._lastSaveSnapshot = picked.data;
    console.log('[Storage] Loaded newest snapshot from', picked.backend, 'canonical backend=', service.getBackend());
    if (shouldSync) await service._syncSnapshotToAvailableBackends(picked.data, picked.backend);
    return picked.data;
}
