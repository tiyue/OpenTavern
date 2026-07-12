/**
 * 新手导读（文件：62-sillytavern-preset-normalizer.js）
 *
 * 负责什么：这是“SillyTavern 预设”中的“SillyTavern、预设、规范化”部分。
 * 在程序中的位置：它导入、规范化、排序并运行 SillyTavern 格式的提示词预设。
 * 从哪里开始看：主要从 `normalizeSillyTavernPreset(raw)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：预设顺序与启用状态决定最终提示词，未知字段应尽量保留以便再次导出。
 */
// ==================== SillyTavern Preset Normalizer ====================
function normalizeSillyTavernPreset(raw) {
    if (!raw || typeof raw !== 'object') throw new Error(t('settings_st_preset_import_error'));

    var src = raw.data && Array.isArray(raw.data.prompts) ? raw.data : raw;
    var promptRows = collectSillyTavernPromptRows(src);
    var orderItems = getSillyTavernPromptOrderItems(src.prompt_order);
    var orderMap = buildSillyTavernOrderMap(orderItems);
    var usedIds = {};

    var prompts = promptRows.map(function(p, idx) {
        return normalizeSillyTavernPromptRow(p, idx, orderMap, usedIds);
    }).filter(function(p) {
        return p.content.trim();
    });

    prompts.sort(function(a, b) { return (a.order || 0) - (b.order || 0); });
    if (prompts.length === 0) throw new Error(t('settings_st_preset_import_error'));

    return {
        name: String(src.name || src.preset_name || raw.name || 'SillyTavern Preset'),
        importedAt: new Date().toISOString(),
        promptOrder: serializeSillyTavernPromptOrderItems(orderItems),
        prompts: prompts.map(function(p, idx) {
            p.order = idx;
            return p;
        })
    };
}
