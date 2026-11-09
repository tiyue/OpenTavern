// 模型工具注册、严格参数校验、本机会话授权与有界工具记录。
// 这里只保存可审计的数据；执行器、传输累积器和界面渲染分别位于后续分片。
var MODEL_TOOL_MAX_ROUNDS = 4;
var MODEL_TOOL_MAX_CALLS = 6;
var MODEL_TOOL_MAX_ARGUMENT_BYTES = 8192;
var MODEL_TOOL_MAX_RESULT_BYTES = 16384;
var MODEL_TOOL_MAX_TOTAL_RESULT_BYTES = 32768;
var MODEL_TOOL_MAX_EXECUTION_MS = 4000;
var MODEL_TOOL_MAX_TASK_MS = 120000;
var MODEL_TOOL_MAX_NATIVE_BYTES = 131072;
var MODEL_TOOL_MAX_TRACE_BYTES = 262144;
var MODEL_TOOL_MAX_QUERY_LENGTH = 200;
var MODEL_TOOL_MAX_RESULTS = 10;
var MODEL_TOOL_DEFAULT_RESULTS = 5;
var modelToolRegistry = Object.create(null);

function modelToolPlainRecord(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function modelToolClone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function modelToolBoundedString(value, max) {
    return String(value == null ? '' : value).slice(0, max);
}

function modelToolJsonBytes(value) {
    try { return modelToolUtf8Bytes(JSON.stringify(value)); } catch (_) { return Infinity; }
}

function modelToolUtf8Bytes(value) {
    var text = String(value == null ? '' : value);
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text).length;
    try { return unescape(encodeURIComponent(text)).length; } catch (_) { return text.length; }
}

function assertSupportedModelToolSchema(schema, path) {
    path = path || 'schema';
    if (!modelToolPlainRecord(schema)) throw new Error(path + ' must be an object.');
    if (typeof schema.type !== 'string') throw new Error(path + ' requires a string type.');
    var allowed = ['type', 'description', 'title', 'enum'];
    if (schema.type === 'object') allowed = allowed.concat(['properties', 'required', 'additionalProperties']);
    else if (schema.type === 'string') allowed = allowed.concat(['minLength', 'maxLength']);
    else if (schema.type === 'integer' || schema.type === 'number') allowed = allowed.concat(['minimum', 'maximum']);
    else if (schema.type === 'array') allowed = allowed.concat(['items', 'minItems', 'maxItems']);
    else if (schema.type !== 'boolean') throw new Error(path + ' has an unsupported type.');
    Object.keys(schema).forEach(function(key) {
        if (allowed.indexOf(key) < 0) throw new Error(path + ' has unsupported keyword ' + key + '.');
    });
    if (schema.enum !== undefined && (!Array.isArray(schema.enum) || !schema.enum.length || schema.enum.some(function(value) {
        return value !== null && ['string', 'number', 'boolean'].indexOf(typeof value) < 0;
    }))) throw new Error(path + '.enum must be a non-empty array of primitive values.');
    if (schema.type === 'object') {
        if (!modelToolPlainRecord(schema.properties)) throw new Error(path + '.properties must be an object.');
        if (schema.additionalProperties !== false) throw new Error(path + ' only supports additionalProperties:false.');
        var required = schema.required === undefined ? [] : schema.required;
        if (!Array.isArray(required) || required.some(function(name) { return typeof name !== 'string' || !Object.prototype.hasOwnProperty.call(schema.properties, name); })) {
            throw new Error(path + '.required must reference declared properties.');
        }
        Object.keys(schema.properties).forEach(function(name) {
            assertSupportedModelToolSchema(schema.properties[name], path + '.properties.' + name);
        });
    }
    if (schema.type === 'array') {
        if (!schema.items) throw new Error(path + '.items is required.');
        assertSupportedModelToolSchema(schema.items, path + '.items');
    }
    if (schema.type === 'string' && schema.minLength !== undefined && (!Number.isInteger(schema.minLength) || schema.minLength < 0)) throw new Error(path + '.minLength must be a non-negative integer.');
    if (schema.type === 'string' && schema.maxLength !== undefined && (!Number.isInteger(schema.maxLength) || schema.maxLength < 0)) throw new Error(path + '.maxLength must be a non-negative integer.');
    if (schema.type === 'integer' || schema.type === 'number') {
        [schema.minimum, schema.maximum].forEach(function(value) {
            if (value !== undefined && !Number.isFinite(value)) throw new Error(path + ' numeric bounds must be finite.');
        });
    }
    if (schema.type === 'array') {
        [schema.minItems, schema.maxItems].forEach(function(value) {
            if (value !== undefined && (!Number.isInteger(value) || value < 0)) throw new Error(path + ' item limits must be non-negative integers.');
        });
    }
}

