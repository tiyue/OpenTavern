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
        conversations: state.conversations || {},
        conversationOrder: state.conversationOrder || [],
        activeConvId: state.activeConvId || null,
        worldBooks: state.worldBooks || {},
        characters: state.characters || {},
        charactersMigrated: !!state._charactersMigrated,
        lastSaved: Date.now()
    };
}

function getCloudSyncEndpoint() {
    var s = ensureCloudSyncSettings();
    return String(s.cloudSyncEndpoint || '/api/sync').trim() || '/api/sync';
}

function normalizeCloudSyncSnapshot(raw) {
    var data = raw && raw.data !== undefined ? raw.data : raw;
    if (data && data.snapshot !== undefined) data = data.snapshot;
    if (!data || typeof data !== 'object') throw new Error('Cloud snapshot is empty or invalid.');
    if (data.encrypted === true) return data;
    if (!data.settings || typeof data.settings !== 'object') data.settings = {};
    if (!data.conversations || typeof data.conversations !== 'object') data.conversations = {};
    if (!data.characters || typeof data.characters !== 'object') data.characters = {};
    if (!data.worldBooks || typeof data.worldBooks !== 'object') data.worldBooks = {};
    if (!Array.isArray(data.conversationOrder)) data.conversationOrder = Object.keys(data.conversations || {});
    if (!data.lastSaved) data.lastSaved = Date.now();
    return data;
}

function getCloudSyncFreshness(remote) {
    var remoteTime = Number(remote && remote.lastSaved || 0) || 0;
    var localTime = Number(StorageService && StorageService._lastSaveSnapshot && StorageService._lastSaveSnapshot.lastSaved || 0) || 0;
    if (!localTime) localTime = Date.now();
    if (!remoteTime) return 'unknown';
    if (remoteTime > localTime + 1000) return 'newer';
    if (remoteTime < localTime - 1000) return 'older';
    return 'same';
}
