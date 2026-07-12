/**
 * 新手导读（文件：63-conversation-export-helpers.js）
 *
 * 负责什么：这是“会话导入导出”中的“会话、导出、辅助函数”部分。
 * 在程序中的位置：它把聊天记录转换成文件，或把外部记录合并为内部会话。
 * 从哪里开始看：主要从 `getConversationExportRecords(无参数)`、`getConversationExportOrder(无参数)`、`buildSingleConversationExportData(conversation, exportedAt)`、`buildSingleConversationExportFilename(conversation)`、`buildAllConversationsExportData(conversations, exportedAt)`、`buildAllConversationsExportFilename(exportedAt)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：导入内容可能不完整或重复，必须先规范化再写入现有状态。
 */
// ==================== Conversation Export Helpers ====================
function getConversationExportRecords() {
    return getConversationIdsWithMissingFallback(state.conversationOrder, state.conversations).map(function(id) {
        return state.conversations[id];
    }).filter(Boolean);
}

function getConversationExportOrder() {
    return getConversationIdsWithMissingFallback(state.conversationOrder, state.conversations);
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
        conversationOrder: getConversationExportOrder(),
        characters: state.characters || {},
        worldBooks: state.worldBooks || {},
        charactersMigrated: !!state._charactersMigrated
    };
}

function buildAllConversationsExportFilename(exportedAt) {
    return 'opentavern_all_' + exportedAt.slice(0, 10) + '.json';
}
