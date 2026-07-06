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
        if (this._pageHideInstalled) return;
        this._pageHideInstalled = true;

        window.addEventListener('pagehide', () => {
            try {
                const snapshot = this._lastSaveSnapshot;
                if (snapshot) {
                    this._tryWriteLocalSnapshot(snapshot);
                    console.log('[Storage] pagehide: sync-flushed snapshot to localStorage');
                }
            } catch (_) {}
            try { if (typeof persistState === 'function') persistState(true); } catch (_) {}
        });

        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                try { if (typeof persistState === 'function') persistState(true); } catch (_) {}
            }
        });

        console.log('[Storage] pagehide/visibilitychange snapshot handlers installed');
    },

    async init() {
        this._installPageHideHandler();

        this._idbAvailable = false;
        this._idbFailed = false;
        this._lastUsedBackend = null;

        try {
            if ('indexedDB' in window) {
                await IDBStorage._open();
                this._idbAvailable = true;
                this._primaryBackend = 'idb';
                console.log('[Storage] IndexedDB primary backend initialized successfully');
            } else {
                throw new Error('IndexedDB not supported');
            }
        } catch (e) {
            this._idbFailed = true;
            this._idbFailureReason = e && e.message ? e.message : String(e);
            this._primaryBackend = 'localStorage';
            console.warn('[Storage] IndexedDB unavailable; localStorage is the emergency primary:', e && e.message);
        }

        this._opfsReadableAvailable = false;
        this._opfsMirrorAvailable = false;
        this._opfsSkipped = false;
        this._opfsSkippedReason = null;
        this._opfsFailed = false;
        this._opfsFailureReason = null;

        try {
            if (!this._useOPFS) {
                this._opfsSkipped = true;
                this._opfsSkippedReason = 'disabled';
                return;
            }
            if (storageIsFileProtocol()) {
                this._opfsSkipped = true;
                this._opfsSkippedReason = 'file-protocol';
                return;
            }
            if (!window.isSecureContext) throw new Error('insecure-context');
            if (!navigator.storage || !navigator.storage.getDirectory) throw new Error('OPFS not supported');

            await OPFSStorage._getRoot();
            this._opfsReadableAvailable = true;

            if (this._isSafari()) {
                this._opfsFailed = true;
                this._opfsFailureReason = 'Safari OPFS writes are disabled; IndexedDB is canonical.';
                console.warn('[Storage] Safari detected: OPFS will be read for recovery only, not used for writes.');
                return;
            }

            const probe = await OPFSStorage.probeWritable();
            if (probe && probe.ok) {
                this._opfsMirrorAvailable = true;
                console.log('[Storage] OPFS writable mirror initialized successfully');
            } else {
                this._opfsFailed = true;
                this._opfsFailureReason = (probe && probe.reason) || 'OPFS write probe failed';
                console.warn('[Storage] OPFS write probe failed; keeping IndexedDB/localStorage canonical:', this._opfsFailureReason);
            }
        } catch (e) {
            const msg = e && e.message ? e.message : String(e);
            if (storageIsFileProtocol() || /file:|file-protocol|blocked on file/i.test(msg)) {
                this._opfsSkipped = true;
                this._opfsSkippedReason = 'file-protocol';
                this._opfsFailed = false;
                this._opfsFailureReason = null;
                return;
            }
            this._opfsFailed = true;
            this._opfsFailureReason = msg;
            console.info('[Storage] OPFS unavailable; IndexedDB/localStorage remain canonical:', msg);
        }
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
