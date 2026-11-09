// 工具轮运行时：授权、调用缓存、限额、执行记录和原生历史回放。
// 工具结果只是协议数据；不执行宏、MVU、正则或脚本，也不能扩大本机权限。
function getModelToolConnectionStamp(settings) {
    var raw = typeof getPromptBuildConnectionStamp === 'function' ? getPromptBuildConnectionStamp(settings) : JSON.stringify([
        (settings || {}).apiProtocol || 'openai',
        String((settings || {}).apiEndpoint || '').replace(/\/+$/, ''),
        String((settings || {}).model || '')
    ]);
    return typeof fingerprintMessageText === 'function' ? fingerprintMessageText(String(raw)) : String(raw);
}

function getModelToolAllowedStage(stage) {
    stage = stage || 'main';
    return stage === 'main' || stage === 'regeneration' || stage === 'continuation';
}

function resolveModelToolRequestContext(conv, settings, stage) {
    if (!conv || !getModelToolAllowedStage(stage)) return null;
    if (state.activeConvId !== conv.id) return null;
    if (typeof isLiveConversation === 'function' && !isLiveConversation(conv)) return null;
    var names = typeof getAuthorizedModelToolNames === 'function' ? getAuthorizedModelToolNames(conv, state.settings) : [];
    if (!names.length) return null;
    settings = settings || state.settings || {};
    return {
        enabled: true,
        conversationId: conv.id,
        conversation: conv,
        stage: stage || 'main',
        protocol: typeof getMainApiProtocol === 'function' ? getMainApiProtocol(settings) : 'openai',
        connectionStamp: getModelToolConnectionStamp(settings),
        toolNames: names
    };
}

function modelToolDisplayCall(call, status, result, error) {
    return {
        id: String(call && call.id || ''),
        name: String(call && call.name || ''),
        arguments: String(call && call.arguments || ''),
        status: status,
        resultPreview: String(result || '').slice(0, 1200),
        resultBytes: typeof modelToolUtf8Bytes === 'function' ? modelToolUtf8Bytes(result) : String(result || '').length,
        durationMs: 0,
        error: String(error || '').slice(0, 500)
    };
}

function modelToolTimeoutError() {
    var error = new Error('Tool execution timed out.');
    error.code = 'tool_timeout';
    return error;
}

