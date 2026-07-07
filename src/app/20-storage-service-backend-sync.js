// ==================== StorageService Backend Sync ====================
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
