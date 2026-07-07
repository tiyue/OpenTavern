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
