// ==================== Cloud Sync Download ====================
async function downloadCloudSyncSnapshot(statusEl, rawData) {
    return runCloudSyncOutsideBackupRestore(function() { return performCloudSyncDownload(statusEl, rawData); });
}

async function performCloudSyncDownload(statusEl, rawData) {
    ensureCloudSyncSettings();
    setCloudSyncPendingStatus(statusEl, '正在比较并下载变化对象...');

    var metadata = rawData && (rawData.protocol === 1 || rawData.protocol === 2) ? rawData : null;
    if (!rawData) metadata = await readCloudSyncRemoteMetadata();
    var remoteForFreshness = metadata ? getCloudSyncSelectedRemoteSnapshot(metadata) : rawData;
    var downloaded = metadata ? await readCloudSyncRemoteSnapshot(metadata) : rawData;

    if (!downloaded) {
        var emptyMsg = '未找到此同步令牌对应的云端数据。';
        setCloudSyncStatus(emptyMsg, true);
        await persistCloudSyncOperationState();
        return null;
    }

    var freshness = getCloudSyncFreshness(remoteForFreshness || downloaded);
    var isV2 = downloaded.__cloudSyncProtocol === 2;
    var data = isV2 ? downloaded : await decryptCloudSyncSnapshot(downloaded);
    applyCloudSyncSnapshot(data);
    var when = formatCloudSyncTimestamp(data.lastSaved);
    var stats = downloaded.__cloudSyncV2Stats;
    var detail = stats
        ? '，下载 ' + stats.downloadedObjects + ' 个、复用本地 ' + stats.reusedObjects + ' 个对象'
        : (downloaded && downloaded.encrypted ? '（已加密）' : '');
    var msg = '云端下载已应用：' + when + '（恢复前' + formatCloudSyncFreshnessLabel(freshness) + detail + '）';
    setCloudSyncStatus(msg, false);
    await persistCloudSyncOperationState();
    return data;
}
