/**
 * 新手导读（文件：62-sillytavern-preset-placement.js）
 *
 * 负责什么：这是“SillyTavern 预设”中的“SillyTavern、预设、放置位置”部分。
 * 在程序中的位置：它导入、规范化、排序并运行 SillyTavern 格式的提示词预设。
 * 从哪里开始看：主要从 `describeSillyTavernPresetPlacement(prompt)`、`isSillyTavernChatHistoryMarker(identifier)`、`getSillyTavernPresetPlacement(prompt, fallback)`、`parseSillyTavernDepth(prompt)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：预设顺序与启用状态决定最终提示词，未知字段应尽量保留以便再次导出。
 */
// SillyTavern 预设位置说明：将内部插入策略转换为可读描述。
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
