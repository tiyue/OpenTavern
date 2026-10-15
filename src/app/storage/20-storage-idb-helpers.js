/**
 * 新手导读（文件：20-storage-idb-helpers.js）
 *
 * 负责什么：这是“本地存储系统”中的“存储、IndexedDB 数据库、辅助函数”部分。
 * 在程序中的位置：它在 OPFS、IndexedDB 和 localStorage 之间读写同一份应用快照。
 * 从哪里开始看：主要从 `normalizeIDBStorageData(data)`、`getIDBStorageInfo(storage)`、`runIDBStorageTransaction(db, storage, mode, action, messages)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：这是用户数据安全相关代码；任何修改都要考虑写入失败、旧数据和回退路径。
 */
// ==================== IndexedDB Storage Helpers ====================
function normalizeIDBStorageData(data) {
    const value = data && data.data ? data.data : data;
    if (value && !value.lastSaved) value.lastSaved = Date.now();
    return value || null;
}

async function getIDBStorageInfo(storage) {
    try {
        const data = await storage.loadAll({ fresh: true });
        return { backend: 'idb', used: data ? new Blob([JSON.stringify(data)]).size : 0 };
    } catch (_) {
        return { backend: 'idb', used: 0 };
    }
}

function runIDBStorageTransaction(db, storage, mode, action, messages) {
    messages = messages || {};
    return new Promise((resolve, reject) => {
        let tx;
        try {
            tx = db.transaction(storage._storeName, mode);
            tx.onerror = () => reject(tx.error || new Error(messages.error || 'IndexedDB transaction failed'));
            tx.onabort = () => reject(tx.error || new Error(messages.abort || 'IndexedDB transaction aborted'));
            action(tx, resolve, reject);
        } catch (e) {
            reject(e);
        }
    });
}
