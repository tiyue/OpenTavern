// ==================== StorageService Info Readers ====================
async function readStorageServiceWebLLMUsage() {
    try {
        if (typeof getWebLLMUsedSize === 'function') return await getWebLLMUsedSize();
    } catch (_) {}
    return 0;
}

async function readStorageServiceAppUsage(service) {
    try {
        let current = service._lastSaveSnapshot || null;
        if (!service._isValidSnapshot(current)) {
            const picked = await service._readNewestStoredSnapshotNoSync();
            current = picked && picked.data;
        }
        return current ? (new Blob([JSON.stringify(current)]).size || 0) : 0;
    } catch (_) {}
    return 0;
}

async function readStorageServiceBrowserQuota() {
    let quota = null;
    let originUsed = 0;
    let persisted = null;

    try {
        if (navigator.storage && navigator.storage.estimate) {
            const est = await navigator.storage.estimate();
            quota = est.quota || null;
            originUsed = est.usage || 0;
        }
        if (navigator.storage && navigator.storage.persisted) {
            persisted = await navigator.storage.persisted();
        }
    } catch (_) {}

    return { quota, originUsed, persisted };
}
