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
        if (!e) return false;
        const msg = (e.message || '').toLowerCase();
        return e.name === 'QuotaExceededError' ||
               e.code === 22 ||
               msg.includes('quota') ||
               msg.includes('exceeded');
    },

    _isSafari() {
        if (this._isSafariBrowser !== null) return this._isSafariBrowser;
        try {
            const ua = navigator.userAgent || '';
            const vendor = navigator.vendor || '';
            const isAppleWebKit = /AppleWebKit/i.test(ua);
            const isChromium = /CriOS|Chrome|Chromium|Edg|OPR|Firefox|FxiOS/i.test(ua);
            this._isSafariBrowser = /Safari/i.test(ua) && /Apple/i.test(vendor) && isAppleWebKit && !isChromium;
        } catch (_) {
            this._isSafariBrowser = false;
        }
        return this._isSafariBrowser;
    },

    _hasUserData(data) {
        return !!(data && (
            Object.keys(data.conversations || {}).length > 0 ||
            Object.keys(data.characters || {}).length > 0 ||
            Object.keys(data.worldBooks || {}).length > 0
        ));
    },

    _isValidSnapshot(data) {
        return !!(data && (
            this._hasUserData(data) ||
            (data.settings && Object.keys(data.settings || {}).length > 0)
        ));
    },

    _snapshotTime(data) {
        const n = data && data.lastSaved ? Number(data.lastSaved) : 0;
        return Number.isFinite(n) ? n : 0;
    },

    _cloneForPersist(data) {
        return data ? JSON.parse(JSON.stringify(data)) : data;
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
            if (typeof location !== 'undefined' && location.protocol === 'file:') throw new Error('file-protocol');
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
            console.warn('[Storage] OPFS unavailable; IndexedDB/localStorage remain canonical:', e && e.message);
        }
    },

    async loadAll(options = {}) {
        const shouldSync = options.sync !== false;
        const shouldReadLegacy = options.includeLegacy !== false;
        const candidates = [];

        try {
            if (this._opfsReadableAvailable || (navigator.storage && navigator.storage.getDirectory)) {
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
            if (this._opfsReadableAvailable || (navigator.storage && navigator.storage.getDirectory)) {
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
        const now = Date.now();
        if (this._lastQuotaAlert && now - this._lastQuotaAlert < 60000) return;
        this._lastQuotaAlert = now;

        try {
            const ts = new Date().toISOString().replace(/[:.]/g, '-');
            const backupName = `opentavern-backup-quota-${ts}.json`;
            const toExport = dataSnapshot || {
                settings: state ? getSafeSettingsForPersist() : {},
                conversations: state ? state.conversations : {},
                conversationOrder: state ? state.conversationOrder : [],
                activeConvId: state ? state.activeConvId : null,
                worldBooks: state ? (state.worldBooks || {}) : {},
                characters: state ? (state.characters || {}) : {},
                lastSaved: Date.now()
            };
            if (typeof downloadJsonFile === 'function') {
                downloadJsonFile(toExport, backupName);
            } else {
                const blob = new Blob([JSON.stringify(toExport, null, 2)], {type:'application/json'});
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = backupName;
                document.body.appendChild(a); a.click(); a.remove();
            }
        } catch (exportErr) {
            console.error('[Storage] Auto backup export on quota fail failed:', exportErr);
        }
        try { alert('存储空间不足，已尝试导出当前数据备份。请保存备份文件后清理浏览器存储空间。'); } catch(_) {}
    },

    getBackend() {
        if (this._idbAvailable || ('indexedDB' in window)) return 'idb';
        return 'localStorage';
    },

    async getStorageInfo() {
        try {
            let webllmUsed = 0;
            try {
                if (typeof getWebLLMUsedSize === 'function') webllmUsed = await getWebLLMUsedSize();
            } catch (_) {}

            let appUsed = 0;
            try {
                let current = this._lastSaveSnapshot || null;
                if (!this._isValidSnapshot(current)) {
                    const picked = await this._readNewestStoredSnapshotNoSync();
                    current = picked && picked.data;
                }
                if (current) appUsed = new Blob([JSON.stringify(current)]).size || 0;
            } catch (_) {}

            let quota = null;
            let originUsed = 0;
            let persisted = null;
            try {
                if (navigator.storage && navigator.storage.estimate) {
                    const est = await navigator.storage.estimate();
                    quota = est.quota || null;
                    originUsed = est.usage || 0;
                }
                if (navigator.storage && navigator.storage.persisted) {
                    persisted = await navigator.storage.persisted();
                }
            } catch (_) {}

            return {
                backend: this.getBackend(),
                used: appUsed,
                webllmUsed,
                totalUsed: appUsed + webllmUsed,
                originUsed,
                quota,
                persisted,
                idbAvailable: this._idbAvailable || ('indexedDB' in window),
                idbLastError: this._idbFailureReason,
                opfsAvailable: this._opfsReadableAvailable,
                opfsMirrorAvailable: this._opfsMirrorAvailable,
                opfsFailureReason: this._opfsFailureReason,
                safariOpfsReadOnly: this._isSafari() && this._opfsReadableAvailable
            };
        } catch (e) {}
        return { backend: this.getBackend(), used: 0, webllmUsed: 0, totalUsed: 0, originUsed: 0, quota: null, persisted: null };
    },

    async clearAllData() {
        let cleared = { opfs: false, idb: false, ls: false };
        const emptyData = {
            lastSaved: Date.now(),
            conversations: {},
            conversationOrder: [],
            activeConvId: null,
            worldBooks: {},
            characters: {},
            settings: {},
            charactersMigrated: true
        };

        try {
            if (typeof OPFSStorage !== 'undefined' && typeof OPFSStorage.saveAll === 'function' && this._opfsMirrorAvailable && !this._isSafari()) {
                await OPFSStorage.saveAll(emptyData).catch(() => {});
            }
            if (typeof OPFSStorage !== 'undefined' && typeof OPFSStorage.clear === 'function') {
                try { await OPFSStorage.clear(); } catch (_) {}
            }
            cleared.opfs = true;
        } catch (e) { console.warn('[Storage] OPFS clear/reset error:', e); }

        try {
            if (typeof IDBStorage !== 'undefined' && typeof IDBStorage.clear === 'function') {
                await IDBStorage.clear();
                cleared.idb = true;
            }
        } catch (e) { console.warn('[Storage] IDB clear/reset error:', e); }

        try {
            localStorage.removeItem(STORAGE_KEY);
            localStorage.removeItem('opentavern-last-backup');
            Object.keys(localStorage).forEach(k => {
                if (k.startsWith('opentavern')) localStorage.removeItem(k);
            });
            try {
                localStorage.setItem(STORAGE_CLEAR_KEY, String(emptyData.lastSaved));
                localStorage.setItem(STORAGE_KEY, JSON.stringify(emptyData));
            } catch (_) {}
            cleared.ls = true;
        } catch (e) {}

        try {
            if ('indexedDB' in window) {
                await new Promise((resolve) => {
                    const req = indexedDB.deleteDatabase('OpenTavernDB');
                    req.onsuccess = req.onerror = req.onblocked = () => resolve();
                });
                cleared.legacyIdb = true;
            }
        } catch (e) { console.warn('[Storage] legacy IDB clear error:', e); }

        try {
            if (typeof clearWebLLMCache === 'function') {
                await clearWebLLMCache({ silent: true });
                cleared.webllm = true;
            }
        } catch (e) {}

        console.log('[Storage] clearAllData result:', cleared);
        if (typeof updateStorageInfo === 'function') setTimeout(() => updateStorageInfo(), 80);
        return cleared;
    }
};
