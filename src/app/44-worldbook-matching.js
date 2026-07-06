// ==================== World Book Matching Helpers ====================
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
