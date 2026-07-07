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
