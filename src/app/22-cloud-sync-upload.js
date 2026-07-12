/**
 * 新手导读（文件：22-cloud-sync-upload.js）
 *
 * 负责什么：这是“云同步系统”中的“云同步、上传”部分。
 * 在程序中的位置：它把本地快照加密后上传，或下载远端快照并合并回应用状态。
 * 从哪里开始看：主要从 `uploadCloudSyncSnapshot(statusEl, options)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：不要记录令牌、密码或明文快照；冲突处理必须防止较旧数据覆盖新数据。
 */
// ==================== Cloud Sync Upload ====================
async function uploadCloudSyncSnapshot(statusEl, options) {
    ensureCloudSyncSettings();
    disableCloudSyncEncryptionWhenUnavailable(statusEl);
    options = options || {};
    setCloudSyncPendingStatus(statusEl, '正在上传...');
    var comparisonSnapshot = options.force ? null : prepareCloudSyncLocalSnapshotForComparison();
    var snapshot = buildAppDataSnapshot({ skipSettingsFormSync: !options.force });
    var expectedRemoteUpdatedAt = Number(options.expectedRemoteUpdatedAt);
    expectedRemoteUpdatedAt = Number.isFinite(expectedRemoteUpdatedAt) && expectedRemoteUpdatedAt >= 0
        ? Math.floor(expectedRemoteUpdatedAt)
        : null;

    if (!options.force) {
        var remote = null;
        try {
            remote = await readCloudSyncRemoteSnapshot();
        } catch (err) {
            console.warn('[CloudSync] 云端快照预检失败，已跳过受保护上传:', err && err.message);
            var verifyMsg = '已跳过云端上传：无法确认云端快照是否为最新。';
            setCloudSyncStatus(verifyMsg, true);
            await persistCloudSyncOperationState();
            return { success: false, skipped: true, reason: 'preflight-failed' };
        }
        var freshness = remote && getCloudSyncFreshness(remote, comparisonSnapshot);
        if (freshness === 'newer' || freshness === 'newer-by-size') {
            var skipMsg = '已跳过云端上传：云端快照较新。请先下载，或点击“立即上传”强制覆盖。';
            setCloudSyncStatus(skipMsg, true);
            await persistCloudSyncOperationState();
            return { success: false, skipped: true, reason: 'remote-newer' };
        }
        if (!remote) {
            expectedRemoteUpdatedAt = 0;
        } else {
            var remoteUpdatedAt = getCloudSyncRemoteUpdatedAt(remote);
            if (remoteUpdatedAt !== null) expectedRemoteUpdatedAt = remoteUpdatedAt;
        }
    }

    var payload = await encryptCloudSyncSnapshot(snapshot);
    var result;
    try {
        result = await requestCloudSync('POST', {
            version: 1,
            app: 'OpenTavern',
            updatedAt: snapshot.lastSaved,
            encrypted: payload && payload.encrypted === true,
            data: payload
        }, expectedRemoteUpdatedAt === null ? undefined : { expectedUpdatedAt: expectedRemoteUpdatedAt });
    } catch (err) {
        if (err && (err.status === 409 || err.status === 412)) {
            var conflictMsg = '云端快照刚被另一设备更新，已停止覆盖。请再次点击“立即同步”重新判断。';
            setCloudSyncStatus(conflictMsg, true);
            await persistCloudSyncOperationState();
            throw new Error(conflictMsg);
        }
        throw err;
    }
    var when = formatCloudSyncTimestamp(result.updatedAt);
    var msg = '云端上传完成：' + when + (payload && payload.encrypted ? '（已加密）' : '');
    setCloudSyncStatus(msg, false);
    await persistCloudSyncOperationState();
    return result;
}