function registerModelTool(definition) {
    if (!modelToolPlainRecord(definition)) throw new Error('Tool definition must be an object.');
    var name = String(definition.name || '');
    if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(name)) throw new Error('Tool name is invalid.');
    assertSupportedModelToolSchema(definition.inputSchema, name);
    if (typeof definition.execute !== 'function') throw new Error('Tool executor is required.');
    var tool = {
        name: name,
        description: modelToolBoundedString(definition.description, 1000),
        inputSchema: modelToolClone(definition.inputSchema),
        execute: definition.execute
    };
    modelToolRegistry[name] = tool;
    return tool;
}

function getModelToolDefinition(name) {
    return typeof name === 'string' && modelToolRegistry[name] || null;
}

function listModelToolDefinitions() {
    return Object.keys(modelToolRegistry).map(function(name) { return modelToolRegistry[name]; });
}

function validateModelToolSchemaValue(schema, value, path, errors) {
    if (schema.enum && !schema.enum.some(function(item) { return item === value; })) errors.push(path + ' is not an allowed value');
    if (schema.type === 'object') {
        if (!modelToolPlainRecord(value)) { errors.push(path + ' must be an object'); return; }
        var properties = schema.properties || {};
        (schema.required || []).forEach(function(name) {
            if (!Object.prototype.hasOwnProperty.call(value, name)) errors.push(path + '.' + name + ' is required');
        });
        Object.keys(value).forEach(function(name) {
            if (Object.prototype.hasOwnProperty.call(properties, name)) validateModelToolSchemaValue(properties[name], value[name], path + '.' + name, errors);
            else if (schema.additionalProperties === false) errors.push(path + '.' + name + ' is not allowed');
        });
        return;
    }
    if (schema.type === 'array') {
        if (!Array.isArray(value)) { errors.push(path + ' must be an array'); return; }
        if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(path + ' has too few items');
        if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(path + ' has too many items');
        value.forEach(function(item, index) { validateModelToolSchemaValue(schema.items, item, path + '[' + index + ']', errors); });
        return;
    }
    if (schema.type === 'string') {
        if (typeof value !== 'string') { errors.push(path + ' must be a string'); return; }
        if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(path + ' is too short');
        if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push(path + ' is too long');
        return;
    }
    if (schema.type === 'integer') {
        if (!Number.isInteger(value)) { errors.push(path + ' must be an integer'); return; }
    } else if (schema.type === 'number') {
        if (!Number.isFinite(value)) { errors.push(path + ' must be a finite number'); return; }
    } else if (schema.type === 'boolean') {
        if (typeof value !== 'boolean') { errors.push(path + ' must be a boolean'); return; }
    }
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(path + ' is below the minimum');
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(path + ' is above the maximum');
}

function validateModelToolArguments(tool, args) {
    var errors = [];
    validateModelToolSchemaValue(tool.inputSchema, args, tool.name, errors);
    return { valid: errors.length === 0, errors: errors };
}

function normalizeModelToolGrants(value) {
    var result = Object.create(null);
    if (!modelToolPlainRecord(value)) return result;
    Object.keys(value).forEach(function(conversationId) {
        if (['__proto__', 'constructor', 'prototype'].indexOf(conversationId) >= 0 || conversationId.length > 200) return;
        var names = Array.isArray(value[conversationId]) ? value[conversationId] : [];
        var unique = [];
        names.forEach(function(name) {
            if (typeof name !== 'string' || unique.indexOf(name) >= 0 || !getModelToolDefinition(name)) return;
            unique.push(name);
        });
        if (unique.length) result[conversationId] = unique.slice(0, 16);
    });
    return result;
}

function getModelToolGrantsForConversation(conversationId) {
    var grants = normalizeModelToolGrants(state.settings && state.settings.modelToolGrants);
    return grants[conversationId] || [];
}