function createModelToolRuntime(context, generationContext) {
    var started = Date.now();
    var trace = {
        version: 1,
        protocol: context.protocol,
        connection: context.connectionStamp,
        status: 'running',
        nativeOmitted: false,
        rounds: [],
        finalNative: null,
        diagnostics: {
            model: String((generationContext && generationContext.settings || state.settings || {}).model || ''),
            protocol: context.protocol,
            toolNames: context.toolNames.slice(),
            rounds: [],
            errors: []
        },
        started: started,
        finished: 0
    };
    var callCache = new Map();
    var currentAccumulatorHasCalls = false;

    function liveConversation() {
        var conv = state.conversations && state.conversations[context.conversationId];
        return conv && typeof isLiveConversation === 'function' && isLiveConversation(conv) ? conv : null;
    }

    function isCurrent() {
        if (!state || state.activeConvId !== context.conversationId) return false;
        if (!liveConversation()) return false;
        if (generationContext && generationContext.controller && generationContext.controller.signal && generationContext.controller.signal.aborted) return false;
        if (generationContext && typeof isGenerationRuntimeOwned === 'function' && !isGenerationRuntimeOwned(generationContext)) return false;
        if (generationContext && generationContext.operation && typeof generationContext.operation.isCurrent === 'function' && !generationContext.operation.isCurrent()) return false;
        if (context.requestSourceCurrent && !context.requestSourceCurrent()) return false;
        if (getModelToolConnectionStamp(state.settings) !== context.connectionStamp) return false;
        var names = typeof getAuthorizedModelToolNames === 'function' ? getAuthorizedModelToolNames(liveConversation(), state.settings) : [];
        return context.toolNames.every(function(name) { return names.indexOf(name) >= 0; });
    }

    function isTaskExpired() {
        return Date.now() - started > MODEL_TOOL_MAX_TASK_MS;
    }

    function taskDeadlineAt() {
        return started + MODEL_TOOL_MAX_TASK_MS;
    }

    function touch() {
        if (generationContext && generationContext.controller && typeof touchGenerationIdleTimeout === 'function') touchGenerationIdleTimeout(generationContext.controller);
    }

    function recordError(traceArg, error, accumulator) {
        if (!traceArg) return;
        if (traceArg.diagnostics && Array.isArray(traceArg.diagnostics.errors)) {
            traceArg.diagnostics.errors.push(String(error && error.message || error || '').slice(0, 500));
            if (traceArg.diagnostics.errors.length > 8) traceArg.diagnostics.errors.shift();
        }
        if (accumulator && typeof finalizeModelToolAccumulator === 'function') {
            try {
                var partial = finalizeModelToolAccumulator(accumulator, { content: '', cot: '' });
                if (partial && partial.hasToolCalls) {
                    traceArg.rounds.push({
                        index: traceArg.rounds.length,
                        calls: partial.calls.map(function(call) { return modelToolDisplayCall(call, 'not-run', '', 'The response ended before the tool could run.'); }),
                        assistantNative: modelToolClone(partial.assistantNative),
                        resultNative: null
                    });
                }
            } catch (_) {}
        }
    }

    function executeWithTimeout(name, args) {
        var conv = liveConversation();
        if (!conv) return Promise.reject(new Error('The conversation changed before the tool could run.'));
        var execution = Promise.resolve().then(function() {
            return executeModelTool(name, args, { conversation: conv, conversationId: conv.id });
        });
        return new Promise(function(resolve, reject) {
            var timer = setTimeout(function() { reject(modelToolTimeoutError()); }, MODEL_TOOL_MAX_EXECUTION_MS);
            execution.then(function(value) {
                clearTimeout(timer);
                resolve(value);
            }, function(error) {
                clearTimeout(timer);
                reject(error);
            });
        });
    }

    function errorToolResult(message) {
        return { content: JSON.stringify({ error: modelToolBoundedString(message, 500) }), isError: true };
    }

    function runSingleCall(call, totalBytes) {
        var id = typeof call.id === 'string' ? call.id : '';
        if (!id || id.length > 128) throw new Error('A tool call is missing a valid id.');
        var name = typeof call.name === 'string' ? call.name : '';
        var argumentsText = typeof call.arguments === 'string' ? call.arguments : '';
        if (modelToolUtf8Bytes(argumentsText) > MODEL_TOOL_MAX_ARGUMENT_BYTES) return Promise.resolve(errorToolResult('Tool arguments exceed the limit.'));
        var signature = name + '\n' + argumentsText;
        if (callCache.has(id)) {
            var cached = callCache.get(id);
            if (cached.signature === signature) return Promise.resolve({ content: cached.content, isError: cached.isError, reused: true, status: 'reused' });
            return Promise.resolve(errorToolResult('A tool call id was repeated with different arguments.'));
        }
        var tool = getModelToolDefinition(name);
        if (!tool || context.toolNames.indexOf(name) < 0) return Promise.resolve(errorToolResult('The tool is not available or not authorized.'));
        var args;
        if (call.parseError) return Promise.resolve(errorToolResult(call.parseError));
        try { args = JSON.parse(argumentsText || '{}'); } catch (error) { return Promise.resolve(errorToolResult('Tool arguments are not valid JSON.')); }
        var validation = validateModelToolArguments(tool, args);
        if (!validation.valid) return Promise.resolve(errorToolResult('Tool arguments are invalid: ' + validation.errors.join('; ')));
        if (isTaskExpired()) return Promise.resolve({ stop: true, reason: 'timeout' });
        return executeWithTimeout(name, args).then(function(value) {
            if (!isCurrent()) return { stop: true, reason: 'abort' };
            var content;
            try { content = typeof value === 'string' ? value : JSON.stringify(value); } catch (_) { content = ''; }
            var contentBytes = modelToolUtf8Bytes(content);
            if (contentBytes > MODEL_TOOL_MAX_RESULT_BYTES) return errorToolResult('Tool result exceeds the per-call limit.');
            if (totalBytes + contentBytes > MODEL_TOOL_MAX_TOTAL_RESULT_BYTES) return errorToolResult('Tool results exceed the total limit.');
            var result = { content: content, isError: false };
            callCache.set(id, { signature: signature, content: content, isError: false });
            return result;
        }, function(error) {
            return errorToolResult(error && error.message || 'Tool execution failed.');
        });
    }

    function onToolRound(traceArg, toolData, info) {
        if (!isCurrent()) return { stop: 'abort' };
        if (traceArg.rounds.length >= MODEL_TOOL_MAX_ROUNDS) return { stop: 'round_limit' };
        var callCount = traceArg.rounds.reduce(function(total, round) { return total + round.calls.length; }, 0);
        if (callCount + toolData.calls.length > MODEL_TOOL_MAX_CALLS) return { stop: 'call_limit' };
        var calls = toolData.calls.slice();
        var results = [];
        var totalBytes = traceArg.rounds.reduce(function(total, round) {
            return total + round.calls.reduce(function(sum, call) { return sum + (Number(call.resultBytes) || 0); }, 0);
        }, 0);
        var chain = Promise.resolve();
        calls.forEach(function(call) {
            chain = chain.then(function() {
                return runSingleCall(call, totalBytes).then(function(result) {
                    if (result && result.stop) throw Object.assign(new Error('Tool budget stopped the round.'), { toolStop: result.reason });
                    totalBytes += modelToolUtf8Bytes(result && result.content || '');
                    results.push(result);
                });
            });
        });
        return chain.then(function() {
            if (!isCurrent()) return { stop: 'abort' };
            if (!toolData.assistantNative) throw new Error('The provider returned tool calls without a native assistant message.');
            var resultMessages = buildModelToolResultMessages(context.protocol, calls, results);
            var displayCalls = calls.map(function(call, index) {
                var result = results[index] || {};
                var item = modelToolDisplayCall(call, result.reused ? 'reused' : (result.isError ? 'error' : 'completed'), result.content || '', result.isError ? 'Tool error' : '');
                item.resultBytes = modelToolUtf8Bytes(result.content || '');
                item.durationMs = 0;
                return item;
            });
            traceArg.rounds.push({
                index: traceArg.rounds.length,
                calls: displayCalls,
                assistantNative: modelToolClone(toolData.assistantNative),
                resultNative: modelToolClone(resultMessages)
            });
            traceArg.diagnostics.rounds.push({
                round: traceArg.rounds.length - 1,
                callCount: calls.length,
                toolNames: calls.map(function(call) { return call.name; }),
                resultBytes: results.reduce(function(total, item) { return total + modelToolUtf8Bytes(item.content || ''); }, 0),
                finishReason: info && info.finishReason || null,
                usage: info && info.usage || null,
                requestMessageCount: info && info.requestMessageCount || null,
                requestRoles: info && info.requestRoles || null
            });
            return { nextMessages: [markModelToolProtocolMessage(modelToolClone(toolData.assistantNative))].concat(resultMessages) };
        }, function(error) {
            if (error && error.toolStop) return { stop: error.toolStop };
            throw error;
        });
    }

    function finishTurn(traceArg, toolData, completion, info) {
        if (!traceArg || !completion) return;
        info = info || {};
        if (toolData && toolData.hasToolCalls && completion.interrupted) {
            traceArg.rounds.push({
                index: traceArg.rounds.length,
                calls: toolData.calls.map(function(call) { return modelToolDisplayCall(call, 'not-run', '', 'The turn was interrupted before execution.'); }),
                assistantNative: modelToolClone(toolData.assistantNative),
                resultNative: null
            });
        }
        if (toolData && !toolData.hasToolCalls && toolData.finalNative && !completion.interrupted) {
            traceArg.finalNative = modelToolClone(toolData.finalNative);
        }
        if (!traceArg.rounds.length && !(typeof modelToolNativeHasReasoning === 'function' && modelToolNativeHasReasoning(traceArg.finalNative))) return;
        traceArg.status = completion.interrupted
            ? (completion.completionReason === 'abort' || completion.completionReason === 'timeout' ? 'interrupted' : 'unknown')
            : 'completed';
        traceArg.finished = Date.now();
        traceArg.diagnostics.finishReason = completion.finishReason;
        traceArg.diagnostics.completionReason = completion.completionReason;
        traceArg.diagnostics.finished = traceArg.finished;
        if (info.error) recordError(traceArg, info.error);
        var normalized = normalizeModelToolTrace(traceArg);
        if (normalized && (normalized.rounds.some(function(round) { return round.calls.length; }) || (typeof modelToolNativeHasReasoning === 'function' && modelToolNativeHasReasoning(normalized.finalNative)))) {
            Object.defineProperty(completion, '_modelToolTrace', { value: normalized, writable: true, configurable: true });
        }
    }

    return {
        enabled: true,
        protocol: context.protocol,
        toolNames: context.toolNames,
        connectionStamp: context.connectionStamp,
        createTrace: function() { return trace; },
        snapshotTrace: function(traceArg, status) {
            if (!traceArg) return null;
            var copy = modelToolClone(traceArg);
            if (!copy) return null;
            copy.status = status || 'unknown';
            return normalizeModelToolTrace(copy);
        },
        newAccumulator: function() { currentAccumulatorHasCalls = false; return createModelToolAccumulator(context.protocol); },
        consume: function(accumulator, raw) {
            consumeModelToolChunk(accumulator, raw);
            if (accumulator && accumulator.sawToolActivity) currentAccumulatorHasCalls = true;
        },
        finishAccumulator: function(accumulator, info) {
            if (accumulator && accumulator.sawToolActivity) currentAccumulatorHasCalls = true;
            return finalizeModelToolAccumulator(accumulator, info);
        },
        hasActivity: function(traceArg) { return !!(traceArg && traceArg.rounds.length || currentAccumulatorHasCalls); },
        isCurrent: isCurrent,
        isTaskExpired: isTaskExpired,
        taskDeadlineAt: taskDeadlineAt,
        touch: touch,
        onToolRound: onToolRound,
        finishTurn: finishTurn,
        recordError: recordError
    };
}

