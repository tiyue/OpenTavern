// ==================== OPFS Storage Clear ====================
function createEmptyOPFSSnapshot() {
    return {
        lastSaved: Date.now(),
        conversations: {},
        characters: {},
        worldBooks: {},
        conversationOrder: [],
        activeConvId: null,
        settings: {}
    };
}

async function resetOPFSStorageFile(root, fileName) {
    try {
        const fh = await root.getFileHandle(fileName, { create: true });
        const w = await fh.createWritable();
        await w.write(JSON.stringify(createEmptyOPFSSnapshot()));
        await w.close();
    } catch (_) {}
}

async function clearOPFSStorage(storage) {
    if (storage._isFileProtocol()) return;

    try {
        const root = await navigator.storage.getDirectory();
        try {
            await root.removeEntry(storage._fileName);
        } catch (removeErr) {
            if (removeErr && removeErr.name !== 'NotFoundError') {
                await resetOPFSStorageFile(root, storage._fileName);
            }
        }
        storage._root = null;
    } catch (e) {}
}
