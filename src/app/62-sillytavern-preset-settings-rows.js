// ==================== SillyTavern Preset Settings Rows ====================
function getSillyTavernPresetRows(preset) {
    return (preset.prompts || []).map(function(p, index) {
        return { prompt: p, index: index };
    }).sort(function(a, b) {
        return (a.prompt.order || 0) - (b.prompt.order || 0);
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
