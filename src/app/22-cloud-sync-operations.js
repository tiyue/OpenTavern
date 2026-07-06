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
