/**
 * 新手导读（文件：50-generation-integrations.js）
 *
 * 负责什么：这是“文本生成底层”中的“内容生成、外部集成”部分。
 * 在程序中的位置：它发送模型请求、读取流式响应，并拆分正文与思考内容。
 * 从哪里开始看：主要从 `streamChatWithMessages(messages, onToken, onComplete, onError, requestOptions)`、`streamChat(onToken, onComplete, onError)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：网络流会分成任意大小的数据块，不能假设一次读取就是完整 JSON 或完整句子。
 */
// ==================== API Client ====================
/**
 * 使用指定 messages 发起一次流式模型请求，并通过回调持续报告结果。
 *
 * @param {Array} messages - 已组装好的模型上下文，每项包含 role 和 content。
 * @param {Function} onToken - 每收到一段增量文本时调用，用于更新正在生成的气泡。
 * @param {Function} onComplete - 流正常结束或用户主动中止时调用，接收完整正文和思考内容。
 * @param {Function} onError - 配置、网络或服务端错误时调用。
 * @param {Object} requestOptions - 可覆盖温度、最大 Token 等本次请求参数。
 *
 * 本地 WebLLM 与远程 API 在这里分流。远程路径会规范化地址、兼容 Ollama、创建 AbortController，
 * 然后把 Response 交给流解析器。fetch 成功只代表服务器有响应，仍必须先检查 response.ok。
 */
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

/**
 * 普通聊天生成的便捷入口：先构建当前会话提示词，再调用通用流式请求函数。
 * 提示词构建失败属于本地错误，此时要恢复 isGenerating 状态，不能继续发送空请求。
 */
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
