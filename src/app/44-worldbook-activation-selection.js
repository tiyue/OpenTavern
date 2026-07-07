// ==================== World Book Activation Selection ====================
function activateDirectWorldInfoEntries(all, conv, charName, charTags) {
    var activated = [];

    for (var i = 0; i < all.length; i++) {
        var e = all[i];
        var cs = e.caseSensitive === true;
        var ww = e.matchWholeWords === true;
        var scanText = buildScanText(conv, (e.scanDepth != null ? e.scanDepth : 4), e);
        var keyHit = entryMatchesKeys(e, scanText, cs, ww);
        var secHit = entryMatchesSecondary(e, scanText, cs);
        var should = false;

        if (e.constant) should = true;
        else if (keyHit && secHit) should = true;

        if (should && passesCharacterFilter(e, charName, charTags) && passesProbability(e)) {
            activated.push(e);
        }
    }

    return activated;
}

function expandRecursiveWorldInfoEntries(activated, all, charName, charTags) {
    var rec = [];

    activated.forEach(function(act) {
        if (act.preventRecursion) return;
        all.forEach(function(cand) {
            if (cand.disable || activated.indexOf(cand) > -1 || rec.indexOf(cand) > -1) return;
            if (cand.excludeRecursion) return;
            var keysJoined = (cand.key || []).join(' ').toLowerCase();
            if (act.content && act.content.toLowerCase().indexOf(keysJoined) !== -1) {
                if (passesCharacterFilter(cand, charName, charTags) && passesProbability(cand)) {
                    cand.isRecursive = true;
                    rec.push(cand);
                }
            }
        });
    });

    return activated.concat(rec);
}

function dedupeWorldInfoEntries(entries) {
    var seen = {};
    return entries.filter(function(e) {
        if (seen[e.uid]) return false;
        seen[e.uid] = true;
        return true;
    });
}
