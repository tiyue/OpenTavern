// ==================== StorageService Load Candidates ====================
async function collectStorageServiceSnapshotCandidates(service, options) {
    options = options || {};
    const shouldReadLegacy = options.includeLegacy !== false;
    const candidates = [];

    await collectStorageServiceOPFSCandidate(service, options, candidates);
    await collectStorageServiceIDBCandidate(service, options, candidates);
    collectStorageServiceLocalCandidate(service, candidates);
    if (shouldReadLegacy) await collectStorageServiceLegacyIDBCandidate(service, candidates);

    return candidates;
}
