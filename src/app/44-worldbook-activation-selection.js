/**
 * 新手导读（文件：44-worldbook-activation-selection.js）
 *
 * 负责什么：这是“世界书匹配引擎”中的“世界书、激活规则、选择”部分。
 * 在程序中的位置：它扫描最近聊天文本，按关键词、分组、预算和时效规则选出要注入的条目。
 * 从哪里开始看：主要从 `activateDirectWorldInfoEntries(all, conv, charName, charTags)`、`expandRecursiveWorldInfoEntries(activated, all, charName, charTags)`、`dedupeWorldInfoEntries(entries)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：匹配顺序和预算共同决定最终结果；看似多余的去重步骤用于防止重复注入。
 */
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
