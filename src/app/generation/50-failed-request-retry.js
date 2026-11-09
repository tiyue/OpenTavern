// A failed request can only be replayed by an explicit click against the same local context.
function failedRequestSettingsStamp(settings) {
    return JSON.stringify(['apiEndpoint', 'apiProtocol', 'apiKey', 'model', 'maxTokens', 'contextLength', 'temperature', 'topP', 'frequencyPenalty', 'presencePenalty', 'systemPrompt', 'postHistoryInstructions', 'promptPostProcessing', 'reasoningEffort', 'thinking', 'activePresetId', 'sillyTavernPreset'].map(function(key) { return settings && settings[key]; }));
}

function offerFailedRequestRetry(generationContext, messages, onToken, onComplete, onError, requestOptions) {
    var conv = generationContext && generationContext.conversation;
    if (typeof document === 'undefined' || !conv || !dom.messagesContainer || getActiveConv() !== conv || !isLiveConversation(conv)) return;
    var previous = document.getElementById('failedRequestRetryNotice'); if (previous) previous.remove();
    var source = streamDraftSource(conv), settingsStamp = failedRequestSettingsStamp(generationContext.settings);
    if (failedRequestSettingsStamp(state.settings) !== settingsStamp || requestOptions.retrySource && !isPromptBuildSourceCurrent(requestOptions.retrySource) || generationContext.operation && generationContext.operation.source && !isPromptBuildSourceCurrent(generationContext.operation.source)) return;
    var notice = document.createElement('div'); notice.id = 'failedRequestRetryNotice'; notice.className = 'feature-inline';
    var text = document.createElement('span'); text.textContent = '请求失败。可在原上下文中重试。';
    var retry = document.createElement('button'); retry.type = 'button'; retry.textContent = '重试上次请求';
    var close = document.createElement('button'); close.type = 'button'; close.textContent = '关闭'; close.onclick = function() { notice.remove(); };
    retry.onclick = function() {
        if (state.isGenerating || !isLiveConversation(conv) || getActiveConv() !== conv || streamDraftSource(conv) !== source || failedRequestSettingsStamp(state.settings) !== settingsStamp) {
            text.textContent = '会话、消息或连接设置已变化，请重新发送。'; retry.disabled = true; return;
        }
        notice.remove();
        var operation = generationContext.operation || createPromptBuildOperation(0, conv);
        operation.sequence = ++activePromptBuildSequence; operation.cancelled = false; operation.settled = false;
        if (typeof capturePromptBuildSource === 'function') operation.setSource(capturePromptBuildSource(conv));
        generationContext.operation = operation; generationContext.sequence = operation.sequence; generationContext.controller = null;
        var draftContext = requestOptions.draftContext || generationContext;
        delete draftContext._streamDraft; delete draftContext._streamDraftClosed;
        state._generationRuntime = generationContext; state.isGenerating = true; appStore.notify('isGenerating');
        streamChatWithMessages(messages, onToken, onComplete, onError, Object.assign({}, requestOptions, {
            generationContext: generationContext, promptBuildOperation: operation, operation: operation.sequence
        }));
    };
    notice.append(text, retry, close); dom.messagesContainer.before(notice);
}
