// ==================== Storage Backend Recovery Scanner ====================
async function scanAllStorageBackends() {
    const candidates = [];

    await scanOPFSStorageRecoveryCandidate(candidates);
    await scanIDBStorageRecoveryCandidate(candidates);
    scanLocalStorageCurrentRecoveryCandidate(candidates);
    scanLocalStorageBackupRecoveryCandidates(candidates);
    await scanLegacyIDBStorageRecoveryCandidate(candidates);

    return sortStorageRecoveryCandidates(candidates);
}
