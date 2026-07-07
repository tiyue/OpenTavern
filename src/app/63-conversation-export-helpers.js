// ==================== Conversation Export Helpers ====================
function getConversationExportRecords() {
    return state.conversationOrder.map(function(id) {
        return state.conversations[id];
    }).filter(Boolean);
}

function buildSingleConversationExportData(conversation, exportedAt) {
    return {
        version: 1,
        type: 'opentavern-export',
        exported_at: exportedAt,
        conversations: [conversation]
    };
}

function buildSingleConversationExportFilename(conversation) {
    return (conversation.title || 'conversation').replace(/[^a-zA-Z0-9一-鿿]/g, '_') + '.json';
}

function buildAllConversationsExportData(conversations, exportedAt) {
    return {
        version: 2,
        type: 'opentavern-full-export',
        exported_at: exportedAt,
        settings: getSafeSettingsForPersist(),
        conversations: conversations,
        conversationOrder: state.conversationOrder || [],
        characters: state.characters || {},
        worldBooks: state.worldBooks || {},
        charactersMigrated: !!state._charactersMigrated
    };
}

function buildAllConversationsExportFilename(exportedAt) {
    return 'opentavern_all_' + exportedAt.slice(0, 10) + '.json';
}
