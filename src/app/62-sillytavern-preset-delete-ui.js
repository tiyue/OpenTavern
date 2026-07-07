// ==================== SillyTavern Preset Delete UI ====================
function deleteSillyTavernPreset() {
    var preset = ensureSillyTavernPresetSettings();
    if (!preset.prompts.length) {
        alert(t('settings_st_preset_empty'));
        return;
    }
    if (!confirm(t('settings_st_preset_delete_confirm'))) return;
    state.settings.sillyTavernPreset = defaultSillyTavernPreset();
    renderSillyTavernPresetSettings();
    persistState(true);
    renderTokenBar();
    appStore.notify('settings');
    alert(t('settings_st_preset_delete_success'));
}
