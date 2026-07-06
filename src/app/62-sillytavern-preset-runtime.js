function describeSillyTavernPresetPlacement(prompt) {
    var placement = getSillyTavernPresetPlacement(prompt, 'before_history');
    if (placement === 'in_chat') {
        var depth = parseSillyTavernDepth(prompt);
        return 'in-chat d' + depth;
    }
    return placement === 'after_history' ? 'after history' : 'before history';
}

function isSillyTavernChatHistoryMarker(identifier) {
    var id = String(identifier || '').toLowerCase().replace(/[\s-]/g, '_');
    return id === 'chat_history' || id === 'chathistory' || id === 'messages' || id === 'conversation_history';
}

function getSillyTavernPresetPlacement(prompt, fallback) {
    prompt = prompt || {};
    var raw = prompt.position != null ? prompt.position : prompt.injection_position;
    var str = String(raw == null ? '' : raw).toLowerCase().trim();

    if (str === '1' || str === 'in_chat' || str === 'in-chat' || str === 'depth' || str === 'at_depth') return 'in_chat';
    if (str.indexOf('after') !== -1 && (str.indexOf('history') !== -1 || str.indexOf('chat') !== -1)) return 'after_history';
    if (str.indexOf('before') !== -1 && (str.indexOf('history') !== -1 || str.indexOf('chat') !== -1)) return 'before_history';
    if (prompt.depth != null || prompt.injection_depth != null) {
        if (str === '0' || str === 'relative') return fallback || 'before_history';
        return 'in_chat';
    }
    return fallback || 'before_history';
}

function parseSillyTavernDepth(prompt) {
    var raw = prompt && (prompt.depth != null ? prompt.depth : prompt.injection_depth);
    var d = parseInt(raw, 10);
    return isNaN(d) ? 0 : d;
}

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
