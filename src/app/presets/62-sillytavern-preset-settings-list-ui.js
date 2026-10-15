/**
 * 新手导读（文件：62-sillytavern-preset-settings-list-ui.js）
 *
 * 负责什么：这是“SillyTavern 预设”中的“SillyTavern、预设、设置、列表、界面”部分。
 * 在程序中的位置：它导入、规范化、排序并运行 SillyTavern 格式的提示词预设。
 * 从哪里开始看：主要从 `renderSillyTavernPresetSettings(无参数)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：预设顺序与启用状态决定最终提示词，未知字段应尽量保留以便再次导出。
 */
// ==================== SillyTavern Preset Settings List UI ====================
function renderSillyTavernPresetSettings() {
    if (!dom.stPresetList || !dom.stPresetStatus) return;

    var preset = ensureSillyTavernPresetSettings();
    if (typeof renderPresetLibrarySelector === 'function') renderPresetLibrarySelector();
    var rows = getSillyTavernPresetRows(preset);
    var enabledCount = rows.filter(function(row) { return row.prompt.enabled !== false; }).length;
    var regexCount = preset.regexScripts.length;

    if (rows.length === 0 && regexCount === 0) {
        renderSillyTavernPresetEmptyState();
        return;
    }

    dom.stPresetStatus.textContent = (preset.name || 'SillyTavern Preset') + ' - ' + enabledCount + ' / ' + rows.length + ' enabled' +
        (regexCount ? ' · ' + regexCount + ' regex_scripts' : '');
    setSillyTavernPresetTransferButtonsDisabled(false);
    var regexHtml = regexCount ?
        '<label class="flex items-start gap-2 rounded-xl bg-amber-500/5 border border-amber-500/15 p-2 cursor-pointer select-none">' +
            '<input type="checkbox" class="st-preset-regex-toggle accent-amber-500 mt-0.5 flex-shrink-0" ' + (preset.regexScriptsEnabled ? 'checked' : '') + '>' +
            '<span class="min-w-0">' +
                '<span class="block text-xs font-medium text-zinc-200">' + escapeHtml(t('settings_st_preset_regex_title')) + '</span>' +
                '<span class="block text-[10px] leading-relaxed text-zinc-500 mt-0.5">' + escapeHtml(t('settings_st_preset_regex_hint').replace('{count}', regexCount)) + '</span>' +
            '</span>' +
        '</label>' : '';
    dom.stPresetList.innerHTML = regexHtml + rows.map(buildSillyTavernPresetRowHtml).join('');
    var regexToggle = dom.stPresetList.querySelector('.st-preset-regex-toggle');
    if (regexToggle) {
        regexToggle.addEventListener('change', function() {
            preset.regexScriptsEnabled = regexToggle.checked;
            preset.regexScriptsPrompted = true;
            persistState(true);
            appStore.notify('settings');
        });
    }
    bindSillyTavernPresetToggleEvents(preset);
}
