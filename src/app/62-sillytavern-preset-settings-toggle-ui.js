// ==================== SillyTavern Preset Settings Toggle UI ====================
function bindSillyTavernPresetToggleEvents(preset) {
    dom.stPresetList.querySelectorAll('.st-preset-toggle').forEach(function(input) {
        input.addEventListener('change', function() {
            var idx = parseInt(this.getAttribute('data-index'), 10);
            if (!isNaN(idx) && preset.prompts[idx]) {
                preset.prompts[idx].enabled = this.checked;
                persistState(true);
                renderSillyTavernPresetSettings();
                renderTokenBar();
                appStore.notify('settings');
            }
        });
    });
}
