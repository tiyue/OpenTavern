/**
 * 新手导读（文件：20-storage-service-save.js）
 *
 * 负责什么：这是“本地存储系统”中的“存储、存储服务、保存”部分。
 * 在程序中的位置：它在 OPFS、IndexedDB 和 localStorage 之间读写同一份应用快照。
 * 从哪里开始看：主要从 `saveStorageServiceData(service, data)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：这是用户数据安全相关代码；任何修改都要考虑写入失败、旧数据和回退路径。
 */
// ==================== StorageService Save Pipeline ====================
async function saveStorageServiceData(service, data) {
    data = service._cloneForPersist(data);

    const previous = await service._readNewestStoredSnapshotNoSync().catch(() => null);
    if (previous && previous.data) service._saveLocalHistorySnapshot(previous.data);

    if (service._isDangerouslyEmptySnapshot(data) && previous && service._hasUserData(previous.data)) {
        console.warn('[Storage] Refusing to overwrite existing user data with an empty startup snapshot.');
        service._lastSaveSnapshot = previous.data;
        await service._syncSnapshotToAvailableBackends(previous.data, previous.backend || 'unknown').catch(() => {});
        return;
    }

    service._lastSaveSnapshot = data;
    const idbResult = await trySaveStorageServiceIDBCanonical(service, data);
    let savedCanonical = idbResult.saved;

    const lsOk = service._tryWriteLocalSnapshot(data);
    if (!savedCanonical) savedCanonical = markStorageServiceLocalStorageCanonical(service, lsOk);

    mirrorStorageServiceSnapshotToOPFS(service, data);
    scheduleStorageServiceInfoRefresh();

    if (savedCanonical) return;
    throwStorageServiceCanonicalSaveFailure(service, idbResult.error, data);
}
