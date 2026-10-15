/**
 * 新手导读（文件：22-cloud-sync-crypto-envelope.js）
 *
 * 负责什么：这是“云同步系统”中的“云同步、加密、加密数据封装”部分。
 * 在程序中的位置：它把本地快照加密后上传，或下载远端快照并合并回应用状态。
 * 从哪里开始看：主要从 `isCloudSyncNonEmptyString(value)`、`getCloudSyncEnvelopeIterations(envelope)`、`validateCloudSyncEncryptedEnvelope(envelope)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：不要记录令牌、密码或明文快照；冲突处理必须防止较旧数据覆盖新数据。
 */
// ==================== Cloud Sync Encryption Envelope Helpers ====================
function isCloudSyncNonEmptyString(value) {
    return typeof value === 'string' && value.trim() !== '';
}

function getCloudSyncEnvelopeIterations(envelope) {
    var raw = envelope && envelope.iterations;
    var iterations = (raw === undefined || raw === null || raw === '') ? 210000 : Number(raw);
    if (!Number.isFinite(iterations) || iterations < 1) {
        throw new Error('加密云端快照元数据无效。');
    }
    return Math.floor(iterations);
}

function validateCloudSyncEncryptedEnvelope(envelope) {
    if (envelope.algorithm !== 'AES-GCM') {
        throw new Error('不支持的云端快照加密算法。');
    }
    if (
        !isCloudSyncNonEmptyString(envelope.payload) ||
        !isCloudSyncNonEmptyString(envelope.iv) ||
        !isCloudSyncNonEmptyString(envelope.salt)
    ) {
        throw new Error('加密云端快照元数据无效。');
    }
    getCloudSyncEnvelopeIterations(envelope);
}
