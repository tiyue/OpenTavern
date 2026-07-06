// ==================== World Book Key Matching ====================
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildWorldBookKeyRegex(key, flags, wholeWord) {
    var isRegex = key[0] === '/' && key.lastIndexOf('/') > 1;
    if (isRegex) {
        var lastSlash = key.lastIndexOf('/');
        var pattern = key.slice(1, lastSlash);
        var regexFlags = key.slice(lastSlash + 1) || flags;
        return new RegExp(pattern, regexFlags);
    }

    if (wholeWord) {
        try {
            var escaped = escapeRegex(key);
            var pat = '(?<!\\w)' + escaped + '(?!\\w)';
            return new RegExp(pat, flags + 'u');
        } catch (e) {
            return new RegExp(escapeRegex(key), flags);
        }
    }

    return new RegExp(escapeRegex(key), flags);
}

function entryMatchesKeys(entry, text, caseSensitive, wholeWord) {
    if (!entry || !entry.key || entry.key.length === 0) return false;
    var flags = caseSensitive ? 'g' : 'gi';
    for (var i = 0; i < entry.key.length; i++) {
        var k = entry.key[i];
        if (!k) continue;
        var re = null;
        try { re = buildWorldBookKeyRegex(k, flags, wholeWord); } catch (e) { re = null; }
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
        var re = null;
        try { re = buildWorldBookKeyRegex(k, flags, false); } catch (e) { re = null; }
        if (re && re.test(text)) matches++;
    }
    var logic = entry.selectiveLogic || 0;
    if (logic === 0) return matches > 0;
    if (logic === 1) return matches === entry.keysecondary.length;
    if (logic === 2) return matches === 0;
    if (logic === 3) return matches < entry.keysecondary.length;
    return matches > 0;
}
