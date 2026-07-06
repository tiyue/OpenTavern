// ==================== Message Delete/Regenerate Actions ====================
function deleteMessage(actualIdx) {
    var conv = getActiveConv();
    if (!conv) return;

    var msg = conv.messages[actualIdx];
    if (!msg) return;

    if (msg.role === 'user') {
        var deleteCount = 1;
        var scanIdx = actualIdx + 1;
        while (scanIdx < conv.messages.length && conv.messages[scanIdx].role === 'assistant') {
            deleteCount++;
            scanIdx++;
            if (deleteCount >= 3) break;
        }
        conv.messages.splice(actualIdx, deleteCount);
    } else {
        if (msg.stage !== 'second') {
            removeLinkedSecondStageMessages(conv, msg);
            actualIdx = conv.messages.indexOf(msg);
        }
        conv.messages.splice(actualIdx, 1);
    }

    conv.updated = Date.now();
    conv._wiCache = null;
    conv._lastRenderedVisibleCount = 0;
    persistState();
    renderMessagesOnly();
    renderConversationListOnly();
}

function regenerateMessage(actualIdx) {
    if (state.isGenerating) return;

    var conv = getActiveConv();
    if (!conv) return;

    var msg = conv.messages[actualIdx];
    if (!msg || msg.role !== 'assistant') return;

    if (msg.stage === 'second') {
        var parent = conv.messages.find(function(m) { return m && m.id && m.id === msg.parentId; });
        conv.messages.splice(actualIdx, 1);
        conv.updated = Date.now();
        conv._wiCache = null;
        conv._lastRenderedVisibleCount = 0;
        persistState();
        renderMessagesOnly();
        if (parent) runSecondStageGeneration(parent, function() { completeGenerationTurn(conv); });
        return;
    }

    removeLinkedSecondStageMessages(conv, msg);
    actualIdx = conv.messages.indexOf(msg);
    if (actualIdx >= 0) conv.messages.splice(actualIdx, 1);
    conv.updated = Date.now();
    conv._wiCache = null;
    conv._lastRenderedVisibleCount = 0;
    persistState();
    renderMessagesOnly();
    renderConversationListOnly();

    var lastMsg = conv.messages[conv.messages.length - 1];
    if (!lastMsg || lastMsg.role !== 'user') return;

    if (isGroupChat(conv)) {
        var mentioned = parseGroupMention(lastMsg.content || '', conv);
        conv._nextGroupSpeaker = mentioned || getNextGroupSpeaker(conv);
    }

    var start = function() {
        streamChat(
            function onToken(token, fullContent, fullCot) {
                updateStreamingBubble(fullContent, conv, getCurrentGeneratingSpeakerName(conv), fullCot);
            },
            handlePrimaryAssistantComplete,
            function onError(err) {
                var streamingEl = document.getElementById('streamingMsg');
                if (streamingEl) streamingEl.remove();
                state.isGenerating = false;
                appStore.notify('isGenerating');
                renderMessagesOnly();
                alert('Error: ' + (err.message || err));
            }
        );
        updateInputState();
    };

    if (isWebLLMBackend()) {
        ensureWebLLMEngine(getWebLLMModelId()).then(start).catch(function(e) {
            state.isGenerating = false;
            appStore.notify('isGenerating');
            renderMessagesOnly();
            alert('Error: ' + (e.message || e));
        });
    } else {
        start();
    }
}
