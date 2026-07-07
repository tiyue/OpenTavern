// ==================== Cloud Sync Auto Upload ====================
var _cloudSyncUploadTimer = null;

function scheduleCloudSyncUpload() {
    var s = ensureCloudSyncSettings();
    if (_cloudSyncSavingStatus) return;
    if (!s.cloudSyncEnabled || !s.cloudSyncAutoUpload || !s.cloudSyncEndpoint || !s.cloudSyncToken) return;
    if (_cloudSyncUploadTimer) clearTimeout(_cloudSyncUploadTimer);
    _cloudSyncUploadTimer = setTimeout(function() {
        _cloudSyncUploadTimer = null;
        uploadCloudSyncSnapshot(null, { force: false }).catch(function(err) {
            console.warn('[CloudSync] auto upload failed:', err && err.message);
            setCloudSyncStatus('Cloud auto upload failed: ' + ((err && err.message) || err), true);
            persistCloudSyncStatusSilently();
        });
    }, 2500);
}
