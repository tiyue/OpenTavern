// ==================== WebLLM Generation Runtime ====================
async function streamChatWebLLMWithMessages(messages, onToken, onComplete, onError, requestOptions) {
    var modelId = getWebLLMModelId();
    if (!webllmEngine || webllmCurrentModel !== modelId) {
        onError(new Error('本地引擎未就绪，请在设置中重新初始化 WebLLM 模型'));
        return;
    }

    state.isGenerating = true;
    appStore.notify('isGenerating');

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

    var aborted = false;
    state._webllmAbort = function() { aborted = true; };

    try {
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
