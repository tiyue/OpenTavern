// ==================== StorageService Backend Clear Utility Helpers ====================
function hasStorageServiceBackendMethod(backend, methodName) {
    return typeof backend !== 'undefined' && typeof backend[methodName] === 'function';
}

async function runStorageServiceBackendClear(operation) {
    try {
        if (typeof operation === 'function') await operation();
    } catch (_) {}
}

function canResetStorageServiceOPFSBeforeClear(service) {
    return typeof OPFSStorage !== 'undefined' &&
        hasStorageServiceBackendMethod(OPFSStorage, 'saveAll') &&
        service._opfsMirrorAvailable &&
        !service._isSafari();
}

function markStorageServiceBackendCleared(cleared, key) {
    cleared[key] = true;
}
