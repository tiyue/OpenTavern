function applySavedSettingsThemeEffects() {
    if (typeof applyUiTheme === 'function') {
        applyUiTheme(state.settings.uiTheme);
    }
    if (typeof applyPerformanceMode === 'function') {
        applyPerformanceMode(state.settings.lowPowerMode);
    }
}

function clearActiveConversationWorldInfoCache() {
    var conv = getActiveConv();
    if (conv) {
        conv._wiCache = null;
    }
}

function scheduleAutoSummaryAfterSettingsSave() {
    if (state.settings.summaryEnabled) {
        setTimeout(function() { autoSummarize(); }, 120);
    }
}