function buildModelToolNativeFinalMessage(trace, prepared, protocol) {
    if (!trace || !prepared) return null;
    if (protocol === 'anthropic') {
        var sourceBlocks = trace.finalNative && Array.isArray(trace.finalNative.content) ? trace.finalNative.content : [];
        var blocks = [];
        var insertedText = false;
        sourceBlocks.forEach(function(block) {
            if (!block || typeof block !== 'object') return;
            if (block.type === 'text') {
                if (!insertedText) {
                    blocks.push({ type: 'text', text: String(prepared.content || '') });
                    insertedText = true;
                }
                return;
            }
            blocks.push(JSON.parse(JSON.stringify(block)));
        });
        if (!insertedText && prepared.content) blocks.push({ type: 'text', text: String(prepared.content) });
        return markModelToolProtocolMessage({ role: 'assistant', content: blocks, _anthropicContent: blocks });
    }
    var message = { role: 'assistant', content: prepared.content };
    var reasoning = trace.finalNative && trace.finalNative.reasoning_content;
    if (typeof reasoning === 'string' && reasoning) message.reasoning_content = reasoning;
    return reasoning ? markModelToolProtocolMessage(message) : message;
}

function buildModelToolHistoryMessages(message, prepared, context) {
    if (!message || !context || !hasModelToolTrace(message.toolTrace)) return null;
    var trace = normalizeModelToolTrace(message.toolTrace);
    if (!trace || trace.protocol !== context.protocol || trace.connection !== context.connectionStamp || trace.nativeOmitted || trace.status !== 'completed') return null;
    var result = [];
    var completeNative = trace.rounds.every(function(round) { return !round.assistantNative || Array.isArray(round.resultNative); });
    if (!completeNative) return null;
    trace.rounds.forEach(function(round) {
        if (round.assistantNative) result.push(markModelToolProtocolMessage(modelToolClone(round.assistantNative)));
        (Array.isArray(round.resultNative) ? round.resultNative : []).forEach(function(item) {
            result.push(markModelToolProtocolMessage(modelToolClone(item)));
        });
    });
    var finalMessage = buildModelToolNativeFinalMessage(trace, prepared, context.protocol);
    if (finalMessage) result.push(finalMessage);
    else if (prepared) result.push(prepared);
    return result;
}
