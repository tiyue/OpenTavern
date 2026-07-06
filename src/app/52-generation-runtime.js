// ==================== Generation Runtime ====================
// ==================== WebLLM 本地生成（仅在 ensure 成功后调用） ====================
async function streamChatWebLLMWithMessages(messages, onToken, onComplete, onError, requestOptions) {
    var modelId = getWebLLMModelId();
    if (!webllmEngine || webllmCurrentModel !== modelId) {
        onError(new Error('本地引擎未就绪，请在设置中重新初始化 WebLLM 模型'));
        return;
    }

    state.isGenerating = true;
    appStore.notify('isGenerating');

    // WebLLM 使用与远程相同的消息格式
    var settings = state.settings;
    requestOptions = requestOptions || {};
    var captureCot = !!settings.requestCotEnabled && requestOptions.requestCot !== false;
    var req = {
        messages: messages,
        max_tokens: requestOptions.maxTokens || settings.maxTokens || 1024,
        temperature: typeof requestOptions.temperature === 'number' ? requestOptions.temperature : (typeof settings.temperature === 'number' ? settings.temperature : 0.7),
        top_p: typeof requestOptions.topP === 'number' ? requestOptions.topP : (typeof settings.topP === 'number' ? settings.topP : 0.9),
        stream: true
    };

    // 用于停止
    var aborted = false;
    state._webllmAbort = function() { aborted = true; };

    try {
        // stream: true 返回 async iterable
        const stream = await webllmEngine.chat.completions.create(req);
        var fullContent = '';
        var fullCot = '';

        for await (const chunk of stream) {
            if (aborted) break;
            var delta = chunk && chunk.choices && chunk.choices[0] && chunk.choices[0].delta;
            var cotDelta = captureCot ? extractCotDelta(delta) : '';
            var contentDelta = delta && delta.content ? delta.content : '';
            if (cotDelta) fullCot += cotDelta;
            if (contentDelta) fullContent += contentDelta;
            if (contentDelta || cotDelta) {
                var parts = captureCot ? splitInlineCot(fullContent, fullCot) : { content: fullContent, cot: '' };
                onToken(contentDelta, parts.content, parts.cot);
            }
        }

        state.isGenerating = false;
        appStore.notify('isGenerating');
        state._webllmAbort = null;
        var finalParts = captureCot ? splitInlineCot(fullContent || '', fullCot) : { content: fullContent || '', cot: '' };
        onComplete(finalParts.content, finalParts.cot);
    } catch (e) {
        state.isGenerating = false;
        appStore.notify('isGenerating');
        state._webllmAbort = null;
        if (aborted || (e && e.name === 'AbortError')) {
            var abortParts = captureCot ? splitInlineCot(fullContent || '', fullCot) : { content: fullContent || '', cot: '' };
            onComplete(abortParts.content, abortParts.cot);
        } else {
            onError(e);
        }
    }
}

async function streamChatWebLLM(onToken, onComplete, onError) {
    var messages;
    try {
        messages = buildMessagesForAPI();
    } catch (err) {
        console.error('buildMessagesForAPI failed:', err);
        state.isGenerating = false;
        appStore.notify('isGenerating');
        onError(new Error('构建提示词时出错：' + (err.message || err)));
        return;
    }
    return streamChatWebLLMWithMessages(messages, onToken, onComplete, onError);
}

function stopGeneration() {
    if (state.abortController) {
        state.abortController.abort();
        state.abortController = null;
        state.isGenerating = false;
        appStore.notify('isGenerating');
    }
    // WebLLM 停止
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

function updateStreamingBubble(fullContent, conv, label, fullCot) {
    var streamingEl = document.getElementById('streamingContent');
    if (streamingEl) {
        streamingEl.innerHTML = renderAssistantContent(fullContent);
        var cotEl = document.getElementById('streamingCot');
        if (cotEl) cotEl.innerHTML = renderCotBlock(fullCot, true);
    } else {
        var div = document.createElement('div');
        div.id = 'streamingMsg';
        div.className = 'msg-assistant flex justify-start msg-enter';
        div.innerHTML = '<div class="max-w-[80%]"><p class="text-[10px] text-zinc-500 mb-1 ml-1 font-medium">' +
            escapeHtml(label || getCurrentGeneratingSpeakerName(conv)) +
            '</p><div id="streamingCot">' + renderCotBlock(fullCot, true) + '</div><div class="msg-bubble typing-cursor" id="streamingContent">' +
            renderAssistantContent(fullContent) + '</div></div>';
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

function runSecondStageGeneration(firstStageMessage, onDone) {
    var conv = getActiveConv();
    if (!conv || !firstStageMessage) {
        if (onDone) onDone();
        return;
    }
    ensureMessageIdentity(firstStageMessage, 'main');

    function startSecondStage() {
        var messages;
        try {
            messages = buildMessagesForSecondStage(firstStageMessage);
        } catch (err) {
            console.error('buildMessagesForSecondStage failed:', err);
            alert('构建第二阶段提示词时出错：' + (err.message || err));
            if (onDone) onDone(err);
            return;
        }

        streamChatWithMessages(
            messages,
            function onToken(token, fullContent, fullCot) {
                updateStreamingBubble(fullContent, conv, t('two_stage_sender') || '第二阶段', fullCot);
            },
            function onComplete(fullContent, fullCot) {
                var streamingEl = document.getElementById('streamingMsg');
                if (streamingEl) streamingEl.remove();
                var c = getActiveConv();
                if (c && fullContent) {
                    var speaker = firstStageMessage.speaker || null;
                    finishAssistantMessage(c, fullContent, speaker, 'second', firstStageMessage.id, fullCot);
                }
                state.isGenerating = false;
                appStore.notify('isGenerating');
                if (onDone) onDone(null);
            },
            function onError(err) {
                var streamingEl = document.getElementById('streamingMsg');
                if (streamingEl) streamingEl.remove();
                state.isGenerating = false;
                appStore.notify('isGenerating');
                renderMessagesOnly();
                alert('第二阶段生成失败：' + (err.message || err));
                if (onDone) onDone(err);
            },
            {
                temperature: typeof state.settings.twoStageTemperature === 'number' ? state.settings.twoStageTemperature : 0.3,
                topP: typeof state.settings.twoStageTopP === 'number' ? state.settings.twoStageTopP : 0.85,
                maxTokens: Math.min(state.settings.maxTokens || 1024, 1024)
            }
        );
    }

    if (isWebLLMBackend()) {
        ensureWebLLMEngine(getWebLLMModelId()).then(startSecondStage).catch(function(e) {
            var msg = (e && e.message === 'NO_WEBGPU') ? (t('webllm_init_no_webgpu') || '需要 WebGPU 支持') : (e && e.message) || String(e);
            alert('本地模型错误: ' + msg);
            if (state && state.settings) state.settings.inferenceBackend = 'remote-api';
            persistState();
            if (onDone) onDone(e);
        });
    } else {
        startSecondStage();
    }
}

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

// ==================== Conversation Management ====================
function saveCurrentConversation() {
    var conv = getActiveConv();
    if (!conv) return;
    var hasMessages = conv.messages.some(function(m) { return m.role !== 'system'; });
    if (!hasMessages) return;
    conv.updated = Date.now();
    if (conv.title === t('title_new_chat_match')) {
        var firstUser = conv.messages.find(function(m) { return m.role === 'user'; });
        if (firstUser) {
            conv.title = firstUser.content.slice(0, 50) + (firstUser.content.length > 50 ? '...' : '');
        } else {
            conv.title = t('chat_title_default') + new Date(conv.created).toLocaleDateString();
        }
    }
    persistState();
}
