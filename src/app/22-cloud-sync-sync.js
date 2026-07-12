/**
 * 新手导读（文件：22-cloud-sync-sync.js）
 *
 * 负责什么：这是“云同步系统”中的“云同步”部分。
 * 在程序中的位置：它把本地快照加密后上传，或下载远端快照并合并回应用状态。
 * 从哪里开始看：主要从 `syncCloudSyncSnapshot(statusEl)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：不要记录令牌、密码或明文快照；冲突处理必须防止较旧数据覆盖新数据。
 */
// ==================== Cloud Sync Compare And Sync ====================
/**
 * 比较本地与云端快照的新旧，并自动选择上传、下载或什么都不做。
 *
 * @param {HTMLElement|null} statusEl - 可选状态元素，用于向用户显示同步进度。
 * @returns {Promise<*>} 上传或下载操作的异步结果；已经最新时仅完成状态保存。
 *
 * 判断依据优先使用时间戳，必要时再比较大小。云端不存在就首次上传；云端较新就下载；
 * 本地较新就强制上传；完全一致只更新“已是最新”提示。这里的 force 不是忽略安全校验，
 * 而是表示比较已经完成，可以执行预定方向的同步。
 */
async function syncCloudSyncSnapshot(statusEl) {
    ensureCloudSyncSettings();
    disableCloudSyncEncryptionWhenUnavailable(statusEl);
    setCloudSyncPendingStatus(statusEl, '正在检查云端快照...');
    var localSnapshot = prepareCloudSyncLocalSnapshotForComparison();

    var remote = await readCloudSyncRemoteSnapshot();
    if (!remote) {
        setCloudSyncPendingStatus(statusEl, '未找到云端快照，正在上传本地快照...');
        return uploadCloudSyncSnapshot(statusEl, { force: true, expectedRemoteUpdatedAt: 0 });
    }

    var freshness = getCloudSyncFreshness(remote, localSnapshot);
    if (freshness === 'newer' || freshness === 'newer-by-size') {
        return downloadCloudSyncSnapshot(statusEl, remote);
    }
    if (freshness === 'older' || freshness === 'older-by-size') {
        setCloudSyncPendingStatus(statusEl, '本地快照较新，正在上传到云端...');
        var remoteUpdatedAt = getCloudSyncRemoteUpdatedAt(remote);
        return uploadCloudSyncSnapshot(statusEl, {
            force: true,
            expectedRemoteUpdatedAt: remoteUpdatedAt === null ? undefined : remoteUpdatedAt
        });
    }
    var msg = '云同步已是最新。';
    setCloudSyncStatus(msg, false);
    await persistCloudSyncOperationState();
    return { success: true, upToDate: true };
}
