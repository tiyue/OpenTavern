// ==================== StorageService Load Candidate Readers ====================
function canReadStorageServiceOPFSCandidate(service) {
    return !storageIsFileProtocol() && (service._opfsReadableAvailable || (navigator.storage && navigator.storage.getDirectory));
}

async function collectStorageServiceOPFSCandidate(service, options, candidates) {
    try {
        if (!canReadStorageServiceOPFSCandidate(service)) return;
        const data = await OPFSStorage.loadAll();
        if (service._isValidSnapshot(data)) candidates.push({ backend: 'opfs', data });
    } catch (e) {
        if (options.warnOPFS !== false) console.warn('[Storage] OPFS recovery read failed:', e && e.message);
    }
}

async function collectStorageServiceIDBCandidate(service, options, candidates) {
    if (!service._idbAvailable) return;
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

function collectStorageServiceLocalCandidate(service, candidates) {
    const data = service._readLocalSnapshot();
    if (data) candidates.push({ backend: 'localStorage', data });
}

async function collectStorageServiceLegacyIDBCandidate(service, candidates) {
    if (typeof readLegacyIndexedDB !== 'function') return;
    try {
        const legacy = await readLegacyIndexedDB();
        if (service._isValidSnapshot(legacy)) candidates.push({ backend: 'legacy-idb', data: legacy });
    } catch (_) {}
}
