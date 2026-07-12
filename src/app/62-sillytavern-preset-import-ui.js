/**
 * 新手导读（文件：62-sillytavern-preset-import-ui.js）
 *
 * 负责什么：这是“SillyTavern 预设”中的“SillyTavern、预设、导入、界面”部分。
 * 在程序中的位置：它导入、规范化、排序并运行 SillyTavern 格式的提示词预设。
 * 从哪里开始看：主要从 `importSillyTavernPresetFile(file)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：预设顺序与启用状态决定最终提示词，未知字段应尽量保留以便再次导出。
 */
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
