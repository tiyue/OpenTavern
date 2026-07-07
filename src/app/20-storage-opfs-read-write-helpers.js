// ==================== OPFS Storage Read/Write Helpers ====================
async function readOPFSStorageText(storage) {
    const root = await storage._getRoot();
    let fileHandle;
    try {
        fileHandle = await root.getFileHandle(storage._fileName);
    } catch (e) {
        return null;
    }
    const file = await fileHandle.getFile();
    return await file.text();
}

function parseOPFSStorageData(text) {
    if (!text) return null;
    const data = JSON.parse(text);
    if (!data.lastSaved) data.lastSaved = Date.now();
    return data;
}

function queueOPFSStorageWrite(storage, writeOperation) {
    const prev = storage._writeLock || Promise.resolve();
    storage._writeLock = prev.then(writeOperation, writeOperation);
    return storage._writeLock;
}

async function writeOPFSStorageData(storage, data) {
    const root = await storage._getRoot();
    const fileHandle = await root.getFileHandle(storage._fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(data));
    await writable.close();
}

function handleOPFSStorageIOError(storage, e, operationName) {
    if (isKnownOPFSUnsupportedError(e)) {
        warnOPFSUnsupportedOnce(storage);
    } else {
        console.error(`[OPFS] ${operationName} failed:`, e);
    }
}
