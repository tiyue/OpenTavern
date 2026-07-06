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
    function readCloudSyncForm() {
        ensureCloudSyncSettings();
        if (dom.cloudSyncEnabled) state.settings.cloudSyncEnabled = !!dom.cloudSyncEnabled.checked;
        if (dom.cloudSyncAutoUpload) state.settings.cloudSyncAutoUpload = !!dom.cloudSyncAutoUpload.checked;
        if (dom.cloudSyncEndpoint) state.settings.cloudSyncEndpoint = dom.cloudSyncEndpoint.value.trim() || '/api/sync';
        if (dom.cloudSyncToken) state.settings.cloudSyncToken = dom.cloudSyncToken.value.trim();
        if (dom.cloudSyncEncrypted) state.settings.cloudSyncEncrypted = !!dom.cloudSyncEncrypted.checked;
        if (dom.cloudSyncPassphrase) state.settings.cloudSyncPassphrase = dom.cloudSyncPassphrase.value;
    }
    if (dom.cloudSyncNowBtn) {
        dom.cloudSyncNowBtn.onclick = function() {
            readCloudSyncForm();
            syncCloudSyncSnapshot(dom.cloudSyncStatus).catch(function(err) {
                setCloudSyncStatus('Cloud sync failed: ' + ((err && err.message) || err), true);
                persistState(true);
            });
        };
    }
    if (dom.cloudSyncUploadBtn) {
        dom.cloudSyncUploadBtn.onclick = function() {
            readCloudSyncForm();
            uploadCloudSyncSnapshot(dom.cloudSyncStatus, { force: true }).catch(function(err) {
                setCloudSyncStatus('Cloud upload failed: ' + ((err && err.message) || err), true);
                persistState(true);
            });
        };
    }
    if (dom.cloudSyncDownloadBtn) {
        dom.cloudSyncDownloadBtn.onclick = function() {
            readCloudSyncForm();
            downloadCloudSyncSnapshot(dom.cloudSyncStatus).catch(function(err) {
                setCloudSyncStatus('Cloud download failed: ' + ((err && err.message) || err), true);
                persistState(true);
            });
        };
    }
}
