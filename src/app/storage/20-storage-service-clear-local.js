/**
 * 新手导读（文件：20-storage-service-clear-local.js）
 *
 * 负责什么：这是“本地存储系统”中的“存储、存储服务、清理、本地”部分。
 * 在程序中的位置：它在 OPFS、IndexedDB 和 localStorage 之间读写同一份应用快照。
 * 从哪里开始看：主要从 `isStorageServiceLocalClearKey(key)`、`removeStorageServiceLocalClearKeys(无参数)`、`writeStorageServiceLocalEmptySnapshot(emptyData)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：这是用户数据安全相关代码；任何修改都要考虑写入失败、旧数据和回退路径。
 */
// ==================== StorageService Local Clear Helpers ====================
function isStorageServiceLocalClearKey(key) {
    return key === STORAGE_KEY || key === STORAGE_CLEAR_KEY || key === 'opentavern-last-backup' || String(key).startsWith('opentavern');
}

function removeStorageServiceLocalClearKeys() {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem('opentavern-last-backup');
    Object.keys(localStorage).forEach(function(key) {
        if (isStorageServiceLocalClearKey(key)) localStorage.removeItem(key);
    });
}

function writeStorageServiceLocalEmptySnapshot(emptyData) {
    localStorage.setItem(STORAGE_CLEAR_KEY, String(emptyData.lastSaved));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(emptyData));
}
