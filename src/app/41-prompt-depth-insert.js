function insertMessagesAtDepth(apiMessages, entries, charName, userName) {
    if (!entries || entries.length === 0) return apiMessages;
    entries.forEach(function(e) {
        var d = (e._depth != null) ? e._depth : (e.depth != null ? e.depth : 4);
        d = parseInt(d, 10);
        if (isNaN(d)) d = 0;
        var role = e.role;
        if (typeof role === 'number') role = (role === 0) ? 'system' : (role === 1 ? 'user' : 'assistant');
        role = normalizePromptRole(role || 'system');
        var content = replacePlaceholders(e.content || '', charName, userName);
        if (!content || !String(content).trim()) return;

        var insertIdx;
        if (d < 0) {
            insertIdx = apiMessages.length + (d + 1);
        } else {
            insertIdx = apiMessages.length - d;
        }

        if (insertIdx < 1) insertIdx = 1;
        if (insertIdx > apiMessages.length) insertIdx = apiMessages.length;

        apiMessages.splice(insertIdx, 0, { role: role, content: content });
    });
    return apiMessages;
}
