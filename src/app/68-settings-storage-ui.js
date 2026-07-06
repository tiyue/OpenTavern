function bindSettingsStorageControls() {
    const backend = StorageService.getBackend();

    bindSettingsStorageStatusControls(backend);
    updateStorageStatusUI();
    bindSettingsStorageClearControls(backend);
    bindSettingsStorageRecoveryControls();
}
