/**
 * 新手导读（文件：62-sillytavern-preset-settings-rows.js）
 *
 * 负责什么：这是“SillyTavern 预设”中的“SillyTavern、预设、设置、多行项目”部分。
 * 在程序中的位置：它导入、规范化、排序并运行 SillyTavern 格式的提示词预设。
 * 从哪里开始看：主要从 `getSillyTavernPresetRows(preset)`、`buildSillyTavernPresetRowHtml(row)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：预设顺序与启用状态决定最终提示词，未知字段应尽量保留以便再次导出。
 */
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
