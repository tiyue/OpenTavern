// ==================== Message Action Helpers ====================
function resetConversationAfterMessageMutation(conv) {
    conv.updated = Date.now();
    conv._wiCache = null;
    conv._lastRenderedVisibleCount = 0;
}

function persistAndRenderMessageMutation(conv, renderConversationList) {
    resetConversationAfterMessageMutation(conv);
    persistState();
    renderMessagesOnly();
    if (renderConversationList) renderConversationListOnly();
}

function deleteUserMessageWithReplies(conv, actualIdx) {
    var deleteCount = 1;
    var scanIdx = actualIdx + 1;
    while (scanIdx < conv.messages.length && conv.messages[scanIdx].role === 'assistant') {
        deleteCount++;
        scanIdx++;
        if (deleteCount >= 3) break;
    }
    conv.messages.splice(actualIdx, deleteCount);
}

function deleteAssistantMessageAt(conv, actualIdx) {
    var msg = conv.messages[actualIdx];
    if (!msg) return;
    if (msg.stage !== 'second') {
        removeLinkedSecondStageMessages(conv, msg);
        actualIdx = conv.messages.indexOf(msg);
    }
    conv.messages.splice(actualIdx, 1);
}

function findSecondStageParentMessage(conv, msg) {
    return conv.messages.find(function(m) {
        return m && m.id && m.id === msg.parentId;
    });
}

function removeSecondStageMessageForRegeneration(conv, actualIdx) {
    var msg = conv.messages[actualIdx];
    if (!msg) return null;
    var parent = findSecondStageParentMessage(conv, msg);
    conv.messages.splice(actualIdx, 1);
    persistAndRenderMessageMutation(conv, false);
    return parent;
}

function removePrimaryAssistantMessageForRegeneration(conv, msg) {
    removeLinkedSecondStageMessages(conv, msg);
    var actualIdx = conv.messages.indexOf(msg);
    if (actualIdx >= 0) conv.messages.splice(actualIdx, 1);
    persistAndRenderMessageMutation(conv, true);
}
