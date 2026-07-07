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
