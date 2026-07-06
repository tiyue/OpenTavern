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
