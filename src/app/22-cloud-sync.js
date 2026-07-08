// ==================== Cloud Sync Settings & Snapshot ====================
var _cloudSyncSavingStatus = false;
var CLOUD_SYNC_TIME_TOLERANCE_MS = 1000;
var CLOUD_SYNC_SIZE_TOLERANCE_BYTES = 32;

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

function buildAppDataSnapshot(options) {
    options = options || {};
    if (!options.skipSettingsFormSync) syncOpenSettingsFormForCloudSnapshot();
    return {
        settings: getSafeSettingsForCloudSync(),
        conversations: cloneCloudSyncSnapshotValue(state.conversations, {}),
        conversationOrder: cloneCloudSyncSnapshotValue(state.conversationOrder, []),
        activeConvId: state.activeConvId || null,
        worldBooks: cloneCloudSyncSnapshotValue(state.worldBooks, {}),
        characters: cloneCloudSyncSnapshotValue(state.characters, {}),
        charactersMigrated: !!state._charactersMigrated,
        lastSaved: Number.isFinite(Number(options.lastSaved)) ? Number(options.lastSaved) : Date.now()
    };
}

function syncOpenSettingsFormForCloudSnapshot() {
    if (!state.settings || !isSettingsModalVisibleForCloudSnapshot()) return;
    if (typeof readSettingsFormIntoState === 'function') {
        readSettingsFormIntoState();
        return;
    }
    syncNonEmptyPromptSettingsForCloudSnapshot();
}

function syncNonEmptyPromptSettingsForCloudSnapshot() {
    [
        'systemPrompt',
        'postHistoryInstructions',
        'twoStageSystemPrompt',
        'twoStagePostHistoryInstructions',
        'summaryPrompt'
    ].forEach(function(key) {
        copyNonEmptyPromptControlToCloudSettings(key);
    });
}

function isSettingsModalVisibleForCloudSnapshot() {
    return !!(
        typeof dom !== 'undefined' &&
        dom.settingsModal &&
        dom.settingsModal.classList &&
        !dom.settingsModal.classList.contains('hidden')
    );
}

function copyNonEmptyPromptControlToCloudSettings(key) {
    if (typeof dom === 'undefined' || !dom[key]) return;
    var value = String(dom[key].value || '').trim();
    if (value) state.settings[key] = value;
}

function prepareCloudSyncLocalSnapshotForComparison() {
    var storedSnapshot = getCloudSyncStoredLocalSnapshotForComparison();
    var storedLastSaved = getCloudSyncSnapshotLastSaved(storedSnapshot);
    var beforeSettings = getCloudSyncComparableSettingsText();
    if (state.settings && isSettingsModalVisibleForCloudSnapshot() && typeof readSettingsFormIntoState === 'function') {
        readSettingsFormIntoState();
    } else if (state.settings && isSettingsModalVisibleForCloudSnapshot()) {
        syncNonEmptyPromptSettingsForCloudSnapshot();
    }
    var afterSettings = getCloudSyncComparableSettingsText();
    if (beforeSettings !== afterSettings) {
        return buildAppDataSnapshot({ skipSettingsFormSync: true, lastSaved: Date.now() });
    }
    return buildAppDataSnapshot({ skipSettingsFormSync: true, lastSaved: storedLastSaved });
}

function getCloudSyncComparableSettingsText() {
    try {
        return JSON.stringify(getSafeSettingsForCloudSync());
    } catch (_) {
        return '';
    }
}

function getCloudSyncStoredLocalSnapshotForComparison() {
    var snapshot = StorageService && StorageService._lastSaveSnapshot;
    if (snapshot && typeof snapshot === 'object') return snapshot;
    return null;
}

function getCloudSyncSnapshotLastSaved(snapshot) {
    return Number(snapshot && snapshot.lastSaved || 0) || 0;
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
    var localSnapshot = arguments.length > 1 ? arguments[1] : getCloudSyncStoredLocalSnapshotForComparison();
    var sizeFreshness = getCloudSyncConversationSizeFreshness(remote, localSnapshot);
    if (sizeFreshness) return sizeFreshness;

    var remoteTime = getCloudSyncSnapshotLastSaved(remote);
    var localTime = getCloudSyncSnapshotLastSaved(localSnapshot);
    if (!remoteTime) return 'unknown';
    if (!localTime) return 'newer';
    if (remoteTime > localTime + CLOUD_SYNC_TIME_TOLERANCE_MS) return 'newer';
    if (remoteTime < localTime - CLOUD_SYNC_TIME_TOLERANCE_MS) return 'older';
    return 'same';
}

function canCompareCloudSyncSnapshotBytes(remote) {
    if (remote && remote.encrypted === true) return false;
    return !(state && state.settings && state.settings.cloudSyncEncrypted);
}

function getCloudSyncConversationSizeFreshness(remote, localSnapshot) {
    if (!canCompareCloudSyncSnapshotBytes(remote)) return '';
    var remoteBytes = getCloudSyncConversationSerializedBytes(remote);
    var localBytes = getCloudSyncConversationSerializedBytes(localSnapshot);
    if (remoteBytes <= 0 || localBytes <= 0) return '';
    var byteDiff = remoteBytes - localBytes;
    if (Math.abs(byteDiff) <= CLOUD_SYNC_SIZE_TOLERANCE_BYTES) return '';
    return byteDiff > 0 ? 'newer-by-size' : 'older-by-size';
}

function getCloudSyncRemoteBytes(remote) {
    return Number(remote && remote.__cloudSyncBytes || 0) || 0;
}

function getCloudSyncSerializedBytes(value) {
    if (!value) return 0;
    try {
        var text = JSON.stringify(value);
        if (typeof TextEncoder !== 'undefined') {
            return new TextEncoder().encode(text).length;
        }
        return text.length;
    } catch (_) {
        return 0;
    }
}

function getCloudSyncConversationSerializedBytes(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return 0;
    return getCloudSyncSerializedBytes({
        conversations: snapshot.conversations || {},
        conversationOrder: Array.isArray(snapshot.conversationOrder) ? snapshot.conversationOrder : [],
        activeConvId: snapshot.activeConvId || null
    });
}
