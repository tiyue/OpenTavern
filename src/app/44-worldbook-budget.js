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
