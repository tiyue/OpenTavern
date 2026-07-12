/**
 * 新手导读（文件：20-storage-service-operations-api.js）
 *
 * 负责什么：这是“本地存储系统”中的“存储、存储服务、操作、模型接口”部分。
 * 在程序中的位置：它在 OPFS、IndexedDB 和 localStorage 之间读写同一份应用快照。
 * 从哪里开始看：主要从 `createStorageServiceOperationsAPI(无参数)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：这是用户数据安全相关代码；任何修改都要考虑写入失败、旧数据和回退路径。
 */
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
