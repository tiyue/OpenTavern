function hydrateCloudSyncSettingsControls() {
    // Cloud Sync
    ensureCloudSyncSettings();
    if (dom.cloudSyncEnabled) dom.cloudSyncEnabled.checked = !!state.settings.cloudSyncEnabled;
    if (dom.cloudSyncAutoUpload) dom.cloudSyncAutoUpload.checked = !!state.settings.cloudSyncAutoUpload;
    if (dom.cloudSyncEndpoint) dom.cloudSyncEndpoint.value = state.settings.cloudSyncEndpoint || '/api/sync';
    if (dom.cloudSyncToken) dom.cloudSyncToken.value = state.settings.cloudSyncToken || '';
    if (dom.cloudSyncEncrypted) dom.cloudSyncEncrypted.checked = !!state.settings.cloudSyncEncrypted;
    if (dom.cloudSyncPassphrase) dom.cloudSyncPassphrase.value = state.settings.cloudSyncPassphrase || '';
    if (dom.cloudSyncStatus) {
        var cloudStatus = state.settings.cloudSyncLastStatus || '';
        if (!cloudStatus && state.settings.cloudSyncLastAt) {
            cloudStatus = 'Last sync: ' + new Date(state.settings.cloudSyncLastAt).toLocaleString();
        }
        dom.cloudSyncStatus.textContent = cloudStatus;
    }
    if (dom.cloudSyncNowBtn) {
        dom.cloudSyncNowBtn.onclick = function() {
            readCloudSyncSettingsFromForm();
            syncCloudSyncSnapshot(dom.cloudSyncStatus).catch(function(err) {
                setCloudSyncStatus('Cloud sync failed: ' + ((err && err.message) || err), true);
                persistCloudSyncStatusSilently();
            });
        };
    }
    if (dom.cloudSyncUploadBtn) {
        dom.cloudSyncUploadBtn.onclick = function() {
            readCloudSyncSettingsFromForm();
            uploadCloudSyncSnapshot(dom.cloudSyncStatus, { force: true }).catch(function(err) {
                setCloudSyncStatus('Cloud upload failed: ' + ((err && err.message) || err), true);
                persistCloudSyncStatusSilently();
            });
        };
    }
    if (dom.cloudSyncDownloadBtn) {
        dom.cloudSyncDownloadBtn.onclick = function() {
            readCloudSyncSettingsFromForm();
            downloadCloudSyncSnapshot(dom.cloudSyncStatus).catch(function(err) {
                setCloudSyncStatus('Cloud download failed: ' + ((err && err.message) || err), true);
                persistCloudSyncStatusSilently();
            });
        };
    }
}
