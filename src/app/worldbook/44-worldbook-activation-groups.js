/**
 * 新手导读（文件：44-worldbook-activation-groups.js）
 *
 * 负责什么：这是“世界书匹配引擎”中的“世界书、激活规则、分组”部分。
 * 在程序中的位置：它扫描最近聊天文本，按关键词、分组、预算和时效规则选出要注入的条目。
 * 从哪里开始看：主要从 `chooseWorldInfoGroupWinner(entries)`、`resolveWorldInfoInclusionGroups(activated)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：匹配顺序和预算共同决定最终结果；看似多余的去重步骤用于防止重复注入。
 */
// ==================== World Book Activation Groups ====================
function chooseWorldInfoGroupWinner(entries) {
    var useScoring = entries.some(function(e) { return e.useGroupScoring; });

    if (!useScoring) {
        return entries.sort(function(a, b) { return (b.order || 0) - (a.order || 0); })[0];
    }

    entries.forEach(function(e) {
        var score = 0;
        if (e.key && e.key.length > 0) score += e.key.length;
        if (e.keysecondary && e.keysecondary.length > 0) {
            var logic = e.selectiveLogic || 0;
            if (logic === 0 || logic === 1) score += e.keysecondary.length;
        }
        e._groupScore = score;
    });

    var winner = entries.sort(function(a, b) { return (b._groupScore || 0) - (a._groupScore || 0); })[0];
    entries.forEach(function(e) { delete e._groupScore; });
    return winner;
}

function resolveWorldInfoInclusionGroups(activated) {
    var groups = {};
    activated.forEach(function(e) {
        if (e.group) { (groups[e.group] = groups[e.group] || []).push(e); }
    });

    Object.keys(groups).forEach(function(g) {
        var gents = groups[g];
        if (gents.length < 2) return;
        activated = activated.filter(function(e) { return !e.group || e.group !== g; });
        activated.push(chooseWorldInfoGroupWinner(gents));
    });

    return activated;
}

