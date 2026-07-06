// ==================== API Client ====================
function extractCotDelta(delta) {
    if (!delta) return '';
    var val = delta.reasoning_content || delta.reasoning || delta.thinking || delta.cot;
    if (typeof val === 'string') return val;
    if (val && typeof val.content === 'string') return val.content;
    if (Array.isArray(val)) {
        return val.map(function(part) {
            if (typeof part === 'string') return part;
            return part && (part.text || part.content) ? String(part.text || part.content) : '';
        }).join('');
    }
    return '';
}

function splitInlineCot(content, existingCot) {
    var text = String(content || '');
    var cot = String(existingCot || '');
    var re = /<think(?:ing)?\b[^>]*>([\s\S]*?)(?:<\/think(?:ing)?>|$)/gi;
    var match;
    while ((match = re.exec(text)) !== null) {
        if (match[1]) cot += (cot ? '\n' : '') + match[1].trim();
    }
    text = text.replace(re, '').trim();
    return { content: text, cot: cot.trim() };
}

function streamChatWithMessages(messages, onToken, onComplete, onError, requestOptions) {
    var settings = state.settings;
    if (isWebLLMBackend()) {
        streamChatWebLLMWithMessages(messages, onToken, onComplete, onError, requestOptions);
        return;
    }
    if (!settings.apiEndpoint || !settings.apiKey) {
        onError(new Error(t('no_api_error')));
        return;
    }

    var controller = new AbortController();
    state.abortController = controller;
    state.isGenerating = true;
    appStore.notify('isGenerating');

    var endpoint = normalizeApiEndpoint(settings.apiEndpoint);
    if (shouldUseOllamaCompat(settings.apiEndpoint)) {
        messages = normalizeMessagesForOllamaCompatibility(messages);
    }
    requestOptions = requestOptions || {};
    var captureCot = !!settings.requestCotEnabled && requestOptions.requestCot !== false;
    var payload = {
        model: settings.model,
        messages: messages,
        max_tokens: requestOptions.maxTokens || settings.maxTokens,
        temperature: typeof requestOptions.temperature === 'number' ? requestOptions.temperature : settings.temperature,
        top_p: typeof requestOptions.topP === 'number' ? requestOptions.topP : settings.topP,
        stream: true
    };

    fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + settings.apiKey
        },
        body: JSON.stringify(payload),
        signal: controller.signal
    }).then(function(response) {
        if (!response.ok) {
            return response.text().then(function(text) {
                var errMsg = 'API Error ' + response.status;
                try {
                    var errJson = JSON.parse(text);
                    if (errJson.error && errJson.error.message) errMsg += ': ' + errJson.error.message;
                } catch(e) {
                    if (text) errMsg += ': ' + text.slice(0, 200);
                }
                onError(new Error(errMsg));
            });
        }

        var reader = response.body.getReader();
        var decoder = new TextDecoder();
        var buffer = '';
        var fullContent = '';
        var fullCot = '';

        function pump() {
            reader.read().then(function(result) {
                if (result.done) {
                    state.isGenerating = false;
                    appStore.notify('isGenerating');
                    state.abortController = null;
                    var finalParts = captureCot ? splitInlineCot(fullContent, fullCot) : { content: fullContent, cot: '' };
                    onComplete(finalParts.content, finalParts.cot);
                    return;
                }
                buffer += decoder.decode(result.value, { stream: true });
                var lines = buffer.split('\n');
                buffer = lines.pop() || '';
                for (var i = 0; i < lines.length; i++) {
                    var line = lines[i].trim();
                    if (!line || line.indexOf('data: ') !== 0) continue;
                    var data = line.slice(6);
                    if (data === '[DONE]') {
                        state.isGenerating = false;
                        appStore.notify('isGenerating');
                        state.abortController = null;
                        var doneParts = captureCot ? splitInlineCot(fullContent, fullCot) : { content: fullContent, cot: '' };
                        onComplete(doneParts.content, doneParts.cot);
                        return;
                    }
                    try {
                        var json = JSON.parse(data);
                        var delta = json.choices && json.choices[0] && json.choices[0].delta;
                        var cotDelta = captureCot ? extractCotDelta(delta) : '';
                        var contentDelta = delta && delta.content ? delta.content : '';
                        if (cotDelta) fullCot += cotDelta;
                        if (contentDelta) fullContent += contentDelta;
                        if (contentDelta || cotDelta) {
                            var parts = captureCot ? splitInlineCot(fullContent, fullCot) : { content: fullContent, cot: '' };
                            onToken(contentDelta, parts.content, parts.cot);
                        }
                    } catch(e) { /* skip malformed */ }
                }
                pump();
            }).catch(function(e) {
                state.isGenerating = false;
                appStore.notify('isGenerating');
                state.abortController = null;
                if (e.name === 'AbortError') {
                    var abortParts = captureCot ? splitInlineCot(fullContent, fullCot) : { content: fullContent, cot: '' };
                    onComplete(abortParts.content, abortParts.cot);
                }
                else onError(e);
            });
        }
        pump();
    }).catch(function(e) {
        state.isGenerating = false;
        appStore.notify('isGenerating');
        state.abortController = null;
        if (e.name === 'AbortError') onComplete('', '');
        else onError(e);
    });
}

function streamChat(onToken, onComplete, onError) {
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
    streamChatWithMessages(messages, onToken, onComplete, onError);
}
