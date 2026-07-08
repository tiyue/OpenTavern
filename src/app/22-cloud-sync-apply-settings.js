// ==================== Cloud Sync Apply Local Settings ====================
function getCloudSyncLocalSettingsForRestore() {
    var local = {
        cloudSyncLastAt: Date.now(),
        cloudSyncLastStatus: '云端下载已应用。'
    };
    [
        'apiKey',
        'summarizeApiKey',
        'saveApiKey',
        'cloudSyncEnabled',
        'cloudSyncAutoUpload',
        'cloudSyncEndpoint',
        'cloudSyncToken',
        'cloudSyncEncrypted',
        'cloudSyncPassphrase'
    ].forEach(function(key) {
        copyCloudSyncLocalSetting(local, key);
    });
    return local;
}

function copyCloudSyncLocalSetting(target, key) {
    if (!state.settings) return;
    var value = state.settings[key];
    if (value === undefined || value === null) return;
    target[key] = value;
}
