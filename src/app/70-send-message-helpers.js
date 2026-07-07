// ==================== Send Message Helpers ====================
function appendUserMessageToConversation(conv, text) {
    conv.messages.push({ role: 'user', content: text });
    conv.updated = Date.now();
    conv._wiBudgetWarning = false;
    if (conv.title === t('title_new_chat_match')) {
        conv.title = text.slice(0, 50) + (text.length > 50 ? '...' : '');
    }
}

function getMentionedGroupSpeakerForMessage(text, conv) {
    if (pendingGroupMention) {
        var mentioned = pendingGroupMention;
        clearPendingGroupMention();
        return mentioned;
    }
    return parseGroupMention(text, conv);
}

function prepareGroupSpeakerForUserMessage(conv, text) {
    if (!isGroupChat(conv)) return;

    var mentioned = getMentionedGroupSpeakerForMessage(text, conv);
    conv._nextGroupSpeaker = mentioned || getNextGroupSpeaker(conv);
}

function resetMessageComposerInput() {
    dom.messageInput.value = '';
    dom.messageInput.style.height = 'auto';
    clearPendingGroupMention();
}
