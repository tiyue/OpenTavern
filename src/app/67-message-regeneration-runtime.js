// ==================== Message Regeneration Runtime ====================
function prepareGroupSpeakerForRegeneration(conv, lastMsg) {
    if (!isGroupChat(conv)) return;
    var mentioned = parseGroupMention(lastMsg.content || '', conv);
    conv._nextGroupSpeaker = mentioned || getNextGroupSpeaker(conv);
}

function handlePrimaryRegenerationError(err) {
    var streamingEl = document.getElementById('streamingMsg');
    if (streamingEl) streamingEl.remove();
    state.isGenerating = false;
    appStore.notify('isGenerating');
    renderMessagesOnly();
    alert('Error: ' + (err.message || err));
}

function startPrimaryMessageRegeneration(conv) {
    var start = function() {
        streamChat(
            function onToken(token, fullContent, fullCot) {
                updateStreamingBubble(fullContent, conv, getCurrentGeneratingSpeakerName(conv), fullCot);
            },
            handlePrimaryAssistantComplete,
            handlePrimaryRegenerationError
        );
        updateInputState();
    };

    if (isWebLLMBackend()) {
        ensureWebLLMEngine(getWebLLMModelId()).then(start).catch(handlePrimaryRegenerationError);
    } else {
        start();
    }
}

