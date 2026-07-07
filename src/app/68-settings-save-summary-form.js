// ==================== Settings Save Summary Form ====================
function readSummarySettingsFromForm() {
    ensureSillyTavernPresetSettings();
    state.settings.summaryEnabled = readCheckboxControlValue(dom.summaryEnabled, false);
    if (dom.summaryThreshold) state.settings.summaryThreshold = readIntegerControlValue(dom.summaryThreshold, 12);
    if (dom.summaryMaxWords) state.settings.summaryMaxWords = readIntegerControlValue(dom.summaryMaxWords, 0);
    if (dom.summaryPrompt) state.settings.summaryPrompt = readTrimmedControlValue(dom.summaryPrompt);
}

function readWorldInfoBudgetSettingsFromForm() {
    state.settings.worldInfoBudgetEnabled = readCheckboxControlValue(dom.worldInfoBudgetEnabled, false);
    state.settings.worldInfoBudget = readIntegerControlValue(dom.worldInfoBudget, 2048);
}
