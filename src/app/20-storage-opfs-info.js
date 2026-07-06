// ==================== OPFS Storage Info ====================
async function getOPFSStorageInfo(storage) {
    if (storage._isFileProtocol()) {
        return {
            backend: 'opfs',
            used: 0,
            quota: null,
            fileProtocol: true,
            opfsAvailable: false,
            opfsSkipped: true,
            opfsSkippedReason: 'file-protocol'
        };
    }

    try {
        const est = (navigator.storage && navigator.storage.estimate) ? await navigator.storage.estimate() : { usage: 0, quota: null };
        let ourSize = 0;
        try {
            const root = await storage._getRoot();
            const fh = await root.getFileHandle(storage._fileName);
            const f = await fh.getFile();
            ourSize = f.size || 0;
        } catch (_) {}
        return {
            backend: 'opfs',
            used: ourSize,
            quota: est.quota,
            originUsed: est.usage
        };
    } catch (e) {}
    return { backend: 'opfs', used: 0, quota: null };
}
