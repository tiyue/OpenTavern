// ==================== Initialize ====================
async function init() {
    cacheDom();
    await initializeStorageAndState();
    bindEvents();
    applyInitialLanguageState();
    applyTranslations();
    renderAll();
    showInitialLibraryView();
    updateStartupInputAvailability();
    migrateActiveConversationFirstMessage();
    scheduleAnnouncementModal();
}

installAppDebugGlobals();
startApp();
