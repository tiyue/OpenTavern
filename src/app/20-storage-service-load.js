// ==================== StorageService Load Pipeline ====================
async function syncStorageServiceSnapshotToAvailableBackends(service, data, source) {
    if (!service._isValidSnapshot(data)) return;
    const snapshot = service._cloneForPersist(data);
    const jobs = [];

    if (source !== 'idb' && service._idbAvailable) {
        jobs.push(IDBStorage.saveAll(service._cloneForPersist(snapshot)).catch((e) => {
            service._idbFailureReason = e && e.message ? e.message : String(e);
            console.warn('[Storage] IDB sync failed; will retry on next save/load:', e && e.message);
        }));
    }

    if (source !== 'localStorage') service._tryWriteLocalSnapshot(snapshot);

    if (source !== 'opfs' && service._opfsMirrorAvailable && !service._isSafari()) {
        jobs.push(OPFSStorage.saveAll(service._cloneForPersist(snapshot)).catch((e) => {
            service._opfsMirrorAvailable = false;
            service._opfsFailed = true;
            service._opfsFailureReason = e && e.message ? e.message : String(e);
            console.warn('[Storage] OPFS mirror sync failed; canonical data remains in IndexedDB/localStorage:', e && e.message);
        }));
    }

    if (jobs.length) await Promise.all(jobs);
}

async function collectStorageServiceSnapshotCandidates(service, options) {
    options = options || {};
    const shouldReadLegacy = options.includeLegacy !== false;
    const candidates = [];

    try {
        if (!storageIsFileProtocol() && (service._opfsReadableAvailable || (navigator.storage && navigator.storage.getDirectory))) {
            const data = await OPFSStorage.loadAll();
            if (service._isValidSnapshot(data)) candidates.push({ backend: 'opfs', data });
        }
    } catch (e) {
        if (options.warnOPFS !== false) console.warn('[Storage] OPFS recovery read failed:', e && e.message);
    }

    if (service._idbAvailable) {
        try {
            const data = await IDBStorage.loadAll({ fresh: true });
            service._idbFailed = false;
            service._idbFailureReason = null;
            service._idbAvailable = true;
            if (service._isValidSnapshot(data)) candidates.push({ backend: 'idb', data });
        } catch (e) {
            service._idbFailureReason = e && e.message ? e.message : String(e);
            if (options.warnIDB !== false) console.warn('[Storage] IDB load failed; keeping IndexedDB retryable:', e && e.message);
        }
    }

    const lsData = service._readLocalSnapshot();
    if (lsData) candidates.push({ backend: 'localStorage', data: lsData });

    if (shouldReadLegacy && typeof readLegacyIndexedDB === 'function') {
        try {
            const legacy = await readLegacyIndexedDB();
            if (service._isValidSnapshot(legacy)) candidates.push({ backend: 'legacy-idb', data: legacy });
        } catch (_) {}
    }

    return candidates;
}

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
