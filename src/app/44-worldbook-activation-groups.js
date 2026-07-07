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

