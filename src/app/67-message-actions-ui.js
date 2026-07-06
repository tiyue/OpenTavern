// ==================== Message Delete/Regenerate Actions ====================
function deleteMessage(actualIdx) {
    var conv = getActiveConv();
    if (!conv) return;

    var msg = conv.messages[actualIdx];
    if (!msg) return;

    if (msg.role === 'user') {
        deleteUserMessageWithReplies(conv, actualIdx);
    } else {
        deleteAssistantMessageAt(conv, actualIdx);
    }

    persistAndRenderMessageMutation(conv, true);
}

function regenerateMessage(actualIdx) {
    if (state.isGenerating) return;

    var conv = getActiveConv();
    if (!conv) return;

    var msg = conv.messages[actualIdx];
    if (!msg || msg.role !== 'assistant') return;

    if (msg.stage === 'second') {
        var parent = removeSecondStageMessageForRegeneration(conv, actualIdx);
        if (parent) runSecondStageGeneration(parent, function() { completeGenerationTurn(conv); });
        return;
    }

    removePrimaryAssistantMessageForRegeneration(conv, msg);

    var lastMsg = conv.messages[conv.messages.length - 1];
    if (!lastMsg || lastMsg.role !== 'user') return;

    prepareGroupSpeakerForRegeneration(conv, lastMsg);
    startPrimaryMessageRegeneration(conv);
}
