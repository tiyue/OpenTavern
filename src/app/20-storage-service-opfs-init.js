// ==================== StorageService OPFS Initialization ====================
async function initStorageServiceOPFS(service) {
    try {
        const skipReason = getStorageServiceOPFSSkipReason(service);
        if (skipReason) {
            markStorageServiceOPFSSkipped(service, skipReason);
            return;
        }
        assertStorageServiceOPFSSupported();

        await OPFSStorage._getRoot();
        service._opfsReadableAvailable = true;

        if (service._isSafari()) {
            markStorageServiceOPFSSafariReadOnly(service);
            return;
        }

        const probe = await OPFSStorage.probeWritable();
        applyStorageServiceOPFSProbeResult(service, probe);
    } catch (e) {
        const msg = e && e.message ? e.message : String(e);
        if (isStorageServiceOPFSFileProtocolError(msg)) {
            markStorageServiceOPFSSkipped(service, 'file-protocol');
            return;
        }
        markStorageServiceOPFSFailed(service, msg);
        console.info('[Storage] OPFS unavailable; IndexedDB/localStorage remain canonical:', msg);
    }
}
