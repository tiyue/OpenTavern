// ==================== Cloud Sync Key Derivation ====================
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
