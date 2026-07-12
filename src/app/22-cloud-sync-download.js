/**
 * 新手导读（文件：22-cloud-sync-download.js）
 *
 * 负责什么：这是“云同步系统”中的“云同步、下载”部分。
 * 在程序中的位置：它把本地快照加密后上传，或下载远端快照并合并回应用状态。
 * 从哪里开始看：主要从 `downloadCloudSyncSnapshot(statusEl, rawData)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：不要记录令牌、密码或明文快照；冲突处理必须防止较旧数据覆盖新数据。
 */
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
