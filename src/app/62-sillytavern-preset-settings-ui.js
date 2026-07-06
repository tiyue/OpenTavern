function renderSillyTavernPresetSettings() {
    if (!dom.stPresetList || !dom.stPresetStatus) return;
    var preset = ensureSillyTavernPresetSettings();
    var rows = preset.prompts.map(function(p, index) { return { prompt: p, index: index }; })
        .sort(function(a, b) { return (a.prompt.order || 0) - (b.prompt.order || 0); });
    var enabledCount = rows.filter(function(row) { return row.prompt.enabled !== false; }).length;

    if (rows.length === 0) {
        dom.stPresetStatus.textContent = t('settings_st_preset_empty');
        dom.stPresetList.innerHTML = '<div class="text-[11px] text-zinc-600 px-1 py-1">' + escapeHtml(t('settings_st_preset_empty')) + '</div>';
        if (dom.stPresetExportBtn) {
            dom.stPresetExportBtn.disabled = true;
            dom.stPresetExportBtn.classList.add('opacity-50', 'cursor-not-allowed');
        }
        if (dom.stPresetDeleteBtn) {
            dom.stPresetDeleteBtn.disabled = true;
            dom.stPresetDeleteBtn.classList.add('opacity-50', 'cursor-not-allowed');
        }
        return;
    }

    dom.stPresetStatus.textContent = (preset.name || 'SillyTavern Preset') + ' - ' + enabledCount + ' / ' + rows.length + ' enabled';
    if (dom.stPresetExportBtn) {
        dom.stPresetExportBtn.disabled = false;
        dom.stPresetExportBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    }
    if (dom.stPresetDeleteBtn) {
        dom.stPresetDeleteBtn.disabled = false;
        dom.stPresetDeleteBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    }

    dom.stPresetList.innerHTML = rows.map(function(row) {
        var p = row.prompt;
        var preview = p.content.length > 220 ? p.content.slice(0, 220) + '...' : p.content;
        var placement = describeSillyTavernPresetPlacement(p);
        return '<div class="rounded-xl bg-black/15 border border-white/5 p-2">' +
            '<label class="flex items-start gap-2 cursor-pointer select-none">' +
                '<input type="checkbox" class="st-preset-toggle accent-amber-500 mt-0.5 flex-shrink-0" data-index="' + row.index + '" ' + (p.enabled !== false ? 'checked' : '') + '>' +
                '<div class="min-w-0 flex-1">' +
                    '<div class="flex items-center gap-1.5 min-w-0">' +
                        '<span class="text-xs font-medium text-zinc-200 truncate">' + escapeHtml(p.name || p.identifier || p.id) + '</span>' +
                        '<span class="text-[9px] uppercase text-zinc-500 bg-white/5 rounded px-1 py-0.5 flex-shrink-0">' + escapeHtml(p.role || 'system') + '</span>' +
                        '<span class="text-[9px] uppercase text-zinc-500 bg-white/5 rounded px-1 py-0.5 flex-shrink-0">' + escapeHtml(placement) + '</span>' +
                    '</div>' +
                    '<details class="mt-1">' +
                        '<summary class="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors">' + escapeHtml(preview) + '</summary>' +
                        '<pre class="mt-1 whitespace-pre-wrap text-[10px] leading-relaxed text-zinc-400 bg-black/20 rounded-lg p-2 max-h-40 overflow-y-auto">' + escapeHtml(p.content) + '</pre>' +
                    '</details>' +
                '</div>' +
            '</label>' +
        '</div>';
    }).join('');

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
