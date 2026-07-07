// ==================== IndexedDB Storage Operations ====================
async function loadAllIDBStorage(storage, options) {
    options = options || {};
    try {
        return await storage._withRetry((db) => new Promise((resolve, reject) => {
            let tx;
            try {
                tx = db.transaction(storage._storeName, 'readonly');
                const req = tx.objectStore(storage._storeName).get(storage._key);
                req.onsuccess = () => resolve(storage._normalize(req.result));
                req.onerror = () => reject(req.error || tx.error || new Error('IndexedDB read failed'));
                tx.onerror = () => reject(tx.error || new Error('IndexedDB read transaction failed'));
                tx.onabort = () => reject(tx.error || new Error('IndexedDB read transaction aborted'));
            } catch (e) {
                reject(e);
            }
        }), { fresh: !!options.fresh, retries: options.retries == null ? 1 : options.retries });
    } catch (e) {
        console.warn('[IDB] loadAll failed:', e && e.message);
        if (options.throwOnError) throw e;
        return null;
    }
}

async function saveAllIDBStorage(storage, data, options) {
    options = options || {};
    return await storage._withRetry((db) => new Promise((resolve, reject) => {
        try {
            const tx = db.transaction(storage._storeName, 'readwrite');
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error || new Error('IndexedDB save failed'));
            tx.onabort = () => reject(tx.error || new Error('IndexedDB save aborted'));
            tx.objectStore(storage._storeName).put({ data, lastSaved: data && data.lastSaved || Date.now() }, storage._key);
        } catch (e) {
            reject(e);
        }
    }), { fresh: !!options.fresh, retries: options.retries == null ? 1 : options.retries });
}

async function clearIDBStorage(storage) {
    try {
        await storage._withRetry((db) => new Promise((resolve, reject) => {
            try {
                const tx = db.transaction(storage._storeName, 'readwrite');
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error || new Error('IndexedDB clear failed'));
                tx.onabort = () => reject(tx.error || new Error('IndexedDB clear aborted'));
                tx.objectStore(storage._storeName).delete(storage._key);
            } catch (e) {
                reject(e);
            }
        }), { retries: 1 });
    } catch (e) {
        console.warn('[IDB] clear failed:', e && e.message);
    }
}
