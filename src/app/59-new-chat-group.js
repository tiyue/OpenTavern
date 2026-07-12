/**
 * 新手导读（文件：59-new-chat-group.js）
 *
 * 负责什么：这是“新建聊天流程”中的“新建、聊天、群聊”部分。
 * 在程序中的位置：它处理角色选择、群聊多选、首条消息、世界书关联和会话归档。
 * 从哪里开始看：主要从 `createNewChatGroupMembers(characters)`、`createNewChatGroupMetadata(characters, members)`、`configureGroupConversation(conv, characters)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：新会话只有在角色与初始数据准备完成后才能保存和切换。
 */
// ==================== New Chat Group Helpers ====================
function createNewChatGroupMembers(characters) {
    return characters.map(function(char, idx) {
        return {
            character: JSON.parse(JSON.stringify(char)),
            muted: false,
            order: idx
        };
    });
}

function createNewChatGroupMetadata(characters, members) {
    return {
        id: makeId(),
        name: characters.map(function(c) { return c.name; }).join('、') + ' 的群聊',
        members: members,
        replyStrategy: 'list_order',
        generationMode: 'switch',
        mergeIncludeMuted: false,
        scenarioOverride: null,
        allowSelfResponse: false,
        autoMode: false
    };
}

function configureGroupConversation(conv, characters) {
    if (!conv || !Array.isArray(characters) || characters.length < 2) return;
    var members = createNewChatGroupMembers(characters);
    conv.group = createNewChatGroupMetadata(characters, members);

    var firstChar = members[0].character;
    appendCharacterFirstMessage(conv, firstChar, { speaker: firstChar && firstChar.name });

    conv.title = conv.group.name;
    if (members.length > 0) {
        currentCharacterName = members[0].character.name;
    }
}
