// ==================== Cloud Sync Decrypt Snapshot ====================
async function decryptCloudSyncSnapshot(envelope) {
    if (!envelope || envelope.encrypted !== true) return envelope;
    var s = ensureCloudSyncSettings();
    var passphrase = String(s.cloudSyncPassphrase || '');
    if (passphrase.length < 8) throw new Error('Encryption passphrase must be at least 8 characters to restore this cloud snapshot.');
    validateCloudSyncEncryptedEnvelope(envelope);

    var salt = base64ToBytes(envelope.salt);
    var iv = base64ToBytes(envelope.iv);
    var cipher = base64ToBytes(envelope.payload);
    var key = await deriveCloudSyncKey(passphrase, salt, getCloudSyncEnvelopeIterations(envelope));
    var plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, cipher);
    var text = new TextDecoder().decode(new Uint8Array(plain));
    return normalizeCloudSyncSnapshot(JSON.parse(text));
}
