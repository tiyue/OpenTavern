/**
 * 新手导读（文件：20-storage-idb-operations.js）
 *
 * 负责什么：这是“本地存储系统”中的“存储、IndexedDB 数据库、操作”部分。
 * 在程序中的位置：它在 OPFS、IndexedDB 和 localStorage 之间读写同一份应用快照。
 * 从哪里开始看：主要从 `loadAllIDBStorage(storage, options)`、`saveAllIDBStorage(storage, data, options)`、`clearIDBStorage(storage)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：这是用户数据安全相关代码；任何修改都要考虑写入失败、旧数据和回退路径。
 */
// ==================== IndexedDB Storage Operations ====================
async function loadAllIDBStorage(storage, options) {
    options = options || {};
    try {
        return await storage._withRetry((db) => runIDBStorageTransaction(db, storage, 'readonly', function(tx, resolve, reject) {
            const req = tx.objectStore(storage._storeName).get(storage._key);
            req.onsuccess = () => resolve(storage._normalize(req.result));
            req.onerror = () => reject(req.error || tx.error || new Error('IndexedDB read failed'));
        }, {
            error: 'IndexedDB read transaction failed',
            abort: 'IndexedDB read transaction aborted'
        }), { fresh: !!options.fresh, retries: options.retries == null ? 1 : options.retries });
    } catch (e) {
        console.warn('[IDB] loadAll failed:', e && e.message);
        if (options.throwOnError) throw e;
        return null;
    }
}

async function saveAllIDBStorage(storage, data, options) {
    options = options || {};
    return await storage._withRetry((db) => runIDBStorageTransaction(db, storage, 'readwrite', function(tx, resolve) {
        tx.oncomplete = () => resolve();
        tx.objectStore(storage._storeName).put({ data, lastSaved: data && data.lastSaved || Date.now() }, storage._key);
    }, {
        error: 'IndexedDB save failed',
        abort: 'IndexedDB save aborted'
    }), { fresh: !!options.fresh, retries: options.retries == null ? 1 : options.retries });
}

async function clearIDBStorage(storage) {
    try {
        await storage._withRetry((db) => runIDBStorageTransaction(db, storage, 'readwrite', function(tx, resolve) {
            tx.oncomplete = () => resolve();
            tx.objectStore(storage._storeName).delete(storage._key);
        }, {
            error: 'IndexedDB clear failed',
            abort: 'IndexedDB clear aborted'
        }), { retries: 1 });
    } catch (e) {
        console.warn('[IDB] clear failed:', e && e.message);
    }
}
