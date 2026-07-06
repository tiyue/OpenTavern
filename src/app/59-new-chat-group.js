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
