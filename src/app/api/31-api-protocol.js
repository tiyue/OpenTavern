// ==================== API Protocol Adapters ====================
function normalizeApiProtocol(value) {
    return String(value || '').toLowerCase() === 'anthropic' ? 'anthropic' : 'openai';
}

function getMainApiProtocol(settings) {
    return normalizeApiProtocol((settings || {}).apiProtocol);
}

function getSummaryApiProtocol(settings) {
    settings = settings || {};
    return settings.summarizeUseMainAPI !== false || !settings.summarizeApiProtocol
        ? getMainApiProtocol(settings) : normalizeApiProtocol(settings.summarizeApiProtocol);
}

function normalizeApiProtocolSettings(settings) {
    settings.apiProtocol = getMainApiProtocol(settings);
    settings.summarizeApiProtocol = settings.summarizeApiProtocol ? normalizeApiProtocol(settings.summarizeApiProtocol) : '';
}

function getAnthropicApiBase(raw) {
    var url = String(raw || '').trim().replace(/\/+$/, '').replace(/\/(messages|models)(?:\?.*)?$/i, '');
    return /\/v\d+$/i.test(url) ? url : url + '/v1';
}

function resolveChatEndpoint(raw, protocol) {
    return normalizeApiProtocol(protocol) === 'anthropic' ? getAnthropicApiBase(raw) + '/messages' : normalizeApiEndpoint(raw);
}

function buildApiAuthHeaders(apiKey, protocol, withJsonBody) {
    var headers = {};
    if (withJsonBody) headers['Content-Type'] = 'application/json';
    if (normalizeApiProtocol(protocol) === 'anthropic') {
        if (apiKey) headers['x-api-key'] = apiKey;
        headers['anthropic-version'] = '2023-06-01';
        headers['anthropic-dangerous-direct-browser-access'] = 'true';
    } else if (apiKey) headers.Authorization = 'Bearer ' + apiKey;
    return headers;
}

