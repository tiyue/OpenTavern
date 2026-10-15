/**
 * 新手导读（文件：50-generation-response-stream.js）
 *
 * 负责什么：这是“文本生成底层”中的“内容生成、响应、流式数据”部分。
 * 在程序中的位置：它发送模型请求、读取流式响应，并拆分正文与思考内容。
 * 从哪里开始看：主要从 `streamChatCompletionResponse(response, captureCot, onToken, onComplete, onError)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：网络流会分成任意大小的数据块，不能假设一次读取就是完整 JSON 或完整句子。
 */
// ==================== Chat Completion Response Stream ====================
function parseProviderResponseError(json) {
    var providerError = json && json.error;
    if (!providerError) return null;
    var message = typeof providerError === 'string'
        ? providerError
        : providerError.message || providerError.code || providerError.type || 'Unknown provider error';
    var error = new Error('Provider error: ' + message);
    error.providerMessage = String(message);
    if (providerError && typeof providerError === 'object') {
        if (providerError.code !== undefined) error.code = providerError.code;
        if (providerError.type !== undefined) error.type = providerError.type;
    }
    return error;
}

function buildResponseCompletionMetadata(finishReason, ending, controller) {
    var rawFinishReason = finishReason === undefined || finishReason === null || finishReason === '' ? null : String(finishReason);
    var aborted = !!(controller && controller.signal && controller.signal.aborted);
    var timedOut = ending === 'timeout' || !!(controller && controller._generationIdleTimedOut);
    var interrupted = timedOut || ending === 'abort' || aborted || (rawFinishReason ? rawFinishReason !== 'stop' : ending === 'eof');
    var completionReason = timedOut
        ? 'timeout'
        : (aborted || ending === 'abort' ? 'abort' : (rawFinishReason || ending));
    return {
        interrupted: interrupted,
        finishReason: rawFinishReason,
        completionReason: completionReason
    };
}

function invokeResponseComplete(onComplete, content, cot, usage, completion) {
    return Promise.resolve().then(function() {
        return onComplete(content, cot, usage, completion);
    });
}

function createGenerationResponseTransport(controller, requestDiagnostic, requestSettings) {
    return createGenerationTransport({
        stateController: {
            finish: finishGenerationStreamState,
            touch: touchGenerationIdleTimeout,
            arm: armGenerationIdleTimeout
        },
        settings: requestSettings,
        helpers: {
            parseProviderError: parseProviderResponseError,
            parseUsage: parseApiUsage,
            extractCot: extractCotDelta,
            buildCotParts: buildCotAwareParts,
            finalizeUsage: finalizeUsageMeta,
            updateDiagnosticCompletion: function(diagnostic, completion) {
                if (typeof updateRequestDiagnosticCompletion === 'function') updateRequestDiagnosticCompletion(diagnostic, completion);
            },
            updateDiagnosticError: function(diagnostic, error) {
                if (typeof updateRequestDiagnosticError === 'function') updateRequestDiagnosticError(diagnostic, error, requestSettings);
            }
        },
        TextDecoder: TextDecoder
    });
}

function streamChatCompletionResponse(response, captureCot, onToken, onComplete, onError, controller, requestDiagnostic, requestSettings) {
    controller = controller || state.abortController;
    return createGenerationResponseTransport(controller, requestDiagnostic, requestSettings).readStream(response, captureCot, onToken, onComplete, onError, controller, requestDiagnostic);
}

function readChatCompletionResponse(response, captureCot, onComplete, onError, controller, requestDiagnostic, requestSettings) {
    controller = controller || state.abortController;
    return createGenerationResponseTransport(controller, requestDiagnostic, requestSettings).readJson(response, captureCot, onComplete, onError, controller, requestDiagnostic);
}
