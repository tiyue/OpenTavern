function resolvePromptOutletPlaceholders(apiMessages, outlets, charName, userName) {
    outlets = outlets || {};
    if (Object.keys(outlets).length === 0) return apiMessages;
    apiMessages.forEach(function(msg) {
        if (msg.content && msg.content.includes('{{outlet::')) {
            msg.content = msg.content.replace(/\{\{outlet::([^}]+)\}\}/gi, function(match, outletName) {
                var name = outletName.trim();
                var entries = outlets[name];
                if (!entries || entries.length === 0) return '';
                return entries.map(function(e) {
                    return replacePlaceholders(e.content || '', charName, userName);
                }).join('\n\n');
            });
        }
    });
    return apiMessages;
}

function replacePromptMessagePlaceholders(apiMessages, charName, userName) {
    return apiMessages.map(function(m) {
        return { role: m.role, content: replacePlaceholders(m.content, charName, userName) };
    });
}
