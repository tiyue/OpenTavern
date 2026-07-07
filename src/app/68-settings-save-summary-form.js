// ==================== Settings Save Summary Form ====================
function readSummarySettingsFromForm() {
    ensureSillyTavernPresetSettings();
    state.settings.summaryEnabled = dom.summaryEnabled.checked;
    if (dom.summaryThreshold) state.settings.summaryThreshold = parseInt(dom.summaryThreshold.value) || 12;
    if (dom.summaryMaxWords) state.settings.summaryMaxWords = parseInt(dom.summaryMaxWords.value) || 0;
    if (dom.summaryPrompt) state.settings.summaryPrompt = dom.summaryPrompt.value.trim();
}

function readWorldInfoBudgetSettingsFromForm() {
    state.settings.worldInfoBudgetEnabled = dom.worldInfoBudgetEnabled.checked;
    state.settings.worldInfoBudget = parseInt(dom.worldInfoBudget.value) || 2048;
}
