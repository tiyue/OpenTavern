function readCloudSyncSettingsFromForm() {
    ensureCloudSyncSettings();
    if (dom.cloudSyncEnabled) state.settings.cloudSyncEnabled = readCheckboxControlValue(dom.cloudSyncEnabled, false);
    if (dom.cloudSyncAutoUpload) state.settings.cloudSyncAutoUpload = readCheckboxControlValue(dom.cloudSyncAutoUpload, false);
    if (dom.cloudSyncEndpoint) state.settings.cloudSyncEndpoint = readTrimmedControlValueOr(dom.cloudSyncEndpoint, '/api/sync');
    if (dom.cloudSyncToken) state.settings.cloudSyncToken = readTrimmedControlValue(dom.cloudSyncToken);
    if (dom.cloudSyncEncrypted) {
        var encrypted = readCheckboxControlValue(dom.cloudSyncEncrypted, false);
        if (encrypted && typeof isCloudSyncWebCryptoAvailable === 'function' && !isCloudSyncWebCryptoAvailable()) {
            encrypted = false;
            dom.cloudSyncEncrypted.checked = false;
            if (typeof setCloudSyncPendingStatus === 'function') {
                setCloudSyncPendingStatus(dom.cloudSyncStatus, '当前 HTTP 页面不支持浏览器加密同步，已关闭“加密上传内容”。本次将按普通云同步上传。');
            }
        }
        state.settings.cloudSyncEncrypted = encrypted;
    }
    if (dom.cloudSyncPassphrase) state.settings.cloudSyncPassphrase = readControlValue(dom.cloudSyncPassphrase);
}
