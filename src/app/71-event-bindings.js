// ==================== Event Bindings ====================
function bindEvents() {
    bindChatComposerEvents();
    bindLibraryEvents();
    bindSidebarEvents();
    bindMessageActionEvents();
    bindLanguageEvents();
    bindCloudSyncShortcutEvents();
    bindCharacterAndDataEvents();
    bindSettingsEvents();

    bindCharacterImportModalEvents();
    bindPromptAndSummaryWorkflowEvents();

    bindAnnouncementEvents();
    bindGlobalKeyboardEvents();
}
