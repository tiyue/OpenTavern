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

        streamChatCompletionResponse(response, captureCot, onToken, onComplete, onError);
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
