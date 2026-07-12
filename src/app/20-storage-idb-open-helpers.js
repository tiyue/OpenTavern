/**
 * 新手导读（文件：20-storage-idb-open-helpers.js）
 *
 * 负责什么：这是“本地存储系统”中的“存储、IndexedDB 数据库、打开、辅助函数”部分。
 * 在程序中的位置：它在 OPFS、IndexedDB 和 localStorage 之间读写同一份应用快照。
 * 从哪里开始看：主要从 `getIDBStorageUnsupportedError(无参数)`、`ensureIDBStorageObjectStore(db, storeName)`、`attachIDBStorageConnectionHandlers(storage, db)`、`createIDBStorageOpenPromise(storage)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：这是用户数据安全相关代码；任何修改都要考虑写入失败、旧数据和回退路径。
 */
// ==================== IndexedDB Storage Open Helpers ====================
function getIDBStorageUnsupportedError() {
    if (typeof window === 'undefined' || !('indexedDB' in window)) return new Error('IndexedDB not supported');
    return null;
}

function ensureIDBStorageObjectStore(db, storeName) {
    if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName);
    }
}

function attachIDBStorageConnectionHandlers(storage, db) {
    storage._db = db;
    db.onversionchange = () => storage._resetConnection();
    db.onclose = () => storage._resetConnection();
    db.onerror = () => { /* transaction handlers report concrete errors */ };
    return db;
}

function createIDBStorageOpenPromise(storage) {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(storage._dbName, 1);
        req.onupgradeneeded = (ev) => {
            ensureIDBStorageObjectStore(ev.target.result, storage._storeName);
        };
        req.onsuccess = (ev) => {
            resolve(attachIDBStorageConnectionHandlers(storage, ev.target.result));
        };
        req.onerror = () => {
            storage._resetConnection();
            reject(req.error || new Error('IndexedDB open failed'));
        };
        req.onblocked = () => {
            storage._resetConnection();
            reject(new Error('IndexedDB open blocked'));
        };
    }).catch((err) => {
        storage._resetConnection();
        throw err;
    });
}
