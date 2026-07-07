// ==================== Cloud Sync Encryption Envelope Helpers ====================
function isCloudSyncNonEmptyString(value) {
    return typeof value === 'string' && value.trim() !== '';
}

function getCloudSyncEnvelopeIterations(envelope) {
    var iterations = Number(envelope && envelope.iterations || 210000);
    if (!Number.isFinite(iterations) || iterations < 1) {
        throw new Error('Invalid encrypted cloud snapshot metadata.');
    }
    return Math.floor(iterations);
}

function validateCloudSyncEncryptedEnvelope(envelope) {
    if (envelope.algorithm !== 'AES-GCM') {
        throw new Error('Unsupported cloud snapshot encryption algorithm.');
    }
    if (
        !isCloudSyncNonEmptyString(envelope.payload) ||
        !isCloudSyncNonEmptyString(envelope.iv) ||
        !isCloudSyncNonEmptyString(envelope.salt)
    ) {
        throw new Error('Invalid encrypted cloud snapshot metadata.');
    }
    getCloudSyncEnvelopeIterations(envelope);
}
