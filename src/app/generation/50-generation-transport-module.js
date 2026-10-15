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

    function buildCompletion(finishReason, ending, controller) {
        var rawFinishReason = finishReason === undefined || finishReason === null || finishReason === '' ? null : String(finishReason);
        var aborted = !!(controller && controller.signal && controller.signal.aborted);
        var timedOut = ending === 'timeout' || !!(controller && controller._generationIdleTimedOut);
        var interrupted = timedOut || ending === 'abort' || aborted || (rawFinishReason ? rawFinishReason !== 'stop' : ending === 'eof');
        var completionReason = timedOut ? 'timeout' : (aborted || ending === 'abort' ? 'abort' : (rawFinishReason || ending));
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

    function readStream(response, captureCot, onToken, onComplete, onError, controller, requestDiagnostic) {
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
            if (settled) return Promise.resolve();
            settled = true;
            var durationMs = finishState(controller);
            var finalParts = parts(captureCot, fullContent, fullCot);
            var completion = buildCompletion(finishReason, ending, controller);
            updateDiagnosticCompletion(requestDiagnostic, completion);
            settlementPromise = Promise.resolve().then(function() {
                return onComplete(finalParts.content, finalParts.cot, typeof helpers.finalizeUsage === 'function' ? helpers.finalizeUsage(usageMeta, durationMs) : usageMeta, completion);
            });
            return settlementPromise;
        }

        function settleError(error) {
            if (settled) return Promise.resolve();
            settled = true;
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
                var error = providerError(json);
                if (error) return settleError(error), true;
                var choice = json && json.choices && json.choices[0];
                if (choice && choice.finish_reason !== undefined && choice.finish_reason !== null) finishReason = choice.finish_reason;
                var parsedUsage = usage(json);
                if (parsedUsage) usageMeta = parsedUsage;
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

    function readJson(response, captureCot, onComplete, onError, controller, requestDiagnostic) {
        var settled = false;
        function settleError(error) {
            if (settled) return Promise.resolve();
            settled = true;
            updateDiagnosticError(requestDiagnostic, error);
            finishState(controller);
            return Promise.resolve().then(function() { return onError(error); });
        }
        return Promise.resolve().then(function() { return response.json(); }).then(function(json) {
            if (settled) return;
            try {
                var error = providerError(json);
                if (error) return settleError(error);
                var choice = json && json.choices && json.choices[0];
                var message = choice && choice.message;
                if (!message) return settleError(new Error('Unexpected API response'));
                var parsedParts = parts(captureCot, message.content || '', cot(message));
                var parsedUsage = usage(json);
                settled = true;
                var durationMs = finishState(controller);
                var completion = buildCompletion(choice.finish_reason, 'json', controller);
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
        var endpoint = typeof helpers.normalizeEndpoint === 'function' ? helpers.normalizeEndpoint(requestSettings.apiEndpoint) : requestSettings.apiEndpoint;
        var useOllamaCompat = typeof helpers.shouldUseOllamaCompat === 'function' ? helpers.shouldUseOllamaCompat(requestSettings.apiEndpoint) : false;
        var beforeMessages = messages;
        var requestMessages = typeof helpers.postProcessMessages === 'function'
            ? helpers.postProcessMessages(messages, requestSettings.promptPostProcessing, endpoint)
            : (useOllamaCompat && typeof helpers.normalizeOllamaMessages === 'function' ? helpers.normalizeOllamaMessages(messages) : messages);
        var requestOptionsForPayload = requestOptions;
        var captureCot = typeof helpers.shouldCaptureCot === 'function' ? helpers.shouldCaptureCot(requestSettings, requestOptions) : !!requestSettings.requestCotEnabled && requestOptions.requestCot !== false;
        var payload = payloadFor(requestMessages, requestOptionsForPayload);
        if (payload.stream && !useOllamaCompat) payload.stream_options = { include_usage: true };
        var controller = typeof stateController.begin === 'function' ? stateController.begin(requestSettings) : null;
        if (payload.stream) armState(controller);
        var diagnostic = diagnosticFor(payload, beforeMessages, requestOptions);
        var settled = false;

        function complete(content, cotValue, usageValue, completion) {
            if (settled) return Promise.resolve();
            settled = true;
            var contextCompletion = setCompletionContext(completion, requestOptions.generationContext);
            return Promise.resolve().then(function() { return callbacks.onComplete(content, cotValue, usageValue, contextCompletion); });
        }

        function fail(error) {
            if (settled) return Promise.resolve();
            settled = true;
            updateDiagnosticError(diagnostic, error);
            finishState(controller);
            return Promise.resolve().then(function() { return callbacks.onError && callbacks.onError(error); });
        }

        function interrupted() {
            if (settled) return Promise.resolve();
            settled = true;
            var completion = buildCompletion(null, 'abort', controller);
            updateDiagnosticCompletion(diagnostic, completion);
            finishState(controller);
            return Promise.resolve().then(function() { return callbacks.onComplete('', '', null, setCompletionContext(completion, requestOptions.generationContext)); });
        }

        var responsePromise;
        try {
            responsePromise = fetch(endpoint, fetchOptionsFor(payload, controller));
        } catch (fetchError) {
            return fetchError && fetchError.name === 'AbortError' ? interrupted() : fail(fetchError);
        }
        return Promise.resolve(responsePromise).then(function(response) {
            if (!response.ok) return apiError(response).then(fail, fail);
            if (payload.stream) {
                touchState(controller);
                return readStream(response, captureCot, callbacks.onToken || function() {}, complete, fail, controller, diagnostic);
            }
            return readJson(response, captureCot, complete, fail, controller, diagnostic);
        }, function(error) {
            return error && error.name === 'AbortError' ? interrupted() : fail(error);
        });
    }

    return { request: request, readStream: readStream, readJson: readJson, buildCompletion: buildCompletion, now: now, timeout: timeout, clearTimeout: clearTimeoutValue };
}
