/**
 * 新手导读（文件：44-worldbook-match-keys.js）
 *
 * 负责什么：这是“世界书匹配引擎”中的“世界书、匹配、关键词”部分。
 * 在程序中的位置：它扫描最近聊天文本，按关键词、分组、预算和时效规则选出要注入的条目。
 * 从哪里开始看：主要从 `escapeRegex(str)`、`buildWorldBookKeyRegex(key, flags, wholeWord)`、`entryMatchesKeys(entry, text, caseSensitive, wholeWord)`、`entryMatchesSecondary(entry, text, caseSensitive)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：匹配顺序和预算共同决定最终结果；看似多余的去重步骤用于防止重复注入。
 */
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
