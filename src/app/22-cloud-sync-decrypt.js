/**
 * 新手导读（文件：22-cloud-sync-decrypt.js）
 *
 * 负责什么：这是“云同步系统”中的“云同步、解密”部分。
 * 在程序中的位置：它把本地快照加密后上传，或下载远端快照并合并回应用状态。
 * 从哪里开始看：主要从 `decryptCloudSyncSnapshot(envelope)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：不要记录令牌、密码或明文快照；冲突处理必须防止较旧数据覆盖新数据。
 */
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
