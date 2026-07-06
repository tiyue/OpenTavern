// ==================== IndexedDB Snapshot Storage (Safari-safe reconnectable backend) ====================
const IDBStorage = {
    _dbName: 'OpenTavernSnapshotDB',
    _storeName: 'snapshots',
    _key: 'main',
    _dbPromise: null,
    _db: null,

    _resetConnection() {
        return resetIDBStorageConnection(this);
    },

    _open(options = {}) {
        return openIDBStorage(this, options);
    },

    _normalize(data) {
        return normalizeIDBStorageData(data);
    },

    _delay(ms) {
        return delayIDBStorage(ms);
    },

    async _withRetry(operation, options = {}) {
        return withRetryIDBStorage(this, operation, options);
    },

    async loadAll(options = {}) {
        return loadAllIDBStorage(this, options);
    },

    async saveAll(data, options = {}) {
        return saveAllIDBStorage(this, data, options);
    },

    async clear() {
        return clearIDBStorage(this);
    },

    async getStorageInfo() {
        return getIDBStorageInfo(this);
    }
};
