/**
 * 生成传输业务模块。请求、HTTP/SSE/JSON 解析和单次结算都封闭在 factory 返回的闭包中。
 * 调用方只通过显式依赖传入 fetch、时钟、状态控制器、设置快照和协议辅助函数。
 */
// ==================== Generation Transport Module ====================
function createGenerationTransport(dependencies) {
    dependencies = dependencies || {};
    var fetch = dependencies.fetch;
    var clock = dependencies.clock || {};
    var stateController = dependencies.stateController || {};
    var helpers = dependencies.helpers || {};
    var settings = dependencies.settings;
    var TextDecoderImpl = dependencies.TextDecoder || (typeof TextDecoder !== 'undefined' ? TextDecoder : null);

    function now() {
        return typeof clock.now === 'function' ? clock.now() : Date.now();
    }

    function timeout(callback, delay) {
        return typeof clock.setTimeout === 'function' ? clock.setTimeout(callback, delay) : setTimeout(callback, delay);
    }

    function clearTimeoutValue(value) {
        if (typeof clock.clearTimeout === 'function') clock.clearTimeout(value);
        else clearTimeout(value);
    }

    function finishState(controller) {
        return typeof stateController.finish === 'function' ? stateController.finish(controller) : 0;
    }

    function touchState(controller) {
        if (typeof stateController.touch === 'function') stateController.touch(controller);
    }

    function armState(controller) {
        if (typeof stateController.arm === 'function') stateController.arm(controller);
    }

    function toolCallStructurallyComplete(call) {
        if (!call || typeof call.id !== 'string' || !call.id || call.id.length > 128) return false;
        if (typeof call.name !== 'string' || !call.name) return false;
        if (typeof call.arguments !== 'string' || call.parseError) return false;
        try {
            var parsed = JSON.parse(call.arguments);
            return !!parsed && typeof parsed === 'object' && !Array.isArray(parsed);
        } catch (_) { return false; }
    }

    // 原始调用身份无效时整轮失败；流式响应可能稍后才补上合法 id，所以只在轮次收尾时判定。
    function toolIdentityFailure(toolData, finishReason, ending, protocol) {
        if (!toolData || !toolData.hasToolCalls || !toolData.identityError) return null;
        if (ending === 'abort' || ending === 'timeout') return null;
        if (ending !== 'json' && finishReason !== (protocol === 'anthropic' ? 'tool_use' : 'tool_calls')) return null;
        var error = new Error(toolData.identityError);
        error.code = 'model_tool_identity_invalid';
        return error;
    }

    // 只有协议明确结束并且每个调用都结构完整时，工具轮才允许执行。
    function toolRoundComplete(toolData, finishReason, ending, controller, protocol) {
        if (!toolData || !toolData.hasToolCalls || !Array.isArray(toolData.calls) || !toolData.calls.length) return false;
        if (toolData.identityError) return false;
        if (ending !== 'done' && ending !== 'json') return false;
        if (!controller || !controller.signal || controller.signal.aborted) return false;
        if (controller._generationIdleTimedOut || controller._generationDeadlineTimedOut) return false;
        if (finishReason !== (protocol === 'anthropic' ? 'tool_use' : 'tool_calls')) return false;
        return toolData.calls.every(toolCallStructurallyComplete);
    }

    function buildCompletion(finishReason, ending, controller, toolCallsPresent, roundComplete) {
        var rawFinishReason = finishReason === undefined || finishReason === null || finishReason === '' ? null : String(finishReason);
        var aborted = !!(controller && controller.signal && controller.signal.aborted);
        var timedOut = ending === 'timeout' || !!(controller && (controller._generationIdleTimedOut || controller._generationDeadlineTimedOut));
        var interrupted = toolCallsPresent
            ? timedOut || ending === 'abort' || aborted || !roundComplete
            : timedOut || ending === 'abort' || aborted || (rawFinishReason ? rawFinishReason !== 'stop' : ending === 'eof');
        var completionReason = timedOut ? 'timeout' : (aborted || ending === 'abort' ? 'abort'
            : (toolCallsPresent && !roundComplete && !rawFinishReason ? 'unknown' : (rawFinishReason || ending)));
        return { interrupted: interrupted, finishReason: rawFinishReason, completionReason: completionReason };
    }

    function providerError(json) {
        if (helpers.parseProviderError) return helpers.parseProviderError(json);
        var provider = json && json.error;
        if (!provider) return null;
        var message = typeof provider === 'string' ? provider : provider.message || provider.code || provider.type || 'Unknown provider error';
        var error = new Error('Provider error: ' + message);
        error.providerMessage = String(message);
        if (provider && typeof provider === 'object') {
            if (provider.code !== undefined) error.code = provider.code;
            if (provider.type !== undefined) error.type = provider.type;
        }
        return error;
    }

    function usage(json) {
        return typeof helpers.parseUsage === 'function' ? helpers.parseUsage(json) : null;
    }

    function cot(delta) {
        return typeof helpers.extractCot === 'function' ? helpers.extractCot(delta) : '';
    }

    function parts(captureCot, content, fullCot) {
        return typeof helpers.buildCotParts === 'function'
            ? helpers.buildCotParts(captureCot, content, fullCot)
            : { content: content || '', cot: captureCot ? fullCot || '' : '' };
    }

    function payloadFor(requestMessages, requestOptions) {
        if (typeof helpers.buildPayload !== 'function') throw new Error('Missing generation payload builder');
        return helpers.buildPayload(settings, requestMessages, requestOptions);
    }

    function fetchOptionsFor(payload, controller) {
        if (typeof helpers.buildFetchOptions !== 'function') throw new Error('Missing generation fetch options builder');
        return helpers.buildFetchOptions(settings, payload, controller);
    }

    function apiError(response) {
        return typeof helpers.readError === 'function' ? helpers.readError(response) : Promise.reject(new Error('Missing API error reader'));
    }

    function diagnosticFor(payload, beforeMessages, requestOptions) {
        return typeof helpers.captureDiagnostic === 'function' ? helpers.captureDiagnostic(payload, beforeMessages, requestOptions) : null;
    }

    function updateDiagnosticCompletion(diagnostic, completion) {
        if (diagnostic && typeof helpers.updateDiagnosticCompletion === 'function') helpers.updateDiagnosticCompletion(diagnostic, completion);
    }

    function updateDiagnosticError(diagnostic, error) {
        if (diagnostic && typeof helpers.updateDiagnosticError === 'function') helpers.updateDiagnosticError(diagnostic, error, settings);
    }

    function setCompletionContext(completion, generationContext) {
        return typeof helpers.setCompletionContext === 'function'
            ? helpers.setCompletionContext(completion, generationContext)
            : completion;
    }

    function readStream(response, captureCot, onToken, onComplete, onError, controller, requestDiagnostic, toolHooks, toolProtocol) {
        if (!TextDecoderImpl) return Promise.resolve().then(function() { return settleError(new Error('Missing TextDecoder dependency')); });
        var reader = response.body && response.body.getReader && response.body.getReader();
        if (!reader) return Promise.resolve().then(function() { return settleError(new Error('Unexpected API response')); });
        var decoder = new TextDecoderImpl();
        var buffer = '';
        var fullContent = '';
        var fullCot = '';
        var usageMeta = null;
        var finishReason = null;
        var doneSeen = false;
        var settled = false;
        var settlementPromise = null;

        function complete(ending) {
            if (settled || (controller && controller._generationDeadlineTimedOut)) return Promise.resolve();
            var toolData = null;
            if (toolHooks && typeof toolHooks.finish === 'function') {
                try {
                    toolData = toolHooks.finish(toolHooks.accumulator, { content: fullContent, cot: fullCot, usage: usageMeta, finishReason: finishReason, ending: ending });
                } catch (toolFinalizeError) {
                    if (toolHooks && typeof toolHooks.onError === 'function') toolHooks.onError(toolHooks.accumulator, toolFinalizeError);
                    return settleError(toolFinalizeError);
                }
            }
            var identityError = toolIdentityFailure(toolData, finishReason, ending, toolProtocol);
            if (identityError) {
                if (toolHooks && typeof toolHooks.onIdentityError === 'function') {
                    settled = true;
                    settlementPromise = Promise.resolve().then(function() {
                        return toolHooks.onIdentityError(toolData, identityError, { content: fullContent, cot: fullCot, usage: usageMeta });
                    });
                    return settlementPromise;
                }
                return settleError(identityError);
            }
            var toolCallsPresent = !!(toolData && toolData.hasToolCalls);
            var completion = buildCompletion(finishReason, ending, controller, toolCallsPresent, toolRoundComplete(toolData, finishReason, ending, controller, toolProtocol));
            if (toolHooks && typeof toolHooks.onFinal === 'function') {
                try { toolHooks.onFinal(toolData, completion, { content: fullContent, cot: fullCot, usage: usageMeta }); }
                catch (toolTraceError) { return settleError(toolTraceError); }
            }
            settled = true;
            if (toolCallsPresent && !completion.interrupted && typeof toolHooks.onToolRound === 'function') {
                settlementPromise = Promise.resolve().then(function() {
                    return toolHooks.onToolRound(toolData, completion, { content: fullContent, cot: fullCot, usage: usageMeta });
                });
                return settlementPromise;
            }
            var durationMs = finishState(controller);
            var finalParts = parts(captureCot, fullContent, fullCot);
            updateDiagnosticCompletion(requestDiagnostic, completion);
            settlementPromise = Promise.resolve().then(function() {
                return onComplete(finalParts.content, finalParts.cot, typeof helpers.finalizeUsage === 'function' ? helpers.finalizeUsage(usageMeta, durationMs) : usageMeta, completion);
            });
            return settlementPromise;
        }

        function settleError(error) {
            if (settled || (controller && controller._generationDeadlineTimedOut)) return Promise.resolve();
            settled = true;
            if (toolHooks && typeof toolHooks.onError === 'function') toolHooks.onError(toolHooks.accumulator, error);
            updateDiagnosticError(requestDiagnostic, error);
            finishState(controller);
            settlementPromise = Promise.resolve().then(function() { return onError(error); });
            return settlementPromise;
        }

        function processLine(line) {
            var trimmed = String(line || '').trim();
            if (!trimmed || trimmed.indexOf('data:') !== 0) return false;
            var data = trimmed.slice(5).trim();
            if (data === '[DONE]') {
                doneSeen = true;
                return true;
            }
            var json;
            try { json = JSON.parse(data); } catch (parseError) { return false; }
            try {
                if (toolHooks && typeof toolHooks.consume === 'function') toolHooks.consume(toolHooks.accumulator, json);
                if (typeof helpers.normalizeResponse === 'function') json = helpers.normalizeResponse(json);
                var error = providerError(json);
                if (error) return settleError(error), true;
                if (json && json.done) { doneSeen = true; return true; }
                var choice = json && json.choices && json.choices[0];
                if (choice && choice.finish_reason !== undefined && choice.finish_reason !== null) finishReason = choice.finish_reason;
                var parsedUsage = usage(json);
                if (parsedUsage) usageMeta = Object.assign({}, usageMeta || {}, parsedUsage);
                var delta = choice && choice.delta;
                var cotDelta = captureCot ? cot(delta) : '';
                var contentDelta = delta && delta.content ? delta.content : '';
                if (cotDelta) fullCot += cotDelta;
                if (contentDelta) fullContent += contentDelta;
                if (contentDelta || cotDelta) {
                    touchState(controller);
                    var currentParts = parts(captureCot, fullContent, fullCot);
                    onToken(contentDelta, currentParts.content, currentParts.cot);
                }
                return false;
            } catch (protocolError) {
                settleError(protocolError);
                return true;
            }
        }

        function processLines(lines) {
            for (var index = 0; index < lines.length; index++) {
                if (processLine(lines[index])) return true;
            }
            return false;
        }

        function pump() {
            return reader.read().then(function(result) {
                if (result.done) {
                    buffer += decoder.decode();
                    if (processLines(buffer.split(/\r\n|\r|\n/))) return settlementPromise || (doneSeen ? complete('done') : Promise.resolve());
                    return complete(doneSeen ? 'done' : 'eof');
                }
                buffer += decoder.decode(result.value, { stream: true });
                var lines = buffer.split(/\r\n|\r|\n/);
                buffer = lines.pop() || '';
                if (processLines(lines)) return settlementPromise || (doneSeen ? complete('done') : Promise.resolve());
                return doneSeen ? complete('done') : pump();
            }, function(error) {
                return error && error.name === 'AbortError' ? complete('abort') : settleError(error);
            });
        }

        return pump();
    }

    function readJson(response, captureCot, onComplete, onError, controller, requestDiagnostic, toolHooks, toolProtocol) {
        var settled = false;
        function settleError(error) {
            if (settled || (controller && controller._generationDeadlineTimedOut)) return Promise.resolve();
            settled = true;
            if (toolHooks && typeof toolHooks.onError === 'function') toolHooks.onError(toolHooks.accumulator, error);
            updateDiagnosticError(requestDiagnostic, error);
            finishState(controller);
            return Promise.resolve().then(function() { return onError(error); });
        }
        return Promise.resolve().then(function() { return response.json(); }).then(function(json) {
            if (settled || (controller && controller._generationDeadlineTimedOut)) return;
            try {
                if (toolHooks && typeof toolHooks.consume === 'function') toolHooks.consume(toolHooks.accumulator, json);
                if (typeof helpers.normalizeResponse === 'function') json = helpers.normalizeResponse(json);
                var error = providerError(json);
                if (error) return settleError(error);
                var choice = json && json.choices && json.choices[0];
                var message = choice && choice.message;
                if (!message) return settleError(new Error('Unexpected API response'));
                var parsedParts = parts(captureCot, message.content || '', cot(message));
                var parsedUsage = usage(json);
                var toolData = null;
                if (toolHooks && typeof toolHooks.finish === 'function') {
                    toolData = toolHooks.finish(toolHooks.accumulator, { content: parsedParts.content, cot: parsedParts.cot, usage: parsedUsage, finishReason: choice.finish_reason, ending: 'json' });
                }
                var identityError = toolIdentityFailure(toolData, choice.finish_reason, 'json', toolProtocol);
                if (identityError) {
                    if (toolHooks && typeof toolHooks.onIdentityError === 'function') {
                        settled = true;
                        return Promise.resolve().then(function() {
                            return toolHooks.onIdentityError(toolData, identityError, { content: parsedParts.content, cot: parsedParts.cot, usage: parsedUsage });
                        });
                    }
                    return settleError(identityError);
                }
                var toolCallsPresent = !!(toolData && toolData.hasToolCalls);
                var completion = buildCompletion(choice.finish_reason, 'json', controller, toolCallsPresent, toolRoundComplete(toolData, choice.finish_reason, 'json', controller, toolProtocol));
                if (toolHooks && typeof toolHooks.onFinal === 'function') toolHooks.onFinal(toolData, completion, { content: parsedParts.content, cot: parsedParts.cot, usage: parsedUsage });
                settled = true;
                if (toolCallsPresent && !completion.interrupted && typeof toolHooks.onToolRound === 'function') {
                    return Promise.resolve().then(function() {
                        return toolHooks.onToolRound(toolData, completion, { content: parsedParts.content, cot: parsedParts.cot, usage: parsedUsage });
                    });
                }
                var durationMs = finishState(controller);
                updateDiagnosticCompletion(requestDiagnostic, completion);
                return Promise.resolve().then(function() {
                    return onComplete(parsedParts.content, parsedParts.cot, typeof helpers.finalizeUsage === 'function' ? helpers.finalizeUsage(parsedUsage, durationMs) : parsedUsage, completion);
                });
            } catch (protocolError) {
                return settleError(protocolError);
            }
        }, settleError);
    }

    function request(messages, callbacks, requestOptions) {
        callbacks = callbacks || {};
        requestOptions = requestOptions || {};
        if (typeof fetch !== 'function') return Promise.reject(new Error('Missing fetch dependency'));
        var requestSettings = requestOptions.settings || settings || {};
        var modelTools = requestOptions.modelTools && requestOptions.modelTools.enabled !== false ? requestOptions.modelTools : null;
        var toolTrace = modelTools && typeof modelTools.createTrace === 'function' ? modelTools.createTrace() : null;
        try {
        var endpoint = typeof helpers.normalizeEndpoint === 'function' ? helpers.normalizeEndpoint(requestSettings.apiEndpoint, requestSettings.apiProtocol) : requestSettings.apiEndpoint;
        var useOllamaCompat = requestSettings.apiProtocol !== 'anthropic' && (typeof helpers.shouldUseOllamaCompat === 'function' ? helpers.shouldUseOllamaCompat(requestSettings.apiEndpoint) : false);
        var beforeMessages = messages;
        var requestMessages;
        if (typeof helpers.postProcessMessages === 'function') {
            var hasProtocolMessages = typeof isModelToolProtocolMessage === 'function' && messages.some(function(message) { return isModelToolProtocolMessage(message); });
            if (!hasProtocolMessages) {
                requestMessages = helpers.postProcessMessages(messages, requestSettings.promptPostProcessing, endpoint);
            } else {
                requestMessages = [];
                var ordinaryRun = [];
                var flushOrdinaryRun = function() {
                    if (!ordinaryRun.length) return;
                    var processedRun = helpers.postProcessMessages(ordinaryRun, requestSettings.promptPostProcessing, endpoint);
                    for (var processedIndex = 0; processedIndex < processedRun.length; processedIndex++) requestMessages.push(processedRun[processedIndex]);
                    ordinaryRun = [];
                };
                messages.forEach(function(message) {
                    if (typeof isModelToolProtocolMessage === 'function' && isModelToolProtocolMessage(message)) {
                        flushOrdinaryRun();
                        requestMessages.push(message);
                    } else ordinaryRun.push(message);
                });
                flushOrdinaryRun();
            }
        } else {
            requestMessages = useOllamaCompat && typeof helpers.normalizeOllamaMessages === 'function' ? helpers.normalizeOllamaMessages(messages) : messages;
        }
        var requestOptionsForPayload = requestOptions;
        var captureCot = !!(modelTools || (typeof helpers.shouldCaptureCot === 'function' ? helpers.shouldCaptureCot(requestSettings, requestOptions) : !!requestSettings.requestCotEnabled && requestOptions.requestCot !== false));
        var payload = payloadFor(requestMessages, requestOptionsForPayload);
        if (payload.stream && !useOllamaCompat && requestSettings.apiProtocol !== 'anthropic') payload.stream_options = { include_usage: true };
        var controller = typeof stateController.begin === 'function' ? stateController.begin(requestSettings) : null;
        if (payload.stream) armState(controller);
        var diagnostic = diagnosticFor(payload, beforeMessages, requestOptions);
        } catch (preparationError) { return fail(preparationError); }
        var settled = false;
        var taskDeadlineTimer = null;
        var activeToolHooks = null;
        var currentMessages = requestMessages;
        var currentPayload = payload;
        var currentDiagnostic = diagnostic;
        var toolRounds = 0;

        function clearTaskDeadline() {
            if (taskDeadlineTimer === null) return;
            clearTimeoutValue(taskDeadlineTimer);
            taskDeadlineTimer = null;
        }

        // 总任务计时覆盖网络、流读取、工具执行与续轮；到期直接中止所属请求。
        function armTaskDeadline() {
            clearTaskDeadline();
            if (!modelTools || !controller || typeof modelTools.taskDeadlineAt !== 'function') return;
            var remaining = Number(modelTools.taskDeadlineAt()) - now();
            if (!Number.isFinite(remaining)) return;
            taskDeadlineTimer = timeout(function() {
                taskDeadlineTimer = null;
                settleTaskDeadline();
            }, Math.max(0, remaining));
        }

        function settleTaskDeadline() {
            if (settled) return;
            if (controller) {
                controller._generationDeadlineTimedOut = true;
                try { controller.abort(); } catch (_) {}
            }
            var partial = null;
            if (activeToolHooks && activeToolHooks.accumulator && modelTools && typeof modelTools.finishAccumulator === 'function') {
                try {
                    partial = modelTools.finishAccumulator(activeToolHooks.accumulator, { content: '', cot: '', usage: null, finishReason: null, ending: 'timeout' });
                } catch (_) { partial = null; }
            }
            finishToolInterruption('timeout', partial, null);
        }

        function complete(content, cotValue, usageValue, completion) {
            if (settled) return Promise.resolve();
            settled = true;
            clearTaskDeadline();
            var contextCompletion = setCompletionContext(completion, requestOptions.generationContext);
            return Promise.resolve().then(function() { return callbacks.onComplete(content, cotValue, usageValue, contextCompletion); });
        }

        function finishToolInterruption(reason, toolData, info, error) {
            if (settled) return Promise.resolve();
            settled = true;
            clearTaskDeadline();
            var completion = buildCompletion(null, reason === 'timeout' ? 'timeout' : 'abort', controller, true);
            if (reason && reason !== 'timeout' && reason !== 'abort' && reason !== 'unknown') completion.completionReason = reason;
            if (modelTools && typeof modelTools.finishTurn === 'function') {
                modelTools.finishTurn(toolTrace, toolData, completion, {
                    interrupted: true, reason: reason, error: error,
                    content: info && info.content || '', cot: info && info.cot || '', usage: info && info.usage || null
                });
            }
            if (error) updateDiagnosticError(currentDiagnostic, error);
            else updateDiagnosticCompletion(currentDiagnostic, completion);
            finishState(controller);
            return Promise.resolve().then(function() {
                return callbacks.onComplete(info && info.content || '', info && info.cot || '', null, setCompletionContext(completion, requestOptions.generationContext));
            });
        }

        function fail(error) {
            if (settled) return Promise.resolve();
            clearTaskDeadline();
            if (modelTools && typeof modelTools.hasActivity === 'function' && modelTools.hasActivity(toolTrace)) {
                return finishToolInterruption('unknown', null, null, error);
            }
            settled = true;
            updateDiagnosticError(currentDiagnostic, error);
            finishState(controller);
            return Promise.resolve().then(function() { return callbacks.onError && callbacks.onError(error); });
        }

        // 身份无效且尚未执行任何工具时给出明确错误；已执行过工具时保留既有记录并结算为 unknown。
        function failToolIdentity(toolData, error, info) {
            if (settled) return Promise.resolve();
            settled = true;
            clearTaskDeadline();
            if (toolRounds > 0 && modelTools && typeof modelTools.finishTurn === 'function') {
                var completion = buildCompletion(null, 'done', controller, true);
                modelTools.finishTurn(toolTrace, toolData, completion, {
                    interrupted: true, reason: 'unknown', error: error,
                    content: info && info.content || '', cot: info && info.cot || '', usage: info && info.usage || null
                });
                updateDiagnosticError(currentDiagnostic, error);
                finishState(controller);
                return Promise.resolve().then(function() {
                    return callbacks.onComplete('', '', null, setCompletionContext(completion, requestOptions.generationContext));
                });
            }
            updateDiagnosticError(currentDiagnostic, error);
            finishState(controller);
            return Promise.resolve().then(function() { return callbacks.onError && callbacks.onError(error); });
        }

        function interrupted() {
            if (settled) return Promise.resolve();
            settled = true;
            clearTaskDeadline();
            var completion = buildCompletion(null, 'abort', controller, modelTools ? true : false);
            if (modelTools && typeof modelTools.finishTurn === 'function') {
                modelTools.finishTurn(toolTrace, null, completion, { interrupted: true, reason: 'abort' });
            }
            updateDiagnosticCompletion(currentDiagnostic, completion);
            finishState(controller);
            return Promise.resolve().then(function() { return callbacks.onComplete('', '', null, setCompletionContext(completion, requestOptions.generationContext)); });
        }

        function createToolHooks() {
            if (!modelTools) return null;
            return {
                accumulator: modelTools.newAccumulator(),
                consume: function(accumulator, raw) { modelTools.consume(accumulator, raw); },
                finish: function(accumulator, info) { return modelTools.finishAccumulator(accumulator, info); },
                onFinal: function(toolData, completion, info) {
                    if (completion.interrupted && typeof modelTools.finishTurn === 'function') {
                        modelTools.finishTurn(toolTrace, toolData, completion, Object.assign({ interrupted: true }, info || {}));
                    } else if (!toolData || !toolData.hasToolCalls) {
                        modelTools.finishTurn(toolTrace, toolData, completion, info || {});
                    }
                },
                onToolRound: function(toolData, completion, info) { return handleToolRound(toolData, completion, info); },
                onError: function(accumulator, error) {
                    if (typeof modelTools.recordError === 'function') modelTools.recordError(toolTrace, error, accumulator);
                },
                onIdentityError: function(toolData, error, info) { return failToolIdentity(toolData, error, info); }
            };
        }

        function handleToolRound(toolData, completion, info) {
            if (settled) return Promise.resolve();
            if (!modelTools.isCurrent()) return finishToolInterruption('abort', toolData, info);
            if (typeof modelTools.isTaskExpired === 'function' && modelTools.isTaskExpired()) return finishToolInterruption('timeout', toolData, info);
            if (toolRounds >= MODEL_TOOL_MAX_ROUNDS) return finishToolInterruption('round_limit', toolData, info);
            var roundResult;
            try {
                roundResult = modelTools.onToolRound(toolTrace, toolData, {
                    controller: controller,
                    round: toolRounds,
                    content: info && info.content || '',
                    cot: info && info.cot || '',
                    usage: info && info.usage || null,
                    requestMessageCount: currentMessages.length,
                    requestRoles: currentMessages.map(function(message) { return message && message.role || ''; }),
                    finishReason: completion.finishReason
                });
            } catch (roundError) {
                return finishToolInterruption('unknown', toolData, info, roundError);
            }
            toolRounds++;
            return Promise.resolve(roundResult).then(function(result) {
                if (settled) return;
                if (!result || result.stop) return finishToolInterruption(result && result.stop || 'abort', toolData, info);
                if (!modelTools.isCurrent()) return finishToolInterruption('abort', toolData, info);
                currentMessages = currentMessages.concat(result.nextMessages || []);
                return persistToolRoundDraft(info).then(function() {
                    if (settled) return;
                    // 恢复记录 ACK 可能迟到：写入成功后必须重新核对当前运行与总期限，旧请求不得续跑。
                    if (!modelTools.isCurrent()) return finishToolInterruption('abort', null, info);
                    if (typeof modelTools.isTaskExpired === 'function' && modelTools.isTaskExpired()) return finishToolInterruption('timeout', null, info);
                    return fetchRound(false);
                }, function(draftError) {
                    // checkpoint 失败时工具已经实际执行过，保留已发生记录，本轮按 interrupted 有限结算并记录失败，不请求下一轮。
                    return finishToolInterruption('unknown', null, info, draftError);
                });
            }, function(roundError) {
                return finishToolInterruption('unknown', toolData, info, roundError);
            });
        }

        // 已执行的工具轮立即形成有界本机恢复记录；最终回复仍待定，标记为 unknown。
        // 返回写入完成的 promise，调用方必须在发送下一轮前等待其 ACK。
        function persistToolRoundDraft(info) {
            if (typeof callbacks.onToolRoundComplete !== 'function' || typeof modelTools.snapshotTrace !== 'function') return Promise.resolve();
            var snapshot = null;
            try { snapshot = modelTools.snapshotTrace(toolTrace, 'unknown'); } catch (_) { snapshot = null; }
            if (!snapshot) return Promise.resolve();
            return Promise.resolve().then(function() {
                return callbacks.onToolRoundComplete({ trace: snapshot, content: info && info.content || '', cot: info && info.cot || '' });
            });
        }

        function fetchRound(first) {
            if (settled) return Promise.resolve();
            if (modelTools && !modelTools.isCurrent()) return finishToolInterruption('abort', null, null);
            if (modelTools && typeof modelTools.isTaskExpired === 'function' && modelTools.isTaskExpired()) return finishToolInterruption('timeout', null, null);
            if (!first) {
                try {
                    currentPayload = payloadFor(currentMessages, requestOptionsForPayload);
                    if (currentPayload.stream && !useOllamaCompat && requestSettings.apiProtocol !== 'anthropic') currentPayload.stream_options = { include_usage: true };
                    currentDiagnostic = diagnosticFor(currentPayload, currentMessages, requestOptions);
                } catch (preparationError) {
                    return fail(preparationError);
                }
                if (currentPayload.stream) armState(controller);
            }
            var toolHooks = createToolHooks();
            activeToolHooks = toolHooks;
            var responsePromise;
            try {
                responsePromise = fetch(endpoint, fetchOptionsFor(currentPayload, controller));
            } catch (fetchError) {
                return fetchError && fetchError.name === 'AbortError' ? interrupted() : fail(fetchError);
            }
            return Promise.resolve(responsePromise).then(function(response) {
                if (!response.ok) return apiError(response).then(fail, fail);
                if (currentPayload.stream) {
                    touchState(controller);
                    return readStream(response, captureCot, callbacks.onToken || function() {}, complete, fail, controller, currentDiagnostic, toolHooks, modelTools && modelTools.protocol);
                }
                return readJson(response, captureCot, complete, fail, controller, currentDiagnostic, toolHooks, modelTools && modelTools.protocol);
            }, function(error) {
                return error && error.name === 'AbortError' ? interrupted() : fail(error);
            });
        }

        armTaskDeadline();
        return fetchRound(true);
    }

    return { request: request, readStream: readStream, readJson: readJson, buildCompletion: buildCompletion, now: now, timeout: timeout, clearTimeout: clearTimeoutValue };
}
