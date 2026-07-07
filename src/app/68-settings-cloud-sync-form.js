function readCloudSyncSettingsFromForm() {
    ensureCloudSyncSettings();
    if (dom.cloudSyncEnabled) state.settings.cloudSyncEnabled = readCheckboxControlValue(dom.cloudSyncEnabled, false);
    if (dom.cloudSyncAutoUpload) state.settings.cloudSyncAutoUpload = readCheckboxControlValue(dom.cloudSyncAutoUpload, false);
    if (dom.cloudSyncEndpoint) state.settings.cloudSyncEndpoint = readTrimmedControlValueOr(dom.cloudSyncEndpoint, '/api/sync');
    if (dom.cloudSyncToken) state.settings.cloudSyncToken = readTrimmedControlValue(dom.cloudSyncToken);
    if (dom.cloudSyncEncrypted) state.settings.cloudSyncEncrypted = readCheckboxControlValue(dom.cloudSyncEncrypted, false);
    if (dom.cloudSyncPassphrase) state.settings.cloudSyncPassphrase = readControlValue(dom.cloudSyncPassphrase);
}
