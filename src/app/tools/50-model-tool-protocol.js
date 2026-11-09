// OpenAI / Anthropic 原生工具响应的流式累积与原生回传消息构造。
// 这里不执行工具，也不信任工具参数；调用完成、参数完整后才交给运行时校验。
function createModelToolAccumulator(protocol) {
    return {
        protocol: normalizeApiProtocol(protocol),
        openai: { content: '', reasoning: '', calls: [], finalMessage: null },
        anthropic: { blocks: [], states: Object.create(null), rawMessage: null, stopReason: null },
        sawToolActivity: false
    };
}

function modelToolCallSafeId(value) {
    return typeof value === 'string' && value && value.length <= 128 ? value : '';
}

function modelToolCallIdentityError(value, position) {
    if (value === undefined || value === null || value === '') return 'Tool call ' + position + ' has no id.';
    if (typeof value !== 'string' || value.length > 128) return 'Tool call ' + position + ' has an invalid id.';
    return '';
}

function modelToolCloneNative(value) {
    try { return value === undefined || value === null ? null : JSON.parse(JSON.stringify(value)); } catch (_) { return null; }
}

function consumeOpenAiModelToolChunk(acc, raw) {
    var choice = raw && raw.choices && raw.choices[0];
    if (!choice) return;
    if (choice.message && acc.openai.finalMessage === null) {
        acc.openai.finalMessage = modelToolCloneNative(choice.message);
        if (typeof choice.message.content === 'string') acc.openai.content = choice.message.content;
        if (typeof choice.message.reasoning_content === 'string') acc.openai.reasoning = choice.message.reasoning_content;
        (Array.isArray(choice.message.tool_calls) ? choice.message.tool_calls : []).forEach(function(call, index) {
            var rawId = call && call.id;
            var fn = call && call.function || {};
            acc.openai.calls.push({
                index: index,
                id: modelToolCallSafeId(rawId),
                name: String(fn.name || ''),
                arguments: typeof fn.arguments === 'string' ? fn.arguments : JSON.stringify(fn.arguments == null ? {} : fn.arguments),
                identityError: modelToolCallIdentityError(rawId, index + 1)
            });
        });
        if (acc.openai.calls.length) acc.sawToolActivity = true;
        return;
    }
    var delta = choice.delta;
    if (!delta) return;
    if (typeof delta.reasoning_content === 'string') acc.openai.reasoning += delta.reasoning_content;
    if (typeof delta.content === 'string') acc.openai.content += delta.content;
    (Array.isArray(delta.tool_calls) ? delta.tool_calls : []).forEach(function(part) {
        var index = Number.isInteger(part && part.index) ? part.index : 0;
        var call = acc.openai.calls.find(function(item) { return item.index === index; });
        if (!call) {
            call = { index: index, id: '', name: '', arguments: '', identityError: '' };
            acc.openai.calls.push(call);
        }
        // 流式响应可能先到参数、后到 id；只在整轮结束时判定，途中记录冲突而不是丢弃。
        if (part && part.id !== undefined && part.id !== null && part.id !== '') {
            var idError = modelToolCallIdentityError(part.id, index + 1);
            if (idError) {
                if (!call.identityError) call.identityError = idError;
            } else if (!call.id) call.id = part.id;
            else if (call.id !== part.id && !call.identityError) {
                call.identityError = 'Tool call ' + (index + 1) + ' changed its id during streaming.';
            }
        }
        var fn = part && part.function || {};
        if (typeof fn.name === 'string' && !call.name) call.name = fn.name;
        if (typeof fn.arguments === 'string') call.arguments += fn.arguments;
        acc.sawToolActivity = true;
    });
}

