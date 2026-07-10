// ==================== Event Bindings ====================
function bindEvents() {
    bindChatComposerEvents();
    bindLibraryEvents();
    bindSidebarEvents();
    bindMessageActionEvents();
    bindMessageOptionEvents();
    bindLanguageEvents();
    bindCloudSyncShortcutEvents();
    bindCharacterAndDataEvents();
    bindSettingsEvents();

    bindCharacterImportModalEvents();
    bindPromptAndSummaryWorkflowEvents();

    bindAnnouncementEvents();
    bindGlobalKeyboardEvents();
}
