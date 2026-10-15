/**
 * 新手导读（文件：44-worldbook-activation-collection.js）
 *
 * 负责什么：这是“世界书匹配引擎”中的“世界书、激活规则、集合”部分。
 * 在程序中的位置：它扫描最近聊天文本，按关键词、分组、预算和时效规则选出要注入的条目。
 * 从哪里开始看：主要从 `collectWorldInfoActivationEntries(conv)`、`buildCombinedWorldInfo(entries)`、`getEnabledWorldInfoEntries(wi)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：匹配顺序和预算共同决定最终结果；看似多余的去重步骤用于防止重复注入。
 */
// ==================== World Book Activation Collection ====================
function collectWorldInfoActivationEntries(conv) {
    var entries = [];
    if (!conv) return entries;
    if (conv.worldBookMode === 'off') return entries;

    if (Array.isArray(conv.worldBookIds) && conv.worldBookIds.length > 0) {
        conv.worldBookIds.forEach(function(wbId) {
            var wb = state.worldBooks && state.worldBooks[wbId];
            if (wb && wb.entries) {
                Object.keys(wb.entries).forEach(function(uid) {
                    var entry = normalizeWIEntry(wb.entries[uid]) || JSON.parse(JSON.stringify(wb.entries[uid]));
                    entry._sourceWorldBookId = wbId;
                    entries.push(entry);
                });
            }
        });
    }

    if (conv.worldInfo && conv.worldInfo.entries) {
        Object.keys(conv.worldInfo.entries).forEach(function(uid) {
            var entry = normalizeWIEntry(conv.worldInfo.entries[uid]) || JSON.parse(JSON.stringify(conv.worldInfo.entries[uid]));
            entries.push(entry);
        });
    }

    if (conv.worldBookMode === 'constant') entries.forEach(function(entry) { entry.constant = true; entry.selective = false; });
    return entries;
}

function buildCombinedWorldInfo(entries) {
    var wi = { entries: {} };
    entries.forEach(function(e) {
        var uid = e.uid != null ? String(e.uid) : Date.now().toString();
        wi.entries[uid] = e;
    });
    return wi;
}

function getEnabledWorldInfoEntries(wi) {
    return Object.keys(wi.entries).map(function(k) { return wi.entries[k]; })
        .filter(function(e) { return e && !e.disable; });
}
