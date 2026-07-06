// ==================== World Book Activation Engine ====================
// ---------- World Info Activation Engine (core features) ----------

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function entryMatchesKeys(entry, text, caseSensitive, wholeWord) {
    if (!entry || !entry.key || entry.key.length === 0) return false;
    var flags = caseSensitive ? 'g' : 'gi';
    for (var i = 0; i < entry.key.length; i++) {
        var k = entry.key[i];
        if (!k) continue;
        var isRegex = k[0] === '/' && k.lastIndexOf('/') > 1;
        var re;
        if (isRegex) {
            try {
                var lastSlash = k.lastIndexOf('/');
                var pattern = k.slice(1, lastSlash);
                var f = k.slice(lastSlash + 1) || flags;
                re = new RegExp(pattern, f);
            } catch (e) { re = null; }
        } else {
            if (wholeWord) {
                // 更好的 Unicode 单词边界（支持中文、日文等）
                try {
                    var escaped = escapeRegex(k);
                    var pat = '(?<!\\w)' + escaped + '(?!\\w)';
                    re = new RegExp(pat, flags + 'u');
                } catch (e) {
                    // 旧浏览器不支持 lookbehind，回退到普通匹配
                    re = new RegExp(escapeRegex(k), flags);
                }
            } else {
                re = new RegExp(escapeRegex(k), flags);
            }
        }
        if (re && re.test(text)) return true;
    }
    return false;
}

function entryMatchesSecondary(entry, text, caseSensitive) {
    if (!entry.keysecondary || entry.keysecondary.length === 0) return true;
    var flags = caseSensitive ? 'g' : 'gi';
    var matches = 0;
    for (var i = 0; i < entry.keysecondary.length; i++) {
        var k = entry.keysecondary[i];
        if (!k) continue;
        var isRegex = k[0] === '/' && k.lastIndexOf('/') > 1;
        var re;
        if (isRegex) {
            try {
                var last = k.lastIndexOf('/');
                re = new RegExp(k.slice(1, last), k.slice(last + 1) || flags);
            } catch (e) { re = null; }
        } else {
            re = new RegExp(escapeRegex(k), flags);
        }
        if (re && re.test(text)) matches++;
    }
    var logic = entry.selectiveLogic || 0;
    if (logic === 0) return matches > 0;
    if (logic === 1) return matches === entry.keysecondary.length;
    if (logic === 2) return matches === 0;
    if (logic === 3) return matches < entry.keysecondary.length;
    return matches > 0;
}

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

function buildScanText(conv, depth, entry) {
    if (!conv) return '';
    var msgs = conv.messages.filter(function(m) { return m.role !== 'system'; });
    depth = depth || 4;
    if (depth > 0) msgs = msgs.slice(-depth);
    var charName = conv.character ? conv.character.name : '';
    var userName = state.settings.userName || 'User';
    var out = [];

    for (var i = 0; i < msgs.length; i++) {
        var m = msgs[i];
        var prefix = m.role === 'user' ? (userName + ': ') : (charName ? (charName + ': ') : '');
        out.push(prefix + (m.content || ''));
    }

    // === Selective Additional Matching Sources ===
    // Only include fields that this specific entry has enabled
    if (conv.character && entry) {
        var c = conv.character;
        if (entry.matchCharacterDescription) {
            out.push('CharacterDescription: ' + (c.description || ''));
        }
        if (entry.matchCharacterPersonality) {
            out.push('CharacterPersonality: ' + (c.personality || ''));
        }
        if (entry.matchScenario) {
            out.push('Scenario: ' + (c.scenario || ''));
        }
        if (entry.matchPersonaDescription) {
            // For now we don't have a separate persona system, skip or use settings
        }
        if (entry.matchCharacterDepthPrompt) {
            out.push("Character's Note: " + getEffectivePostHistoryInstructions(c));
        }
        if (entry.matchCreatorNotes) {
            out.push('Creator Notes: ' + (c.creator_notes || ''));
        }
    } else if (conv.character) {
        // Fallback: if no entry provided, include everything (legacy behavior)
        var c = conv.character;
        out.push('CharacterDescription: ' + (c.description || ''));
        out.push('CharacterPersonality: ' + (c.personality || ''));
        out.push('Scenario: ' + (c.scenario || ''));
    }

    return out.join('\n');
}

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
    // Base chat history (depth is global default here; per-entry scanDepth override handled later if needed)
    var baseScanText = buildScanText(conv, 4, null);

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

function joinWIContent(list, charName, userName) {
    if (!list || !list.length) return '';
    return list.map(function(e) {
        return replacePlaceholders(e.content || '', charName, userName);
    }).join('\n\n');
}
