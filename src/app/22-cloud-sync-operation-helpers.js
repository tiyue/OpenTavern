/**
 * 新手导读（文件：22-cloud-sync-operation-helpers.js）
 *
 * 负责什么：这是“云同步系统”中的“云同步、操作、辅助函数”部分。
 * 在程序中的位置：它把本地快照加密后上传，或下载远端快照并合并回应用状态。
 * 从哪里开始看：主要从 `setCloudSyncPendingStatus(statusEl, message)`、`formatCloudSyncTimestamp(timestamp)`、`formatCloudSyncFreshnessLabel(freshness)`、`disableCloudSyncEncryptionWhenUnavailable(statusEl)`、`persistCloudSyncOperationState(无参数)`、`persistCloudSyncStatusSilently(无参数)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：不要记录令牌、密码或明文快照；冲突处理必须防止较旧数据覆盖新数据。
 */
// ==================== Cloud Sync Operation Helpers ====================
function setCloudSyncPendingStatus(statusEl, message) {
    var target = statusEl || document.getElementById('cloudSyncStatus');
    if (!target) return;
    target.textContent = message;
    target.className = 'text-[10px] leading-relaxed text-amber-300';
}

function formatCloudSyncTimestamp(timestamp) {
    return timestamp ? new Date(timestamp).toLocaleString() : new Date().toLocaleString();
}

function formatCloudSyncFreshnessLabel(freshness) {
    if (freshness === 'newer') return '云端较新';
    if (freshness === 'older') return '云端较旧';
    if (freshness === 'newer-by-size') return '云端较新（大小不同）';
    if (freshness === 'older-by-size') return '云端较旧（大小不同）';
    if (freshness === 'same') return '与本地一致';
    return '状态未知';
}

function disableCloudSyncEncryptionWhenUnavailable(statusEl) {
    var s = ensureCloudSyncSettings();
    if (!s.cloudSyncEncrypted) return false;
    if (typeof isCloudSyncWebCryptoAvailable !== 'function' || isCloudSyncWebCryptoAvailable()) return false;

    s.cloudSyncEncrypted = false;
    if (typeof dom !== 'undefined' && dom.cloudSyncEncrypted) {
        dom.cloudSyncEncrypted.checked = false;
        dom.cloudSyncEncrypted.disabled = true;
    }
    if (typeof dom !== 'undefined' && dom.cloudSyncPassphrase) {
        dom.cloudSyncPassphrase.disabled = true;
    }
    setCloudSyncPendingStatus(statusEl, '当前 HTTP 页面不支持浏览器加密同步，已自动关闭“加密上传内容”，本次将按普通云同步处理。');
    return true;
}

async function persistCloudSyncOperationState() {
    _cloudSyncSavingStatus = true;
    try {
        await persistState(true, { preserveLastSaved: true });
    } finally {
        _cloudSyncSavingStatus = false;
    }
}

function persistCloudSyncStatusSilently() {
    persistCloudSyncOperationState().catch(function(err) {
        console.warn('[CloudSync] 持久化同步状态失败:', err && err.message);
    });
}
