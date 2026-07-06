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