function toAnthropicContentBlocks(content) {
    if (!Array.isArray(content)) return [{ type: 'text', text: String(content == null ? '' : content) }];
    return content.reduce(function(blocks, part) {
        if (typeof part === 'string') { if (part) blocks.push({ type: 'text', text: part }); return blocks; }
        if (!part || typeof part !== 'object') return blocks;
        if (part.type === 'image_url' || part.image_url) {
            var image = part.image_url;
            var url = String(typeof image === 'string' ? image : image && image.url || '');
            var match = /^data:(image\/(?:png|jpeg|gif|webp));base64,([a-z0-9+/=\s]+)$/i.exec(url);
            if (match) blocks.push({ type: 'image', source: { type: 'base64', media_type: match[1].toLowerCase(), data: match[2].replace(/\s/g, '') } });
            else if (/^https?:\/\//i.test(url)) blocks.push({ type: 'image', source: { type: 'url', url: url } });
            else throw new Error('Anthropic image requires a supported base64 image or HTTP URL.');
        } else if (typeof part.text === 'string' && part.text) blocks.push({ type: 'text', text: part.text });
        return blocks;
    }, []);
}

function isModelToolProtocolMessage(message) {
    return !!(message && message._modelToolProtocol === true);
}

function pushAnthropicProtocolMessage(messages, role, blocks, protocolMerge) {
    if (!Array.isArray(blocks) || !blocks.length) return;
    if (protocolMerge && role === 'assistant') {
        messages.push({ role: role, content: blocks });
        return;
    }
    var previous = messages[messages.length - 1];
    if (previous && previous.role === role) {
        if (!protocolMerge) {
            previous.content = previous.content.concat([{ type: 'text', text: '\n\n' }], blocks);
        } else if (role === 'user') {
            var previousToolResults = previous.content.filter(function(block) { return block && block.type === 'tool_result'; });
            var previousOther = previous.content.filter(function(block) { return !block || block.type !== 'tool_result'; });
            var nextToolResults = blocks.filter(function(block) { return block && block.type === 'tool_result'; });
            var nextOther = blocks.filter(function(block) { return !block || block.type !== 'tool_result'; });
            previous.content = previousToolResults.concat(nextToolResults, previousOther, nextOther);
        } else {
            previous.content = previous.content.concat(blocks);
        }
        return;
    }
    messages.push({ role: role, content: blocks });
}

function toApiProtocolPayload(payload, protocol) {
    if (normalizeApiProtocol(protocol) !== 'anthropic') return payload;
    var system = [], messages = [], seenConversation = false;
    (payload.messages || []).forEach(function(message) {
        if (isModelToolProtocolMessage(message)) {
            seenConversation = true;
            if (Array.isArray(message._anthropicContent)) {
                pushAnthropicProtocolMessage(messages, message.role === 'assistant' ? 'assistant' : 'user', JSON.parse(JSON.stringify(message._anthropicContent)), true);
                return;
            }
            if (message.role === 'tool') {
                var resultBlock = { type: 'tool_result', tool_use_id: String(message.tool_call_id || ''), content: String(message.content == null ? '' : message.content) };
                if (message.is_error) resultBlock.is_error = true;
                pushAnthropicProtocolMessage(messages, 'user', [resultBlock], true);
                return;
            }
        }
        var blocks = toAnthropicContentBlocks(message.content).filter(function(block) { return block.type !== 'text' || block.text.trim(); });
        if (!blocks.length) return;
        if ((message.role === 'system' || message.role === 'developer') && !seenConversation) {
            blocks.forEach(function(block) { if (block.type === 'text') system.push(block.text); });
            return;
        }
        seenConversation = true;
        var role = message.role === 'assistant' ? 'assistant' : 'user';
        pushAnthropicProtocolMessage(messages, role, blocks);
    });
    if (!messages.length || messages[0].role !== 'user') messages.unshift({ role: 'user', content: [{ type: 'text', text: '[Start of conversation]' }] });
    if (messages[messages.length - 1].role === 'assistant') messages.push({ role: 'user', content: [{ type: 'text', text: '[Continue the conversation]' }] });
    var body = { model: payload.model, messages: messages, max_tokens: Math.max(1, Math.round(Number(payload.max_tokens) || 4096)), stream: !!payload.stream };
    if (system.length) body.system = system.join('\n\n');
    if (Array.isArray(payload.tools) && payload.tools.length) body.tools = JSON.parse(JSON.stringify(payload.tools));
    if (payload.tool_choice !== undefined) body.tool_choice = JSON.parse(JSON.stringify(payload.tool_choice));
    var thinking = payload.thinking;
    if (thinking && (thinking.type === 'enabled' || thinking.type === 'adaptive' || thinking.type === 'disabled')) {
        body.thinking = { type: thinking.type };
        if (thinking.type === 'enabled') {
            var budget = Number(thinking.budget_tokens) || Math.max(1024, Math.floor(body.max_tokens / 2));
            if (!Number.isInteger(budget) || budget < 1024 || budget >= body.max_tokens) throw new Error('Anthropic thinking budget must be at least 1024 and below max_tokens.');
            body.thinking.budget_tokens = budget;
        }
    }
    if (payload.reasoning_effort) body.output_config = { effort: payload.reasoning_effort };
    if (!body.thinking || body.thinking.type === 'disabled') {
        if (typeof payload.temperature === 'number' && Number.isFinite(payload.temperature)) body.temperature = Math.min(1, Math.max(0, payload.temperature));
        else if (typeof payload.top_p === 'number' && Number.isFinite(payload.top_p)) body.top_p = payload.top_p;
    }
    return body;
}

function normalizeAnthropicFinishReason(reason) {
    if (reason === 'end_turn' || reason === 'stop_sequence') return 'stop';
    return reason === 'max_tokens' ? 'length' : reason;
}

function normalizeApiProtocolResponse(data, protocol) {
    if (normalizeApiProtocol(protocol) !== 'anthropic' || !data || data.error) return data;
    var result = { choices: [] };
    if (data.type === 'message_stop') return { done: true };
    if (data.type === 'message' || Array.isArray(data.content)) {
        if (!Array.isArray(data.content)) return result;
        var message = { content: '', reasoning_content: '' };
        data.content.forEach(function(block) {
            if (block && block.type === 'text') message.content += block.text || '';
            if (block && block.type === 'thinking') message.reasoning_content += block.thinking || '';
        });
        result.choices.push({ message: message, finish_reason: normalizeAnthropicFinishReason(data.stop_reason) });
        result.usage = data.usage;
    } else if (data.type === 'message_start') result.usage = data.message && data.message.usage;
    else if (data.type === 'message_delta') {
        result.choices.push({ delta: {}, finish_reason: normalizeAnthropicFinishReason(data.delta && data.delta.stop_reason) });
        result.usage = data.usage;
    } else if (data.type === 'content_block_start' || data.type === 'content_block_delta') {
        var block = data.content_block || data.delta || {};
        var delta = {};
        if (block.type === 'text' || block.type === 'text_delta') delta.content = block.text || '';
        if (block.type === 'thinking' || block.type === 'thinking_delta') delta.reasoning_content = block.thinking || '';
        result.choices.push({ delta: delta });
    }
    return result;
}

function parseApiProtocolUsage(payload, protocol) {
    if (normalizeApiProtocol(protocol) !== 'anthropic') return typeof parseApiUsage === 'function' ? parseApiUsage(payload) : null;
    var usage = payload && payload.usage;
    if (!usage || typeof usage !== 'object') return null;
    var result = { source: 'api' };
    if (usage.input_tokens != null && Number.isFinite(Number(usage.input_tokens))) {
        result.promptTokens = Math.max(0, Number(usage.input_tokens)) + Math.max(0, Number(usage.cache_creation_input_tokens) || 0) + Math.max(0, Number(usage.cache_read_input_tokens) || 0);
    }
    if (usage.output_tokens != null && Number.isFinite(Number(usage.output_tokens))) result.completionTokens = Math.max(0, Number(usage.output_tokens));
    if (usage.cache_read_input_tokens != null && Number.isFinite(Number(usage.cache_read_input_tokens))) result.cachedTokens = Math.max(0, Number(usage.cache_read_input_tokens));
    return result.promptTokens == null && result.completionTokens == null ? null : result;
}
