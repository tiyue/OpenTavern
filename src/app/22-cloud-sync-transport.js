// ==================== Cloud Sync Transport & Status ====================
async function requestCloudSync(method, payload) {
    var s = ensureCloudSyncSettings();
    var endpoint = getCloudSyncEndpoint();
    if (!endpoint) throw new Error('Cloud sync endpoint is required.');
    if (!s.cloudSyncToken) throw new Error('Cloud sync token is required.');
    if (s.cloudSyncToken.length < 8) throw new Error('Cloud sync token must be at least 8 characters.');

    var headers = {
        'Accept': 'application/json',
        'Authorization': 'Bearer ' + s.cloudSyncToken,
        'X-OpenTavern-Token': s.cloudSyncToken
    };
    var options = { method: method, headers: headers };
    if (payload !== undefined) {
        headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(payload);
    }

    var resp = await fetch(endpoint, options);
    var text = await resp.text();
    var json = null;
    if (text) {
        try { json = JSON.parse(text); } catch (_) {}
    }
    if (!resp.ok || (json && json.success === false)) {
        var msg = (json && (json.error || json.message)) || text || ('HTTP ' + resp.status);
        throw new Error(msg);
    }
    return json || {};
}

async function readCloudSyncRemoteSnapshot() {
    var result = await requestCloudSync('GET');
    if (!result || result.data === null || result.data === undefined) return null;
    return normalizeCloudSyncSnapshot(result);
}

function setCloudSyncStatus(message, isError) {
    ensureCloudSyncSettings();
    state.settings.cloudSyncLastStatus = message || '';
    if (!isError && message) state.settings.cloudSyncLastAt = Date.now();
    var el = document.getElementById('cloudSyncStatus');
    if (el) {
        el.textContent = message || '';
        el.className = 'text-[10px] leading-relaxed ' + (isError ? 'text-red-400' : 'text-zinc-500');
    }
}
