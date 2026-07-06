// ==================== StorageService Runtime State ====================
function createStorageServiceRuntimeState() {
    return {
        _primaryBackend: 'idb',
        _useOPFS: true,
        _opfsReadableAvailable: false,
        _opfsMirrorAvailable: false,
        _opfsSkipped: false,
        _opfsSkippedReason: null,
        _opfsFailed: false,
        _opfsFailureReason: null,
        _idbAvailable: false,
        _idbFailed: false,
        _idbFailureReason: null,

        _lastSaveSnapshot: null,
        _pageHideInstalled: false,
        _lastUsedBackend: null,
        _lastLoadedBackend: null,
        _lastQuotaAlert: 0,
        _isSafariBrowser: null
    };
}
