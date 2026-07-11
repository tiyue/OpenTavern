// ==================== Generation Message Lifecycle ====================
function stopGeneration() {
    if (state.abortController) {
        state.abortController.abort();
        state.abortController = null;
        state.isGenerating = false;
        appStore.notify('isGenerating');
    }
    if (state._webllmAbort) {
        try { state._webllmAbort(); } catch (e) {}
        state._webllmAbort = null;
    }
}

function ensureMessageIdentity(msg, stage) {
    if (!msg) return msg;
    if (!msg.id) msg.id = makeId();
    if (stage && !msg.stage) msg.stage = stage;
    return msg;
}

function getLinkedSecondStageIndexes(conv, parentMsg) {
    if (!conv || !parentMsg) return [];
    ensureMessageIdentity(parentMsg, 'main');
    var indexes = [];
    for (var i = 0; i < conv.messages.length; i++) {
        var m = conv.messages[i];
        if (m && m.role === 'assistant' && m.stage === 'second' && m.parentId === parentMsg.id) {
            indexes.push(i);
        }
    }
    return indexes;
}

function removeLinkedSecondStageMessages(conv, parentMsg) {
    var indexes = getLinkedSecondStageIndexes(conv, parentMsg);
    for (var i = indexes.length - 1; i >= 0; i--) {
        conv.messages.splice(indexes[i], 1);
    }
}

function updateStreamingBubble(fullContent, conv, label, fullCot, stage) {
    var ids = getGenerationStreamingIds(stage);
    var displayContent = stage === 'second' ? String(fullContent || '') : isolatePrimaryStageContent(fullContent);
    var streamingEl = document.getElementById(ids.content);
    if (streamingEl) {
        streamingEl.innerHTML = renderAssistantContent(displayContent);
        var cotEl = document.getElementById(ids.cot);
        if (cotEl) cotEl.innerHTML = renderCotBlock(fullCot, true);
    } else {
        var div = document.createElement('div');
        div.id = ids.message;
        div.className = 'msg-assistant flex justify-start msg-enter';
        div.innerHTML = '<div class="max-w-[80%]"><p class="text-[10px] text-zinc-500 mb-1 ml-1 font-medium">' +
            escapeHtml(label || getCurrentGeneratingSpeakerName(conv)) +
            '</p><div id="' + ids.cot + '">' + renderCotBlock(fullCot, true) + '</div><div class="msg-bubble typing-cursor" id="' + ids.content + '">' +
            renderAssistantContent(displayContent) + '</div></div>';
        dom.messagesContainer.appendChild(div);
    }
    dom.messagesContainer.scrollTop = dom.messagesContainer.scrollHeight;
}

function finishAssistantMessage(conv, fullContent, speakerForMsg, stage, parentId, fullCot) {
    if (!conv || !fullContent) return null;
    var pushObj = { role: 'assistant', content: fullContent, id: makeId() };
    if (fullCot) pushObj.cot = fullCot;
    if (speakerForMsg) pushObj.speaker = speakerForMsg;
    if (stage) pushObj.stage = stage;
    if (parentId) pushObj.parentId = parentId;
    conv.messages.push(pushObj);
    conv.updated = Date.now();
    persistState();
    appendFinalAssistantMessage(conv, fullContent, fullCot);
    renderTokenBar();
    return pushObj;
}
