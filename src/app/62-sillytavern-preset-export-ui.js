/**
 * 新手导读（文件：62-sillytavern-preset-export-ui.js）
 *
 * 负责什么：这是“SillyTavern 预设”中的“SillyTavern、预设、导出、界面”部分。
 * 在程序中的位置：它导入、规范化、排序并运行 SillyTavern 格式的提示词预设。
 * 从哪里开始看：主要从 `exportSillyTavernPreset(无参数)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：预设顺序与启用状态决定最终提示词，未知字段应尽量保留以便再次导出。
 */
// ==================== SillyTavern Preset Export UI ====================
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
