// ==================== IndexedDB Storage Connection Helpers ====================
function resetIDBStorageConnection(storage) {
    try { if (storage._db) storage._db.close(); } catch (_) {}
    storage._db = null;
    storage._dbPromise = null;
}

function openIDBStorage(storage, options) {
    options = options || {};
    if (!('indexedDB' in window)) return Promise.reject(new Error('IndexedDB not supported'));
    if (options.fresh) storage._resetConnection();
    if (storage._db) return Promise.resolve(storage._db);
    if (storage._dbPromise) return storage._dbPromise;

    storage._dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(storage._dbName, 1);
        req.onupgradeneeded = (ev) => {
            const db = ev.target.result;
            if (!db.objectStoreNames.contains(storage._storeName)) {
                db.createObjectStore(storage._storeName);
            }
        };
        req.onsuccess = (ev) => {
            const db = ev.target.result;
            storage._db = db;
            db.onversionchange = () => storage._resetConnection();
            db.onclose = () => storage._resetConnection();
            db.onerror = () => { /* transaction handlers report concrete errors */ };
            resolve(db);
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
