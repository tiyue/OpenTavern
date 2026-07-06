// ==================== OPFS Storage ====================
const OPFSStorage = {
    _root: null,
    _fileName: 'opentavern-data.json',
    _writeLock: null,
    _probeResult: null,
    _probePromise: null,

    _isFileProtocol() {
        return opfsStorageIsFileProtocol();
    },

    _getRoot() {
        return getOPFSStorageRoot(this);
    },

    probeWritable() {
        return probeOPFSStorageWritable(this);
    },

    loadAll() {
        return loadAllOPFSStorage(this);
    },

    saveAll(data) {
        return saveAllOPFSStorage(this, data);
    },

    _doSaveAll(data) {
        return doSaveAllOPFSStorage(this, data);
    },

    getStorageInfo() {
        return getOPFSStorageInfo(this);
    },

    clear() {
        return clearOPFSStorage(this);
    }
};
