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
