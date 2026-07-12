/**
 * 新手导读（文件：23-storage-legacy-idb-requests.js）
 *
 * 负责什么：这是“旧存储恢复”中的“存储、旧版兼容、IndexedDB 数据库、请求”部分。
 * 在程序中的位置：它扫描旧版数据库和备份候选，帮助用户找回历史数据。
 * 从哪里开始看：主要从 `legacyIDBHasStore(storeNames, storeName)`、`closeLegacyIndexedDB(db)`、`getLegacyIDBStoreValue(tx, storeNames, storeName, key)`、`getAllLegacyIDBStoreValues(tx, storeNames, storeName)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：恢复前应先预览候选，不能在尚未确认时删除现有数据。
 */
// ==================== Legacy IndexedDB Request Helpers ====================
function legacyIDBHasStore(storeNames, storeName) {
    return !!(storeNames && storeNames.contains && storeNames.contains(storeName));
}

function closeLegacyIndexedDB(db) {
    try { db.close(); } catch (_) {}
}

function getLegacyIDBStoreValue(tx, storeNames, storeName, key) {
    return new Promise(function(resolve) {
        try {
            if (!legacyIDBHasStore(storeNames, storeName)) {
                resolve(null);
                return;
            }
            const request = tx.objectStore(storeName).get(key);
            request.onsuccess = function() { resolve(request.result); };
            request.onerror = function() { resolve(null); };
        } catch (_) {
            resolve(null);
        }
    });
}

function getAllLegacyIDBStoreValues(tx, storeNames, storeName) {
    return new Promise(function(resolve) {
        try {
            if (!legacyIDBHasStore(storeNames, storeName)) {
                resolve([]);
                return;
            }
            const request = tx.objectStore(storeName).getAll();
            request.onsuccess = function() { resolve(request.result || []); };
            request.onerror = function() { resolve([]); };
        } catch (_) {
            resolve([]);
        }
    });
}
