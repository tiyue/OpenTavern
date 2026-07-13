// ==================== Cloud Sync Incremental Encryption Interface ====================
// TODO: Add per-item AES-GCM encryption while keeping plaintext hashes stable for reuse.
// V2 deliberately refuses encrypted operation until that protocol is implemented end to end.
function getCloudSyncV2EncryptionUnsupportedMessage() {
    return '增量同步暂未支持加密。请关闭“加密上传内容”后重试；旧版加密云端快照仍可正常下载。';
}

async function prepareCloudSyncV2UploadCrypto(remoteManifest) {
    var settings = ensureCloudSyncSettings();
    if (settings.cloudSyncEncrypted) throw new Error(getCloudSyncV2EncryptionUnsupportedMessage());
    if (remoteManifest && remoteManifest.encrypted === true) {
        throw new Error('云端现有数据使用了尚未支持的增量同步加密格式，无法安全覆盖。');
    }
    return { encrypted: false, key: null, crypto: null };
}

async function deriveCloudSyncV2CryptoContext(_cryptoMetadata) {
    throw new Error('此云端数据使用了尚未支持的增量同步加密格式，已停止下载。');
}

async function encryptCloudSyncV2ItemBytes(plaintext, cryptoContext) {
    if (cryptoContext && cryptoContext.encrypted) throw new Error(getCloudSyncV2EncryptionUnsupportedMessage());
    return { bytes: plaintext, iv: null };
}

async function decryptCloudSyncV2ItemBytes(ciphertext, _descriptor, cryptoContext) {
    if (cryptoContext && cryptoContext.encrypted) {
        throw new Error('此云端数据使用了尚未支持的增量同步加密格式，已停止下载。');
    }
    return ciphertext;
}
