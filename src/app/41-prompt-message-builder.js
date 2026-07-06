function buildMessagesForAPI() {
    var conv = getActiveConv();
    normalizeConversation(conv);

    var isGroup = isGroupChat(conv);
    var currentChar = isGroup ? getCurrentSpeakerCharacter(conv) : conv.character;
    var charName = currentChar ? currentChar.name : (conv.character ? conv.character.name : 'Assistant');
    var userName = state.settings.userName || 'User';
    var maxMsgs = state.settings.contextLength;

    var wiResult = getActivatedWorldInfo(conv);
    var wiByPos = wiResult.byPosition || {};
    var systemContent = isGroup
        ? buildGroupSystemPrompt(conv, wiByPos)
        : buildSystemPrompt(conv.character, wiByPos);

    var apiMessages = [];
    var presetBuckets = buildSillyTavernPresetMessageBuckets(charName, userName);
    var finalSystemContent = systemContent || '';

    if (finalSystemContent) {
        apiMessages.push({ role: 'system', content: finalSystemContent });
    }

    if (presetBuckets.beforeHistory.length > 0) {
        apiMessages = apiMessages.concat(presetBuckets.beforeHistory.map(function(m) {
            return { role: m.role, content: m.content };
        }));
    }

    var summaryMessage = buildPromptSummaryMessage(conv.summaries, state.settings.lang || 'zh-CN');
    if (summaryMessage) apiMessages.push(summaryMessage);

    apiMessages = apiMessages.concat(getRegularPromptMessages(conv, maxMsgs));

    if (presetBuckets.afterHistory.length > 0) {
        apiMessages = apiMessages.concat(presetBuckets.afterHistory.map(function(m) {
            return { role: m.role, content: m.content };
        }));
    }

    var depthEntries = wiByPos[WI_POS.AT_DEPTH] || [];
    insertMessagesAtDepth(apiMessages, depthEntries, charName, userName);
    insertMessagesAtDepth(apiMessages, presetBuckets.inChat, charName, userName);

    resolvePromptOutletPlaceholders(apiMessages, wiResult.outlets || {}, charName, userName);
    return replacePromptMessagePlaceholders(apiMessages, charName, userName);
}

function formatPromptMessages(messages) {
    var text = '';
    for (var i = 0; i < messages.length; i++) {
        var role = String(messages[i].role || '').toUpperCase();
        var content = messages[i].content || '';
        if (content) {
            text += '=== ' + role + ' ===\n';
            text += content + '\n\n';
        }
    }
    return text;
}
