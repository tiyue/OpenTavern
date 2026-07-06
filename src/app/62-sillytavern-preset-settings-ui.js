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

function exportSillyTavernPreset() {
    var preset = ensureSillyTavernPresetSettings();
    var prompts = preset.prompts.slice().sort(function(a, b) { return (a.order || 0) - (b.order || 0); });
    if (prompts.length === 0) {
        alert(t('settings_st_preset_empty'));
        return;
    }
    var data = {
        name: preset.name || 'OpenTavern SillyTavern Preset Prompts',
        prompts: prompts.map(function(p) {
            return {
                identifier: p.identifier || p.id,
                name: p.name || p.identifier || p.id,
                role: p.role || 'system',
                content: p.content || '',
                position: p.position,
                injection_position: p.injection_position,
                depth: p.depth,
                injection_depth: p.injection_depth,
                system_prompt: true,
                marker: false
            };
        }),
        prompt_order: [{
            character_id: 100001,
            order: (preset.promptOrder && preset.promptOrder.length ? preset.promptOrder : prompts).map(function(item) {
                var id = item.identifier || item.id;
                return {
                    identifier: id,
                    enabled: item.enabled !== false,
                    position: item.position,
                    injection_position: item.injection_position,
                    depth: item.depth,
                    injection_depth: item.injection_depth
                };
            })
        }],
        opentavern: {
            type: 'sillytavern-preset-prompts',
            exported_at: new Date().toISOString()
        }
    };
    downloadJsonFile(data, 'sillytavern_preset_prompts_' + new Date().toISOString().slice(0, 10) + '.json');
}

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
