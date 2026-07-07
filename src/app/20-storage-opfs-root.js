// ==================== OPFS Root Access ====================
async function getOPFSStorageRoot(storage) {
    if (storage._root) return storage._root;

    if (opfsStorageIsFileProtocol()) {
        throw new Error('OPFS blocked on file:// protocol (open via http://localhost or deploy to HTTPS)');
    }
    if (!window.isSecureContext) {
        throw new Error('OPFS requires secure context (HTTPS or localhost)');
    }
    if (!navigator.storage || !navigator.storage.getDirectory) {
        throw new Error('OPFS not supported in this browser');
    }

    storage._root = await navigator.storage.getDirectory();
    return storage._root;
}
