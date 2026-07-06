// ==================== World Book Activation Filters ====================
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
