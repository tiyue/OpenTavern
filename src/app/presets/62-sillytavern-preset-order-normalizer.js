/**
 * 新手导读（文件：62-sillytavern-preset-order-normalizer.js）
 *
 * 负责什么：这是“SillyTavern 预设”中的“SillyTavern、预设、顺序、规范化”部分。
 * 在程序中的位置：它导入、规范化、排序并运行 SillyTavern 格式的提示词预设。
 * 从哪里开始看：主要从 `getSillyTavernPromptOrderItems(promptOrder)`、`buildSillyTavernOrderMap(orderItems)`、`serializeSillyTavernPromptOrderItems(orderItems)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：预设顺序与启用状态决定最终提示词，未知字段应尽量保留以便再次导出。
 */
// ==================== SillyTavern Preset Order Normalizer ====================
function getSillyTavernPromptOrderItems(promptOrder) {
    var items = [];
    if (Array.isArray(promptOrder)) {
        promptOrder.forEach(function(group) {
            if (group && Array.isArray(group.order)) addSillyTavernOrderArray(items, group.order);
            else addSillyTavernOrderArray(items, [group]);
        });
    } else if (promptOrder && typeof promptOrder === 'object') {
        if (Array.isArray(promptOrder.order)) addSillyTavernOrderArray(items, promptOrder.order);
        Object.keys(promptOrder).forEach(function(key, idx) {
            var value = promptOrder[key];
            if (key === 'order') return;
            appendSillyTavernOrderObject(items, key, value, idx);
        });
    }
    return items;
}

function buildSillyTavernOrderMap(orderItems) {
    var orderMap = {};
    orderItems.forEach(function(item, idx) {
        var id = String(item.identifier || '');
        if (!id) return;
        orderMap[id] = {
            enabled: item.enabled !== false,
            order: typeof item.order === 'number' ? item.order : idx,
            role: item.role,
            position: item.position,
            depth: item.depth
        };
        orderMap[id.toLowerCase()] = orderMap[id];
    });
    return orderMap;
}

function serializeSillyTavernPromptOrderItems(orderItems) {
    return orderItems.map(function(item, idx) {
        return {
            identifier: String(item.identifier || ''),
            enabled: item.enabled !== false,
            order: typeof item.order === 'number' ? item.order : idx,
            role: item.role != null ? String(item.role) : '',
            position: item.position,
            depth: item.depth
        };
    }).filter(function(item) {
        return item.identifier;
    });
}
