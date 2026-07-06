// ==================== StorageService Helper API ====================
function createStorageServiceHelperAPI() {
    return {
        _isQuotaError(e) {
            return storageIsQuotaError(e);
        },

        _isSafari() {
            if (this._isSafariBrowser !== null) return this._isSafariBrowser;
            this._isSafariBrowser = storageDetectSafari();
            return this._isSafariBrowser;
        },

        _hasUserData(data) {
            return storageHasUserData(data);
        },

        _isValidSnapshot(data) {
            return storageIsValidSnapshot(data);
        },

        _snapshotTime(data) {
            return storageSnapshotTime(data);
        },

        _cloneForPersist(data) {
            return storageCloneForPersist(data);
        }
    };
}
