// ==================== World Book Output Helpers ====================
function joinWIContent(list, charName, userName) {
    if (!list || !list.length) return '';
    return list.map(function(e) {
        return replacePlaceholders(e.content || '', charName, userName);
    }).join('\n\n');
}
