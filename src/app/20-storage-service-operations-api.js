// ==================== StorageService Operations API ====================
function createStorageServiceOperationsAPI() {
    return {
        async _syncSnapshotToAvailableBackends(data, source) {
            return syncStorageServiceSnapshotToAvailableBackends(this, data, source);
        },

        _installPageHideHandler() {
            return installStorageServicePageHideHandler(this);
        },

        async init() {
            return initStorageService(this);
        },

        async loadAll(options = {}) {
            return loadStorageServiceData(this, options);
        },

        _isDangerouslyEmptySnapshot(data) {
            return isDangerouslyEmptyStorageSnapshot(data);
        },

        async _readNewestStoredSnapshotNoSync() {
            return readNewestStorageServiceSnapshotNoSync(this);
        },

        _saveLocalHistorySnapshot(data) {
            return saveStorageServiceLocalHistorySnapshot(this, data);
        },

        async saveAll(data) {
            return saveStorageServiceData(this, data);
        },

        _handleQuotaExceeded(err, dataSnapshot) {
            return handleStorageQuotaExceeded(this, err, dataSnapshot);
        },

        getBackend() {
            if (this._idbAvailable || ('indexedDB' in window)) return 'idb';
            return 'localStorage';
        },

        async getStorageInfo() {
            return getStorageServiceInfo(this);
        },

        async clearAllData() {
            return clearStorageServiceData(this);
        }
    };
}
