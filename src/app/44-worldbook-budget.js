/**
 * 新手导读（文件：44-worldbook-budget.js）
 *
 * 负责什么：这是“世界书匹配引擎”中的“世界书、内容预算”部分。
 * 在程序中的位置：它扫描最近聊天文本，按关键词、分组、预算和时效规则选出要注入的条目。
 * 从哪里开始看：主要从 `estimateTokens(text)`、`applyWorldInfoBudget(entries, settings)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：匹配顺序和预算共同决定最终结果；看似多余的去重步骤用于防止重复注入。
 */
// ==================== World Book Budget Helpers ====================
function estimateTokens(text) {
    if (!text) return 0;
    // Simple but effective heuristic used by many lightweight frontends
    return Math.max(1, Math.ceil(text.length / 3.6));
}

function applyWorldInfoBudget(entries, settings) {
    if (!entries || entries.length === 0) {
        return { entries: entries || [], trimmed: false };
    }

    var budgetEnabled = settings.worldInfoBudgetEnabled !== false;
    var maxBudget = parseInt(settings.worldInfoBudget) || 2048;

    if (!budgetEnabled) {
        return { entries: entries, trimmed: false };
    }

    var originalCount = entries.length;

    // Always keep ignoreBudget entries
    var mustKeep = entries.filter(function(e) { return e.ignoreBudget; });
    var rest = entries.filter(function(e) { return !e.ignoreBudget; });

    // Priority:
    // 1. Direct (non-recursive) entries before recursive ones
    // 2. Constants before non-constants
    // 3. Higher order first
    rest.sort(function(a, b) {
        var aRec = a.isRecursive ? 1 : 0;
        var bRec = b.isRecursive ? 1 : 0;
        if (aRec !== bRec) return aRec - bRec;     // direct (0) before recursive (1)

        var aConst = a.constant ? 1 : 0;
        var bConst = b.constant ? 1 : 0;
        if (aConst !== bConst) return bConst - aConst;

        return (b.order || 0) - (a.order || 0);
    });

    var used = 0;
    mustKeep.forEach(function(e) {
        used += estimateTokens(e.content);
    });

    var accepted = [];

    for (var i = 0; i < rest.length; i++) {
        var e = rest[i];
        var cost = estimateTokens(e.content);
        if (used + cost <= maxBudget) {
            accepted.push(e);
            used += cost;
        } else {
            break;
        }
    }

    // Combine and re-sort by original order for correct injection sequence
    var final = mustKeep.concat(accepted);
    final.sort(function(a, b) { return (a.order || 0) - (b.order || 0); });

    var trimmed = final.length < originalCount;

    return { entries: final, trimmed: trimmed };
}
