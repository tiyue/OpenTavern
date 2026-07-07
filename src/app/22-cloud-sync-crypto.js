// ==================== Cloud Sync Encryption ====================
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
    if (passphrase.length < 8) throw new Error('Encryption passphrase must be at least 8 characters to restore this cloud snapshot.');
    if (envelope.algorithm !== 'AES-GCM') throw new Error('Unsupported cloud snapshot encryption algorithm.');

    var salt = base64ToBytes(envelope.salt);
    var iv = base64ToBytes(envelope.iv);
    var cipher = base64ToBytes(envelope.payload);
    var key = await deriveCloudSyncKey(passphrase, salt, Number(envelope.iterations || 210000));
    var plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, cipher);
    var text = new TextDecoder().decode(new Uint8Array(plain));
    return normalizeCloudSyncSnapshot(JSON.parse(text));
}
