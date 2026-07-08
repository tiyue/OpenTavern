// ==================== Cloud Sync Encrypt Snapshot ====================
async function encryptCloudSyncSnapshot(snapshot) {
    var s = ensureCloudSyncSettings();
    if (!s.cloudSyncEncrypted) return snapshot;

    var passphrase = String(s.cloudSyncPassphrase || '');
    if (passphrase.length < 8) throw new Error('加密密码至少需要 8 个字符。');

    var cryptoApi = getCloudSyncWebCryptoApi();
    if (!cryptoApi) throw new Error(getCloudSyncWebCryptoUnavailableMessage());

    var salt = cryptoApi.getRandomValues(new Uint8Array(16));
    var iv = cryptoApi.getRandomValues(new Uint8Array(12));
    var iterations = 210000;
    var key = await deriveCloudSyncKey(passphrase, salt, iterations);
    var plaintext = new TextEncoder().encode(JSON.stringify(snapshot));
    var cipher = new Uint8Array(await cryptoApi.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, plaintext));

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
