// ==================== StorageService Info ====================
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
