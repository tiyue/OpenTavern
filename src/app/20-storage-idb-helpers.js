// ==================== IndexedDB Storage Helpers ====================
function normalizeIDBStorageData(data) {
    const value = data && data.data ? data.data : data;
    if (value && !value.lastSaved) value.lastSaved = Date.now();
    return value || null;
}

async function getIDBStorageInfo(storage) {
    try {
        const data = await storage.loadAll({ fresh: true });
        return { backend: 'idb', used: data ? new Blob([JSON.stringify(data)]).size : 0 };
    } catch (_) {
        return { backend: 'idb', used: 0 };
    }
}

function runIDBStorageTransaction(db, storage, mode, action, messages) {
    messages = messages || {};
    return new Promise((resolve, reject) => {
        let tx;
        try {
            tx = db.transaction(storage._storeName, mode);
            tx.onerror = () => reject(tx.error || new Error(messages.error || 'IndexedDB transaction failed'));
            tx.onabort = () => reject(tx.error || new Error(messages.abort || 'IndexedDB transaction aborted'));
            action(tx, resolve, reject);
        } catch (e) {
            reject(e);
        }
    });
}
