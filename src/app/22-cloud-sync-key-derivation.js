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
    return '当前页面不支持浏览器加密同步。HTTP/IP 访问通常无法使用 WebCrypto；请关闭“加密上传内容”，或改用 HTTPS 域名后再开启加密。';
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
