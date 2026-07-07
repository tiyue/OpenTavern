// ==================== Cloud Sync Settings & Snapshot ====================
var _cloudSyncSavingStatus = false;

function ensureCloudSyncSettings() {
    if (!state.settings) state.settings = defaultSettings();
    var defs = defaultSettings();
    [
        'cloudSyncEnabled',
        'cloudSyncAutoUpload',
        'cloudSyncEndpoint',
        'cloudSyncToken',
        'cloudSyncEncrypted',
        'cloudSyncPassphrase',
        'cloudSyncLastAt',
        'cloudSyncLastStatus'
    ].forEach(function(key) {
        if (state.settings[key] === undefined || state.settings[key] === null) {
            state.settings[key] = defs[key];
        }
    });
    state.settings.cloudSyncEnabled = !!state.settings.cloudSyncEnabled;
    state.settings.cloudSyncAutoUpload = !!state.settings.cloudSyncAutoUpload;
    state.settings.cloudSyncEndpoint = String(state.settings.cloudSyncEndpoint || defs.cloudSyncEndpoint).trim() || defs.cloudSyncEndpoint;
    state.settings.cloudSyncToken = String(state.settings.cloudSyncToken || '');
    state.settings.cloudSyncEncrypted = !!state.settings.cloudSyncEncrypted;
    state.settings.cloudSyncPassphrase = String(state.settings.cloudSyncPassphrase || '');
    state.settings.cloudSyncLastAt = Number(state.settings.cloudSyncLastAt || 0) || 0;
    state.settings.cloudSyncLastStatus = String(state.settings.cloudSyncLastStatus || '');
    return state.settings;
}

function buildAppDataSnapshot() {
    return {
        settings: getSafeSettingsForCloudSync(),
        conversations: cloneCloudSyncSnapshotValue(state.conversations, {}),
        conversationOrder: cloneCloudSyncSnapshotValue(state.conversationOrder, []),
        activeConvId: state.activeConvId || null,
        worldBooks: cloneCloudSyncSnapshotValue(state.worldBooks, {}),
        characters: cloneCloudSyncSnapshotValue(state.characters, {}),
        charactersMigrated: !!state._charactersMigrated,
        lastSaved: Date.now()
    };
}

function cloneCloudSyncSnapshotValue(value, fallback) {
    if (value === undefined || value === null) return fallback;
    return JSON.parse(JSON.stringify(value));
}

function getCloudSyncEndpoint() {
    var s = ensureCloudSyncSettings();
    return String(s.cloudSyncEndpoint || '/api/sync').trim() || '/api/sync';
}

function getCloudSyncFreshness(remote) {
    var remoteTime = Number(remote && remote.lastSaved || 0) || 0;
    var localTime = Number(StorageService && StorageService._lastSaveSnapshot && StorageService._lastSaveSnapshot.lastSaved || 0) || 0;
    if (!remoteTime) return 'unknown';
    if (!localTime) return 'newer';
    if (remoteTime > localTime + 1000) return 'newer';
    if (remoteTime < localTime - 1000) return 'older';
    return 'same';
}
