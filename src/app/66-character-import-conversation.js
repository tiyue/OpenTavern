/**
 * 新手导读（文件：66-character-import-conversation.js）
 *
 * 负责什么：这是“导入与弹窗事件”中的“角色、导入、会话”部分。
 * 在程序中的位置：它把文件选择、提示词查看器和总结管理器的按钮连接到业务函数。
 * 从哪里开始看：主要从 `prepareConversationForImportedCharacter(无参数)`、`applyImportedCharacterToConversation(conv, character)`、`attachEmbeddedCharacterBook(json, character, conv)`、`registerImportedCharacter(character)`、`addImportedCharacterFirstMessage(conv, character)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：事件处理函数要防止重复触发，并在异步操作期间正确显示状态。
 */
// ==================== Character Import Conversation Helpers ====================
function prepareConversationForImportedCharacter() {
    var conv = getActiveConv();
    if (!conv) {
        newConversation();
        conv = getActiveConv();
    }

    var hasMsgs = conv.messages.some(function(m) { return m.role !== 'system'; });
    if (!hasMsgs) return conv;

    saveCurrentConversation();
    var oldWorldInfo = conv.worldInfo ? JSON.parse(JSON.stringify(conv.worldInfo)) : null;
    var oldWorldBookIds = Array.isArray(conv.worldBookIds) ? conv.worldBookIds.slice() : [];
    var newConv = defaultConversation();
    state.conversations[newConv.id] = newConv;
    state.conversationOrder.unshift(newConv.id);
    state.activeConvId = newConv.id;

    if (oldWorldInfo) newConv.worldInfo = oldWorldInfo;
    if (oldWorldBookIds.length > 0) newConv.worldBookIds = oldWorldBookIds;
    return newConv;
}

function applyImportedCharacterToConversation(conv, character) {
    conv.character = character;
    conv.title = t('chat_with') + character.name;
    conv.messages = [];
    currentCharacterName = character.name;
}

function attachEmbeddedCharacterBook(json, character, conv) {
    var embeddedBook = null;
    try {
        embeddedBook = importCharacterBookFromCard(json, character.name);
        if (embeddedBook) {
            conv.worldBookIds = conv.worldBookIds || [];
            if (!conv.worldBookIds.includes(embeddedBook.id)) {
                conv.worldBookIds.push(embeddedBook.id);
            }
        }
    } catch (e) {
        console.warn('Failed to import embedded character book; character import continues:', e);
    }
    return embeddedBook;
}

function registerImportedCharacter(character) {
    if (!character.name) return;
    var key = character.name.trim().toLowerCase();
    if (!state.characters) state.characters = {};
    state.characters[key] = JSON.parse(JSON.stringify(character));
}

function addImportedCharacterFirstMessage(conv, character) {
    var charName = character.name;
    var userName = state.settings.userName || 'User';
    var firstMes = replacePlaceholders(character.first_mes, charName, userName);
    if (firstMes) {
        conv.messages.push({ role: 'assistant', content: firstMes });
    }
}
