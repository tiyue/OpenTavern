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
    persistCloudSyncAppliedSnapshot();
    notifyCloudSyncSnapshotApplied();
    return data;
}

function getCloudSyncLocalSettingsForRestore() {
    return {
        cloudSyncEnabled: state.settings && state.settings.cloudSyncEnabled,
        cloudSyncAutoUpload: state.settings && state.settings.cloudSyncAutoUpload,
        cloudSyncEndpoint: state.settings && state.settings.cloudSyncEndpoint,
        cloudSyncToken: state.settings && state.settings.cloudSyncToken,
        cloudSyncEncrypted: state.settings && state.settings.cloudSyncEncrypted,
        cloudSyncPassphrase: state.settings && state.settings.cloudSyncPassphrase,
        cloudSyncLastAt: Date.now(),
        cloudSyncLastStatus: 'Cloud download applied.'
    };
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

function persistCloudSyncAppliedSnapshot() {
    _cloudSyncSavingStatus = true;
    try { persistState(true); } finally { _cloudSyncSavingStatus = false; }
}

function notifyCloudSyncSnapshotApplied() {
    appStore.notify(['settings', 'conversations', 'characters', 'worldBooks', 'activeConvId']);
    if (typeof requestFullRender === 'function') requestFullRender();
    if (typeof updateInputState === 'function') updateInputState();
    if (typeof updateStorageInfo === 'function') updateStorageInfo();
}
