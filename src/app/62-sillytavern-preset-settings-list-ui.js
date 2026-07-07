// ==================== SillyTavern Preset Settings List UI ====================
function renderSillyTavernPresetSettings() {
    if (!dom.stPresetList || !dom.stPresetStatus) return;

    var preset = ensureSillyTavernPresetSettings();
    var rows = getSillyTavernPresetRows(preset);
    var enabledCount = rows.filter(function(row) { return row.prompt.enabled !== false; }).length;

    if (rows.length === 0) {
        renderSillyTavernPresetEmptyState();
        return;
    }

    dom.stPresetStatus.textContent = (preset.name || 'SillyTavern Preset') + ' - ' + enabledCount + ' / ' + rows.length + ' enabled';
    setSillyTavernPresetTransferButtonsDisabled(false);
    dom.stPresetList.innerHTML = rows.map(buildSillyTavernPresetRowHtml).join('');
    bindSillyTavernPresetToggleEvents(preset);
}
