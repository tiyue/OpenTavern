/**
 * 新手导读（文件：59-new-chat-workflow.js）
 *
 * 负责什么：这是“新建聊天流程”中的“新建、聊天、工作流”部分。
 * 在程序中的位置：它处理角色选择、群聊多选、首条消息、世界书关联和会话归档。
 * 从哪里开始看：主要从 `newConversation(charOrChars)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：新会话只有在角色与初始数据准备完成后才能保存和切换。
 */
// ==================== New Chat Workflow ====================
async function newConversation(charOrChars) {
    var conv;
    var previousName = currentCharacterName;
    try {
        saveCurrentConversation();
        conv = defaultConversation();
        var current = getActiveConv();
        copyWorldInfoFromCurrentConversation(conv, current);
        try {
            if (!charOrChars || !Array.isArray(charOrChars)) {
                var character = charOrChars || (current && current.character ? current.character : null);
                configureSingleCharacterConversation(conv, character);
            } else if (Array.isArray(charOrChars) && charOrChars.length >= 2) {
                configureGroupConversation(conv, charOrChars);
            } else if (Array.isArray(charOrChars) && charOrChars.length === 1) {
                configureSingleCharacterConversation(conv, charOrChars[0]);
            }
        } finally { currentCharacterName = previousName; }
        normalizeConversation(conv);
        if (typeof refreshMvuCandidate === 'function') refreshMvuCandidate(conv);
        await persistPreparedConversation(conv);
    } catch (error) {
        alert('新建聊天保存失败：' + (error.message || error));
        return null;
    }
    try {
        currentCharacterName = isGroupChat(conv) ? getGroupMembers(conv)[0].character.name : conv.character && conv.character.name || previousName;
        renderNewConversationState(conv);
        finalizeNewConversationUi();
        var greetingCharacter = isGroupChat(conv) ? getGroupMembers(conv)[0].character : conv.character;
        if (typeof openConversationGreetings === 'function' && getCharacterGreetings(greetingCharacter, isGroupChat(conv)).length > 1) openConversationGreetings(conv);
    } catch (error) { reportPersistPostSaveError('new conversation UI', error); }
    return conv;
}

// Phase 4: Show character picker when creating new chat
// Stage 1 MVP: supports multi-select group chat creation.
