/**
 * 新手导读（文件：23-storage-recovery-backends.js）
 *
 * 负责什么：这是“旧存储恢复”中的“存储、恢复、多个存储后端”部分。
 * 在程序中的位置：它扫描旧版数据库和备份候选，帮助用户找回历史数据。
 * 从哪里开始看：主要从 `scanOPFSStorageRecoveryCandidate(candidates)`、`scanIDBStorageRecoveryCandidate(candidates)`、`scanLocalStorageCurrentRecoveryCandidate(candidates)`、`scanLocalStorageBackupRecoveryCandidates(candidates)`、`scanLegacyIDBStorageRecoveryCandidate(candidates)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：恢复前应先预览候选，不能在尚未确认时删除现有数据。
 */
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
