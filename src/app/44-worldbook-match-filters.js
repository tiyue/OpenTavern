/**
 * 新手导读（文件：44-worldbook-match-filters.js）
 *
 * 负责什么：这是“世界书匹配引擎”中的“世界书、匹配、过滤条件”部分。
 * 在程序中的位置：它扫描最近聊天文本，按关键词、分组、预算和时效规则选出要注入的条目。
 * 从哪里开始看：主要从 `passesCharacterFilter(entry, charName, charTags)`、`passesProbability(entry)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：匹配顺序和预算共同决定最终结果；看似多余的去重步骤用于防止重复注入。
 */
// ==================== World Book Activation Filters ====================
function passesCharacterFilter(entry, charName, charTags) {
    var cf = entry.characterFilter || { isExclude: false, names: [], tags: [] };
    var names = cf.names || [];
    var tags = cf.tags || [];
    if (names.length === 0 && tags.length === 0) return true;
    var nameMatch = names.length > 0 && names.some(function(n) { return (charName || '').toLowerCase() === n.toLowerCase(); });
    var tagMatch = tags.length > 0 && charTags && charTags.some(function(t) {
        return tags.some(function(tt) { return (t || '').toLowerCase() === tt.toLowerCase(); });
    });
    var match = nameMatch || tagMatch;
    return cf.isExclude ? !match : match;
}

function passesProbability(entry) {
    if (!entry.useProbability) return true;
    var p = entry.probability != null ? entry.probability : 100;
    if (p >= 100) return true;
    if (p <= 0) return false;
    return Math.random() * 100 < p;
}
