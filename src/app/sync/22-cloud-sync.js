/**
 * 新手导读（文件：22-cloud-sync.js）
 *
 * 负责什么：这是“云同步系统”中的“云同步”部分。
 * 在程序中的位置：它把本地快照加密后上传，或下载远端快照并合并回应用状态。
 * 从哪里开始看：主要从 `ensureCloudSyncSettings(无参数)`、`buildAppDataSnapshot(options)`、`getCloudSyncSnapshotConversationOrder(无参数)`、`getCloudSyncSnapshotActiveConversationId(无参数)`、`syncOpenSettingsFormForCloudSnapshot(无参数)`、`syncNonEmptyPromptSettingsForCloudSnapshot(无参数)`，以及另外 14 个内部步骤 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：不要记录令牌、密码或明文快照；冲突处理必须防止较旧数据覆盖新数据。
 */
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
        conversationOrder: getCloudSyncSnapshotConversationOrder(),
        activeConvId: getCloudSyncSnapshotActiveConversationId(),
        worldBooks: cloneCloudSyncSnapshotValue(state.worldBooks, {}),
        characters: cloneCloudSyncSnapshotValue(state.characters, {}),
        charactersMigrated: !!state._charactersMigrated,
        lastSaved: Number.isFinite(Number(options.lastSaved)) ? Number(options.lastSaved) : Date.now()
    };
}

function getCloudSyncSnapshotConversationOrder() {
    return getConversationIdsWithMissingFallback(state.conversationOrder, state.conversations);
}

function getCloudSyncSnapshotActiveConversationId() {
    return getValidConversationIdOrFallback(state.activeConvId, state.conversationOrder, state.conversations);
}

function syncOpenSettingsFormForCloudSnapshot() {
    if (typeof settingsFormDraft !== 'undefined' && settingsFormDraft) return;
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
    if (typeof settingsFormDraft !== 'undefined' && settingsFormDraft) {
        return buildAppDataSnapshot({ skipSettingsFormSync: true, lastSaved: storedLastSaved });
    }
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
    var remoteTime = getCloudSyncSnapshotLastSaved(remote);
    var localTime = getCloudSyncSnapshotLastSaved(localSnapshot);
    if (!remoteTime) return 'unknown';
    if (!localTime) return 'newer';
    if (remoteTime > localTime + CLOUD_SYNC_TIME_TOLERANCE_MS) return 'newer';
    if (remoteTime < localTime - CLOUD_SYNC_TIME_TOLERANCE_MS) return 'older';
    return 'same';
}

function canCompareCloudSyncSnapshotBytes(remote) {
    if (!remote || typeof remote !== 'object') return false;
    if (remote.encrypted === true) {
        return getCloudSyncSnapshotConversationBytes(remote) > 0;
    }
    return true;
}

function getCloudSyncConversationSizeFreshness(remote, localSnapshot) {
    if (!canCompareCloudSyncSnapshotBytes(remote)) return '';
    var remoteBytes = getCloudSyncSnapshotConversationBytes(remote);
    var localBytes = getCloudSyncSnapshotConversationBytes(localSnapshot);
    if (remoteBytes <= 0 || localBytes <= 0) return '';
    var byteDiff = remoteBytes - localBytes;
    if (Math.abs(byteDiff) <= CLOUD_SYNC_SIZE_TOLERANCE_BYTES) return '';
    return byteDiff > 0 ? 'newer-by-size' : 'older-by-size';
}

function getCloudSyncSnapshotConversationBytes(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return 0;
    if (snapshot.encrypted === true) {
        var encryptedBytes = Number(snapshot.conversationBytes);
        return Number.isFinite(encryptedBytes) && encryptedBytes > 0 ? Math.floor(encryptedBytes) : 0;
    }
    return getCloudSyncConversationSerializedBytes(snapshot);
}

function getCloudSyncRemoteBytes(remote) {
    return Number(remote && remote.__cloudSyncBytes || 0) || 0;
}

function getCloudSyncRemoteUpdatedAt(remote) {
    var updatedAt = Number(remote && remote.__cloudSyncUpdatedAt);
    return Number.isFinite(updatedAt) && updatedAt >= 0 ? Math.floor(updatedAt) : null;
}

function getCloudSyncRemoteRevision(remote) {
    var revision = Number(remote && (remote.revision !== undefined ? remote.revision : remote.__cloudSyncRevision));
    return Number.isFinite(revision) && revision >= 0 ? Math.floor(revision) : null;
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
    var conversations = snapshot.conversations || {};
    var conversationOrder = getConversationIdsWithMissingFallback(snapshot.conversationOrder, conversations);
    return getCloudSyncSerializedBytes({
        conversations: conversations,
        conversationOrder: conversationOrder,
        activeConvId: getValidConversationIdOrFallback(snapshot.activeConvId, conversationOrder, conversations)
    });
}