function finalizeAnthropicBlockState(state) {
    if (!state) return null;
    var block = state.block && typeof state.block === 'object' ? state.block : {};
    if (state.type === 'text') {
        return Object.assign({}, block, { type: 'text', text: state.text || String(block.text || '') });
    }
    if (state.type === 'thinking') {
        return Object.assign({}, block, { type: 'thinking', thinking: state.thinking || String(block.thinking || ''), signature: state.signature || block.signature || '' });
    }
    if (state.type === 'redacted_thinking') {
        return Object.assign({}, block, { type: 'redacted_thinking' });
    }
    if (state.type === 'tool_use') {
        var parsed = null;
        var parseError = '';
        var jsonText = String(state.json || '').trim();
        if (jsonText) {
            try { parsed = JSON.parse(jsonText); } catch (error) { parseError = 'Malformed tool arguments: ' + error.message; }
        } else if (state.initialInput && typeof state.initialInput === 'object' && Object.keys(state.initialInput).length) {
            parsed = modelToolCloneNative(state.initialInput);
        }
        var argumentsText = parsed !== null ? JSON.stringify(parsed) : (jsonText || (state.initialInput && JSON.stringify(state.initialInput) || ''));
        return Object.assign({}, block, { type: 'tool_use', id: modelToolCallSafeId(block.id), name: String(block.name || ''), input: parsed === null ? {} : parsed, _argumentsText: argumentsText, _parseError: parseError, _identityConflict: state.identityError || '' });
    }
    var unknown = Object.assign({}, block);
    if (state.unknownText) unknown.text = state.unknownText;
    return unknown;
}

function consumeAnthropicModelToolChunk(acc, raw) {
    if (!raw || typeof raw !== 'object') return;
    if (raw.type === 'message' && Array.isArray(raw.content)) {
        acc.anthropic.rawMessage = modelToolCloneNative(raw);
        acc.anthropic.blocks = raw.content.map(function(block) {
            var copy = modelToolCloneNative(block);
            if (copy && copy.type === 'tool_use' && copy._argumentsText === undefined) copy._argumentsText = JSON.stringify(copy.input == null ? {} : copy.input);
            return copy;
        });
        if (raw.content.some(function(block) { return block && block.type === 'tool_use'; })) acc.sawToolActivity = true;
        return;
    }
    if (raw.type === 'content_block_start') {
        var startBlock = raw.content_block && typeof raw.content_block === 'object' ? raw.content_block : {};
        var index = Number.isInteger(raw.index) ? raw.index : acc.anthropic.blocks.length;
        var previousState = acc.anthropic.states[index];
        var identityConflict = '';
        if (previousState && previousState.type === 'tool_use' && startBlock.type === 'tool_use') {
            var previousId = modelToolCallSafeId(previousState.block && previousState.block.id);
            var nextId = modelToolCallSafeId(startBlock.id);
            if (previousId && nextId && previousId !== nextId) identityConflict = 'Tool call ' + (index + 1) + ' changed its id during streaming.';
        }
        acc.anthropic.states[index] = {
            index: index,
            type: startBlock.type || '',
            block: modelToolCloneNative(startBlock) || {},
            text: '',
            thinking: '',
            signature: '',
            json: '',
            initialInput: startBlock.input,
            unknownText: '',
            identityError: identityConflict
        };
        acc.anthropic.blocks[index] = acc.anthropic.states[index];
        if (startBlock.type === 'tool_use') acc.sawToolActivity = true;
        return;
    }
    if (raw.type === 'content_block_delta') {
        var state = acc.anthropic.states[raw.index];
        if (!state) return;
        var delta = raw.delta || {};
        if (delta.type === 'text_delta') state.text += String(delta.text || '');
        else if (delta.type === 'thinking_delta') state.thinking += String(delta.thinking || '');
        else if (delta.type === 'signature_delta') state.signature += String(delta.signature || '');
        else if (delta.type === 'input_json_delta') state.json += String(delta.partial_json || '');
        else if (typeof delta.partial_json === 'string') state.json += delta.partial_json;
        else if (typeof delta.text === 'string') state.unknownText += delta.text;
        return;
    }
    if (raw.type === 'content_block_stop') {
        var blockState = acc.anthropic.states[raw.index];
        if (blockState) acc.anthropic.blocks[raw.index] = finalizeAnthropicBlockState(blockState);
        return;
    }
    if (raw.type === 'message_delta') acc.anthropic.stopReason = raw.delta && raw.delta.stop_reason || null;
}

