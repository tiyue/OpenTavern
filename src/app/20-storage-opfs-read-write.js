// ==================== OPFS Storage Read/Write ====================
async function loadAllOPFSStorage(storage) {
    if (storage._isFileProtocol()) return null;

    try {
        return parseOPFSStorageData(await readOPFSStorageText(storage));
    } catch (e) {
        handleOPFSStorageIOError(storage, e, 'loadAll');
        return null;
    }
}

async function saveAllOPFSStorage(storage, data) {
    if (storage._isFileProtocol()) return;

    return queueOPFSStorageWrite(storage, () => storage._doSaveAll(data));
}

async function doSaveAllOPFSStorage(storage, data) {
    try {
        await writeOPFSStorageData(storage, data);
    } catch (e) {
        handleOPFSStorageIOError(storage, e, 'saveAll');
        throw e;
    }
}
