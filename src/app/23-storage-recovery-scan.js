// ==================== Storage Backend Recovery Scanner ====================
function createStorageRecoveryCandidate(backend, data) {
    return {
        backend: backend,
        data: data,
        lastSaved: data.lastSaved || 0,
        convCount: Object.keys(data.conversations || {}).length,
        charCount: Object.keys(data.characters || {}).length,
        wbCount: Object.keys(data.worldBooks || {}).length
    };
}

function hasRecoverableStorageData(data) {
    return !!(data && (
        Object.keys(data.conversations || {}).length > 0 ||
        Object.keys(data.characters || {}).length > 0 ||
        Object.keys(data.worldBooks || {}).length > 0 ||
        data.lastSaved ||
        data.settings
    ));
}

async function scanAllStorageBackends() {
    const candidates = [];

    try {
        if (!storageIsFileProtocol() && typeof OPFSStorage !== 'undefined' && OPFSStorage.loadAll) {
            const data = await OPFSStorage.loadAll();
            if (data && (Object.keys(data.conversations || {}).length > 0 || data.lastSaved)) {
                candidates.push(createStorageRecoveryCandidate('OPFS', data));
            }
        }
    } catch (e) {}

    try {
        if (typeof IDBStorage !== 'undefined' && IDBStorage.loadAll) {
            const data = await IDBStorage.loadAll({ fresh: true, retries: 2 });
            if (hasRecoverableStorageData(data)) {
                candidates.push(createStorageRecoveryCandidate('IndexedDB 快照', data));
            }
        }
    } catch (e) { console.warn('[Recovery] IndexedDB scan failed:', e && e.message); }

    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const data = JSON.parse(raw);
            if (hasRecoverableStorageData(data)) {
                candidates.push(createStorageRecoveryCandidate('localStorage', data));
            }
        }
    } catch (e) {}

    try {
        Object.keys(localStorage)
            .filter(k => k.startsWith(STORAGE_BACKUP_PREFIX))
            .forEach(k => {
                try {
                    const data = JSON.parse(localStorage.getItem(k));
                    if (hasRecoverableStorageData(data)) {
                        candidates.push(createStorageRecoveryCandidate('localStorage 历史备份', data));
                    }
                } catch (_) {}
            });
    } catch (e) {}

    try {
        const legacy = await readLegacyIndexedDB();
        if (legacy && (Object.keys(legacy.conversations || {}).length > 0 || legacy.lastSaved)) {
            candidates.push(createStorageRecoveryCandidate('IndexedDB (旧版)', legacy));
        }
    } catch (e) {}

    candidates.forEach(c => {
        c.hasUserData = !!(c.convCount || c.charCount || c.wbCount);
    });
    candidates.sort((a, b) => ((b.hasUserData ? 1 : 0) - (a.hasUserData ? 1 : 0)) || ((b.lastSaved || 0) - (a.lastSaved || 0)));
    return candidates;
}
