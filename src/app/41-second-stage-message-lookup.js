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

