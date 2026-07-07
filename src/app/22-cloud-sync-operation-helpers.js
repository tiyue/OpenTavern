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
        console.warn('[CloudSync] failed to persist sync status:', err && err.message);
    });
}
