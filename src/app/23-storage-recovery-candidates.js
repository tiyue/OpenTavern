// ==================== Storage Recovery Candidates ====================
function createStorageRecoveryCandidate(backend, data) {
    return {
        backend: backend,
        data: data,
        lastSaved: data.lastSaved || 0,
        convCount: Object.keys(data.conversations || {}).length,
        charCount: Object.keys(data.characters || {}).length,
        wbCount: Object.keys(data.worldBooks || {}).length
    };
}

function hasRecoverableStorageData(data) {
    return !!(data && (
        Object.keys(data.conversations || {}).length > 0 ||
        Object.keys(data.characters || {}).length > 0 ||
        Object.keys(data.worldBooks || {}).length > 0 ||
        data.lastSaved ||
        data.settings
    ));
}

function sortStorageRecoveryCandidates(candidates) {
    candidates.forEach(function(candidate) {
        candidate.hasUserData = !!(candidate.convCount || candidate.charCount || candidate.wbCount);
    });
    candidates.sort(function(a, b) {
        return ((b.hasUserData ? 1 : 0) - (a.hasUserData ? 1 : 0)) || ((b.lastSaved || 0) - (a.lastSaved || 0));
    });
    return candidates;
}
