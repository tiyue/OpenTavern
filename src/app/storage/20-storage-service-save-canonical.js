/**
 * 新手导读（文件：20-storage-service-save-canonical.js）
 *
 * 负责什么：这是“本地存储系统”中的“存储、存储服务、保存、标准副本”部分。
 * 在程序中的位置：它在 OPFS、IndexedDB 和 localStorage 之间读写同一份应用快照。
 * 从哪里开始看：主要从 `trySaveStorageServiceIDBCanonical(service, data)`、`markStorageServiceLocalStorageCanonical(service, saved)`、`throwStorageServiceCanonicalSaveFailure(service, lastError, data)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：这是用户数据安全相关代码；任何修改都要考虑写入失败、旧数据和回退路径。
 */
// ==================== StorageService Canonical Save Helpers ====================
async function trySaveStorageServiceIDBCanonical(service, data) {
    if (!service._idbAvailable) return { saved: false, error: null };
    try {
        await IDBStorage.saveAll(data, { fresh: service._idbFailed });
        service._idbFailed = false;
        service._idbFailureReason = null;
        service._idbAvailable = true;
        service._primaryBackend = 'idb';
        service._lastUsedBackend = 'idb';
        return { saved: true, error: null };
    } catch (e) {
        service._idbFailed = true;
        service._idbFailureReason = e && e.message ? e.message : String(e);
        service._primaryBackend = 'idb';
        console.warn('[Storage] IndexedDB save failed after retry; localStorage emergency snapshot will still be written:', e && e.message);
        return { saved: false, error: e };
    }
}

function markStorageServiceLocalStorageCanonical(service, saved) {
    if (!saved) return false;
    service._primaryBackend = 'localStorage';
    service._lastUsedBackend = 'localStorage';
    return true;
}

function throwStorageServiceCanonicalSaveFailure(service, lastError, data) {
    if (lastError && service._isQuotaError(lastError)) service._handleQuotaExceeded(lastError, data);
    const err = lastError || new Error('All canonical storage backends failed');
    console.error('[Storage] All canonical save backends failed:', err);
    throw err;
}
