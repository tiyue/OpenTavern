/**
 * 新手导读（文件：20-storage-idb-connection.js）
 *
 * 负责什么：这是“本地存储系统”中的“存储、IndexedDB 数据库、连接”部分。
 * 在程序中的位置：它在 OPFS、IndexedDB 和 localStorage 之间读写同一份应用快照。
 * 从哪里开始看：主要从 `resetIDBStorageConnection(storage)`、`openIDBStorage(storage, options)`、`delayIDBStorage(ms)`、`withRetryIDBStorage(storage, operation, options)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：这是用户数据安全相关代码；任何修改都要考虑写入失败、旧数据和回退路径。
 */
// ==================== IndexedDB Storage Connection Helpers ====================
function resetIDBStorageConnection(storage) {
    try { if (storage._db) storage._db.close(); } catch (_) {}
    storage._db = null;
    storage._dbPromise = null;
}

function openIDBStorage(storage, options) {
    options = options || {};
    const unsupportedError = getIDBStorageUnsupportedError();
    if (unsupportedError) return Promise.reject(unsupportedError);
    if (options.fresh) storage._resetConnection();
    if (storage._db) return Promise.resolve(storage._db);
    if (storage._dbPromise) return storage._dbPromise;

    storage._dbPromise = createIDBStorageOpenPromise(storage);
    return storage._dbPromise;
}

function delayIDBStorage(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function withRetryIDBStorage(storage, operation, options) {
    options = options || {};
    const retries = options.retries == null ? 1 : options.retries;
    let lastError = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const db = await storage._open({ fresh: options.fresh || attempt > 0 });
            return await operation(db);
        } catch (e) {
            lastError = e;
            storage._resetConnection();
            if (attempt < retries) await storage._delay(40);
        }
    }
    throw lastError || new Error('IndexedDB operation failed');
}
