/**
 * 新手导读（文件：22-cloud-sync-encrypt.js）
 *
 * 负责什么：这是“云同步系统”中的“云同步、加密”部分。
 * 在程序中的位置：它把本地快照加密后上传，或下载远端快照并合并回应用状态。
 * 从哪里开始看：主要从 `encryptCloudSyncSnapshot(snapshot)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：不要记录令牌、密码或明文快照；冲突处理必须防止较旧数据覆盖新数据。
 */
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
        conversationBytes: getCloudSyncConversationSerializedBytes(snapshot),
        lastSaved: snapshot.lastSaved,
        createdAt: Date.now()
    };
}
