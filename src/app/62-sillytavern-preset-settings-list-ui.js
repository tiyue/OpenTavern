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

function getSillyTavernPresetRows(preset) {
    return (preset.prompts || []).map(function(p, index) {
        return { prompt: p, index: index };
    }).sort(function(a, b) {
        return (a.prompt.order || 0) - (b.prompt.order || 0);
    });
}

function renderSillyTavernPresetEmptyState() {
    dom.stPresetStatus.textContent = t('settings_st_preset_empty');
    dom.stPresetList.innerHTML = '<div class="text-[11px] text-zinc-600 px-1 py-1">' + escapeHtml(t('settings_st_preset_empty')) + '</div>';
    setSillyTavernPresetTransferButtonsDisabled(true);
}

function setSillyTavernPresetTransferButtonsDisabled(disabled) {
    [dom.stPresetExportBtn, dom.stPresetDeleteBtn].forEach(function(btn) {
        if (!btn) return;
        btn.disabled = !!disabled;
        btn.classList.toggle('opacity-50', !!disabled);
        btn.classList.toggle('cursor-not-allowed', !!disabled);
    });
}

function buildSillyTavernPresetRowHtml(row) {
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
}

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