function setModelToolConversationGrant(conversationId, toolName, enabled) {
    if (!conversationId || typeof conversationId !== 'string' || !getModelToolDefinition(toolName)) return false;
    var grants = normalizeModelToolGrants(state.settings && state.settings.modelToolGrants);
    var names = grants[conversationId] || [];
    var index = names.indexOf(toolName);
    if (enabled && index < 0) names = names.concat([toolName]);
    if (!enabled && index >= 0) names = names.filter(function(name) { return name !== toolName; });
    if (names.length) grants[conversationId] = names;
    else delete grants[conversationId];
    state.settings.modelToolGrants = grants;
    return true;
}

function isModelToolAuthorizedForConversation(conv, settings, toolName) {
    if (!conv || !getModelToolDefinition(toolName)) return false;
    if (typeof isLiveConversation === 'function' && !isLiveConversation(conv)) return false;
    var grants = normalizeModelToolGrants((settings || state.settings || {}).modelToolGrants);
    return (grants[conv.id] || []).indexOf(toolName) >= 0;
}

function getAuthorizedModelToolNames(conv, settings) {
    if (!conv) return [];
    var grants = normalizeModelToolGrants((settings || state.settings || {}).modelToolGrants);
    return (grants[conv.id] || []).filter(function(name) { return !!getModelToolDefinition(name); });
}

function buildModelToolWireDefinitions(protocol, toolNames) {
    var names = Array.isArray(toolNames) ? toolNames : [];
    return names.map(getModelToolDefinition).filter(Boolean).map(function(tool) {
        if (normalizeApiProtocol(protocol) === 'anthropic') {
            return { name: tool.name, description: tool.description, input_schema: modelToolClone(tool.inputSchema) };
        }
        return { type: 'function', function: { name: tool.name, description: tool.description, parameters: modelToolClone(tool.inputSchema) } };
    });
}

function searchConversationMessagesForTool(conv, args) {
    var query = modelToolBoundedString(args && args.query, MODEL_TOOL_MAX_QUERY_LENGTH).trim();
    var maxResults = args && Number.isInteger(args.maxResults) ? Math.min(MODEL_TOOL_MAX_RESULTS, Math.max(1, args.maxResults)) : MODEL_TOOL_DEFAULT_RESULTS;
    var results = [];
    var totalMatches = 0;
    var totalBytes = 0;
    var truncated = false;
    var lowerQuery = query.toLowerCase();
    (conv && Array.isArray(conv.messages) ? conv.messages : []).forEach(function(message) {
        if (!message || message.role === 'system' || message.stage === 'second' || typeof message.content !== 'string' || !message.content) return;
        var at = message.content.toLowerCase().indexOf(lowerQuery);
        if (at < 0) return;
        totalMatches++;
        if (results.length >= maxResults) { truncated = true; return; }
        var start = Math.max(0, at - 80);
        var end = Math.min(message.content.length, at + query.length + 120);
        var item = {
            messageId: String(message.id || ''),
            revision: typeof getMessageRevision === 'function' ? getMessageRevision(message) : '',
            role: message.role,
            stage: message.stage || 'main',
            snippet: (start > 0 ? '…' : '') + message.content.slice(start, end) + (end < message.content.length ? '…' : '')
        };
        var size = modelToolUtf8Bytes(JSON.stringify(item));
        if (totalBytes + size > MODEL_TOOL_MAX_RESULT_BYTES) { truncated = true; return; }
        totalBytes += size;
        results.push(item);
    });
    var output = JSON.stringify({ query: query, totalMatches: totalMatches, returned: results.length, truncated: truncated, results: results });
    while (modelToolUtf8Bytes(output) > MODEL_TOOL_MAX_RESULT_BYTES && results.length) {
        results.pop();
        truncated = true;
        output = JSON.stringify({ query: query, totalMatches: totalMatches, returned: results.length, truncated: truncated, results: results });
    }
    return output;
}

function executeModelTool(name, args, context) {
    var tool = getModelToolDefinition(name);
    if (!tool) throw new Error('Unknown tool.');
    return tool.execute(args, context || {});
}

