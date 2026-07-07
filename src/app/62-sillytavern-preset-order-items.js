// ==================== SillyTavern Preset Order Item Helpers ====================
function addSillyTavernOrderArray(items, arr) {
    if (!Array.isArray(arr)) return;
    arr.forEach(function(item, idx) {
        if (typeof item === 'string') {
            items.push({ identifier: item, enabled: true, order: idx });
        } else {
            appendSillyTavernOrderObject(items, '', item, idx);
        }
    });
}

function appendSillyTavernOrderObject(items, fallbackId, item, idx) {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
        items.push({
            identifier: item.identifier || item.id || item.name || fallbackId || '',
            enabled: item.enabled !== false,
            order: typeof item.order === 'number' ? item.order : idx,
            role: item.role != null ? item.role : '',
            position: item.position != null ? item.position : item.injection_position,
            depth: item.depth != null ? item.depth : item.injection_depth
        });
    } else if (typeof item === 'boolean' && fallbackId) {
        items.push({ identifier: fallbackId, enabled: item, order: idx });
    }
}
