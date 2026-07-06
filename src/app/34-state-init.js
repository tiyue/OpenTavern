async function initState() {
    var migrationResult = { backend: 'opfs', attempted: false, success: false };
    var saved = await loadInitialStateSnapshot();

    applySavedStateSnapshot(saved);
    logInitialStateLoadResult(saved, migrationResult);

    migrationResult.backend = StorageService.getBackend();
    state._storageMigration = migrationResult;

    ensureStateSettingDefaults();
    applyStartupUiPreferences();
    applyApiKeyPersistencePolicy();
    migrateCharacterRegistryOnStartup();
    ensureActiveConversationOnStartup();
}