registerModelTool({
    name: 'search_conversation',
    description: 'Read-only search of saved user and assistant text in the current conversation. Returns bounded snippets, message IDs and revisions. It cannot read other conversations, settings, credentials, drafts or hidden reasoning.',
    inputSchema: {
        type: 'object',
        properties: {
            query: { type: 'string', minLength: 1, maxLength: MODEL_TOOL_MAX_QUERY_LENGTH, description: 'Literal text to search for.' },
            maxResults: { type: 'integer', minimum: 1, maximum: MODEL_TOOL_MAX_RESULTS, description: 'Maximum number of snippets.' }
        },
        required: ['query'],
        additionalProperties: false
    },
    execute: function(args, context) {
        if (!context || !context.conversation) throw new Error('No current conversation.');
        return searchConversationMessagesForTool(context.conversation, args);
    }
});

function normalizeModelToolTraceCall(call) {
    if (!modelToolPlainRecord(call)) return null;
    var id = modelToolBoundedString(call.id, 128) || '(invalid)';
    var name = modelToolBoundedString(call.name, 64) || '(unknown)';
    return {
        id: id,
        name: name,
        arguments: modelToolBoundedString(call.arguments, 2048),
        status: ['completed', 'error', 'reused', 'not-run'].indexOf(call.status) >= 0 ? call.status : 'error',
        resultPreview: modelToolBoundedString(call.resultPreview, 1200),
        resultBytes: Math.max(0, Math.min(Number(call.resultBytes) || 0, 100000000)),
        durationMs: Math.max(0, Math.min(Number(call.durationMs) || 0, MODEL_TOOL_MAX_TASK_MS)),
        error: modelToolBoundedString(call.error, 500)
    };
}

function normalizeModelToolNative(value) {
    if (value === undefined || value === null) return { ok: true, value: null };
    try {
        var cloned = modelToolClone(value);
        return modelToolJsonBytes(cloned) <= MODEL_TOOL_MAX_NATIVE_BYTES ? { ok: true, value: cloned } : { ok: false, value: null };
    } catch (_) {
        return { ok: false, value: null };
    }
}

function normalizeModelToolTraceDiagnostics(diagnostics) {
    if (!modelToolPlainRecord(diagnostics)) return null;
    var rounds = [];
    (Array.isArray(diagnostics.rounds) ? diagnostics.rounds : []).slice(0, MODEL_TOOL_MAX_ROUNDS + 1).forEach(function(round) {
        if (!modelToolPlainRecord(round)) return;
        rounds.push({
            round: Number(round.round) || rounds.length,
            callCount: Math.max(0, Math.min(Number(round.callCount) || 0, MODEL_TOOL_MAX_CALLS)),
            toolNames: (Array.isArray(round.toolNames) ? round.toolNames : []).slice(0, MODEL_TOOL_MAX_CALLS).map(function(name) { return modelToolBoundedString(name, 64); }),
            resultBytes: Math.max(0, Number(round.resultBytes) || 0),
            finishReason: modelToolBoundedString(round.finishReason, 80),
            usage: modelToolPlainRecord(round.usage) ? {
                promptTokens: Number(round.usage.promptTokens) || 0,
                completionTokens: Number(round.usage.completionTokens) || 0,
                cachedTokens: Number(round.usage.cachedTokens) || 0,
                totalTokens: Number(round.usage.totalTokens) || 0,
                source: modelToolBoundedString(round.usage.source, 40)
            } : null,
            requestMessageCount: Math.max(0, Number(round.requestMessageCount) || 0),
            requestRoles: (Array.isArray(round.requestRoles) ? round.requestRoles : []).slice(0, 256).map(function(role) { return modelToolBoundedString(role, 20); })
        });
    });
    return {
        model: modelToolBoundedString(diagnostics.model, 120),
        protocol: normalizeApiProtocol(diagnostics.protocol),
        toolNames: (Array.isArray(diagnostics.toolNames) ? diagnostics.toolNames : []).slice(0, 16).map(function(name) { return modelToolBoundedString(name, 64); }),
        rounds: rounds,
        errors: (Array.isArray(diagnostics.errors) ? diagnostics.errors : []).slice(0, 8).map(function(error) { return modelToolBoundedString(error, 500); }),
        finishReason: modelToolBoundedString(diagnostics.finishReason, 80),
        completionReason: modelToolBoundedString(diagnostics.completionReason, 80),
        finished: Number(diagnostics.finished) || 0
    };
}

