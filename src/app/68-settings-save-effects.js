function applyClosedSettingsEffects() {
    persistState();
    dom.settingsModal.classList.add('hidden');

    applySavedSettingsThemeEffects();
    updateInputState();

    clearActiveConversationWorldInfoCache();
    renderTokenBar();

    scheduleAutoSummaryAfterSettingsSave();

    appStore.notify('settings');
}
