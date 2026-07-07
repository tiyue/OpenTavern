function buildSillyTavernPresetMessageBuckets(charName, userName) {
    var preset = ensureSillyTavernPresetSettings();
    var enabledPrompts = preset.prompts
        .filter(function(p) { return p && p.enabled !== false && p.content && p.content.trim(); })
        .sort(function(a, b) { return (a.order || 0) - (b.order || 0); });

    var byId = {};
    enabledPrompts.forEach(function(p) {
        [p.id, p.identifier, p.name].forEach(function(id) {
            if (!id) return;
            byId[String(id).toLowerCase()] = p;
        });
    });

    var buckets = { beforeHistory: [], afterHistory: [], inChat: [] };
    var seen = {};
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
        if (item.enabled === false) return;
        addPrompt(byId[id], item);
    });

    enabledPrompts.forEach(function(p) { addPrompt(p, null); });
    buckets.inChat.sort(function(a, b) { return (a._order || 0) - (b._order || 0); });
    return buckets;
}
