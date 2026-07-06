// ==================== StorageService Info Helpers ====================
async function getStorageServiceInfo(service) {
    try {
        const webllmUsed = await readStorageServiceWebLLMUsage();
        const appUsed = await readStorageServiceAppUsage(service);
        const browserInfo = await readStorageServiceBrowserQuota();

        return {
            backend: service.getBackend(),
            used: appUsed,
            webllmUsed,
            totalUsed: appUsed + webllmUsed,
            originUsed: browserInfo.originUsed,
            quota: browserInfo.quota,
            persisted: browserInfo.persisted,
            fileProtocol: storageIsFileProtocol(),
            idbAvailable: service._idbAvailable || ('indexedDB' in window),
            idbLastError: service._idbFailureReason,
            opfsAvailable: service._opfsReadableAvailable,
            opfsMirrorAvailable: service._opfsMirrorAvailable,
            opfsSkipped: service._opfsSkipped,
            opfsSkippedReason: service._opfsSkippedReason,
            opfsFailureReason: service._opfsFailureReason,
            safariOpfsReadOnly: service._isSafari() && service._opfsReadableAvailable
        };
    } catch (e) {}
    return getStorageServiceFallbackInfo(service);
}

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

function getStorageServiceFallbackInfo(service) {
    const isFileMode = storageIsFileProtocol();
    return {
        backend: service.getBackend(),
        used: 0,
        webllmUsed: 0,
        totalUsed: 0,
        originUsed: 0,
        quota: null,
        persisted: null,
        fileProtocol: isFileMode,
        idbAvailable: service._idbAvailable || (typeof window !== 'undefined' && 'indexedDB' in window),
        idbLastError: service._idbFailureReason,
        opfsAvailable: false,
        opfsMirrorAvailable: false,
        opfsSkipped: isFileMode || service._opfsSkipped,
        opfsSkippedReason: isFileMode ? 'file-protocol' : service._opfsSkippedReason,
        opfsFailureReason: isFileMode ? null : service._opfsFailureReason,
        safariOpfsReadOnly: false
    };
}
