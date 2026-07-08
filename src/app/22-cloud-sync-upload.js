// ==================== Cloud Sync Upload ====================
async function uploadCloudSyncSnapshot(statusEl, options) {
    ensureCloudSyncSettings();
    disableCloudSyncEncryptionWhenUnavailable(statusEl);
    options = options || {};
    setCloudSyncPendingStatus(statusEl, '正在上传...');
    var comparisonSnapshot = options.force ? null : prepareCloudSyncLocalSnapshotForComparison();
    var snapshot = buildAppDataSnapshot({ skipSettingsFormSync: !options.force });

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
    }

    var payload = await encryptCloudSyncSnapshot(snapshot);
    var result = await requestCloudSync('POST', {
        version: 1,
        app: 'OpenTavern',
        updatedAt: snapshot.lastSaved,
        encrypted: payload && payload.encrypted === true,
        data: payload
    });
    var when = formatCloudSyncTimestamp(result.updatedAt);
    var msg = '云端上传完成：' + when + (payload && payload.encrypted ? '（已加密）' : '');
    setCloudSyncStatus(msg, false);
    await persistCloudSyncOperationState();
    return result;
}
