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
