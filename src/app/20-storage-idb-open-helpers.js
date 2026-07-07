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
