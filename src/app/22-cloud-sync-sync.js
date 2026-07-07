// ==================== Cloud Sync Compare And Sync ====================
async function syncCloudSyncSnapshot(statusEl) {
    ensureCloudSyncSettings();
    setCloudSyncPendingStatus(statusEl, 'Checking cloud snapshot...');

    var remote = await readCloudSyncRemoteSnapshot();
    if (!remote) {
        setCloudSyncStatus('No cloud snapshot found. Uploading local snapshot...', false);
        return uploadCloudSyncSnapshot(statusEl, { force: true });
    }

    var freshness = getCloudSyncFreshness(remote);
    if (freshness === 'newer') {
        return downloadCloudSyncSnapshot(statusEl, remote);
    }
    if (freshness === 'older') {
        setCloudSyncStatus('Local snapshot is newer. Uploading to cloud...', false);
        return uploadCloudSyncSnapshot(statusEl, { force: true });
    }
    var msg = 'Cloud sync already up to date.';
    setCloudSyncStatus(msg, false);
    await persistCloudSyncOperationState();
    return { success: true, upToDate: true };
}