function normalizeModelToolTrace(trace) {
    if (!modelToolPlainRecord(trace) || trace.version !== 1) return null;
    var protocol = normalizeApiProtocol(trace.protocol);
    var rounds = [];
    var callCount = 0;
    var nativeOmitted = trace.nativeOmitted === true;
    (Array.isArray(trace.rounds) ? trace.rounds : []).slice(0, MODEL_TOOL_MAX_ROUNDS + 1).forEach(function(round) {
        if (!modelToolPlainRecord(round) || callCount >= MODEL_TOOL_MAX_CALLS) return;
        var calls = [];
        (Array.isArray(round.calls) ? round.calls : []).forEach(function(call) {
            if (callCount >= MODEL_TOOL_MAX_CALLS) return;
            var normalized = normalizeModelToolTraceCall(call);
            if (!normalized) return;
            calls.push(normalized);
            callCount++;
        });
        var assistantNative = normalizeModelToolNative(round.assistantNative);
        var resultNative = normalizeModelToolNative(round.resultNative);
        if (!assistantNative.ok || !resultNative.ok) nativeOmitted = true;
        rounds.push({
            index: rounds.length,
            calls: calls,
            assistantNative: assistantNative.ok ? assistantNative.value : null,
            resultNative: resultNative.ok ? resultNative.value : null
        });
    });
    var finalNative = normalizeModelToolNative(trace.finalNative);
    if (!finalNative.ok) nativeOmitted = true;
    var normalized = {
        version: 1,
        protocol: protocol,
        connection: modelToolBoundedString(trace.connection, 160),
        status: ['running', 'completed', 'interrupted', 'unknown'].indexOf(trace.status) >= 0 ? trace.status : 'unknown',
        nativeOmitted: nativeOmitted,
        rounds: rounds,
        finalNative: finalNative.ok ? finalNative.value : null,
        diagnostics: normalizeModelToolTraceDiagnostics(trace.diagnostics),
        started: Number(trace.started) || 0,
        finished: Number(trace.finished) || 0
    };
    if (modelToolJsonBytes(normalized) > MODEL_TOOL_MAX_TRACE_BYTES) {
        normalized.nativeOmitted = true;
        normalized.rounds.forEach(function(round) { round.assistantNative = null; round.resultNative = null; });
        normalized.finalNative = null;
        normalized.diagnostics = null;
    }
    return modelToolJsonBytes(normalized) <= MODEL_TOOL_MAX_TRACE_BYTES ? normalized : null;
}

function hasModelToolTrace(trace) {
    var normalized = normalizeModelToolTrace(trace);
    return !!(normalized && (normalized.rounds.some(function(round) { return round.calls.length; }) || modelToolNativeHasReasoning(normalized.finalNative)));
}

function modelToolNativeHasReasoning(native) {
    if (!modelToolPlainRecord(native)) return false;
    if (typeof native.reasoning_content === 'string' && native.reasoning_content) return true;
    return Array.isArray(native.content) && native.content.some(function(block) {
        return block && (block.type === 'thinking' || block.type === 'redacted_thinking');
    });
}

function getModelToolTraceIdentity(trace) {
    var normalized = normalizeModelToolTrace(trace);
    if (!normalized || (!normalized.rounds.some(function(round) { return round.calls.length; }) && !modelToolNativeHasReasoning(normalized.finalNative))) return null;
    return 'tool:' + JSON.stringify(normalized);
}

function mergeModelToolTraces(previous, next) {
    var left = normalizeModelToolTrace(previous);
    var right = normalizeModelToolTrace(next);
    if (!left) return right;
    if (!right) return left;
    if (left.protocol !== right.protocol || left.connection !== right.connection) return right;
    var merged = modelToolClone(left);
    merged.rounds = left.rounds.concat(right.rounds).slice(-(MODEL_TOOL_MAX_ROUNDS + 1)).map(function(round, index) {
        round.index = index;
        return round;
    });
    merged.finalNative = right.finalNative || left.finalNative;
    merged.status = right.status;
    merged.nativeOmitted = left.nativeOmitted || right.nativeOmitted;
    merged.diagnostics = right.diagnostics || left.diagnostics;
    merged.finished = right.finished || left.finished;
    return normalizeModelToolTrace(merged);
}
