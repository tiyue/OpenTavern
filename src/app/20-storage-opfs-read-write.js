// ==================== OPFS Storage Read/Write ====================
async function loadAllOPFSStorage(storage) {
    if (storage._isFileProtocol()) return null;

    try {
        const root = await storage._getRoot();
        let fileHandle;
        try {
            fileHandle = await root.getFileHandle(storage._fileName);
        } catch (e) {
            return null;
        }
        const file = await fileHandle.getFile();
        const text = await file.text();
        if (!text) return null;
        const data = JSON.parse(text);
        if (!data.lastSaved) data.lastSaved = Date.now();
        return data;
    } catch (e) {
        if (isKnownOPFSUnsupportedError(e)) {
            warnOPFSUnsupportedOnce(storage);
        } else {
            console.error('[OPFS] loadAll failed:', e);
        }
        return null;
    }
}

async function saveAllOPFSStorage(storage, data) {
    if (storage._isFileProtocol()) return;

    const doWrite = () => storage._doSaveAll(data);
    const prev = storage._writeLock || Promise.resolve();
    storage._writeLock = prev.then(doWrite, doWrite);
    return storage._writeLock;
}

async function doSaveAllOPFSStorage(storage, data) {
    try {
        const root = await storage._getRoot();
        const fileHandle = await root.getFileHandle(storage._fileName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(JSON.stringify(data));
        await writable.close();
    } catch (e) {
        if (isKnownOPFSUnsupportedError(e)) {
            warnOPFSUnsupportedOnce(storage);
        } else {
            console.error('[OPFS] saveAll failed:', e);
        }
        throw e;
    }
}
