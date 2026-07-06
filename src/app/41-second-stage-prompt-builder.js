function findLinkedSecondStageMessage(conv, parentMsg) {
    if (!conv || !parentMsg || !Array.isArray(conv.messages)) return null;
    ensureMessageIdentity(parentMsg, 'main');
    for (var i = conv.messages.length - 1; i >= 0; i--) {
        var m = conv.messages[i];
        if (m && m.role === 'assistant' && m.stage === 'second' && m.parentId === parentMsg.id) {
            return m;
        }
    }
    return null;
}

function findPreviousMainAssistantMessage(conv, currentMainMsg) {
    if (!conv || !currentMainMsg || !Array.isArray(conv.messages)) return null;
    var currentIdx = conv.messages.indexOf(currentMainMsg);
    if (currentIdx < 0) currentIdx = conv.messages.length;
    for (var i = currentIdx - 1; i >= 0; i--) {
        var m = conv.messages[i];
        if (m && m.role === 'assistant' && m.stage !== 'second') {
            return m;
        }
    }
    return null;
}

function findLatestUserMessageBefore(conv, targetMsg) {
    if (!conv || !targetMsg || !Array.isArray(conv.messages)) return null;
    var targetIdx = conv.messages.indexOf(targetMsg);
    if (targetIdx < 0) targetIdx = conv.messages.length;
    for (var i = targetIdx - 1; i >= 0; i--) {
        var m = conv.messages[i];
        if (m && m.role === 'user') return m;
    }
    return null;
}

function buildSecondStageRecentContextMessages(conv, firstStageMessage, charName, userName) {
    var messages = [];
    var previousMain = findPreviousMainAssistantMessage(conv, firstStageMessage);
    var previousSecond = findLinkedSecondStageMessage(conv, previousMain);
    var currentUser = findLatestUserMessageBefore(conv, firstStageMessage);

    if (previousMain && previousMain.content) {
        messages.push({
            role: 'assistant',
            content: '[上一轮正文]\n' + replacePlaceholders(previousMain.content || '', charName, userName)
        });
    }
    if (previousSecond && previousSecond.content) {
        messages.push({
            role: 'assistant',
            content: '[上一轮第二阶段输出]\n' + replacePlaceholders(previousSecond.content || '', charName, userName)
        });
    }
    if (currentUser && currentUser.content) {
        messages.push({
            role: 'user',
            content: '[当前用户消息]\n' + replacePlaceholders(currentUser.content || '', charName, userName)
        });
    }
    if (firstStageMessage && firstStageMessage.content) {
        messages.push({
            role: 'assistant',
            content: '[本轮刚生成的正文]\n' + replacePlaceholders(firstStageMessage.content || '', charName, userName)
        });
    }

    return messages;
}

function buildMessagesForSecondStage(firstStageMessage) {
    var conv = getActiveConv();
    normalizeConversation(conv);

    var isGroup = isGroupChat(conv);
    var currentChar = isGroup ? getCurrentSpeakerCharacter(conv) : conv.character;
    var charName = currentChar ? currentChar.name : (conv.character ? conv.character.name : 'Assistant');
    var userName = state.settings.userName || 'User';

    var secondPrompt = (state.settings.twoStageSystemPrompt || DEFAULT_TWO_STAGE_PROMPT || '').trim();
    var apiMessages = [];
    if (secondPrompt) {
        apiMessages.push({ role: 'system', content: replacePlaceholders(secondPrompt, charName, userName) });
    }

    if (state.settings.twoStageIncludeRecentContext) {
        return apiMessages.concat(buildSecondStageRecentContextMessages(conv, firstStageMessage, charName, userName));
    }

    if (firstStageMessage && firstStageMessage.content) {
        apiMessages.push({
            role: 'assistant',
            content: replacePlaceholders(firstStageMessage.content || '', charName, userName)
        });
    }

    return apiMessages;
}
