/**
 * 新手导读（文件：50-generation-api-request.js）
 *
 * 负责什么：这是“文本生成底层”中的“内容生成、模型接口、请求”部分。
 * 在程序中的位置：它发送模型请求、读取流式响应，并拆分正文与思考内容。
 * 从哪里开始看：主要从 `shouldCaptureCotForRequest(settings, requestOptions)`、`buildChatCompletionPayload(settings, messages, requestOptions)`、`buildChatCompletionFetchOptions(settings, payload, controller)`、`readChatCompletionError(response)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：网络流会分成任意大小的数据块，不能假设一次读取就是完整 JSON 或完整句子。
 */
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
