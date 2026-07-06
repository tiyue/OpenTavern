// ==================== StorageService (IndexedDB primary + localStorage snapshot + optional OPFS mirror) ====================
var StorageService = {
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
    _isSafariBrowser: null,

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
    },

    _readLocalSnapshot() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return null;
            const data = JSON.parse(raw);
            return this._isValidSnapshot(data) ? data : null;
        } catch (e) {
            console.warn('[Storage] localStorage snapshot load failed:', e);
            return null;
        }
    },

    _tryWriteLocalSnapshot(data) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
            return true;
        } catch (_) {
            return false;
        }
    },

    _clearMarkerTime() {
        try {
            const n = Number(localStorage.getItem(STORAGE_CLEAR_KEY) || 0);
            return Number.isFinite(n) ? n : 0;
        } catch (_) { return 0; }
    },

    _pickNewest(candidates) {
        const valid = candidates.filter(c => c && this._isValidSnapshot(c.data));
        const withUserData = valid.filter(c => this._hasUserData(c.data));
        return (withUserData.length ? withUserData : valid)
            .sort((a, b) => this._snapshotTime(b.data) - this._snapshotTime(a.data))[0] || null;
    },

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
