/**
 * 新手导读（文件：60-library-conversation-helpers.js）
 *
 * 负责什么：这是“资料库与角色卡界面”中的“资料库、会话、辅助函数”部分。
 * 在程序中的位置：它缓存常用页面元素，并渲染本地角色、公共角色和对应操作。
 * 从哪里开始看：主要从 `findMostRecentConversationForCharacter(characterName)`、`getConversationDisplayCharacterName(conv)`、`resetConversationRuntimeState(conv)`、`removeConversationFromLibraryState(id)`、`createDefaultLibraryConversation(无参数)`、`ensureLibraryActiveConversationAfterDelete(deletedId)`，以及另外 1 个内部步骤 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：渲染函数可能反复运行；事件绑定和临时元素要避免重复创建。
 */
// ==================== Library Conversation Helpers ====================
function findMostRecentConversationForCharacter(characterName) {
    if (!characterName) return null;

    var recentId = null;
    var recentTime = 0;
    var order = getConversationIdsWithMissingFallback(state.conversationOrder, state.conversations);
    order.forEach(function(id) {
        var conv = state.conversations && state.conversations[id];
        if (conv && conv.character && conv.character.name === characterName) {
            var t = getConversationActivityTimestamp(conv);
            if (!recentId || t > recentTime) {
                recentTime = t;
                recentId = id;
            }
        }
    });
    return recentId ? state.conversations[recentId] : null;
}

function getConversationDisplayCharacterName(conv) {
    if (conv && conv.character && conv.character.name) return conv.character.name;
    if (!conv || !isGroupChat(conv) || !conv.group || !Array.isArray(conv.group.members)) return null;

    var firstMember = conv.group.members[0];
    if (!firstMember || !firstMember.character || !firstMember.character.name) return null;
    return firstMember.character.name;
}

function resetConversationRuntimeState(conv) {
    if (!conv) return;
    conv._showAllMessages = false;
    conv._lastRenderedVisibleCount = 0;
    conv._historyWindow = 150;
    conv._historyScrollHandler = null;
    conv._wiCache = null;
}

function removeConversationFromLibraryState(id) {
    delete state.conversations[id];
    state.conversationOrder = (state.conversationOrder || []).filter(function(x) { return x !== id; });
}

function createDefaultLibraryConversation() {
    var conv = defaultConversation();
    state.conversations[conv.id] = conv;
    state.conversationOrder.push(conv.id);
    return conv;
}

function ensureLibraryActiveConversationAfterDelete(deletedId) {
    if (state.activeConvId !== deletedId) return;
    var nextId = getMostRecentConversationIdFromOrder(
        getConversationIdsWithMissingFallback(state.conversationOrder, state.conversations),
        state.conversations
    );
    if (nextId) {
        state.activeConvId = nextId;
        return;
    }
    state.activeConvId = createDefaultLibraryConversation().id;
}

function deleteConversationFromLibraryState(id) {
    removeConversationFromLibraryState(id);
    ensureLibraryActiveConversationAfterDelete(id);
}
