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
var activePromptBuildSequence = 0;

function createPromptBuildOperation(sequence, conversation) {
    return {
        sequence: sequence,
        conversation: conversation || null,
        source: null,
        cancelled: false,
        settled: false,
        setSource: function(source) { this.source = source; },
        hasCurrentOwnership: function() {
            if (this.cancelled || this.settled || this.sequence !== activePromptBuildSequence) return false;
            if (this.conversation && typeof isLiveConversation === 'function' && !isLiveConversation(this.conversation)) return false;
            return true;
        },
        rebindSourceAfterSave: function(nextSource, savedMessage) {
            if (!this.hasCurrentOwnership() || !nextSource || !savedMessage || !this.source) return false;
            if (this.source.conversation !== nextSource.conversation || this.source.conversationId !== nextSource.conversationId) return false;
            if (nextSource.messages.length !== this.source.messages.length + 1) return false;
            for (var index = 0; index < this.source.messages.length; index++) {
                if (this.source.messages[index].id !== nextSource.messages[index].id || this.source.messages[index].revision !== nextSource.messages[index].revision) return false;
            }
            var appended = nextSource.messages[nextSource.messages.length - 1];
            if (appended.id !== savedMessage.id || appended.revision !== getMessageRevision(savedMessage)) return false;
            this.source = nextSource;
            return true;
        },
        isCurrent: function() {
            if (this.cancelled || this.sequence !== activePromptBuildSequence) return false;
            if (this.conversation && typeof isLiveConversation === 'function' && !isLiveConversation(this.conversation)) return false;
            return !this.source || typeof isPromptBuildSourceCurrent !== 'function' || isPromptBuildSourceCurrent(this.source);
        }
    };
}

function createGenerationRuntimeContext(operation, settings, conversation, stage) {
    return {
        operation: operation || null,
        sequence: operation ? operation.sequence : null,
        conversation: conversation || null,
        stage: stage || 'main',
        settings: JSON.parse(JSON.stringify(settings || state.settings || {})),
        controller: null
    };
}

function setGenerationCompletionContext(completion, generationContext) {
    if (!completion || !generationContext) return completion;
    Object.defineProperty(completion, '_generationRuntime', { value: generationContext });
    return completion;
}

function getGenerationCompletionContext(completion) {
    return completion && completion._generationRuntime || null;
}

function isGenerationRuntimeActive(generationContext) {
    if (!generationContext) return true;
    if (state._generationRuntime && state._generationRuntime !== generationContext) return false;
    if (generationContext.controller && state.abortController && state.abortController !== generationContext.controller) return false;
    return true;
}

function isGenerationRuntimeOwned(generationContext) {
    if (!isGenerationRuntimeActive(generationContext)) return false;
    if (generationContext && generationContext.operation && typeof generationContext.operation.isCurrent === 'function' && !generationContext.operation.isCurrent()) return false;
    return true;
}

function releaseGenerationRuntimeState(generationContext) {
    if (generationContext && state._generationRuntime && state._generationRuntime !== generationContext) return false;
    if (state.abortController && (!generationContext || state.abortController !== generationContext.controller)) return false;
    state.isGenerating = false;
    appStore.notify('isGenerating');
    state.abortController = null;
    state._generationStartedAt = 0;
    if (!generationContext || state._generationRuntime === generationContext) state._generationRuntime = null;
    return true;
}
/**
 * 使用指定 messages 发起一次流式模型请求，并通过回调持续报告结果。
 *
 * @param {Array} messages - 已组装好的模型上下文，每项包含 role 和 content。
 * @param {Function} onToken - 每收到一段增量文本时调用，用于更新正在生成的气泡。
 * @param {Function} onComplete - 流正常结束或用户主动中止时调用，接收完整正文和思考内容。
 * @param {Function} onError - 配置、网络或服务端错误时调用。
 * @param {Object} requestOptions - 可覆盖温度、最大 Token 等本次请求参数。
 *
 * 远程路径会规范化地址、兼容 Ollama、创建 AbortController，
 * 然后把 Response 交给流解析器。fetch 成功只代表服务器有响应，仍必须先检查 response.ok。
 */
