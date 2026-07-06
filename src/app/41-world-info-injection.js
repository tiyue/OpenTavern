// ==================== World Info Prompt Injection ====================
function injectWorldInfoIntoSystem(systemParts, wiByPos, charName, userName) {
    if (!wiByPos) return systemParts;

    function joinEntries(list) {
        if (!list || !list.length) return '';
        return list.map(function(e) {
            return replacePlaceholders(e.content || '', charName, userName);
        }).join('\n\n');
    }

    var before = joinEntries(wiByPos[WI_POS.BEFORE_CHAR] || []);
    var after = joinEntries(wiByPos[WI_POS.AFTER_CHAR] || []);
    var beforeEx = joinEntries(wiByPos[WI_POS.BEFORE_EX] || []);
    var afterEx = joinEntries(wiByPos[WI_POS.AFTER_EX] || []);
    var topAN = joinEntries(wiByPos[WI_POS.TOP_AN] || []);
    var botAN = joinEntries(wiByPos[WI_POS.BOTTOM_AN] || []);

    if (before) systemParts.unshift(before);
    if (after) systemParts.push(after);

    if (beforeEx) systemParts.push('Example context (lore):\n' + beforeEx);
    if (afterEx) systemParts.push('Example context (lore):\n' + afterEx);

    if (topAN || botAN) {
        var an = [];
        if (topAN) an.push(topAN);
        if (botAN) an.push(botAN);
        systemParts.push("[Author's Note / World Lore]\n" + an.join('\n'));
    }

    return systemParts;
}
