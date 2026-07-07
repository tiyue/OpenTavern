// ==================== Storage Recovery Backend Scanners ====================
async function scanOPFSStorageRecoveryCandidate(candidates) {
    try {
        if (!storageIsFileProtocol() && typeof OPFSStorage !== 'undefined' && OPFSStorage.loadAll) {
            const data = await OPFSStorage.loadAll();
            if (data && (Object.keys(data.conversations || {}).length > 0 || data.lastSaved)) {
                candidates.push(createStorageRecoveryCandidate('OPFS', data));
            }
        }
    } catch (e) {}
}

async function scanIDBStorageRecoveryCandidate(candidates) {
    try {
        if (typeof IDBStorage !== 'undefined' && IDBStorage.loadAll) {
            const data = await IDBStorage.loadAll({ fresh: true, retries: 2 });
            if (hasRecoverableStorageData(data)) {
                candidates.push(createStorageRecoveryCandidate('IndexedDB 快照', data));
            }
        }
    } catch (e) { console.warn('[Recovery] IndexedDB scan failed:', e && e.message); }
}

function scanLocalStorageCurrentRecoveryCandidate(candidates) {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const data = JSON.parse(raw);
            if (hasRecoverableStorageData(data)) {
                candidates.push(createStorageRecoveryCandidate('localStorage', data));
            }
        }
    } catch (e) {}
}

function scanLocalStorageBackupRecoveryCandidates(candidates) {
    try {
        Object.keys(localStorage)
            .filter(function(k) { return k.startsWith(STORAGE_BACKUP_PREFIX); })
            .forEach(function(k) {
                try {
                    const data = JSON.parse(localStorage.getItem(k));
                    if (hasRecoverableStorageData(data)) {
                        candidates.push(createStorageRecoveryCandidate('localStorage 历史备份', data));
                    }
                } catch (_) {}
            });
    } catch (e) {}
}

async function scanLegacyIDBStorageRecoveryCandidate(candidates) {
    try {
        const legacy = await readLegacyIndexedDB();
        if (legacy && (Object.keys(legacy.conversations || {}).length > 0 || legacy.lastSaved)) {
            candidates.push(createStorageRecoveryCandidate('IndexedDB (旧版)', legacy));
        }
    } catch (e) {}
}
