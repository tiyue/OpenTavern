// ==================== Cloud Sync Download ====================
async function downloadCloudSyncSnapshot(statusEl, rawData) {
    ensureCloudSyncSettings();
    setCloudSyncPendingStatus(statusEl, '正在下载...');
    rawData = rawData || await readCloudSyncRemoteSnapshot();
    if (!rawData) {
        var emptyMsg = '未找到此同步令牌对应的云端快照。';
        setCloudSyncStatus(emptyMsg, true);
        await persistCloudSyncOperationState();
        return null;
    }
    var freshness = getCloudSyncFreshness(rawData);
    var data = await decryptCloudSyncSnapshot(rawData);
    applyCloudSyncSnapshot(data);
    var when = formatCloudSyncTimestamp(data.lastSaved);
    var msg = '云端下载已应用：' + when + '（恢复前' + formatCloudSyncFreshnessLabel(freshness) + '）' + (rawData && rawData.encrypted ? '（已加密）' : '');
    setCloudSyncStatus(msg, false);
    await persistCloudSyncOperationState();
    return data;
}
