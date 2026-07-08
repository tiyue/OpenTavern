// ==================== Cloud Sync Compare And Sync ====================
async function syncCloudSyncSnapshot(statusEl) {
    ensureCloudSyncSettings();
    disableCloudSyncEncryptionWhenUnavailable(statusEl);
    setCloudSyncPendingStatus(statusEl, '正在检查云端快照...');
    var localSnapshot = prepareCloudSyncLocalSnapshotForComparison();

    var remote = await readCloudSyncRemoteSnapshot();
    if (!remote) {
        setCloudSyncStatus('未找到云端快照，正在上传本地快照...', false);
        return uploadCloudSyncSnapshot(statusEl, { force: true });
    }

    var freshness = getCloudSyncFreshness(remote, localSnapshot);
    if (freshness === 'newer' || freshness === 'newer-by-size') {
        return downloadCloudSyncSnapshot(statusEl, remote);
    }
    if (freshness === 'older' || freshness === 'older-by-size') {
        setCloudSyncStatus('本地快照较新，正在上传到云端...', false);
        return uploadCloudSyncSnapshot(statusEl, { force: true });
    }
    var msg = '云同步已是最新。';
    setCloudSyncStatus(msg, false);
    await persistCloudSyncOperationState();
    return { success: true, upToDate: true };
}