function consumeModelToolChunk(acc, raw) {
    if (acc.protocol === 'anthropic') consumeAnthropicModelToolChunk(acc, raw);
    else consumeOpenAiModelToolChunk(acc, raw);
}

function finalizeOpenAiModelToolAccumulator(acc, info) {
    var identityError = '';
    var calls = acc.openai.calls.slice().sort(function(a, b) { return a.index - b.index; }).map(function(call, position) {
        if (!identityError) {
            if (call.identityError) identityError = call.identityError;
            else if (!call.id) identityError = 'Tool call ' + (position + 1) + ' has no valid id.';
        }
        return { id: call.id, name: call.name, arguments: call.arguments };
    });
    var hasToolCalls = calls.length > 0;
    var content = String(info && info.content != null ? info.content : acc.openai.content || '');
    var reasoning = String(acc.openai.reasoning || '');
    var assistant = { role: 'assistant', content: content || null };
    if (reasoning) assistant.reasoning_content = reasoning;
    if (hasToolCalls) {
        assistant.tool_calls = calls.map(function(call) {
            return { id: call.id, type: 'function', function: { name: call.name, arguments: call.arguments } };
        });
    }
    var finalNative = { role: 'assistant', content: content };
    if (reasoning) finalNative.reasoning_content = reasoning;
    return { hasToolCalls: hasToolCalls, calls: calls, identityError: identityError, assistantNative: hasToolCalls ? assistant : null, finalNative: finalNative };
}

function finalizeAnthropicModelToolAccumulator(acc, info) {
    var rawBlocks = (acc.anthropic.blocks || []).filter(Boolean).map(function(block) {
        if (block && typeof block.index === 'number' && block.block && typeof block.block === 'object') return finalizeAnthropicBlockState(block);
        return block;
    });
    var blocks = rawBlocks.map(function(block) {
        return block && block.type ? block : null;
    }).filter(Boolean).map(function(block) {
        var copy = modelToolCloneNative(block);
        delete copy._argumentsText;
        delete copy._parseError;
        delete copy._identityConflict;
        return copy;
    });
    var calls = [];
    var identityError = '';
    rawBlocks.forEach(function(block) {
        if (!block || block.type !== 'tool_use') return;
        var id = modelToolCallSafeId(block.id);
        if (!identityError) {
            if (block._identityConflict) identityError = block._identityConflict;
            else if (!id) identityError = 'Tool call ' + (calls.length + 1) + ' has no valid id.';
        }
        calls.push({ id: id, name: String(block.name || ''), arguments: String(block._argumentsText || ''), parseError: String(block._parseError || '') });
    });
    var hasToolCalls = calls.length > 0;
    var assistantNative = hasToolCalls ? { role: 'assistant', content: blocks } : null;
    return {
        hasToolCalls: hasToolCalls,
        calls: calls,
        identityError: identityError,
        assistantNative: assistantNative,
        finalNative: { role: 'assistant', content: blocks }
    };
}

function finalizeModelToolAccumulator(acc, info) {
    return acc.protocol === 'anthropic' ? finalizeAnthropicModelToolAccumulator(acc, info) : finalizeOpenAiModelToolAccumulator(acc, info);
}

function markModelToolProtocolMessage(message) {
    Object.defineProperty(message, '_modelToolProtocol', { value: true, writable: true, enumerable: true, configurable: true });
    if (Array.isArray(message.content)) Object.defineProperty(message, '_anthropicContent', { value: message.content, writable: true, enumerable: true, configurable: true });
    return message;
}

function buildModelToolResultMessages(protocol, calls, results) {
    if (normalizeApiProtocol(protocol) === 'anthropic') {
        var blocks = calls.map(function(call, index) {
            var result = results[index] || {};
            var block = { type: 'tool_result', tool_use_id: call.id, content: String(result.content || '') };
            if (result.isError) block.is_error = true;
            return block;
        });
        return [markModelToolProtocolMessage({ role: 'user', content: blocks, _anthropicContent: blocks })];
    }
    return calls.map(function(call, index) {
        return markModelToolProtocolMessage({ role: 'tool', tool_call_id: call.id, content: String((results[index] || {}).content || '') });
    });
}
