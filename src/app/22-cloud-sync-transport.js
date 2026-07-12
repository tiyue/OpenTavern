/**
 * 新手导读（文件：22-cloud-sync-transport.js）
 *
 * 负责什么：这是“云同步系统”中的“云同步、网络传输”部分。
 * 在程序中的位置：它把本地快照加密后上传，或下载远端快照并合并回应用状态。
 * 从哪里开始看：主要从 `requestCloudSync(method, payload)`、`readCloudSyncRemoteSnapshot(无参数)`、`attachCloudSyncRemoteMetadata(snapshot, result)`、`setCloudSyncStatus(message, isError)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：不要记录令牌、密码或明文快照；冲突处理必须防止较旧数据覆盖新数据。
 */
// ==================== Cloud Sync Transport & Status ====================
async function requestCloudSync(method, payload, requestOptions) {
    var s = ensureCloudSyncSettings();
    requestOptions = requestOptions || {};
    var endpoint = getCloudSyncEndpoint();
    if (!endpoint) throw new Error('请填写云同步端点。');
    if (!s.cloudSyncToken) throw new Error('请填写云同步令牌。');
    if (s.cloudSyncToken.length < 8) throw new Error('云同步令牌至少需要 8 个字符。');

    var headers = {
        'Accept': 'application/json',
        'Authorization': 'Bearer ' + s.cloudSyncToken,
        'X-OpenTavern-Token': s.cloudSyncToken
    };
    var expectedUpdatedAt = Number(requestOptions.expectedUpdatedAt);
    if (Number.isFinite(expectedUpdatedAt) && expectedUpdatedAt >= 0) {
        expectedUpdatedAt = Math.floor(expectedUpdatedAt);
        headers['If-Match'] = String(expectedUpdatedAt);
        headers['X-OpenTavern-If-Match-Updated-At'] = String(expectedUpdatedAt);
    }
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
        var error = new Error(msg);
        error.status = resp.status;
        var currentUpdatedAt = Number(json && json.currentUpdatedAt);
        if (Number.isFinite(currentUpdatedAt) && currentUpdatedAt >= 0) {
            error.currentUpdatedAt = Math.floor(currentUpdatedAt);
        }
        throw error;
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
