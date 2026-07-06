// ==================== Cloud Sync ====================
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

function buildAppDataSnapshot() {
    return {
        settings: getSafeSettingsForCloudSync(),
        conversations: state.conversations || {},
        conversationOrder: state.conversationOrder || [],
        activeConvId: state.activeConvId || null,
        worldBooks: state.worldBooks || {},
        characters: state.characters || {},
        charactersMigrated: !!state._charactersMigrated,
        lastSaved: Date.now()
    };
}

function getCloudSyncEndpoint() {
    var s = ensureCloudSyncSettings();
    return String(s.cloudSyncEndpoint || '/api/sync').trim() || '/api/sync';
}

function normalizeCloudSyncSnapshot(raw) {
    var data = raw && raw.data !== undefined ? raw.data : raw;
    if (data && data.snapshot !== undefined) data = data.snapshot;
    if (!data || typeof data !== 'object') throw new Error('Cloud snapshot is empty or invalid.');
    if (data.encrypted === true) return data;
    if (!data.settings || typeof data.settings !== 'object') data.settings = {};
    if (!data.conversations || typeof data.conversations !== 'object') data.conversations = {};
    if (!data.characters || typeof data.characters !== 'object') data.characters = {};
    if (!data.worldBooks || typeof data.worldBooks !== 'object') data.worldBooks = {};
    if (!Array.isArray(data.conversationOrder)) data.conversationOrder = Object.keys(data.conversations || {});
    if (!data.lastSaved) data.lastSaved = Date.now();
    return data;
}

function getCloudSyncFreshness(remote) {
    var remoteTime = Number(remote && remote.lastSaved || 0) || 0;
    var localTime = Number(StorageService && StorageService._lastSaveSnapshot && StorageService._lastSaveSnapshot.lastSaved || 0) || 0;
    if (!localTime) localTime = Date.now();
    if (!remoteTime) return 'unknown';
    if (remoteTime > localTime + 1000) return 'newer';
    if (remoteTime < localTime - 1000) return 'older';
    return 'same';
}

async function readCloudSyncRemoteSnapshot() {
    var result = await requestCloudSync('GET');
    if (!result || result.data === null || result.data === undefined) return null;
    return normalizeCloudSyncSnapshot(result);
}

function bytesToBase64(bytes) {
    var binary = '';
    var chunk = 0x8000;
    for (var i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
}

function base64ToBytes(text) {
    var binary = atob(String(text || ''));
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

async function deriveCloudSyncKey(passphrase, salt, iterations) {
    if (!window.crypto || !crypto.subtle) throw new Error('WebCrypto is required for encrypted cloud sync.');
    var enc = new TextEncoder();
    var material = await crypto.subtle.importKey(
        'raw',
        enc.encode(passphrase),
        'PBKDF2',
        false,
        ['deriveKey']
    );
    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: salt, iterations: iterations, hash: 'SHA-256' },
        material,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

async function encryptCloudSyncSnapshot(snapshot) {
    var s = ensureCloudSyncSettings();
    if (!s.cloudSyncEncrypted) return snapshot;
    var passphrase = String(s.cloudSyncPassphrase || '');
    if (passphrase.length < 8) throw new Error('Encryption passphrase must be at least 8 characters.');

    var salt = crypto.getRandomValues(new Uint8Array(16));
    var iv = crypto.getRandomValues(new Uint8Array(12));
    var iterations = 210000;
    var key = await deriveCloudSyncKey(passphrase, salt, iterations);
    var plaintext = new TextEncoder().encode(JSON.stringify(snapshot));
    var cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, plaintext));

    return {
        encrypted: true,
        version: 1,
        algorithm: 'AES-GCM',
        kdf: 'PBKDF2-SHA256',
        iterations: iterations,
        salt: bytesToBase64(salt),
        iv: bytesToBase64(iv),
        payload: bytesToBase64(cipher),
        lastSaved: snapshot.lastSaved,
        createdAt: Date.now()
    };
}

async function decryptCloudSyncSnapshot(envelope) {
    if (!envelope || envelope.encrypted !== true) return envelope;
    var s = ensureCloudSyncSettings();
    var passphrase = String(s.cloudSyncPassphrase || '');
    if (!passphrase) throw new Error('Encryption passphrase is required to restore this cloud snapshot.');
    if (envelope.algorithm !== 'AES-GCM') throw new Error('Unsupported cloud snapshot encryption algorithm.');

    var salt = base64ToBytes(envelope.salt);
    var iv = base64ToBytes(envelope.iv);
    var cipher = base64ToBytes(envelope.payload);
    var key = await deriveCloudSyncKey(passphrase, salt, Number(envelope.iterations || 210000));
    var plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, cipher);
    var text = new TextDecoder().decode(new Uint8Array(plain));
    return normalizeCloudSyncSnapshot(JSON.parse(text));
}

async function requestCloudSync(method, payload) {
    var s = ensureCloudSyncSettings();
    var endpoint = getCloudSyncEndpoint();
    if (!endpoint) throw new Error('Cloud sync endpoint is required.');
    if (!s.cloudSyncToken) throw new Error('Cloud sync token is required.');

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

var _cloudSyncUploadTimer = null;
var _cloudSyncSavingStatus = false;
function scheduleCloudSyncUpload() {
    var s = ensureCloudSyncSettings();
    if (_cloudSyncSavingStatus) return;
    if (!s.cloudSyncEnabled || !s.cloudSyncAutoUpload || !s.cloudSyncEndpoint || !s.cloudSyncToken) return;
    if (_cloudSyncUploadTimer) clearTimeout(_cloudSyncUploadTimer);
    _cloudSyncUploadTimer = setTimeout(function() {
        _cloudSyncUploadTimer = null;
        uploadCloudSyncSnapshot(null, { force: false }).catch(function(err) {
            console.warn('[CloudSync] auto upload failed:', err && err.message);
            setCloudSyncStatus('Cloud auto upload failed: ' + ((err && err.message) || err), true);
        });
    }, 2500);
}
