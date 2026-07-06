// ==================== World Book Activation Engine ====================
function getActivatedWorldInfo(conv) {
    var entries = collectWorldInfoActivationEntries(conv);
    if (entries.length === 0) return { entries: [], byPosition: {} };

    var wi = buildCombinedWorldInfo(entries);
    var cacheKey = buildWorldInfoActivationCacheKey(conv, wi);
    if (conv._wiCache && conv._wiCache.key === cacheKey) {
        return conv._wiCache.result;
    }

    var all = getEnabledWorldInfoEntries(wi);
    if (all.length === 0) return { entries: [], byPosition: {} };

    var charName = conv.character ? conv.character.name : '';
    var charTags = conv.character ? (conv.character.tags || []) : [];

    var activated = activateDirectWorldInfoEntries(all, conv, charName, charTags);
    activated = expandRecursiveWorldInfoEntries(activated, all, charName, charTags);
    activated = dedupeWorldInfoEntries(activated);
    activated = resolveWorldInfoInclusionGroups(activated);
    activated.sort(function(a, b) { return (a.order || 0) - (b.order || 0); });

    activated = processTimedEffects(conv, activated);
    activated = applyWorldInfoBudgetWithWarning(activated);
    activated.forEach(function(e) { delete e.isRecursive; });

    var grouped = groupActivatedWorldInfoByPosition(activated);
    var result = {
        entries: activated,
        byPosition: grouped.byPosition,
        outlets: grouped.outlets
    };

    cacheActivatedWorldInfoResult(conv, cacheKey, result);
    return result;
}
