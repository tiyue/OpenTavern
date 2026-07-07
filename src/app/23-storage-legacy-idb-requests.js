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
