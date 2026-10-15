/**
 * 新手导读（文件：20-storage-service-local-api.js）
 *
 * 负责什么：这是“本地存储系统”中的“存储、存储服务、本地、模型接口”部分。
 * 在程序中的位置：它在 OPFS、IndexedDB 和 localStorage 之间读写同一份应用快照。
 * 从哪里开始看：主要从 `createStorageServiceLocalSnapshotAPI(无参数)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：这是用户数据安全相关代码；任何修改都要考虑写入失败、旧数据和回退路径。
 */
// ==================== StorageService Local Snapshot API ====================
function createStorageServiceLocalSnapshotAPI() {
    return {
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
            const clearMarker = this._clearMarkerTime();
            const valid = candidates.filter(c => c && this._isValidSnapshot(c.data) && this._snapshotTime(c.data) >= clearMarker);
            const withUserData = valid.filter(c => this._hasUserData(c.data));
            return (withUserData.length ? withUserData : valid)
                .sort((a, b) => this._snapshotTime(b.data) - this._snapshotTime(a.data))[0] || null;
        }
    };
}
