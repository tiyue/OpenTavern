// ==================== StorageService (IndexedDB primary + localStorage snapshot + optional OPFS mirror) ====================
var StorageService = Object.assign(
    createStorageServiceRuntimeState(),
    createStorageServiceAPI()
);
