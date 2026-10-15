/**
 * 新手导读（文件：63-conversation-import-merge.js）
 *
 * 负责什么：这是“会话导入导出”中的“会话、导入、合并”部分。
 * 在程序中的位置：它把聊天记录转换成文件，或把外部记录合并为内部会话。
 * 从哪里开始看：主要从 `mergeImportedTopLevelCharacters(characters)`、`registerImportedConversationCharacters(importedConvs)`、`registerImportedConversationCharacterPreservingExisting(char)`、`mergeImportedWorldBooks(worldBooks)`、`applySuccessfulConversationImport(data, importResult)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：导入内容可能不完整或重复，必须先规范化再写入现有状态。
 */
// ==================== Conversation Import Merge Helpers ====================
function mergeImportedTopLevelCharacters(characters) {
    if (!characters || typeof characters !== 'object') return;
    if (!state.characters) state.characters = {};

    Object.keys(characters).forEach(function(key) {
        if (!state.characters[key]) {
            state.characters[key] = cloneConversationImportValue(characters[key]);
        }
    });
}

function registerImportedConversationCharacters(importedConvs) {
    if (typeof migrateCharactersToRegistry === 'function') {
        migrateCharactersToRegistry(importedConvs);
        return;
    }

    if (!state.characters) state.characters = {};
    importedConvs.forEach(function(conv) {
        registerImportedConversationCharacterPreservingExisting(conv.character);
        if (conv.group && Array.isArray(conv.group.members)) {
            conv.group.members.forEach(function(member) {
                registerImportedConversationCharacterPreservingExisting(member && member.character);
            });
        }
    });
}

function registerImportedConversationCharacterPreservingExisting(char) {
    if (!char || !char.name) return;
    var key = char.name.trim().toLowerCase();
    if (!state.characters[key]) {
        state.characters[key] = cloneConversationImportValue(char);
    }
}

function mergeImportedWorldBooks(worldBooks) {
    if (!worldBooks || typeof worldBooks !== 'object') return;
    if (!state.worldBooks) state.worldBooks = {};

    Object.keys(worldBooks).forEach(function(wbId) {
        if (!state.worldBooks[wbId]) {
            state.worldBooks[wbId] = cloneConversationImportValue(worldBooks[wbId]);
        }
    });
}

function mergeImportedPortableSettings(settings) {
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return;
    var current = state.settings || {};
    var portable = getCloudSyncPortableSettings(settings);
    var local = getCloudSyncPreservedLocalSettings(current);
    preserveCloudSyncEndpointForLocalCredential(local, current, 'apiKey', 'apiEndpoint');
    preserveCloudSyncEndpointForLocalCredential(local, current, 'summarizeApiKey', 'summarizeApiEndpoint');
    state.settings = Object.assign({}, current, portable, local);
}

function restoreImportedConversationOrder(data, importResult) {
    if (!Array.isArray(data.conversationOrder)) return;
    var restored = [];
    data.conversationOrder.forEach(function(sourceId) {
        var importedId = importResult.idMap[String(sourceId)];
        if (!importedId || !state.conversations[importedId] || restored.indexOf(importedId) >= 0) return;
        restored.push(importedId);
    });
    state.conversationOrder.forEach(function(id) {
        if (state.conversations[id] && restored.indexOf(id) < 0) restored.push(id);
    });
    state.conversationOrder = restored;
}

function restoreImportedActiveConversation(data, importResult) {
    var importedId = importResult.idMap[String(data.activeConvId || '')];
    if (importedId && state.conversations[importedId]) state.activeConvId = importedId;
}

function applySuccessfulConversationImport(data, importResult) {
    var isFullExport = isOpenTavernFullExport(data);
    mergeImportedTopLevelCharacters(data.characters);
    registerImportedConversationCharacters(importResult.conversations);
    mergeImportedWorldBooks(data.worldBooks);

    if (isFullExport) {
        mergeImportedPortableSettings(data.settings);
        restoreImportedConversationOrder(data, importResult);
        restoreImportedActiveConversation(data, importResult);
        if (data.charactersMigrated === true) state._charactersMigrated = true;
    }

    persistState(true);
    if (typeof updateStorageInfo === 'function') updateStorageInfo();

    if (typeof renderLibraryGrids === 'function') renderLibraryGrids();
    if (typeof renderMyCards === 'function') renderMyCards();

    if (!state.activeConvId && state.conversationOrder.length > 0) {
        var importedOrder = (importResult.conversations || []).map(function(conv) { return conv.id; });
        state.activeConvId =
            getMostRecentConversationIdFromOrder(importedOrder, state.conversations) ||
            getMostRecentConversationIdFromOrder(state.conversationOrder, state.conversations);
    }
    persistState(true);
    requestRender('activeConvId');
}
