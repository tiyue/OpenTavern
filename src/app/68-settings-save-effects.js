function applyClosedSettingsEffects() {
    persistState();
    dom.settingsModal.classList.add('hidden');

    if (typeof applyUiTheme === 'function') {
        applyUiTheme(state.settings.uiTheme);
    }
    if (typeof applyPerformanceMode === 'function') {
        applyPerformanceMode(state.settings.lowPowerMode);
    }
    updateInputState();

    var conv = getActiveConv();
    if (conv) {
        conv._wiCache = null;
    }
    renderTokenBar();

    if (state.settings.summaryEnabled) {
        setTimeout(function() { autoSummarize(); }, 120);
    }

    appStore.notify('settings');
}
