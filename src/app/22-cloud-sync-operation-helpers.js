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
