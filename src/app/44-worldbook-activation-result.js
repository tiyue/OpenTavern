/**
 * 新手导读（文件：44-worldbook-activation-result.js）
 *
 * 负责什么：这是“世界书匹配引擎”中的“世界书、激活规则、结果”部分。
 * 在程序中的位置：它扫描最近聊天文本，按关键词、分组、预算和时效规则选出要注入的条目。
 * 从哪里开始看：主要从 `applyWorldInfoBudgetWithWarning(activated)`、`groupActivatedWorldInfoByPosition(activated)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：匹配顺序和预算共同决定最终结果；看似多余的去重步骤用于防止重复注入。
 */
// ==================== World Book Activation Result Helpers ====================
function applyWorldInfoBudgetWithWarning(activated) {
    var settings = state.settings || {};
    var budgetResult = applyWorldInfoBudget(activated, settings);

    if (budgetResult.trimmed) {
        var activeConv = getActiveConv();
        if (activeConv) activeConv._wiBudgetWarning = true;
    }

    return budgetResult.entries;
}

function groupActivatedWorldInfoByPosition(activated) {
    var byPos = {};
    var outlets = {};

    activated.forEach(function(e) {
        var p = e.position != null ? e.position : WI_POS.AFTER_CHAR;
        (byPos[p] = byPos[p] || []).push(e);

        if (p === WI_POS.OUTLET && e.outletName) {
            var name = e.outletName.trim();
            if (name) {
                if (!outlets[name]) outlets[name] = [];
                outlets[name].push(e);
            }
        }
    });

    Object.keys(outlets).forEach(function(name) {
        outlets[name].sort(function(a, b) { return (a.order || 0) - (b.order || 0); });
    });

    return { byPosition: byPos, outlets: outlets };
}
