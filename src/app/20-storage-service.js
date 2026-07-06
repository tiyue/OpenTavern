// ==================== StorageService (IndexedDB primary + localStorage snapshot + optional OPFS mirror) ====================
var StorageService = {
    _primaryBackend: 'idb',
    _useOPFS: true,
    _opfsReadableAvailable: false,
    _opfsMirrorAvailable: false,
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
        if (!this._isValidSnapshot(data)) return;
        const snapshot = this._cloneForPersist(data);
        const jobs = [];

        if (source !== 'idb' && this._idbAvailable) {
            jobs.push(IDBStorage.saveAll(this._cloneForPersist(snapshot)).catch((e) => {
                this._idbFailureReason = e && e.message ? e.message : String(e);
                console.warn('[Storage] IDB sync failed; will retry on next save/load:', e && e.message);
            }));
        }

        if (source !== 'localStorage') this._tryWriteLocalSnapshot(snapshot);

        if (source !== 'opfs' && this._opfsMirrorAvailable && !this._isSafari()) {
            jobs.push(OPFSStorage.saveAll(this._cloneForPersist(snapshot)).catch((e) => {
                this._opfsMirrorAvailable = false;
                this._opfsFailed = true;
                this._opfsFailureReason = e && e.message ? e.message : String(e);
                console.warn('[Storage] OPFS mirror sync failed; canonical data remains in IndexedDB/localStorage:', e && e.message);
            }));
        }

        if (jobs.length) await Promise.all(jobs);
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
        this._opfsFailed = false;
        this._opfsFailureReason = null;

        try {
            if (!this._useOPFS) throw new Error('OPFS disabled by policy');
            if (storageIsFileProtocol()) {
                this._opfsFailed = true;
                this._opfsFailureReason = 'file:// mode uses IndexedDB/localStorage; OPFS is skipped.';
                console.info('[Storage] file:// mode: using IndexedDB/localStorage; OPFS skipped.');
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
            this._opfsFailed = true;
            this._opfsFailureReason = e && e.message ? e.message : String(e);
            console.info('[Storage] OPFS unavailable; IndexedDB/localStorage remain canonical:', e && e.message);
        }
    },

    async loadAll(options = {}) {
        const shouldSync = options.sync !== false;
        const shouldReadLegacy = options.includeLegacy !== false;
        const candidates = [];

        try {
            if (!storageIsFileProtocol() && (this._opfsReadableAvailable || (navigator.storage && navigator.storage.getDirectory))) {
                const data = await OPFSStorage.loadAll();
                if (this._isValidSnapshot(data)) candidates.push({ backend: 'opfs', data });
            }
        } catch (e) {
            console.warn('[Storage] OPFS recovery read failed:', e && e.message);
        }

        if (this._idbAvailable) {
            try {
                const data = await IDBStorage.loadAll({ fresh: true });
                this._idbFailed = false;
                this._idbFailureReason = null;
                this._idbAvailable = true;
                if (this._isValidSnapshot(data)) candidates.push({ backend: 'idb', data });
            } catch (e) {
                this._idbFailureReason = e && e.message ? e.message : String(e);
                console.warn('[Storage] IDB load failed; keeping IndexedDB retryable:', e && e.message);
            }
        }

        const lsData = this._readLocalSnapshot();
        if (lsData) candidates.push({ backend: 'localStorage', data: lsData });

        if (shouldReadLegacy && typeof readLegacyIndexedDB === 'function') {
            try {
                const legacy = await readLegacyIndexedDB();
                if (this._isValidSnapshot(legacy)) candidates.push({ backend: 'legacy-idb', data: legacy });
            } catch (_) {}
        }

        const picked = this._pickNewest(candidates);
        if (!picked) return null;

        this._lastLoadedBackend = picked.backend;
        this._lastUsedBackend = this.getBackend();
        console.log('[Storage] Loaded newest snapshot from', picked.backend, 'canonical backend=', this.getBackend());
        if (shouldSync) await this._syncSnapshotToAvailableBackends(picked.data, picked.backend);
        return picked.data;
    },

    _isDangerouslyEmptySnapshot(data) {
        const convs = Object.values((data && data.conversations) || {});
        const hasChars = Object.keys((data && data.characters) || {}).length > 0;
        const hasWorldBooks = Object.keys((data && data.worldBooks) || {}).length > 0;
        if (hasChars || hasWorldBooks) return false;
        if (convs.length === 0) return true;
        if (convs.length > 1) return false;
        const c = convs[0] || {};
        return (!Array.isArray(c.messages) || c.messages.length === 0) && !c.character && !c.title;
    },

    async _readNewestStoredSnapshotNoSync() {
        const candidates = [];
        try {
            if (!storageIsFileProtocol() && (this._opfsReadableAvailable || (navigator.storage && navigator.storage.getDirectory))) {
                const d = await OPFSStorage.loadAll();
                if (this._isValidSnapshot(d)) candidates.push({ backend: 'opfs', data: d });
            }
        } catch (_) {}
        try {
            if (this._idbAvailable) {
                const d = await IDBStorage.loadAll({ fresh: true });
                this._idbFailed = false;
                this._idbFailureReason = null;
                this._idbAvailable = true;
                if (this._isValidSnapshot(d)) candidates.push({ backend: 'idb', data: d });
            }
        } catch (_) {}
        const ls = this._readLocalSnapshot();
        if (ls) candidates.push({ backend: 'localStorage', data: ls });
        return this._pickNewest(candidates);
    },

    _saveLocalHistorySnapshot(data) {
        try {
            if (!this._isValidSnapshot(data)) return;
            const raw = JSON.stringify(data);
            const ts = this._snapshotTime(data) || Date.now();
            localStorage.setItem(STORAGE_BACKUP_PREFIX + ts, raw);
            const keys = Object.keys(localStorage)
                .filter(k => k.startsWith(STORAGE_BACKUP_PREFIX))
                .sort()
                .reverse();
            keys.slice(5).forEach(k => { try { localStorage.removeItem(k); } catch (_) {} });
        } catch (_) {}
    },

    async saveAll(data) {
        data = this._cloneForPersist(data);

        const previous = await this._readNewestStoredSnapshotNoSync().catch(() => null);
        if (previous && previous.data) this._saveLocalHistorySnapshot(previous.data);

        if (this._isDangerouslyEmptySnapshot(data) && previous && this._hasUserData(previous.data)) {
            console.warn('[Storage] Refusing to overwrite existing user data with an empty startup snapshot.');
            this._lastSaveSnapshot = previous.data;
            await this._syncSnapshotToAvailableBackends(previous.data, previous.backend || 'unknown').catch(() => {});
            return;
        }

        this._lastSaveSnapshot = data;
        let savedCanonical = false;
        let lastError = null;

        if (this._idbAvailable) {
            try {
                await IDBStorage.saveAll(data, { fresh: this._idbFailed });
                this._idbFailed = false;
                this._idbFailureReason = null;
                this._idbAvailable = true;
                this._primaryBackend = 'idb';
                this._lastUsedBackend = 'idb';
                savedCanonical = true;
            } catch (e) {
                lastError = e;
                this._idbFailed = true;
                this._idbFailureReason = e && e.message ? e.message : String(e);
                this._primaryBackend = 'idb';
                console.warn('[Storage] IndexedDB save failed after retry; localStorage emergency snapshot will still be written:', e && e.message);
            }
        }

        const lsOk = this._tryWriteLocalSnapshot(data);
        if (!savedCanonical && lsOk) {
            this._primaryBackend = 'localStorage';
            this._lastUsedBackend = 'localStorage';
            savedCanonical = true;
        }

        if (this._opfsMirrorAvailable && !this._isSafari()) {
            OPFSStorage.saveAll(this._cloneForPersist(data)).catch((e) => {
                this._opfsMirrorAvailable = false;
                this._opfsFailed = true;
                this._opfsFailureReason = e && e.message ? e.message : String(e);
                console.warn('[Storage] OPFS mirror write failed; canonical data remains safe:', e && e.message);
                setTimeout(() => { try { if (typeof updateStorageInfo === 'function') updateStorageInfo(); } catch(_) {} }, 60);
            });
        }

        setTimeout(() => { try { if (typeof updateStorageInfo === 'function') updateStorageInfo(); } catch(_) {} }, 60);

        if (savedCanonical) return;

        if (lastError && this._isQuotaError(lastError)) this._handleQuotaExceeded(lastError, data);
        const err = lastError || new Error('All canonical storage backends failed');
        console.error('[Storage] All canonical save backends failed:', err);
        throw err;
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
