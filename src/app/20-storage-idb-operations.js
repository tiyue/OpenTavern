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
