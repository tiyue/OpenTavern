// ==================== StorageService Load Candidates ====================
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
