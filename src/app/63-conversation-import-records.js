// ==================== Conversation Import Records ====================
function getConversationImportRecords(data) {
    return data && Array.isArray(data.conversations) ? data.conversations : null;
}

function cloneConversationImportValue(value) {
    return JSON.parse(JSON.stringify(value));
}

function importConversationRecords(convsToImport) {
    var imported = 0;
    var skipped = 0;
    var importedConvs = [];

    convsToImport.forEach(function(conv) {
        if (!conv.id || !Array.isArray(conv.messages)) return;

        var incoming = cloneConversationImportValue(conv);
        if (state.conversations[incoming.id]) {
            incoming.id = makeId();
            skipped++;
        }

        state.conversations[incoming.id] = incoming;
        if (state.conversationOrder.indexOf(incoming.id) === -1) {
            state.conversationOrder.unshift(incoming.id);
        }
        importedConvs.push(incoming);
        imported++;
    });

    return { imported, skipped, conversations: importedConvs };
}
