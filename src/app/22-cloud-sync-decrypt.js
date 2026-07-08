// ==================== Cloud Sync Decrypt Snapshot ====================
async function decryptCloudSyncSnapshot(envelope) {
    if (!envelope || envelope.encrypted !== true) return envelope;

    var s = ensureCloudSyncSettings();
    var passphrase = String(s.cloudSyncPassphrase || '');
    if (passphrase.length < 8) throw new Error('恢复此云端快照需要至少 8 个字符的加密密码。');
    validateCloudSyncEncryptedEnvelope(envelope);

    var cryptoApi = getCloudSyncWebCryptoApi();
    if (!cryptoApi) throw new Error(getCloudSyncWebCryptoUnavailableMessage());

    var salt = base64ToBytes(envelope.salt);
    var iv = base64ToBytes(envelope.iv);
    var cipher = base64ToBytes(envelope.payload);
    var key = await deriveCloudSyncKey(passphrase, salt, getCloudSyncEnvelopeIterations(envelope));
    var plain = await cryptoApi.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, cipher);
    var text = new TextDecoder().decode(new Uint8Array(plain));
    return normalizeCloudSyncSnapshot(JSON.parse(text));
}
