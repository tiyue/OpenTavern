/**
 * 新手导读（文件：20-storage-service-clear-backends.js）
 *
 * 负责什么：这是“本地存储系统”中的“存储、存储服务、清理、多个存储后端”部分。
 * 在程序中的位置：它在 OPFS、IndexedDB 和 localStorage 之间读写同一份应用快照。
 * 从哪里开始看：主要从 `clearStorageServiceOPFS(service, emptyData, cleared)`、`clearStorageServiceIDB(cleared)`、`clearStorageServiceLocalSnapshot(emptyData, cleared)`、`clearStorageServiceLegacyIDB(cleared)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：这是用户数据安全相关代码；任何修改都要考虑写入失败、旧数据和回退路径。
 */
// ==================== StorageService Backend Clear Helpers ====================
async function clearStorageServiceOPFS(service, emptyData, cleared) {
    try {
        if (canResetStorageServiceOPFSBeforeClear(service)) await runStorageServiceBackendClear(function() {
            return OPFSStorage.saveAll(emptyData);
        });
        if (typeof OPFSStorage !== 'undefined' && hasStorageServiceBackendMethod(OPFSStorage, 'clear')) await runStorageServiceBackendClear(function() {
            return OPFSStorage.clear();
        });
        markStorageServiceBackendCleared(cleared, 'opfs');
    } catch (e) {
        console.warn('[Storage] OPFS clear/reset error:', e);
    }
}

async function clearStorageServiceIDB(cleared) {
    try {
        if (typeof IDBStorage !== 'undefined' && hasStorageServiceBackendMethod(IDBStorage, 'clear')) {
            await IDBStorage.clear();
            markStorageServiceBackendCleared(cleared, 'idb');
        }
    } catch (e) {
        console.warn('[Storage] IDB clear/reset error:', e);
    }
}

function clearStorageServiceLocalSnapshot(emptyData, cleared) {
    try {
        removeStorageServiceLocalClearKeys();
        try { writeStorageServiceLocalEmptySnapshot(emptyData); } catch (_) {}
        cleared.ls = true;
    } catch (e) {}
}

async function clearStorageServiceLegacyIDB(cleared) {
    try {
        if ('indexedDB' in window) {
            await new Promise((resolve) => {
                const req = indexedDB.deleteDatabase('OpenTavernDB');
                req.onsuccess = req.onerror = req.onblocked = () => resolve();
            });
            markStorageServiceBackendCleared(cleared, 'legacyIdb');
        }
    } catch (e) {
        console.warn('[Storage] legacy IDB clear error:', e);
    }
}
