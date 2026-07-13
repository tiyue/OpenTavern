// ==================== Cloud Sync Compare And Sync ====================
async function syncCloudSyncSnapshot(statusEl) {
    ensureCloudSyncSettings();
    setCloudSyncPendingStatus(statusEl, '正在检查云端同步元数据...');
    var localSnapshot = prepareCloudSyncLocalSnapshotForComparison();
    var metadata = await readCloudSyncRemoteMetadata();
    var remote = Number(metadata.protocol) === 2
        ? (metadata.exists ? metadata : metadata.legacySnapshot)
        : metadata.snapshot;

    if (!remote) {
        setCloudSyncPendingStatus(statusEl, '云端暂无数据，正在上传本地对象...');
        return uploadCloudSyncSnapshot(statusEl, {
            force: true,
            remoteMetadata: metadata,
            expectedRemoteRevision: Number(metadata.protocol) === 2 ? 0 : undefined,
            expectedRemoteUpdatedAt: Number(metadata.protocol) === 1 ? 0 : undefined
        });
    }

    var freshness = getCloudSyncFreshness(remote, localSnapshot);
    if (freshness === 'newer') return downloadCloudSyncSnapshot(statusEl, metadata);
    if (freshness === 'older') {
        setCloudSyncPendingStatus(statusEl, '本地数据较新，正在上传变化对象...');
        return uploadCloudSyncSnapshot(statusEl, {
            force: true,
            remoteMetadata: metadata,
            expectedRemoteRevision: getCloudSyncRemoteRevision(metadata),
            expectedRemoteUpdatedAt: getCloudSyncRemoteUpdatedAt(remote)
        });
    }

    var msg = '云同步已是最新。';
    setCloudSyncStatus(msg, false);
    await persistCloudSyncOperationState();
    return { success: true, upToDate: true };
}
