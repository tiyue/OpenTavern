// ==================== World Book Activation Helpers ====================
function collectWorldInfoActivationEntries(conv) {
    var entries = [];
    if (!conv) return entries;

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

function buildWorldInfoActivationCacheKey(conv, wi) {
    var messages = conv.messages || [];
    var lastMsg = messages.length > 0 ? messages[messages.length - 1] : null;
    var lastContentHash = lastMsg ? (lastMsg.content || '').slice(0, 64) : '';
    var wiEntryCount = Object.keys(wi.entries).length;

    var fingerprint = '';
    var checkPoints = [0, 1, 2, messages.length - 3, messages.length - 2, messages.length - 1];
    checkPoints.forEach(function(idx) {
        if (idx >= 0 && idx < messages.length) {
            var m = messages[idx];
            fingerprint += (m.role || '') + ':' + (m.content || '').slice(0, 20) + '|';
        }
    });

    return messages.length + '|' + lastContentHash + '|' + wiEntryCount + '|' + fingerprint;
}

function getEnabledWorldInfoEntries(wi) {
    return Object.keys(wi.entries).map(function(k) { return wi.entries[k]; })
        .filter(function(e) { return e && !e.disable; });
}

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

function cacheActivatedWorldInfoResult(conv, cacheKey, result) {
    if (!conv) return;
    conv._wiCache = {
        key: cacheKey,
        result: result
    };
}
