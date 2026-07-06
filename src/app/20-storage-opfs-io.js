// ==================== OPFS Storage IO ====================
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

async function clearOPFSStorage(storage) {
    if (storage._isFileProtocol()) return;

    try {
        const root = await navigator.storage.getDirectory();
        try {
            await root.removeEntry(storage._fileName);
        } catch (removeErr) {
            if (removeErr && removeErr.name !== 'NotFoundError') {
                try {
                    const fh = await root.getFileHandle(storage._fileName, { create: true });
                    const w = await fh.createWritable();
                    await w.write(JSON.stringify({
                        lastSaved: Date.now(),
                        conversations: {},
                        characters: {},
                        worldBooks: {},
                        conversationOrder: [],
                        activeConvId: null,
                        settings: {}
                    }));
                    await w.close();
                } catch (_) {}
            }
        }
        storage._root = null;
    } catch (e) {}
}
