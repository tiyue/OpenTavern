// ==================== StorageService OPFS Initialization Helpers ====================
function resetStorageServiceOPFSState(service) {
    service._opfsReadableAvailable = false;
    service._opfsMirrorAvailable = false;
    service._opfsSkipped = false;
    service._opfsSkippedReason = null;
    service._opfsFailed = false;
    service._opfsFailureReason = null;
}

function markStorageServiceOPFSSkipped(service, reason) {
    service._opfsSkipped = true;
    service._opfsSkippedReason = reason;
    service._opfsFailed = false;
    service._opfsFailureReason = null;
}

function markStorageServiceOPFSFailed(service, reason) {
    service._opfsFailed = true;
    service._opfsFailureReason = reason;
}

function getStorageServiceOPFSSkipReason(service) {
    if (!service._useOPFS) return 'disabled';
    if (storageIsFileProtocol()) return 'file-protocol';
    return null;
}

function assertStorageServiceOPFSSupported() {
    if (!window.isSecureContext) throw new Error('insecure-context');
    if (!navigator.storage || !navigator.storage.getDirectory) throw new Error('OPFS not supported');
}

function isStorageServiceOPFSFileProtocolError(message) {
    return storageIsFileProtocol() || /file:|file-protocol|blocked on file/i.test(message || '');
}

function markStorageServiceOPFSSafariReadOnly(service) {
    markStorageServiceOPFSFailed(service, 'Safari OPFS writes are disabled; IndexedDB is canonical.');
    console.warn('[Storage] Safari detected: OPFS will be read for recovery only, not used for writes.');
}

function applyStorageServiceOPFSProbeResult(service, probe) {
    if (probe && probe.ok) {
        service._opfsMirrorAvailable = true;
        console.log('[Storage] OPFS writable mirror initialized successfully');
        return;
    }
    markStorageServiceOPFSFailed(service, (probe && probe.reason) || 'OPFS write probe failed');
    console.warn('[Storage] OPFS write probe failed; keeping IndexedDB/localStorage canonical:', service._opfsFailureReason);
}
