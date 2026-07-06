// ==================== Generation Turn Runtime ====================
function completeGenerationTurn(conv) {
    if (!conv) return;
    if (isGroupChat(conv)) {
        conv._nextGroupSpeaker = getNextGroupSpeaker(conv);
    } else {
        delete conv._nextGroupSpeaker;
    }
    conv.updated = Date.now();
    persistState();
    state.isGenerating = false;
    appStore.notify('isGenerating');
    renderTokenBar();
    if (state.settings.summaryEnabled) {
        setTimeout(function() { autoSummarize(); }, 500);
    }
}

function handlePrimaryAssistantComplete(fullContent, fullCot) {
    var streamingEl = document.getElementById('streamingMsg');
    if (streamingEl) streamingEl.remove();
    var conv = getActiveConv();
    if (!conv || !fullContent) {
        state.isGenerating = false;
        appStore.notify('isGenerating');
        return;
    }

    var speakerForMsg = isGroupChat(conv)
        ? (conv._nextGroupSpeaker ? conv._nextGroupSpeaker.name : getCurrentGeneratingSpeakerName(conv))
        : null;
    var firstStageMsg = finishAssistantMessage(conv, fullContent, speakerForMsg, 'main', null, fullCot);

    if (state.settings.twoStageEnabled && firstStageMsg) {
        runSecondStageGeneration(firstStageMsg, function() {
            completeGenerationTurn(conv);
        });
    } else {
        completeGenerationTurn(conv);
    }
}
