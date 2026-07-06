// ==================== Generation API Request Helpers ====================
function shouldCaptureCotForRequest(settings, requestOptions) {
    requestOptions = requestOptions || {};
    return !!settings.requestCotEnabled && requestOptions.requestCot !== false;
}

function buildChatCompletionPayload(settings, messages, requestOptions) {
    requestOptions = requestOptions || {};
    return {
        model: settings.model,
        messages: messages,
        max_tokens: requestOptions.maxTokens || settings.maxTokens,
        temperature: typeof requestOptions.temperature === 'number' ? requestOptions.temperature : settings.temperature,
        top_p: typeof requestOptions.topP === 'number' ? requestOptions.topP : settings.topP,
        stream: true
    };
}

function buildChatCompletionFetchOptions(settings, payload, controller) {
    return {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + settings.apiKey
        },
        body: JSON.stringify(payload),
        signal: controller.signal
    };
}

async function readChatCompletionError(response) {
    var text = await response.text();
    var errMsg = 'API Error ' + response.status;
    try {
        var errJson = JSON.parse(text);
        if (errJson.error && errJson.error.message) errMsg += ': ' + errJson.error.message;
    } catch(e) {
        if (text) errMsg += ': ' + text.slice(0, 200);
    }
    return new Error(errMsg);
}
