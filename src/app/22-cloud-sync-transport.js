// ==================== Cloud Sync Transport & Status ====================
async function requestCloudSync(method, payload) {
    var s = ensureCloudSyncSettings();
    var endpoint = getCloudSyncEndpoint();
    if (!endpoint) throw new Error('请填写云同步端点。');
    if (!s.cloudSyncToken) throw new Error('请填写云同步令牌。');
    if (s.cloudSyncToken.length < 8) throw new Error('云同步令牌至少需要 8 个字符。');

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
    return attachCloudSyncRemoteMetadata(normalizeCloudSyncSnapshot(result), result);
}

function attachCloudSyncRemoteMetadata(snapshot, result) {
    if (!snapshot || typeof snapshot !== 'object') return snapshot;
    var bytes = Number(result && result.bytes);
    var updatedAt = Number(result && result.updatedAt);
    try {
        Object.defineProperty(snapshot, '__cloudSyncBytes', {
            value: Number.isFinite(bytes) ? bytes : 0,
            configurable: true
        });
        Object.defineProperty(snapshot, '__cloudSyncUpdatedAt', {
            value: Number.isFinite(updatedAt) ? updatedAt : 0,
            configurable: true
        });
    } catch (_) {
        snapshot.__cloudSyncBytes = Number.isFinite(bytes) ? bytes : 0;
        snapshot.__cloudSyncUpdatedAt = Number.isFinite(updatedAt) ? updatedAt : 0;
    }
    return snapshot;
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