function streamChatWithMessages(messages, onToken, onComplete, onError, requestOptions) {
    requestOptions = requestOptions || {};
    var promptBuildOperation = requestOptions.promptBuildOperation || requestOptions.generationContext && requestOptions.generationContext.operation || messages._promptBuildOperation;
    if (promptBuildOperation && !promptBuildOperation.isCurrent()) return;
    if (!requestOptions.settings && messages._requestSettings) requestOptions.settings = messages._requestSettings;
    if (!requestOptions.conversation && messages._requestConversation) requestOptions.conversation = messages._requestConversation;
    var settings = requestOptions.settings || state.settings;
    var generationContext = requestOptions.generationContext || createGenerationRuntimeContext(promptBuildOperation, settings, requestOptions.conversation, requestOptions.stage);
    requestOptions.settings = settings;
    if (promptBuildOperation && requestOptions.operation == null) requestOptions.operation = promptBuildOperation.sequence;
    if (!settings.apiEndpoint || !settings.apiKey) {
        return Promise.resolve().then(function() { return onError(new Error(t('no_api_error'))); });
    }
    var transport = createGenerationTransport({
        fetch: fetch,
        clock: { now: Date.now, setTimeout: setTimeout, clearTimeout: clearTimeout },
        stateController: {
            begin: function(requestSettings) {
                var controller = beginGenerationStreamState(requestSettings);
                generationContext.controller = controller;
                state._generationRuntime = generationContext;
                return controller;
            },
            finish: finishGenerationStreamState,
            touch: touchGenerationIdleTimeout,
            arm: armGenerationIdleTimeout
        },
        settings: settings,
        helpers: {
            shouldCaptureCot: shouldCaptureCotForRequest,
            buildPayload: buildChatCompletionPayload,
            buildFetchOptions: buildChatCompletionFetchOptions,
            readError: readChatCompletionError,
            normalizeEndpoint: normalizeApiEndpoint,
            shouldUseOllamaCompat: shouldUseOllamaCompat,
            normalizeOllamaMessages: typeof normalizeMessagesForOllamaCompatibility === 'function' ? normalizeMessagesForOllamaCompatibility : undefined,
            postProcessMessages: typeof postProcessPromptMessages === 'function' ? postProcessPromptMessages : undefined,
            parseUsage: typeof parseApiUsage === 'function' ? parseApiUsage : undefined,
            extractCot: typeof extractCotDelta === 'function' ? extractCotDelta : undefined,
            buildCotParts: typeof buildCotAwareParts === 'function' ? buildCotAwareParts : undefined,
            finalizeUsage: typeof finalizeUsageMeta === 'function' ? finalizeUsageMeta : undefined,
            captureDiagnostic: typeof captureRequestDiagnostic === 'function' ? captureRequestDiagnostic : undefined,
            updateDiagnosticCompletion: typeof updateRequestDiagnosticCompletion === 'function' ? updateRequestDiagnosticCompletion : undefined,
            updateDiagnosticError: typeof updateRequestDiagnosticError === 'function' ? function(diagnostic, error) { updateRequestDiagnosticError(diagnostic, error, settings); } : undefined,
            setCompletionContext: typeof setGenerationCompletionContext === 'function' ? setGenerationCompletionContext : undefined
        }
    });
    return transport.request(messages, {
        onToken: onToken,
        onComplete: onComplete,
        onError: onError
    }, Object.assign({}, requestOptions, {
        settings: settings,
        generationContext: generationContext
    }));
}

/**
 * 普通聊天生成的便捷入口：先构建当前会话提示词，再调用通用流式请求函数。
 * 提示词构建失败属于本地错误，此时要恢复 isGenerating 状态，不能继续发送空请求。
 */
async function streamChat(onToken, onComplete, onError, conversation) {
    var sequence = ++activePromptBuildSequence;
    var targetConversation = conversation || getActiveConv();
    var operation = createPromptBuildOperation(sequence, targetConversation);
    var generationContext = createGenerationRuntimeContext(operation, state.settings, targetConversation, 'main');
    state._promptBuildPendingSequence = sequence;
    state._promptBuildOperation = operation;
    state._generationRuntime = generationContext;
    state.isGenerating = true;
    appStore.notify('isGenerating');
    var settled = false;
    function isLatest() { return sequence === activePromptBuildSequence; }
    function settleInterrupted() {
        if (settled || !isLatest() || operation.settled) return;
        settled = operation.settled = true;
        onComplete('', '', null, setGenerationCompletionContext({ interrupted: true }, generationContext));
    }
    function release() {
        if (state._promptBuildPendingSequence === sequence) state._promptBuildPendingSequence = null;
        if (state._promptBuildOperation === operation) state._promptBuildOperation = null;
    }
    var messages;
    try {
        if (!operation.source && typeof capturePromptBuildSource === 'function') operation.setSource(capturePromptBuildSource(targetConversation));
        messages = typeof buildMessagesForAPIAsync === 'function'
            ? await buildMessagesForAPIAsync(targetConversation, { operation: operation, settings: generationContext.settings })
            : buildMessagesForAPI(targetConversation);
    } catch (err) {
        if (!isLatest()) return;
        if (operation.cancelled) {
            settleInterrupted();
            return;
        }
        if (!operation.isCurrent()) {
            releaseGenerationRuntimeState(generationContext);
            return;
        }
        console.error('buildMessagesForAPI failed:', err);
        settled = operation.settled = true;
        releaseGenerationRuntimeState(generationContext);
        onError(new Error('构建提示词时出错：' + (err.message || err)));
        return;
    } finally {
        release();
    }
    if (!isLatest()) return;
    if (operation.cancelled) {
        settleInterrupted();
        return;
    }
    if (!operation.isCurrent() || !messages) {
        releaseGenerationRuntimeState(generationContext);
        return;
    }
    streamChatWithMessages(messages, onToken, onComplete, onError, {
        conversation: targetConversation,
        stage: 'main',
        settings: generationContext.settings,
        generationContext: generationContext,
        promptBuildOperation: operation,
        operation: operation.sequence
    });
}
