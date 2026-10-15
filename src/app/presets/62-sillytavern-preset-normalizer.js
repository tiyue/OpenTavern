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

    var nestedData = raw.data && typeof raw.data === 'object' ? raw.data : null;
    var nestedRegexScripts = nestedData && (
        Array.isArray(nestedData.regex_scripts) ||
        nestedData.extensions && Array.isArray(nestedData.extensions.regex_scripts)
    );
    var src = nestedData && (Array.isArray(nestedData.prompts) || nestedRegexScripts) ? nestedData : raw;
    var promptRows = collectSillyTavernPromptRows(src);
    var orderItems = getSillyTavernPromptOrderItems(src.prompt_order);
    var orderMap = buildSillyTavernOrderMap(orderItems);
    var usedIds = {};
    var regexScripts = collectSillyTavernPresetRegexScripts(raw, src);

    var prompts = promptRows.map(function(p, idx) {
        return normalizeSillyTavernPromptRow(p, idx, orderMap, usedIds);
    }).filter(function(p) {
        return p.content.trim();
    });

    prompts.sort(function(a, b) { return (a.order || 0) - (b.order || 0); });
    if (prompts.length === 0 && regexScripts.length === 0) throw new Error(t('settings_st_preset_import_error'));

    return Object.assign({}, src, {
        name: String(src.name || src.preset_name || raw.name || 'SillyTavern Preset'),
        importedAt: new Date().toISOString(),
        promptOrder: serializeSillyTavernPromptOrderItems(orderItems),
        regexScripts: regexScripts,
        regexScriptsEnabled: false,
        regexScriptsPrompted: false,
        prompts: prompts.map(function(p, idx) {
            p.order = idx;
            return p;
        })
    });
}

function collectSillyTavernPresetRegexScripts(raw, src) {
    var candidates = [
        src && src.extensions && src.extensions.regex_scripts,
        src && src.regex_scripts,
        raw && raw.extensions && raw.extensions.regex_scripts,
        raw && raw.regex_scripts
    ];
    for (var i = 0; i < candidates.length; i++) {
        if (!Array.isArray(candidates[i])) continue;
        return candidates[i].filter(function(script) {
            return script && typeof script === 'object' && !Array.isArray(script);
        }).map(function(script) {
            return JSON.parse(JSON.stringify(script));
        });
    }
    return [];
}
