// ==================== StorageService API Delegates ====================
function createStorageServiceAPI() {
    return Object.assign(
        {},
        createStorageServiceHelperAPI(),
        createStorageServiceLocalSnapshotAPI(),
        createStorageServiceOperationsAPI()
    );
}
