// ==================== Cloud Sync Upload / Download ====================
async function uploadCloudSyncSnapshot(statusEl, options) {
    ensureCloudSyncSettings();
    options = options || {};
    var target = statusEl || document.getElementById('cloudSyncStatus');
    if (target) {
        target.textContent = 'Uploading...';
        target.className = 'text-[10px] leading-relaxed text-amber-300';
    }
    var snapshot = buildAppDataSnapshot();

    if (!options.force) {
        var remote = null;
        try {
            remote = await readCloudSyncRemoteSnapshot();
        } catch (err) {
            console.warn('[CloudSync] remote preflight failed, skipping protected upload:', err && err.message);
            var verifyMsg = 'Cloud upload skipped: could not verify remote snapshot freshness.';
            setCloudSyncStatus(verifyMsg, true);
            return { success: false, skipped: true, reason: 'preflight-failed' };
        }
        if (remote && getCloudSyncFreshness(remote) === 'newer') {
            var skipMsg = 'Cloud upload skipped: remote snapshot is newer. Use Download or Upload now to overwrite.';
            setCloudSyncStatus(skipMsg, true);
            return { success: false, skipped: true, reason: 'remote-newer' };
        }
    }

    var payload = await encryptCloudSyncSnapshot(snapshot);
    var result = await requestCloudSync('POST', {
        version: 1,
        app: 'OpenTavern',
        updatedAt: snapshot.lastSaved,
        encrypted: payload && payload.encrypted === true,
        data: payload
    });
    var when = result.updatedAt ? new Date(result.updatedAt).toLocaleString() : new Date().toLocaleString();
    var msg = 'Cloud upload complete: ' + when + (payload && payload.encrypted ? ' (encrypted)' : '');
    setCloudSyncStatus(msg, false);
    _cloudSyncSavingStatus = true;
    try { await persistState(true); } finally { _cloudSyncSavingStatus = false; }
    return result;
}

function applyCloudSyncSnapshot(snapshot) {
    var data = normalizeCloudSyncSnapshot(snapshot);
    var currentCloud = {
        cloudSyncEnabled: state.settings && state.settings.cloudSyncEnabled,
        cloudSyncAutoUpload: state.settings && state.settings.cloudSyncAutoUpload,
        cloudSyncEndpoint: state.settings && state.settings.cloudSyncEndpoint,
        cloudSyncToken: state.settings && state.settings.cloudSyncToken,
        cloudSyncEncrypted: state.settings && state.settings.cloudSyncEncrypted,
        cloudSyncPassphrase: state.settings && state.settings.cloudSyncPassphrase,
        cloudSyncLastAt: Date.now(),
        cloudSyncLastStatus: 'Cloud download applied.'
    };

    state.settings = Object.assign(defaultSettings(), data.settings || {}, currentCloud);
    state.conversations = data.conversations || {};
    state.conversationOrder = data.conversationOrder || Object.keys(state.conversations || {});
    state.activeConvId = data.activeConvId || null;
    state.worldBooks = data.worldBooks || {};
    state.characters = data.characters || {};
    state._charactersMigrated = !!data.charactersMigrated;

    Object.values(state.conversations || {}).forEach(function(conv) {
        try { normalizeConversation(conv); } catch (_) {}
    });

    if (!state.activeConvId || !state.conversations[state.activeConvId]) {
        var first = (state.conversationOrder || []).find(function(id) { return state.conversations[id]; }) || Object.keys(state.conversations || {})[0];
        if (first) {
            state.activeConvId = first;
        } else {
            var conv = defaultConversation();
            state.conversations[conv.id] = conv;
            state.conversationOrder = [conv.id];
            state.activeConvId = conv.id;
        }
    }

    _cloudSyncSavingStatus = true;
    try { persistState(true); } finally { _cloudSyncSavingStatus = false; }
    appStore.notify(['settings', 'conversations', 'characters', 'worldBooks', 'activeConvId']);
    if (typeof requestFullRender === 'function') requestFullRender();
    if (typeof updateInputState === 'function') updateInputState();
    if (typeof updateStorageInfo === 'function') updateStorageInfo();
    return data;
}

async function downloadCloudSyncSnapshot(statusEl) {
    ensureCloudSyncSettings();
    var target = statusEl || document.getElementById('cloudSyncStatus');
    if (target) {
        target.textContent = 'Downloading...';
        target.className = 'text-[10px] leading-relaxed text-amber-300';
    }
    var rawData = await readCloudSyncRemoteSnapshot();
    if (!rawData) {
        var emptyMsg = 'No cloud snapshot found for this token.';
        setCloudSyncStatus(emptyMsg, true);
        return null;
    }
    var freshness = getCloudSyncFreshness(rawData);
    var data = await decryptCloudSyncSnapshot(rawData);
    applyCloudSyncSnapshot(data);
    var when = data.lastSaved ? new Date(data.lastSaved).toLocaleString() : new Date().toLocaleString();
    var msg = 'Cloud download applied: ' + when + ' (' + freshness + ' than local before restore)' + (rawData && rawData.encrypted ? ' (encrypted)' : '');
    setCloudSyncStatus(msg, false);
    _cloudSyncSavingStatus = true;
    try { await persistState(true); } finally { _cloudSyncSavingStatus = false; }
    return data;
}

async function syncCloudSyncSnapshot(statusEl) {
    ensureCloudSyncSettings();
    var target = statusEl || document.getElementById('cloudSyncStatus');
    if (target) {
        target.textContent = 'Checking cloud snapshot...';
        target.className = 'text-[10px] leading-relaxed text-amber-300';
    }

    var remote = await readCloudSyncRemoteSnapshot();
    if (!remote) {
        setCloudSyncStatus('No cloud snapshot found. Uploading local snapshot...', false);
        return uploadCloudSyncSnapshot(statusEl, { force: true });
    }

    var freshness = getCloudSyncFreshness(remote);
    if (freshness === 'newer') {
        return downloadCloudSyncSnapshot(statusEl);
    }
    if (freshness === 'older') {
        setCloudSyncStatus('Local snapshot is newer. Uploading to cloud...', false);
        return uploadCloudSyncSnapshot(statusEl, { force: true });
    }
    var msg = 'Cloud sync already up to date.';
    setCloudSyncStatus(msg, false);
    _cloudSyncSavingStatus = true;
    try { await persistState(true); } finally { _cloudSyncSavingStatus = false; }
    return { success: true, upToDate: true };
}
