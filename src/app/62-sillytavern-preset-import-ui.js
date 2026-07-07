// ==================== SillyTavern Preset Import UI ====================
function importSillyTavernPresetFile(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(ev) {
        try {
            var raw = JSON.parse(ev.target.result);
            state.settings.sillyTavernPreset = normalizeSillyTavernPreset(raw);
            renderSillyTavernPresetSettings();
            persistState(true);
            renderTokenBar();
            appStore.notify('settings');
            alert(t('settings_st_preset_import_success'));
        } catch (err) {
            console.error('[SillyTavern Preset] import failed:', err);
            alert(t('settings_st_preset_import_error') + ': ' + (err.message || err));
        } finally {
            if (dom.stPresetImportFile) dom.stPresetImportFile.value = '';
        }
    };
    reader.readAsText(file);
}
