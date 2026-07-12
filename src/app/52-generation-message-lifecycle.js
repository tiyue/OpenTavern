/**
 * 新手导读（文件：52-generation-message-lifecycle.js）
 *
 * 负责什么：这是“回复生成主流程”中的“内容生成、消息、生命周期”部分。
 * 在程序中的位置：它串联提示词、模型调用、流式气泡、消息保存和可选的二段生成。
 * 从哪里开始看：主要从 `stopGeneration(无参数)`、`ensureMessageIdentity(msg, stage)`、`getLinkedSecondStageIndexes(conv, parentMsg)`、`removeLinkedSecondStageMessages(conv, parentMsg)`、`updateStreamingBubble(fullContent, conv, label, fullCot, stage)`、`finishAssistantMessage(conv, fullContent, speakerForMsg, stage, parentId, fullCot)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：主回复与二段结果必须保持独立并通过 parentId 关联，避免选项混入正文。
 */
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
    // parentId 将二段结果绑定到对应正文，重生成正文时可精确清理旧结果。
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
