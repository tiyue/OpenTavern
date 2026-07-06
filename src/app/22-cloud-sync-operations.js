// ==================== Cloud Sync Upload / Download ====================
async function uploadCloudSyncSnapshot(statusEl, options) {
    ensureCloudSyncSettings();
    options = options || {};
    setCloudSyncPendingStatus(statusEl, 'Uploading...');
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
    var when = formatCloudSyncTimestamp(result.updatedAt);
    var msg = 'Cloud upload complete: ' + when + (payload && payload.encrypted ? ' (encrypted)' : '');
    setCloudSyncStatus(msg, false);
    await persistCloudSyncOperationState();
    return result;
}

async function downloadCloudSyncSnapshot(statusEl) {
    ensureCloudSyncSettings();
    setCloudSyncPendingStatus(statusEl, 'Downloading...');
    var rawData = await readCloudSyncRemoteSnapshot();
    if (!rawData) {
        var emptyMsg = 'No cloud snapshot found for this token.';
        setCloudSyncStatus(emptyMsg, true);
        return null;
    }
    var freshness = getCloudSyncFreshness(rawData);
    var data = await decryptCloudSyncSnapshot(rawData);
    applyCloudSyncSnapshot(data);
    var when = formatCloudSyncTimestamp(data.lastSaved);
    var msg = 'Cloud download applied: ' + when + ' (' + freshness + ' than local before restore)' + (rawData && rawData.encrypted ? ' (encrypted)' : '');
    setCloudSyncStatus(msg, false);
    await persistCloudSyncOperationState();
    return data;
}

async function syncCloudSyncSnapshot(statusEl) {
    ensureCloudSyncSettings();
    setCloudSyncPendingStatus(statusEl, 'Checking cloud snapshot...');

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
    await persistCloudSyncOperationState();
    return { success: true, upToDate: true };
}
