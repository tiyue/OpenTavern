// ==================== IndexedDB Snapshot Storage (Safari-safe reconnectable backend) ====================
const IDBStorage = {
    _dbName: 'OpenTavernSnapshotDB',
    _storeName: 'snapshots',
    _key: 'main',
    _dbPromise: null,
    _db: null,

    _resetConnection() {
        try { if (this._db) this._db.close(); } catch (_) {}
        this._db = null;
        this._dbPromise = null;
    },

    _open(options = {}) {
        if (!('indexedDB' in window)) return Promise.reject(new Error('IndexedDB not supported'));
        if (options.fresh) this._resetConnection();
        if (this._db) return Promise.resolve(this._db);
        if (this._dbPromise) return this._dbPromise;

        this._dbPromise = new Promise((resolve, reject) => {
            const req = indexedDB.open(this._dbName, 1);
            req.onupgradeneeded = (ev) => {
                const db = ev.target.result;
                if (!db.objectStoreNames.contains(this._storeName)) {
                    db.createObjectStore(this._storeName);
                }
            };
            req.onsuccess = (ev) => {
                const db = ev.target.result;
                this._db = db;
                db.onversionchange = () => this._resetConnection();
                db.onclose = () => this._resetConnection();
                db.onerror = () => { /* transaction handlers report concrete errors */ };
                resolve(db);
            };
            req.onerror = () => {
                this._resetConnection();
                reject(req.error || new Error('IndexedDB open failed'));
            };
            req.onblocked = () => {
                this._resetConnection();
                reject(new Error('IndexedDB open blocked'));
            };
        }).catch((err) => {
            this._resetConnection();
            throw err;
        });
        return this._dbPromise;
    },

    _normalize(data) {
        const value = data && data.data ? data.data : data;
        if (value && !value.lastSaved) value.lastSaved = Date.now();
        return value || null;
    },

    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    async _withRetry(operation, options = {}) {
        const retries = options.retries == null ? 1 : options.retries;
        let lastError = null;
        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                const db = await this._open({ fresh: options.fresh || attempt > 0 });
                return await operation(db);
            } catch (e) {
                lastError = e;
                this._resetConnection();
                if (attempt < retries) await this._delay(40);
            }
        }
        throw lastError || new Error('IndexedDB operation failed');
    },

    async loadAll(options = {}) {
        try {
            return await this._withRetry((db) => new Promise((resolve, reject) => {
                let tx;
                try {
                    tx = db.transaction(this._storeName, 'readonly');
                    const req = tx.objectStore(this._storeName).get(this._key);
                    req.onsuccess = () => resolve(this._normalize(req.result));
                    req.onerror = () => reject(req.error || tx.error || new Error('IndexedDB read failed'));
                    tx.onerror = () => reject(tx.error || new Error('IndexedDB read transaction failed'));
                    tx.onabort = () => reject(tx.error || new Error('IndexedDB read transaction aborted'));
                } catch (e) {
                    reject(e);
                }
            }), { fresh: !!options.fresh, retries: options.retries == null ? 1 : options.retries });
        } catch (e) {
            console.warn('[IDB] loadAll failed:', e && e.message);
            if (options.throwOnError) throw e;
            return null;
        }
    },

    async saveAll(data, options = {}) {
        return await this._withRetry((db) => new Promise((resolve, reject) => {
            try {
                const tx = db.transaction(this._storeName, 'readwrite');
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error || new Error('IndexedDB save failed'));
                tx.onabort = () => reject(tx.error || new Error('IndexedDB save aborted'));
                tx.objectStore(this._storeName).put({ data, lastSaved: data && data.lastSaved || Date.now() }, this._key);
            } catch (e) {
                reject(e);
            }
        }), { fresh: !!options.fresh, retries: options.retries == null ? 1 : options.retries });
    },

    async clear() {
        try {
            await this._withRetry((db) => new Promise((resolve, reject) => {
                try {
                    const tx = db.transaction(this._storeName, 'readwrite');
                    tx.oncomplete = () => resolve();
                    tx.onerror = () => reject(tx.error || new Error('IndexedDB clear failed'));
                    tx.onabort = () => reject(tx.error || new Error('IndexedDB clear aborted'));
                    tx.objectStore(this._storeName).delete(this._key);
                } catch (e) {
                    reject(e);
                }
            }), { retries: 1 });
        } catch (e) {
            console.warn('[IDB] clear failed:', e && e.message);
        }
    },

    async getStorageInfo() {
        try {
            const data = await this.loadAll({ fresh: true });
            return { backend: 'idb', used: data ? new Blob([JSON.stringify(data)]).size : 0 };
        } catch (_) {
            return { backend: 'idb', used: 0 };
        }
    }
};
