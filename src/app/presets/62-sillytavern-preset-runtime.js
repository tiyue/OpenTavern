/**
 * 新手导读（文件：62-sillytavern-preset-runtime.js）
 *
 * 负责什么：这是“SillyTavern 预设”中的“SillyTavern、预设、运行流程”部分。
 * 在程序中的位置：它导入、规范化、排序并运行 SillyTavern 格式的提示词预设。
 * 从哪里开始看：主要从 `buildSillyTavernPresetMessageBuckets(charName, userName)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：预设顺序与启用状态决定最终提示词，未知字段应尽量保留以便再次导出。
 */
// SillyTavern 预设运行时：把预设提示词整理为不同位置的消息桶。
function buildSillyTavernPresetMessageBuckets(charName, userName) {
    var preset = ensureSillyTavernPresetSettings();
    var enabledPrompts = preset.prompts
        .filter(function(p) { return p && p.enabled !== false && p.content && p.content.trim(); })
        .sort(function(a, b) { return (a.order || 0) - (b.order || 0); });

    var byId = Object.create(null);
    enabledPrompts.forEach(function(p) {
        [p.id, p.identifier, p.name].forEach(function(id) {
            if (!id) return;
            byId[String(id).toLowerCase()] = p;
        });
    });

    var buckets = { beforeHistory: [], afterHistory: [], inChat: [] };
    var seen = Object.create(null);
    var afterHistory = false;

    function addPrompt(prompt, orderItem) {
        if (!prompt) return;
        var key = String(prompt.id || prompt.identifier || prompt.name || '');
        if (seen[key]) return;
        seen[key] = true;

        var merged = Object.assign({}, prompt);
        if (orderItem) {
            if (orderItem.role) merged.role = orderItem.role;
            if (orderItem.position != null) merged.position = orderItem.position;
            if (orderItem.depth != null) merged.depth = orderItem.depth;
        }

        var placement = getSillyTavernPresetPlacement(merged, afterHistory ? 'after_history' : 'before_history');
        var msg = {
            role: normalizePromptRole(merged.role || 'system'),
            content: replacePlaceholders(String(merged.content || '').trim(), charName, userName),
            _depth: parseSillyTavernDepth(merged),
            _order: typeof merged.order === 'number' ? merged.order : 0
        };

        if (!msg.content) return;
        if (placement === 'in_chat') buckets.inChat.push(msg);
        else if (placement === 'after_history') buckets.afterHistory.push(msg);
        else buckets.beforeHistory.push(msg);
    }

    var ordered = preset.promptOrder && preset.promptOrder.length
        ? preset.promptOrder.slice().sort(function(a, b) { return (a.order || 0) - (b.order || 0); })
        : [];

    ordered.forEach(function(item) {
        var id = String(item.identifier || '').toLowerCase();
        if (!id) return;
        if (isSillyTavernChatHistoryMarker(id)) {
            afterHistory = true;
            return;
        }
        if (item.enabled === false) {
            var disabled = byId[id];
            if (disabled) seen[String(disabled.id || disabled.identifier || disabled.name || '')] = true;
            return;
        }
        addPrompt(byId[id], item);
    });

    enabledPrompts.forEach(function(p) { addPrompt(p, null); });
    buckets.inChat.sort(function(a, b) { return (a._order || 0) - (b._order || 0); });
    return buckets;
}
