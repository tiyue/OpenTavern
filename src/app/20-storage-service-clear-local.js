// ==================== StorageService Local Clear Helpers ====================
function isStorageServiceLocalClearKey(key) {
    return key === STORAGE_KEY || key === STORAGE_CLEAR_KEY || key === 'opentavern-last-backup' || String(key).startsWith('opentavern');
}

function removeStorageServiceLocalClearKeys() {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem('opentavern-last-backup');
    Object.keys(localStorage).forEach(function(key) {
        if (isStorageServiceLocalClearKey(key)) localStorage.removeItem(key);
    });
}

function writeStorageServiceLocalEmptySnapshot(emptyData) {
    localStorage.setItem(STORAGE_CLEAR_KEY, String(emptyData.lastSaved));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(emptyData));
}
