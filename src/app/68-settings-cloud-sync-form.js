function readCloudSyncSettingsFromForm() {
    ensureCloudSyncSettings();
    if (dom.cloudSyncEnabled) state.settings.cloudSyncEnabled = !!dom.cloudSyncEnabled.checked;
    if (dom.cloudSyncAutoUpload) state.settings.cloudSyncAutoUpload = !!dom.cloudSyncAutoUpload.checked;
    if (dom.cloudSyncEndpoint) state.settings.cloudSyncEndpoint = dom.cloudSyncEndpoint.value.trim() || '/api/sync';
    if (dom.cloudSyncToken) state.settings.cloudSyncToken = dom.cloudSyncToken.value.trim();
    if (dom.cloudSyncEncrypted) state.settings.cloudSyncEncrypted = !!dom.cloudSyncEncrypted.checked;
    if (dom.cloudSyncPassphrase) state.settings.cloudSyncPassphrase = dom.cloudSyncPassphrase.value;
}
