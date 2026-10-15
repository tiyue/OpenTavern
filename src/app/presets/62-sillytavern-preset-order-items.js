/**
 * 新手导读（文件：62-sillytavern-preset-order-items.js）
 *
 * 负责什么：这是“SillyTavern 预设”中的“SillyTavern、预设、顺序、项目”部分。
 * 在程序中的位置：它导入、规范化、排序并运行 SillyTavern 格式的提示词预设。
 * 从哪里开始看：主要从 `addSillyTavernOrderArray(items, arr)`、`appendSillyTavernOrderObject(items, fallbackId, item, idx)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：预设顺序与启用状态决定最终提示词，未知字段应尽量保留以便再次导出。
 */
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
