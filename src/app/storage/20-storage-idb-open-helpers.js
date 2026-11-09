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
// 固定内部期限：没有用户选项，只用于让挂起的打开/事务以明确失败收尾。
const IDB_STORAGE_OPEN_TIMEOUT_MS = 5000;
const IDB_STORAGE_TRANSACTION_TIMEOUT_MS = 5000;

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
    // 只清理自己这一个连接；迟到的旧连接事件不能销毁后来建立的健康连接。
    db.onversionchange = () => { if (storage._db === db) storage._resetConnection(); };
    db.onclose = () => { if (storage._db === db) storage._resetConnection(); };
    db.onerror = () => { /* transaction handlers report concrete errors */ };
    return db;
}

function createIDBStorageOpenPromise(storage) {
    let settled = false;
    let timer = null;
    let request = null;
    let rejectOpen = null;
    const attemptToken = Number(storage._dbOpenAttempt) || 0;

    const settleFailure = (error) => {
        if (settled) return;
        settled = true;
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
        if (rejectOpen) rejectOpen(error);
    };

    return new Promise((resolve, reject) => {
        rejectOpen = reject;
        timer = setTimeout(() => {
            timer = null;
            settleFailure(new Error('IndexedDB open timed out'));
        }, IDB_STORAGE_OPEN_TIMEOUT_MS);

        try {
            request = indexedDB.open(storage._dbName, 1);
        } catch (error) {
            settleFailure(error);
            return;
        }

        request.onupgradeneeded = (ev) => {
            ensureIDBStorageObjectStore(ev.target.result, storage._storeName);
        };
        request.onsuccess = (ev) => {
            const db = ev.target.result;
            if (settled) {
                // 超时后迟到的打开结果只关闭，不接入当前连接，也不影响较新的连接。
                try { db.close(); } catch (_) {}
                return;
            }
            settled = true;
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
            if (attemptToken !== (Number(storage._dbOpenAttempt) || 0)) {
                // 已被 fresh 重开或连接重置取代的旧请求不能覆盖新连接。
                try { db.close(); } catch (_) {}
                if (rejectOpen) rejectOpen(new Error('IndexedDB open superseded'));
                return;
            }
            resolve(attachIDBStorageConnectionHandlers(storage, db));
        };
        request.onerror = () => {
            settleFailure(request.error || new Error('IndexedDB open failed'));
        };
        request.onblocked = () => {
            settleFailure(new Error('IndexedDB open blocked'));
        };
    });
}
