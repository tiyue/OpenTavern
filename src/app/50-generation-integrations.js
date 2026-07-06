// ==================== API Client ====================
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

    var controller = beginGenerationStreamState();
    var endpoint = normalizeApiEndpoint(settings.apiEndpoint);
    if (shouldUseOllamaCompat(settings.apiEndpoint)) {
        messages = normalizeMessagesForOllamaCompatibility(messages);
    }
    requestOptions = requestOptions || {};
    var captureCot = shouldCaptureCotForRequest(settings, requestOptions);
    var payload = buildChatCompletionPayload(settings, messages, requestOptions);

    fetch(endpoint, buildChatCompletionFetchOptions(settings, payload, controller)).then(function(response) {
        if (!response.ok) {
            return readChatCompletionError(response).then(function(err) {
                finishGenerationStreamState();
                onError(err);
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
                    finishGenerationStreamState();
                    var finalParts = buildCotAwareParts(captureCot, fullContent, fullCot);
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
                        finishGenerationStreamState();
                        var doneParts = buildCotAwareParts(captureCot, fullContent, fullCot);
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
                            var parts = buildCotAwareParts(captureCot, fullContent, fullCot);
                            onToken(contentDelta, parts.content, parts.cot);
                        }
                    } catch(e) { /* skip malformed */ }
                }
                pump();
            }).catch(function(e) {
                finishGenerationStreamState();
                if (e.name === 'AbortError') {
                    var abortParts = buildCotAwareParts(captureCot, fullContent, fullCot);
                    onComplete(abortParts.content, abortParts.cot);
                }
                else onError(e);
            });
        }
        pump();
    }).catch(function(e) {
        finishGenerationStreamState();
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
