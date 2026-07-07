// ==================== StorageService Info Fallback ====================
function getStorageServiceFallbackInfo(service) {
    const isFileMode = storageIsFileProtocol();
    return {
        backend: service.getBackend(),
        used: 0,
        webllmUsed: 0,
        totalUsed: 0,
        originUsed: 0,
        quota: null,
        persisted: null,
        fileProtocol: isFileMode,
        idbAvailable: service._idbAvailable || (typeof window !== 'undefined' && 'indexedDB' in window),
        idbLastError: service._idbFailureReason,
        opfsAvailable: false,
        opfsMirrorAvailable: false,
        opfsSkipped: isFileMode || service._opfsSkipped,
        opfsSkippedReason: isFileMode ? 'file-protocol' : service._opfsSkippedReason,
        opfsFailureReason: isFileMode ? null : service._opfsFailureReason,
        safariOpfsReadOnly: false
    };
}
