/**
 * 新手导读（文件：22-cloud-sync-key-derivation.js）
 *
 * 负责什么：这是“云同步系统”中的“云同步、关键词、密钥派生”部分。
 * 在程序中的位置：它把本地快照加密后上传，或下载远端快照并合并回应用状态。
 * 从哪里开始看：主要从 `getCloudSyncWebCryptoApi(无参数)`、`isCloudSyncWebCryptoAvailable(无参数)`、`getCloudSyncWebCryptoUnavailableMessage(无参数)`、`deriveCloudSyncKey(passphrase, salt, iterations)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：不要记录令牌、密码或明文快照；冲突处理必须防止较旧数据覆盖新数据。
 */
// ==================== Cloud Sync Key Derivation ====================
function getCloudSyncWebCryptoApi() {
    if (typeof crypto !== 'undefined' && crypto && crypto.subtle && crypto.getRandomValues) {
        return crypto;
    }
    if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle && window.crypto.getRandomValues) {
        return window.crypto;
    }
    return null;
}

function isCloudSyncWebCryptoAvailable() {
    return !!getCloudSyncWebCryptoApi();
}

function getCloudSyncWebCryptoUnavailableMessage() {
    return '当前页面无法使用 WebCrypto，因此不能处理旧版 AES-GCM 云端快照的加密或解密。请在支持 WebCrypto 的安全上下文中重试旧快照恢复。';
}

async function deriveCloudSyncKey(passphrase, salt, iterations) {
    var cryptoApi = getCloudSyncWebCryptoApi();
    if (!cryptoApi) throw new Error(getCloudSyncWebCryptoUnavailableMessage());
    var enc = new TextEncoder();
    var material = await cryptoApi.subtle.importKey(
        'raw',
        enc.encode(passphrase),
        'PBKDF2',
        false,
        ['deriveKey']
    );
    return cryptoApi.subtle.deriveKey(
        { name: 'PBKDF2', salt: salt, iterations: iterations, hash: 'SHA-256' },
        material,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}
