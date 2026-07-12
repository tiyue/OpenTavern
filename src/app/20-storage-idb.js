/**
 * 新手导读（文件：20-storage-idb.js）
 *
 * 负责什么：这是“本地存储系统”中的“存储、IndexedDB 数据库”部分。
 * 在程序中的位置：它在 OPFS、IndexedDB 和 localStorage 之间读写同一份应用快照。
 * 从哪里开始看：本文件主要保存常量、配置或立即执行代码，没有独立的命名函数。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：这是用户数据安全相关代码；任何修改都要考虑写入失败、旧数据和回退路径。
 */
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
