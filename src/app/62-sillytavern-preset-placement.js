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

