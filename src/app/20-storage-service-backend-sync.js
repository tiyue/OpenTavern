/**
 * 新手导读（文件：20-storage-service-backend-sync.js）
 *
 * 负责什么：这是“本地存储系统”中的“存储、存储服务、存储后端、同步”部分。
 * 在程序中的位置：它在 OPFS、IndexedDB 和 localStorage 之间读写同一份应用快照。
 * 从哪里开始看：主要从 `syncStorageServiceSnapshotToAvailableBackends(service, data, source)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：这是用户数据安全相关代码；任何修改都要考虑写入失败、旧数据和回退路径。
 */
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
