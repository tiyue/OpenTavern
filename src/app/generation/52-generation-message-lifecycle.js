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
    var generationContext = state._generationRuntime;
    var operation = state._promptBuildOperation || generationContext && generationContext.operation;
    if (operation && !(generationContext && generationContext.controller && state.abortController === generationContext.controller)) operation.cancelled = true;
    if (state.abortController) {
        state.abortController.abort();
    } else if (state.isGenerating && state._promptBuildPendingSequence) {
        state.isGenerating = false;
        appStore.notify('isGenerating');
    }
}

function isolatePrimaryStageContentWithSettings(content, settings) {
    var text = String(content == null ? '' : content);
    if (!settings || !settings.twoStageEnabled) return text;
    return typeof stripSecondStageOptionBlocks === 'function' ? stripSecondStageOptionBlocks(text) : isolatePrimaryStageContent(text);
}

function ensureMessageIdentity(msg, stage) {
    if (!msg) return msg;
    if (!msg.id) msg.id = makeId();
    if (stage && !msg.stage) msg.stage = stage;
    msg.revision = getMessageRevision(msg);
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

function updateStreamingBubble(fullContent, conv, label, fullCot, stage, generationContext) {
    var ids = getGenerationStreamingIds(stage);
    var settings = generationContext && generationContext.settings || state.settings;
    var groupRendering = typeof isGroupChat === 'function' && isGroupChat(conv);
    var renderCharacter = groupRendering && typeof getCurrentSpeakerCharacter === 'function'
        ? getCurrentSpeakerCharacter(conv)
        : (conv && conv.character);
    var renderContext = { conv: conv, character: renderCharacter, settings: settings, stage: stage || 'main' };
    var preparedDisplay = prepareMessageDisplay({
        text: fullContent,
        context: renderContext,
        stage: stage || 'main',
        messageRole: 'assistant',
        sourcePlacement: 'AI_OUTPUT',
        isolatePrimary: stage !== 'second',
        settings: settings
    });
    var displayContent = preparedDisplay.display.text;
    var streamKey = stage === 'second' ? 'second' : 'main';
    if (!state._streamingDisplayContent) state._streamingDisplayContent = {};
    var previousDisplayContent = state._streamingDisplayContent[streamKey] || '';
    state._streamingDisplayContent[streamKey] = displayContent;
    var streamingEl = document.getElementById(ids.content);
    if (streamingEl) {
        renderStreamingAssistantContent(streamingEl, displayContent, renderContext, !previousDisplayContent, preparedDisplay);
        var cotEl = document.getElementById(ids.cot);
        if (cotEl) cotEl.innerHTML = renderCotBlock(fullCot, true, renderContext);
    } else {
        var div = document.createElement('div');
        div.id = ids.message;
        div.className = 'msg-assistant flex justify-start msg-enter';
        var streamingCharacter = groupRendering && typeof getCurrentSpeakerCharacter === 'function'
            ? getCurrentSpeakerCharacter(conv)
            : (conv && conv.character);
        div.innerHTML = '<div class="max-w-[80%]">' +
            renderAssistantSenderHtml(label || getCurrentGeneratingSpeakerName(conv), streamingCharacter) +
            '<div id="' + ids.cot + '">' + renderCotBlock(fullCot, true, renderContext) + '</div><div class="msg-bubble typing-cursor" id="' + ids.content + '"></div></div>';
        dom.messagesContainer.appendChild(div);
        renderStreamingAssistantContent(document.getElementById(ids.content), displayContent, renderContext, !previousDisplayContent, preparedDisplay);
    }
    dom.messagesContainer.scrollTop = dom.messagesContainer.scrollHeight;
}

async function finishAssistantMessage(conv, fullContent, speakerForMsg, stage, parentId, fullCot, usage, completion, generationContext) {
    if (!conv || !fullContent) return null;
    var content = generationContext ? isolatePrimaryStageContentWithSettings(fullContent, generationContext.settings) : fullContent;
    var pushObj = { role: 'assistant', content: content, id: makeId() };
    if (fullCot) pushObj.cot = fullCot;
    if (speakerForMsg) pushObj.speaker = speakerForMsg;
    if (stage) pushObj.stage = stage;
    if (parentId) pushObj.parentId = parentId;
    if (usage) pushObj.usage = usage;
    if (completion && completion.interrupted) pushObj.interrupted = true;
    pushObj.revision = getMessageRevision(pushObj);
    await persistConversationMessageMutation(conv, function(candidate) {
        candidate.messages.push(pushObj);
        return pushObj;
    });
    appendFinalAssistantMessage(conv, fullContent, fullCot);
    renderTokenBar();
    var savedMessage = conv.messages.find(function(message) { return message.id === pushObj.id; });
    if (generationContext && generationContext.operation && savedMessage && typeof capturePromptBuildSource === 'function') {
        generationContext.operation.rebindSourceAfterSave(capturePromptBuildSource(conv), savedMessage);
    }
    return savedMessage;
}
