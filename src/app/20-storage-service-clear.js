// ==================== StorageService Clear Helpers ====================
async function clearStorageServiceData(service) {
    let cleared = { opfs: false, idb: false, ls: false };
    const emptyData = createEmptyStorageServiceSnapshot();

    await clearStorageServiceOPFS(service, emptyData, cleared);
    await clearStorageServiceIDB(cleared);
    clearStorageServiceLocalSnapshot(emptyData, cleared);
    await clearStorageServiceLegacyIDB(cleared);
    await clearStorageServiceWebLLMCache(cleared);

    console.log('[Storage] clearAllData result:', cleared);
    if (typeof updateStorageInfo === 'function') setTimeout(() => updateStorageInfo(), 80);
    return cleared;
}

function createEmptyStorageServiceSnapshot() {
    return {
        lastSaved: Date.now(),
        conversations: {},
        conversationOrder: [],
        activeConvId: null,
        worldBooks: {},
        characters: {},
        settings: {},
        charactersMigrated: true
    };
}
