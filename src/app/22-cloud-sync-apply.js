// ==================== Cloud Sync Apply Snapshot ====================
function applyCloudSyncSnapshot(snapshot) {
    var data = normalizeCloudSyncSnapshot(snapshot);
    var currentCloud = getCloudSyncLocalSettingsForRestore();

    state.settings = Object.assign(defaultSettings(), data.settings || {}, currentCloud);
    state.conversations = data.conversations || {};
    state.conversationOrder = data.conversationOrder || Object.keys(state.conversations || {});
    state.activeConvId = data.activeConvId || null;
    state.worldBooks = data.worldBooks || {};
    state.characters = data.characters || {};
    state._charactersMigrated = !!data.charactersMigrated;

    normalizeCloudSyncRestoredConversations();
    ensureCloudSyncRestoredActiveConversation();
    persistCloudSyncAppliedSnapshot(data);
    notifyCloudSyncSnapshotApplied();
    return data;
}

function getCloudSyncLocalSettingsForRestore() {
    var local = {
        cloudSyncLastAt: Date.now(),
        cloudSyncLastStatus: 'Cloud download applied.'
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

function normalizeCloudSyncRestoredConversations() {
    Object.values(state.conversations || {}).forEach(function(conv) {
        try { normalizeConversation(conv); } catch (_) {}
    });
}

function ensureCloudSyncRestoredActiveConversation() {
    if (state.activeConvId && state.conversations[state.activeConvId]) return;

    var first = (state.conversationOrder || []).find(function(id) {
        return state.conversations[id];
    }) || Object.keys(state.conversations || {})[0];

    if (first) {
        state.activeConvId = first;
        return;
    }

    var conv = defaultConversation();
    state.conversations[conv.id] = conv;
    state.conversationOrder = [conv.id];
    state.activeConvId = conv.id;
}

function persistCloudSyncAppliedSnapshot(data) {
    _cloudSyncSavingStatus = true;
    try { persistState(true, { lastSaved: data && data.lastSaved }); } finally { _cloudSyncSavingStatus = false; }
}

function notifyCloudSyncSnapshotApplied() {
    appStore.notify(['settings', 'conversations', 'characters', 'worldBooks', 'activeConvId']);
    if (typeof requestFullRender === 'function') requestFullRender();
    if (typeof updateInputState === 'function') updateInputState();
    if (typeof updateStorageInfo === 'function') updateStorageInfo();
}
