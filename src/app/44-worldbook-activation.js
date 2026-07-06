// ==================== World Book Activation Engine ====================
function getActivatedWorldInfo(conv) {
    // Phase 2+: Collect world info from global worldBooks via worldBookIds + legacy support
    var entries = [];

    if (conv) {
        // New model: pull from global reusable world books
        if (Array.isArray(conv.worldBookIds) && conv.worldBookIds.length > 0) {
            conv.worldBookIds.forEach(function(wbId) {
                var wb = state.worldBooks && state.worldBooks[wbId];
                if (wb && wb.entries) {
                    Object.keys(wb.entries).forEach(function(uid) {
                        // Normalize on read so old imported data (with ST field names like keys/insertion_order/enabled + extensions) works
                        var entry = normalizeWIEntry(wb.entries[uid]) || JSON.parse(JSON.stringify(wb.entries[uid]));
                        entry._sourceWorldBookId = wbId;
                        entries.push(entry);
                    });
                }
            });
        }

        // Legacy fallback during transition
        if (conv.worldInfo && conv.worldInfo.entries) {
            Object.keys(conv.worldInfo.entries).forEach(function(uid) {
                var entry = normalizeWIEntry(conv.worldInfo.entries[uid]) || JSON.parse(JSON.stringify(conv.worldInfo.entries[uid]));
                entries.push(entry);
            });
        }
    }

    if (entries.length === 0) return { entries: [], byPosition: {} };

    // Build virtual combined worldInfo for the rest of the (existing) activation logic
    var wi = { entries: {} };
    entries.forEach(function(e) {
        var uid = e.uid != null ? String(e.uid) : Date.now().toString();
        wi.entries[uid] = e;
    });

    // ==================== World Info Activation Cache ====================
    var messages = conv.messages || [];
    var lastMsg = messages.length > 0 ? messages[messages.length - 1] : null;
    var lastContentHash = lastMsg ? (lastMsg.content || '').slice(0, 64) : '';
    var wiEntryCount = Object.keys(wi.entries).length;

    var fingerprint = '';
    var checkPoints = [0, 1, 2, messages.length-3, messages.length-2, messages.length-1];
    checkPoints.forEach(function(idx) {
        if (idx >= 0 && idx < messages.length) {
            var m = messages[idx];
            fingerprint += (m.role || '') + ':' + (m.content || '').slice(0, 20) + '|';
        }
    });

    var cacheKey = messages.length + '|' + lastContentHash + '|' + wiEntryCount + '|' + fingerprint;

    if (conv._wiCache && conv._wiCache.key === cacheKey) {
        return conv._wiCache.result;
    }

    var all = Object.keys(wi.entries).map(function(k) { return wi.entries[k]; })
        .filter(function(e) { return e && !e.disable; });

    if (all.length === 0) return { entries: [], byPosition: {} };

    var charName = conv.character ? conv.character.name : '';
    var charTags = conv.character ? (conv.character.tags || []) : [];

    var activated = [];

    for (var i = 0; i < all.length; i++) {
        var e = all[i];
        var cs = e.caseSensitive === true;
        var ww = e.matchWholeWords === true;

        // Build scan text tailored to this entry's additional matching sources
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

    // One level recursion via content mention
    // Mark recursive entries so they have lower priority in budget allocation
    var rec = [];
    activated.forEach(function(act) {
        if (act.preventRecursion) return;
        all.forEach(function(cand) {
            if (cand.disable || activated.indexOf(cand) > -1 || rec.indexOf(cand) > -1) return;
            if (cand.excludeRecursion) return;
            var keysJoined = (cand.key || []).join(' ').toLowerCase();
            if (act.content && act.content.toLowerCase().indexOf(keysJoined) !== -1) {
                if (passesCharacterFilter(cand, charName, charTags) && passesProbability(cand)) {
                    cand.isRecursive = true;   // mark for budget priority
                    rec.push(cand);
                }
            }
        });
    });
    activated = activated.concat(rec);

    // dedupe
    var seen = {};
    activated = activated.filter(function(e) { if (seen[e.uid]) return false; seen[e.uid] = true; return true; });

    // inclusion groups (with Group Scoring support)
    var groups = {};
    activated.forEach(function(e) {
        if (e.group) { (groups[e.group] = groups[e.group] || []).push(e); }
    });
    Object.keys(groups).forEach(function(g) {
        var gents = groups[g];
        if (gents.length < 2) return;

        activated = activated.filter(function(e) { return !e.group || e.group !== g; });

        var useScoring = gents.some(function(e) { return e.useGroupScoring; });

        var winner;
        if (useScoring) {
            // Calculate score for each entry
            gents.forEach(function(e) {
                var score = 0;
                // Primary keys
                if (e.key && e.key.length > 0) {
                    // Simple heuristic: count how many primary keys exist (real matching already happened)
                    score += e.key.length;
                }
                // Secondary keys contribution depends on selective logic (simplified)
                if (e.keysecondary && e.keysecondary.length > 0) {
                    var logic = e.selectiveLogic || 0;
                    if (logic === 0 || logic === 1) score += e.keysecondary.length; // AND ANY / AND ALL
                }
                e._groupScore = score;
            });
            winner = gents.sort(function(a, b) { return (b._groupScore || 0) - (a._groupScore || 0); })[0];
            gents.forEach(function(e) { delete e._groupScore; });
        } else {
            // Original behavior: highest order wins (or random weight later)
            winner = gents.sort(function(a, b) { return (b.order || 0) - (a.order || 0); })[0];
        }

        activated.push(winner);
    });

    activated.sort(function(a, b) { return (a.order || 0) - (b.order || 0); });

    // === Timed Effects (Sticky / Cooldown / Delay) ===
    activated = processTimedEffects(conv, activated);

    // === Apply global World Info token budget ===
    // This now also considers recursive entries (they have lower priority)
    var settings = state.settings || {};
    var budgetResult = applyWorldInfoBudget(activated, settings);
    activated = budgetResult.entries;

    // Record budget warning for UI
    if (budgetResult.trimmed) {
        var activeConv = getActiveConv();
        if (activeConv) {
            activeConv._wiBudgetWarning = true;
        }
    }

    // Clean up temporary recursion marker
    activated.forEach(function(e) { delete e.isRecursive; });

    var byPos = {};
    var outlets = {}; // name -> array of entries

    activated.forEach(function(e) {
        var p = e.position != null ? e.position : WI_POS.AFTER_CHAR;
        (byPos[p] = byPos[p] || []).push(e);

        // Collect Outlet entries
        if (p === WI_POS.OUTLET && e.outletName) {
            var name = e.outletName.trim();
            if (name) {
                if (!outlets[name]) outlets[name] = [];
                outlets[name].push(e);
            }
        }
    });

    // Sort outlets by order
    Object.keys(outlets).forEach(function(name) {
        outlets[name].sort(function(a, b) { return (a.order || 0) - (b.order || 0); });
    });

    var result = { entries: activated, byPosition: byPos, outlets: outlets };

    // 写入缓存
    if (conv) {
        conv._wiCache = {
            key: cacheKey,
            result: result
        };
    }

    return result;
}
