// ==================== Cloud Sync Download ====================
async function downloadCloudSyncSnapshot(statusEl, rawData) {
    ensureCloudSyncSettings();
    setCloudSyncPendingStatus(statusEl, 'Downloading...');
    rawData = rawData || await readCloudSyncRemoteSnapshot();
    if (!rawData) {
        var emptyMsg = 'No cloud snapshot found for this token.';
        setCloudSyncStatus(emptyMsg, true);
        await persistCloudSyncOperationState();
        return null;
    }
    var freshness = getCloudSyncFreshness(rawData);
    var data = await decryptCloudSyncSnapshot(rawData);
    applyCloudSyncSnapshot(data);
    var when = formatCloudSyncTimestamp(data.lastSaved);
    var msg = 'Cloud download applied: ' + when + ' (' + freshness + ' than local before restore)' + (rawData && rawData.encrypted ? ' (encrypted)' : '');
    setCloudSyncStatus(msg, false);
    await persistCloudSyncOperationState();
    return data;
}
