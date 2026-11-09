import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, 'src/app', file), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
const TOOL_FILES = [
    'api/31-api-endpoint-normalizer.js', 'api/31-api-protocol.js',
    'generation/50-generation-cot-utils.js', 'generation/50-generation-usage.js',
    'generation/50-generation-api-request.js', 'tools/32-model-tools.js',
    'tools/50-model-tool-protocol.js', 'generation/50-generation-stream-state.js',
    'generation/50-generation-transport-module.js', 'tools/50-model-tool-runtime.js',
    'conversation/32-message-identity.js', 'conversation/32-response-versions.js', 'sync/19-cloud-sync-settings-policy.js',
    'generation/52-generation-message-lifecycle.js', 'prompt/41-prompt-controls.js'
];

function baseSettings(protocol, grant = true) {
    return {
        apiProtocol: protocol,
        apiEndpoint: 'https://synthetic.invalid/' + protocol,
        apiKey: 'synthetic-key',
        model: 'synthetic-model',
        maxTokens: 2048,
        temperature: 0.7,
        topP: 0.9,
        streamEnabled: true,
        requestCotEnabled: false,
        thinking: null,
        activeConnectionProfileIds: { main: '', summary: '', embedding: '' },
        modelToolGrants: grant ? { c1: ['search_conversation'] } : {}
    };
}

function createHarness(protocol = 'openai', grant = true) {
    let id = 0;
    const conv = {
        id: 'c1', title: 'D1', messages: [
            { id: 'u1', role: 'user', content: '已保存 保留原文 {{user}} <script>globalThis.pwned=true</script>' },
            { id: 'a1', role: 'assistant', content: 'old answer' }
        ], summaries: []
    };
    const state = {
        settings: baseSettings(protocol, grant), conversations: { c1: conv }, conversationOrder: ['c1'],
        activeConvId: 'c1', isGenerating: false, characters: {}, worldBooks: {}
    };
    const context = {
        console, JSON, Object, Array, String, Number, Math, Date, Promise, Set, Map, AbortController, TextDecoder,
        Uint8Array, setTimeout, clearTimeout, state,
        appStore: { notify() {} }, renderTokenBar() {},
        makeId: () => 'generated-' + (++id),
        t: key => key,
        escapeHtml: value => String(value == null ? '' : value),
        persistConversationMessageMutation: async (target, mutate) => {
            const candidate = Object.assign({}, target, { messages: clone(target.messages), summaries: clone(target.summaries || []) });
            const result = mutate(candidate);
            if (typeof context.normalizeConversationMessageIdentity === 'function') context.normalizeConversationMessageIdentity(candidate);
            target.messages = clone(candidate.messages);
            target.summaries = clone(candidate.summaries);
            return result;
        },
        finishStreamDraft: async () => {},
        appendFinalAssistantMessage() {},
        capturePromptBuildSource: target => ({ conversation: target, conversationId: target.id, messages: clone(target.messages) }),
        isolatePrimaryStageContentWithSettings: value => String(value == null ? '' : value),
        clonePromptContent: value => Array.isArray(value) ? clone(value) : String(value == null ? '' : value),
        mergePromptContents: (left, right) => String(left || '') + '\n\n' + String(right || ''),
        shouldUseOllamaCompat: () => false,
        normalizeMessagesForOllamaCompatibility: messages => messages
    };
    context.isLiveConversation = value => state.conversations[value.id] === value;
    context.getActiveConv = () => conv;
    context.getPromptBuildConnectionStamp = settings => JSON.stringify([settings.apiProtocol, settings.apiEndpoint, settings.model]);
    context.touchGenerationIdleTimeout = () => {};
    context.isGenerationRuntimeOwned = generation => !generation || !generation.operation || generation.operation.isCurrent();
    vm.createContext(context);
    vm.runInContext(TOOL_FILES.map(read).join('\n'), context, { filename: 'd1-runtime.js' });
    return { context, state, conv };
}

function makeTransport(harness, responses, onRequest, fetchImpl) {
    const { context, state } = harness;
    let index = 0;
    const requests = [];
    return {
        requests,
        transport: context.createGenerationTransport({
            settings: state.settings,
            TextDecoder,
            fetch: fetchImpl ? (url, options) => fetchImpl(url, options, harness, requests) : async (url, options) => {
                const body = JSON.parse(options.body);
                requests.push(body);
                if (typeof onRequest === 'function') await onRequest(index, body, harness);
                const response = responses[Math.min(index, responses.length - 1)];
                index++;
                return typeof response === 'function' ? response(index - 1, body, harness) : response;
            },
            stateController: {
                begin: () => new AbortController(), finish: () => 1, arm() {}, touch() {}
            },
            helpers: {
                normalizeEndpoint: context.resolveChatEndpoint,
                shouldUseOllamaCompat: () => false,
                postProcessMessages: context.postProcessPromptMessages,
                buildPayload: context.buildChatCompletionPayload,
                buildFetchOptions: context.buildChatCompletionFetchOptions,
                readError: context.readChatCompletionError,
                normalizeResponse: json => context.normalizeApiProtocolResponse(json, state.settings.apiProtocol),
                parseUsage: json => context.parseApiProtocolUsage(json, state.settings.apiProtocol),
                extractCot: context.extractCotDelta,
                buildCotParts: context.buildCotAwareParts,
                finalizeUsage: context.finalizeUsageMeta
            }
        })
    };
}

function generation(harness, stage = 'main') {
    const operation = { sequence: 1, settled: false, current: true, isCurrent() { return this.current; }, source: null, rebindSourceAfterSave() { return true; } };
    return {
        operation,
        conversation: harness.conv,
        stage,
        settings: harness.state.settings,
        controller: null
    };
}

function runtimeFor(harness, gen) {
    const context = harness.context;
    const toolContext = context.resolveModelToolRequestContext(harness.conv, harness.state.settings, gen.stage);
    if (!toolContext) return null;
    toolContext.requestSourceCurrent = () => gen.operation.current;
    return { context: toolContext, runtime: context.createModelToolRuntime(toolContext, gen) };
}

async function runRequest(harness, responses, options = {}) {
    const gen = generation(harness, options.stage || 'main');
    harness.__lastGen = gen;
    const resolved = options.noTools ? null : runtimeFor(harness, gen);
    const made = makeTransport(harness, responses, options.onRequest, options.fetch);
    const completions = [], errors = [], tokens = [], toolRoundRecords = [];
    const requestMessages = options.messages || clone(harness.conv.messages).map(message => ({ role: message.role, content: message.content }));
    await made.transport.request(
        requestMessages,
        {
            onToken: (...values) => tokens.push(values),
            onComplete: (...values) => completions.push(values),
            onError: error => errors.push(error),
            onToolRoundComplete: info => toolRoundRecords.push(info)
        },
        { settings: harness.state.settings, generationContext: gen, modelTools: resolved && resolved.runtime, stream: options.stream !== false }
    );
    return { ...made, completions, errors, tokens, toolRoundRecords, gen, toolContext: resolved && resolved.context, runtime: resolved && resolved.runtime };
}

function jsonResponse(body) {
    return { ok: true, headers: { get: () => 'application/json' }, json: async () => body };
}

function sseResponse(events, done = false) {
    const bytes = new TextEncoder().encode(events.map(event => 'data: ' + JSON.stringify(event) + '\n\n').join('') + (done ? 'data: [DONE]\n\n' : ''));
    return {
        ok: true,
        headers: { get: () => 'text/event-stream' },
        body: new ReadableStream({
            start(controller) {
                for (let index = 0; index < bytes.length; index++) controller.enqueue(bytes.slice(index, index + 1));
                controller.close();
            }
        })
    };
}

function stalledSseResponse(signal, events) {
    const bytes = new TextEncoder().encode(events.map(event => 'data: ' + JSON.stringify(event) + '\n\n').join(''));
    let controller;
    const body = new ReadableStream({
        start(value) { controller = value; value.enqueue(bytes); }
    });
    const abort = () => {
        try { controller.error(Object.assign(new Error('aborted'), { name: 'AbortError' })); } catch (_) {}
    };
    if (signal) {
        if (signal.aborted) abort();
        else signal.addEventListener('abort', abort, { once: true });
    }
    return { ok: true, headers: { get: () => 'text/event-stream' }, body };
}

function openAiToolCall(id, args, name = 'search_conversation') {
    return { id, type: 'function', function: { name, arguments: JSON.stringify(args) } };
}

function firstOf(list, message) {
    assert.ok(list.length, message || 'expected at least one item');
    return list[0];
}

function deferred() {
    let resolve = null;
    let reject = null;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}

const settleTicks = () => new Promise(resolve => setTimeout(resolve, 25));

function toolCallResponse(protocol, id = 'call_ack') {
    return protocol === 'anthropic'
        ? jsonResponse({ type: 'message', content: [{ type: 'tool_use', id, name: 'search_conversation', input: { query: '保留原文', maxResults: 2 } }], stop_reason: 'tool_use' })
        : jsonResponse({ choices: [{ message: { content: 'before search', tool_calls: [openAiToolCall(id, { query: '保留原文', maxResults: 2 })] }, finish_reason: 'tool_calls' }] });
}

function finalResponse(protocol) {
    return protocol === 'anthropic'
        ? jsonResponse({ type: 'message', content: [{ type: 'text', text: '最终正文' }], stop_reason: 'end_turn' })
        : jsonResponse({ choices: [{ message: { content: '最终正文' }, finish_reason: 'stop' }] });
}

// 真实集成层：加载 streamChatWithMessages，只替换本机草稿队列/写入为可控 ACK。
function createIntegrationHarness(protocol = 'openai') {
    const harness = createHarness(protocol, true);
    const context = harness.context;
    context.normalizeStreamIdleTimeoutSec = () => 0;
    context.isPromptBuildSourceCurrent = source => !!(source && source.conversation && context.isLiveConversation(source.conversation));
    context.reportStreamDraftError = () => {};
    context.refreshStreamDraftRecoveryNotice = async () => {};
    vm.runInContext(read('generation/50-generation-integrations.js'), context, { filename: 'd1-integrations.js' });
    return harness;
}

function requestViaIntegration(harness, responses, options = {}) {
    const { context, state, conv } = harness;
    const gen = generation(harness, 'main');
    const requests = [];
    const completions = [];
    const errors = [];
    const draftCalls = [];
    const acks = [];
    let index = 0;
    context.fetch = async (url, fetchOptions) => {
        requests.push(JSON.parse(fetchOptions.body));
        const response = responses[Math.min(index, responses.length - 1)];
        index += 1;
        return typeof response === 'function' ? response(index - 1, harness) : response;
    };
    context.queueStreamDraft = (...args) => draftCalls.push(args);
    context.flushStreamDraftWrites = options.flush || (() => { acks.push(true); return Promise.resolve(); });
    const messages = clone(conv.messages).map(message => ({ role: message.role, content: message.content }));
    const promise = context.streamChatWithMessages(messages, () => {}, (...values) => completions.push(values), error => errors.push(error), {
        conversation: conv,
        stage: 'main',
        settings: state.settings,
        generationContext: gen,
        promptBuildOperation: gen.operation,
        operation: gen.operation.sequence,
        stream: options.stream !== false
    });
    return { promise, requests, completions, errors, draftCalls, acks, gen };
}

function legacyRevision(message) {
    const context = { console, JSON, Object, Array, String, Number, Math };
    vm.createContext(context);
    vm.runInContext(['api/31-api-protocol.js', 'conversation/32-message-identity.js'].map(read).join('\n'), context);
    return context.getMessageRevision(message);
}

function testRegistryAndSchema() {
    const harness = createHarness('openai', false);
    const context = harness.context;
    assert.deepEqual(Array.from(context.getAuthorizedModelToolNames(harness.conv, harness.state.settings)), []);
    harness.state.settings.modelToolGrants = { c1: ['search_conversation'] };
    assert.equal(context.resolveModelToolRequestContext(harness.conv, harness.state.settings, 'second'), null, 'Second-stage requests must not inherit tools.');
    assert.equal(context.resolveModelToolRequestContext(harness.conv, harness.state.settings, 'summary'), null, 'Summary requests must not inherit tools.');
    harness.state.settings.modelToolGrants = {};
    assert.throws(() => context.registerModelTool({ name: 'bad_schema', description: 'x', inputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false, oneOf: [] }, execute() {} }), /unsupported/);
    assert.throws(() => context.registerModelTool({ name: 'bad_required', description: 'x', inputSchema: { type: 'object', properties: {}, required: ['missing'], additionalProperties: false }, execute() {} }), /required/);
    const tool = context.getModelToolDefinition('search_conversation');
    assert.ok(tool);
    assert.equal(context.validateModelToolArguments(tool, { query: 'x' }).valid, true);
    assert.equal(context.validateModelToolArguments(tool, { query: 1 }).valid, false);
    assert.equal(context.validateModelToolArguments(tool, { query: 'x', extra: true }).valid, false);
    assert.equal(context.validateModelToolArguments(tool, { query: 'x', maxResults: 99 }).valid, false);
    context.setModelToolConversationGrant('c1', 'search_conversation', true);
    assert.deepEqual(Array.from(context.getAuthorizedModelToolNames(harness.conv, harness.state.settings)), ['search_conversation']);
    context.setModelToolConversationGrant('c1', 'search_conversation', false);
    assert.deepEqual(Array.from(context.getAuthorizedModelToolNames(harness.conv, harness.state.settings)), []);
    const wire = context.buildModelToolWireDefinitions('openai', ['search_conversation']);
    assert.equal(wire[0].type, 'function');
    assert.equal(wire[0].function.parameters.additionalProperties, false);
    assert.equal(context.buildModelToolWireDefinitions('anthropic', ['search_conversation'])[0].input_schema.required[0], 'query');
    const old = { id: 'm', role: 'assistant', content: 'text', cot: '', speaker: '', stage: 'main', parentId: '' };
    assert.equal(context.getMessageRevision(old), legacyRevision(clone(old)), 'Messages without tool traces must keep their legacy revision.');
    const trace = { version: 1, protocol: 'openai', connection: 'c', status: 'completed', nativeOmitted: false, rounds: [{ index: 0, calls: [{ id: 'call_1', name: 'search_conversation', arguments: '{"query":"x"}', status: 'completed', resultPreview: 'ok', resultBytes: 2, durationMs: 1, error: '' }], assistantNative: null, resultNative: null }], finalNative: null, diagnostics: null, started: 1, finished: 2 };
    assert.notEqual(context.getMessageRevision({ ...old, toolTrace: trace }), context.getMessageRevision(old), 'A real tool trace must participate in revision identity.');
    assert.equal(context.getMessageRevision({ ...old, toolTrace: clone(trace) }), context.getMessageRevision({ ...old, toolTrace: trace }), 'Trace identity must be deterministic.');
}

async function testOpenAiJson() {
    const harness = createHarness('openai', true);
    const first = jsonResponse({ choices: [{ message: { content: '', tool_calls: [openAiToolCall('call_1', { query: '保留原文', maxResults: 2 })] }, finish_reason: 'tool_calls' }] });
    const second = jsonResponse({ choices: [{ message: { content: '最终正文' }, finish_reason: 'stop' }] });
    const result = await runRequest(harness, [first, second], { stream: false });
    assert.equal(result.errors.length, 0);
    assert.equal(result.completions.length, 1);
    assert.equal(result.completions[0][0], '最终正文');
    const trace = firstOf(result.completions)[3]._modelToolTrace;
    assert.equal(trace.status, 'completed');
    assert.equal(trace.rounds[0].calls[0].id, 'call_1');
    assert.equal(result.requests.length, 2);
    assert.equal(result.requests[0].tools[0].function.name, 'search_conversation');
    assert.equal(result.requests[0].tool_choice, undefined, 'The request must not force tool_choice.');
    const toolMessage = result.requests[1].messages.find(message => message.role === 'tool');
    assert.equal(toolMessage.tool_call_id, 'call_1');
    assert.ok(toolMessage.content.includes('{{user}}'));
    assert.ok(toolMessage.content.includes('<script>globalThis.pwned=true</script>'));
    assert.equal(globalThis.pwned, undefined, 'Tool result text must remain data.');
}

async function testOpenAiFragmentedSse() {
    const harness = createHarness('openai', true);
    const events = [
        { choices: [{ delta: { reasoning_content: 'native-think' } }] },
        { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_a', type: 'function', function: { name: 'search_conversation' } }] } }] },
        { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{"query":"保' } }] } }] },
        { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '留原文"}' } }] } }] },
        { choices: [{ delta: { tool_calls: [{ index: 1, id: 'call_b', type: 'function', function: { name: 'search_conversation' } }] } }] },
        { choices: [{ delta: { tool_calls: [{ index: 1, function: { arguments: '{"query":"alpha"}' } }] } }] },
        { choices: [{ delta: {}, finish_reason: 'tool_calls' }] }
    ];
    const finalEvents = [{ choices: [{ delta: { content: '中文🙂' } }] }, { choices: [{ delta: {}, finish_reason: 'stop' }] }];
    const result = await runRequest(harness, [sseResponse(events, true), sseResponse(finalEvents, true)]);
    assert.equal(result.errors.length, 0);
    assert.equal(result.completions[0][0], '中文🙂');
    const trace = result.completions[0][3]._modelToolTrace;
    assert.equal(trace.rounds[0].calls.length, 2);
    assert.deepEqual(Array.from(trace.rounds[0].calls, call => call.id), ['call_a', 'call_b']);
    assert.equal(result.requests.length, 2);
    assert.deepEqual(Array.from(result.requests[1].messages.filter(message => message.role === 'tool'), message => message.tool_call_id), ['call_a', 'call_b']);
    assert.equal(result.requests[1].messages.find(message => message.role === 'assistant' && message.tool_calls).reasoning_content, 'native-think');
}

async function testAnthropicJson() {
    const harness = createHarness('anthropic', true);
    const first = jsonResponse({
        type: 'message',
        content: [
            { type: 'thinking', thinking: 'synthetic-native-thinking', signature: 'synthetic-signature' },
            { type: 'redacted_thinking', data: 'synthetic-redacted' },
            { type: 'text', text: 'I will search.' },
            { type: 'tool_use', id: 'toolu_1', name: 'search_conversation', input: { query: '保留原文', maxResults: 2 } }
        ],
        stop_reason: 'tool_use', usage: { input_tokens: 5, output_tokens: 4 }
    });
    const second = jsonResponse({ type: 'message', content: [{ type: 'thinking', thinking: 'final-think', signature: 'final-sig' }, { type: 'text', text: '最终正文' }], stop_reason: 'end_turn' });
    const result = await runRequest(harness, [first, second], { stream: false });
    assert.equal(result.errors.length, 0);
    assert.equal(result.completions[0][0], '最终正文');
    assert.equal(result.requests[0].tools[0].input_schema.required[0], 'query');
    const assistant = result.requests[1].messages.find(message => message.role === 'assistant' && Array.isArray(message.content) && message.content.some(block => block.type === 'tool_use'));
    assert.deepEqual(Array.from(assistant.content, block => block.type), ['thinking', 'redacted_thinking', 'text', 'tool_use']);
    assert.equal(assistant.content[0].signature, 'synthetic-signature');
    assert.equal(assistant.content[1].data, 'synthetic-redacted');
    const resultBlock = result.requests[1].messages.find(message => message.role === 'user' && Array.isArray(message.content) && message.content[0] && message.content[0].type === 'tool_result');
    assert.equal(resultBlock.content[0].tool_use_id, 'toolu_1');
    const trace = result.completions[0][3]._modelToolTrace;
    assert.equal(trace.protocol, 'anthropic');
    assert.equal(trace.rounds[0].calls[0].id, 'toolu_1');
}

async function testAnthropicFragmentedSse() {
    const harness = createHarness('anthropic', true);
    const events = [
        { type: 'message_start', message: { usage: { input_tokens: 3 } } },
        { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: '思考🙂' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'sig' } },
        { type: 'content_block_stop', index: 0 },
        { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'toolu_x', name: 'search_conversation', input: {} } },
        { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"que' } },
        { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: 'ry":"保' } },
        { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '留原文","max' } },
        { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: 'Results":2}' } },
        { type: 'content_block_stop', index: 1 },
        { type: 'message_delta', delta: { stop_reason: 'tool_use' } },
        { type: 'message_stop' }
    ];
    const finalEvents = [
        { type: 'message_start' }, { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '最终中文🙂' } },
        { type: 'content_block_stop', index: 0 }, { type: 'message_delta', delta: { stop_reason: 'end_turn' } }, { type: 'message_stop' }
    ];
    const result = await runRequest(harness, [sseResponse(events), sseResponse(finalEvents)]);
    assert.equal(result.errors.length, 0);
    assert.equal(result.completions[0][0], '最终中文🙂');
    const assistant = result.requests[1].messages.find(message => message.role === 'assistant' && Array.isArray(message.content) && message.content.some(block => block.type === 'tool_use'));
    assert.deepEqual(Array.from(assistant.content, block => block.type), ['thinking', 'tool_use']);
    assert.equal(assistant.content[1].input.query, '保留原文');
    assert.equal(assistant.content[1].input.maxResults, 2);
    const trace = result.completions[0][3]._modelToolTrace;
    assert.equal(trace.rounds[0].calls[0].status, 'completed');
}

async function testInvalidCallsAndCache() {
    const harness = createHarness('openai', true);
    let unauthorizedExecutions = 0;
    harness.context.registerModelTool({
        name: 'test_echo',
        description: 'synthetic tool that must not run without a grant',
        inputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
        execute: () => { unauthorizedExecutions++; return 'executed'; }
    });
    const calls = [
        openAiToolCall('same', { query: '原' }),
        openAiToolCall('same', { query: '原' }),
        openAiToolCall('same', { query: 'conflict' }),
        openAiToolCall('unknown', {}, 'unknown_tool'),
        openAiToolCall('unauthorized', {}, 'test_echo'),
        openAiToolCall('badtype', { query: 5 })
    ];
    const first = jsonResponse({ choices: [{ message: { content: null, tool_calls: calls }, finish_reason: 'tool_calls' }] });
    const second = jsonResponse({ choices: [{ message: { content: 'done' }, finish_reason: 'stop' }] });
    const result = await runRequest(harness, [first, second], { stream: false });
    assert.equal(result.errors.length, 0);
    const trace = result.completions[0][3]._modelToolTrace;
    const statuses = Object.fromEntries(trace.rounds[0].calls.map(call => [call.id, call.status]));
    assert.deepEqual(Array.from(trace.rounds[0].calls.filter(call => call.id === 'same'), call => call.status), ['completed', 'reused', 'error']);
    assert.equal(statuses.unknown, 'error');
    assert.equal(statuses.unauthorized, 'error');
    assert.equal(statuses.badtype, 'error');
    assert.equal(unauthorizedExecutions, 0, 'An unauthorized tool must not execute.');
    const results = result.requests[1].messages.filter(message => message.role === 'tool');
    assert.equal(results.length, calls.length);
    assert.ok(results.every(message => message.tool_call_id && message.content));

    const shapeHarness = createHarness('openai', true);
    const shapeCalls = [openAiToolCall('extra', { query: 'x', extra: true }), openAiToolCall('oversize', { query: 'x'.repeat(9000) })];
    const shapeResult = await runRequest(shapeHarness, [
        jsonResponse({ choices: [{ message: { content: null, tool_calls: shapeCalls }, finish_reason: 'tool_calls' }] }),
        jsonResponse({ choices: [{ message: { content: 'done' }, finish_reason: 'stop' }] })
    ], { stream: false });
    const shapeStatuses = Object.fromEntries(shapeResult.completions[0][3]._modelToolTrace.rounds[0].calls.map(call => [call.id, call.status]));
    assert.equal(shapeStatuses.extra, 'error');
    assert.equal(shapeStatuses.oversize, 'error');
}

async function testLimits() {
    const harness = createHarness('openai', true);
    const toolResponse = () => jsonResponse({ choices: [{ message: { content: null, tool_calls: [openAiToolCall('loop_' + Math.random(), { query: 'x' })] }, finish_reason: 'tool_calls' }] });
    const result = await runRequest(harness, Array.from({ length: 8 }, toolResponse), { stream: false });
    assert.equal(result.errors.length, 0);
    assert.equal(result.completions.length, 1, 'A tool budget must settle exactly once.');
    assert.equal(result.requests.length, harness.context.MODEL_TOOL_MAX_ROUNDS + 1, 'The next model round must not start after the round limit.');
    assert.ok(result.completions[0][3].interrupted);
    assert.equal(result.completions[0][3].completionReason, 'round_limit');
    assert.ok(result.completions[0][3]._modelToolTrace);

    const callHarness = createHarness('openai', true);
    const manyCalls = Array.from({ length: 7 }, (_, index) => openAiToolCall('limit_' + index, { query: 'x' }));
    const first = jsonResponse({ choices: [{ message: { content: null, tool_calls: manyCalls }, finish_reason: 'tool_calls' }] });
    const callResult = await runRequest(callHarness, [first], { stream: false });
    assert.equal(callResult.requests.length, 1, 'Call budget failure must not fetch another round.');
    assert.equal(callResult.completions[0][3].completionReason, 'call_limit');
    assert.ok(callResult.completions[0][3]._modelToolTrace.rounds[0].calls.length <= callHarness.context.MODEL_TOOL_MAX_CALLS);

    const eofHarness = createHarness('openai', true);
    const eofEvents = [
        { choices: [{ delta: { tool_calls: [{ index: 0, id: 'eof_call', type: 'function', function: { name: 'search_conversation' } }] } }] },
        { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{"query":"x"}' } }] } }] }
    ];
    const eofResult = await runRequest(eofHarness, [sseResponse(eofEvents)]);
    assert.equal(eofResult.requests.length, 1, 'An unexpected EOF before [DONE] must not execute or continue.');
    assert.equal(eofResult.completions[0][3].interrupted, true);
    assert.equal(eofResult.completions[0][3]._modelToolTrace.rounds[0].calls[0].status, 'not-run');
}

async function testStopAndRevokeBetweenRounds() {
    for (const mode of ['revoke', 'switch', 'source']) {
        const harness = createHarness('openai', true);
        const first = jsonResponse({ choices: [{ message: { content: null, tool_calls: [openAiToolCall('call_stop', { query: 'x' })] }, finish_reason: 'tool_calls' }] });
        const result = await runRequest(harness, [first, jsonResponse({ choices: [{ message: { content: 'must-not-run' }, finish_reason: 'stop' }] })], {
            stream: false,
            onRequest: async (index, _body, current) => {
                if (index !== 0) return;
                if (mode === 'revoke') current.state.settings.modelToolGrants = {};
                if (mode === 'switch') {
                    current.state.conversations.c2 = { id: 'c2', messages: [], summaries: [] };
                    current.state.activeConvId = 'c2';
                }
                if (mode === 'source') current.__lastGen.operation.current = false;
            }
        });
        assert.equal(result.requests.length, 1, mode + ' must not start another model round');
        assert.equal(result.errors.length, 0);
        assert.ok(result.completions[0][3].interrupted, mode + ' must settle as interrupted');
        assert.ok(result.completions[0][3]._modelToolTrace, mode + ' must retain a readable trace');
    }
}

async function testOffPathAndReplay() {
    const harness = createHarness('openai', false);
    const response = jsonResponse({ choices: [{ message: { content: 'ordinary' }, finish_reason: 'stop' }] });
    const result = await runRequest(harness, [response], { noTools: true, stream: false });
    assert.equal(result.completions[0][0], 'ordinary');
    assert.equal(result.requests[0].tools, undefined);
    assert.equal(result.requests[0].messages.every(message => !message.tool_calls && !message.reasoning_content && message.role !== 'tool'), true);
    assert.equal(result.completions[0][3]._modelToolTrace, undefined);
    assert.equal(result.toolContext, null);

    const context = harness.context;
    const trace = {
        version: 1, protocol: 'anthropic', connection: 'conn', status: 'completed', nativeOmitted: false,
        rounds: [{ index: 0, calls: [{ id: 't1', name: 'search_conversation', arguments: '{"query":"a"}', status: 'completed', resultPreview: 'result', resultBytes: 6, durationMs: 1, error: '' }],
            assistantNative: { role: 'assistant', content: [{ type: 'thinking', thinking: 'think', signature: 'sig' }, { type: 'text', text: 'raw' }, { type: 'tool_use', id: 't1', name: 'search_conversation', input: { query: 'a' } }] },
            resultNative: [{ role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'result' }], _anthropicContent: [{ type: 'tool_result', tool_use_id: 't1', content: 'result' }], _modelToolProtocol: true }] }],
        finalNative: { role: 'assistant', content: [{ type: 'thinking', thinking: 'final-think', signature: 'sig2' }, { type: 'text', text: 'raw final' }] },
        diagnostics: null, started: 1, finished: 2
    };
    const history = context.buildModelToolHistoryMessages({ role: 'assistant', content: 'prepared final', toolTrace: trace }, { role: 'assistant', content: 'prepared final' }, { protocol: 'anthropic', connectionStamp: 'conn' });
    assert.equal(history.length, 3);
    assert.deepEqual(Array.from(history[0].content, block => block.type), ['thinking', 'text', 'tool_use']);
    assert.equal(history[0].content[0].signature, 'sig');
    assert.equal(history[1].content[0].type, 'tool_result');
    assert.equal(history[2].content[1].text, 'prepared final');
    assert.equal(history[2].content[0].signature, 'sig2');
    assert.equal(context.buildModelToolHistoryMessages({ role: 'assistant', content: 'x', toolTrace: trace }, { role: 'assistant', content: 'x' }, { protocol: 'anthropic', connectionStamp: 'other' }), null);
    assert.equal(context.buildModelToolHistoryMessages({ role: 'assistant', content: 'x', toolTrace: { ...trace, nativeOmitted: true } }, { role: 'assistant', content: 'x' }, { protocol: 'anthropic', connectionStamp: 'conn' }), null);
}

async function testDurableTraceAndDraft() {
    const harness = createHarness('openai', true);
    const { context, conv, state } = harness;
    context.normalizeConversationMessageIdentity(conv);
    const trace = { version: 1, protocol: 'openai', connection: 'conn', status: 'interrupted', nativeOmitted: false, rounds: [{ index: 0, calls: [{ id: 'call_1', name: 'search_conversation', arguments: '{"query":"x"}', status: 'not-run', resultPreview: '', resultBytes: 0, durationMs: 0, error: '' }], assistantNative: null, resultNative: null }], finalNative: null, diagnostics: null, started: 1, finished: 2 };
    const completion = { interrupted: true, finishReason: null, completionReason: 'abort' };
    Object.defineProperty(completion, '_modelToolTrace', { value: context.normalizeModelToolTrace(trace), writable: true, configurable: true });
    const gen = generation(harness);
    const before = conv.messages.length;
    const saved = await context.finishAssistantMessage(conv, '', null, 'main', null, '', null, completion, gen);
    assert.equal(conv.messages.length, before + 1);
    assert.equal(saved.content, '');
    assert.equal(saved.interrupted, true);
    assert.ok(saved.toolTrace);
    assert.equal(saved.revision, context.getMessageRevision(saved));
    const version = { id: 'v1', message: clone(saved), secondMessages: [] };
    assert.equal(context.getResponseVersions({ responseVersions: [version] }).length, 1, 'A trace-only interrupted reply must remain a readable version.');
    assert.equal(state.settings.modelToolGrants.c1[0], 'search_conversation');
    const portable = context.getCloudSyncPortableSettings(state.settings);
    assert.equal(portable.modelToolGrants, undefined, 'Local tool grants must not enter portable settings.');
}

async function testPostProcessNative() {
    const harness = createHarness('openai', true);
    const context = harness.context;
    const assistantNative = context.markModelToolProtocolMessage({ role: 'assistant', content: null, tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'search_conversation', arguments: '{}' } }] });
    const resultNative = context.markModelToolProtocolMessage({ role: 'tool', tool_call_id: 'call_1', content: 'data' });
    const result = await runRequest(harness, [jsonResponse({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] })], {
        noTools: true,
        stream: false,
        messages: [{ role: 'user', content: 'history' }, assistantNative, resultNative, { role: 'user', content: 'next text' }]
    });
    assert.equal(result.requests.length, 1);
    assert.equal(result.requests[0].messages.length, 4, 'Protocol messages must not be merged or dropped by post-processing.');
    assert.equal(result.requests[0].messages[1].tool_calls[0].id, 'call_1');
    assert.equal(result.requests[0].messages[2].tool_call_id, 'call_1');
    assert.equal(result.requests[0].messages[3].content, 'next text');
}

async function testIncompleteToolRounds() {
    const call = openAiToolCall('strict_call', { query: '保留原文', maxResults: 2 });
    const finalJson = protocol => protocol === 'anthropic'
        ? jsonResponse({ type: 'message', content: [{ type: 'text', text: 'FINAL' }], stop_reason: 'end_turn' })
        : jsonResponse({ choices: [{ message: { content: 'FINAL' }, finish_reason: 'stop' }] });
    const cases = [
        ['OpenAI JSON length finish', 'openai', [jsonResponse({ choices: [{ message: { content: '', tool_calls: [call] }, finish_reason: 'length' }] }), finalJson('openai')], false],
        ['OpenAI JSON missing finish reason', 'openai', [jsonResponse({ choices: [{ message: { content: '', tool_calls: [call] } }] }), finalJson('openai')], false],
        ['OpenAI SSE DONE without tool_calls finish', 'openai', [sseResponse([{ choices: [{ delta: { tool_calls: [{ index: 0, ...call }] } }] }], true), sseResponse([{ choices: [{ delta: { content: 'FINAL' }, finish_reason: 'stop' }] }], true)], true],
        ['OpenAI SSE complete finish with truncated arguments', 'openai', [sseResponse([
            { choices: [{ delta: { tool_calls: [{ index: 0, id: 'strict_call', type: 'function', function: { name: 'search_conversation' } }] } }] },
            { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{"query":"保' } }] } }] },
            { choices: [{ delta: {}, finish_reason: 'tool_calls' }] }
        ], true), sseResponse([{ choices: [{ delta: { content: 'FINAL' }, finish_reason: 'stop' }] }], true)], true],
        ['Anthropic max_tokens finish', 'anthropic', [jsonResponse({
            type: 'message',
            content: [{ type: 'tool_use', id: 'native_call', name: 'search_conversation', input: { query: '保留原文' } }],
            stop_reason: 'max_tokens'
        }), finalJson('anthropic')], false]
    ];
    for (const [name, protocol, responses, stream] of cases) {
        const harness = createHarness(protocol, true);
        let executions = 0;
        const original = harness.context.executeModelTool;
        harness.context.executeModelTool = (...args) => { executions++; return original(...args); };
        const result = await runRequest(harness, responses, { stream });
        assert.equal(executions, 0, name + ' must not execute a tool');
        assert.equal(result.requests.length, 1, name + ' must not send another model request');
        assert.equal(result.errors.length, 0, name + ' must settle as a readable completion, not an error');
        assert.equal(result.completions.length, 1, name + ' must settle exactly once');
        const completion = result.completions[0][3];
        assert.equal(completion.interrupted, true, name + ' must be interrupted');
        const trace = completion._modelToolTrace;
        assert.ok(trace, name + ' must retain the partial tool record');
        assert.equal(trace.status === 'unknown' || trace.status === 'interrupted', true, name + ' must read as unknown/interrupted');
        assert.ok(trace.rounds.some(round => round.calls.some(item => item.status === 'not-run')), name + ' must keep not-run calls');
    }
}

function countExecutions(harness) {
    const counted = { value: 0 };
    const original = harness.context.executeModelTool;
    harness.context.executeModelTool = (...args) => {
        counted.value++;
        return original(...args);
    };
    return counted;
}

async function testInvalidToolIdentities() {
    const finalJson = { choices: [{ message: { content: 'FINAL' }, finish_reason: 'stop' }] };
    const missingIdCall = { type: 'function', function: { name: 'search_conversation', arguments: '{"query":"x"}' } };
    const invalidCases = [
        ['OpenAI JSON missing id', 'openai', jsonResponse({ choices: [{ message: { content: '', tool_calls: [missingIdCall] }, finish_reason: 'tool_calls' }] }), false],
        ['OpenAI JSON empty id', 'openai', jsonResponse({ choices: [{ message: { content: '', tool_calls: [openAiToolCall('', { query: 'x' })] }, finish_reason: 'tool_calls' }] }), false],
        ['OpenAI JSON overlong id', 'openai', jsonResponse({ choices: [{ message: { content: '', tool_calls: [openAiToolCall('x'.repeat(129), { query: 'x' })] }, finish_reason: 'tool_calls' }] }), false],
        ['OpenAI SSE missing id', 'openai', sseResponse([
            { choices: [{ delta: { tool_calls: [{ index: 0, type: 'function', function: { name: 'search_conversation' } }] } }] },
            { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{"query":"x"}' } }] } }] },
            { choices: [{ delta: {}, finish_reason: 'tool_calls' }] }
        ], true), true],
        ['OpenAI SSE conflicting id', 'openai', sseResponse([
            { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_a', type: 'function', function: { name: 'search_conversation' } }] } }] },
            { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_b' }] } }] },
            { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{"query":"x"}' } }] } }] },
            { choices: [{ delta: {}, finish_reason: 'tool_calls' }] }
        ], true), true],
        ['Anthropic JSON missing id', 'anthropic', jsonResponse({
            type: 'message',
            content: [{ type: 'tool_use', name: 'search_conversation', input: { query: 'x' } }],
            stop_reason: 'tool_use'
        }), false],
        ['Anthropic SSE missing id', 'anthropic', sseResponse([
            { type: 'message_start', message: { usage: {} } },
            { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', name: 'search_conversation', input: {} } },
            { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"query":"x"}' } },
            { type: 'content_block_stop', index: 0 },
            { type: 'message_delta', delta: { stop_reason: 'tool_use' } }
        ], true), true]
    ];
    for (const [name, protocol, response, stream] of invalidCases) {
        const harness = createHarness(protocol, true);
        const executions = countExecutions(harness);
        const result = await runRequest(harness, [response, protocol === 'anthropic'
            ? jsonResponse({ type: 'message', content: [{ type: 'text', text: 'FINAL' }], stop_reason: 'end_turn' })
            : finalJson], { stream });
        assert.equal(executions.value, 0, name + ' must not execute any tool');
        assert.equal(result.requests.length, 1, name + ' must not start another model request');
        assert.equal(result.completions.length, 0, name + ' must not settle as a content-less completion');
        assert.equal(result.errors.length, 1, name + ' must report one explicit protocol error');
        assert.match(result.errors[0].message, /Tool call \d+ has (no valid|no|an invalid) id|changed its id/);
    }

    const mixedHarness = createHarness('openai', true);
    const mixedExecutions = countExecutions(mixedHarness);
    const mixedResult = await runRequest(mixedHarness, [jsonResponse({
        choices: [{ message: { content: '', tool_calls: [openAiToolCall('good_call', { query: 'x' }), missingIdCall] }, finish_reason: 'tool_calls' }]
    }), finalJson], { stream: false });
    assert.equal(mixedExecutions.value, 0, 'A valid call must not run when another call in the same round has no identity');
    assert.equal(mixedResult.requests.length, 1, 'A partially invalid round must not continue');
    assert.equal(mixedResult.completions.length, 0);
    assert.equal(mixedResult.errors.length, 1);

    const lateHarness = createHarness('openai', true);
    const lateExecutions = countExecutions(lateHarness);
    const lateResult = await runRequest(lateHarness, [
        sseResponse([
            { choices: [{ delta: { tool_calls: [{ index: 0, function: { name: 'search_conversation', arguments: '{"query":"late"}' } }] } }] },
            { choices: [{ delta: { tool_calls: [{ index: 0, id: 'late_id' }] } }] },
            { choices: [{ delta: {}, finish_reason: 'tool_calls' }] }
        ], true),
        sseResponse([{ choices: [{ delta: { content: 'late ok' }, finish_reason: 'stop' }] }], true)
    ]);
    assert.equal(lateResult.errors.length, 0, 'An id that arrives after argument fragments must be accepted');
    assert.equal(lateExecutions.value, 1);
    assert.equal(lateResult.completions[0][0], 'late ok');
    assert.equal(lateResult.requests[1].messages.filter(message => message.role === 'tool')[0].tool_call_id, 'late_id');

    const afterHarness = createHarness('openai', true);
    const afterExecutions = countExecutions(afterHarness);
    const afterResult = await runRequest(afterHarness, [
        jsonResponse({ choices: [{ message: { content: 'before search', tool_calls: [openAiToolCall('first_call', { query: '保留原文' })] }, finish_reason: 'tool_calls' }] }),
        jsonResponse({ choices: [{ message: { content: '', tool_calls: [missingIdCall] }, finish_reason: 'tool_calls' }] }),
        finalJson
    ], { stream: false });
    assert.equal(afterExecutions.value, 1, 'The earlier valid round must still have run exactly once');
    assert.equal(afterResult.requests.length, 2, 'A bad later round must not start another model request');
    assert.equal(afterResult.errors.length, 0);
    assert.equal(afterResult.completions.length, 1, 'A bad later round must settle once as an unknown interruption');
    const afterCompletion = afterResult.completions[0][3];
    assert.equal(afterCompletion.interrupted, true);
    assert.equal(afterCompletion.completionReason, 'unknown');
    const afterTrace = afterCompletion._modelToolTrace;
    assert.equal(afterTrace.status, 'unknown', 'The earlier executed facts must remain readable');
    assert.equal(afterTrace.rounds.length, 2);
    assert.equal(afterTrace.rounds[0].calls[0].id, 'first_call');
    assert.equal(afterTrace.rounds[0].calls[0].status, 'completed');
    assert.ok(afterTrace.rounds[0].calls[0].resultPreview.includes('{{user}}'));
    assert.equal(afterTrace.rounds[1].calls[0].status, 'not-run');
    assert.equal(afterResult.toolRoundRecords.length, 1, 'The earlier recovery checkpoint must be kept');
}

async function testTaskDeadline() {
    const harness = createHarness('openai', true);
    harness.context.MODEL_TOOL_MAX_TASK_MS = 80;
    let executions = 0;
    const original = harness.context.executeModelTool;
    harness.context.executeModelTool = (...args) => { executions++; return original(...args); };
    const startedAt = Date.now();
    const result = await runRequest(harness, [], {
        stream: true,
        fetch: (url, options, current, requests) => {
            requests.push(JSON.parse(options.body));
            return Promise.resolve(stalledSseResponse(options.signal, [
                { choices: [{ delta: { tool_calls: [{ index: 0, id: 'late_call', type: 'function', function: { name: 'search_conversation' } }] } }] }
            ]));
        }
    });
    const elapsed = Date.now() - startedAt;
    assert.ok(elapsed < 750, 'an 80ms task budget must abort the in-flight stream promptly, took ' + elapsed + 'ms');
    assert.equal(executions, 0, 'the deadline must not execute a tool');
    assert.equal(result.requests.length, 1, 'the deadline must not start another request');
    assert.equal(result.errors.length, 0);
    assert.equal(result.completions.length, 1, 'the deadline must settle exactly once');
    assert.equal(result.completions[0][3].interrupted, true);
    assert.equal(result.completions[0][3].completionReason, 'timeout');
    assert.ok(result.completions[0][3]._modelToolTrace, 'a late stream must keep its partial tool record');
    await new Promise(resolve => setTimeout(resolve, 120));
    assert.equal(result.completions.length, 1, 'the cleared task timer must not settle a finished task again');
}

async function testToolRoundDraftSnapshot() {
    const harness = createHarness('openai', true);
    const first = jsonResponse({ choices: [{ message: { content: 'before search', tool_calls: [openAiToolCall('draft_call', { query: '保留原文' })] }, finish_reason: 'tool_calls' }] });
    const second = jsonResponse({ choices: [{ message: { content: 'FINAL' }, finish_reason: 'stop' }] });
    const result = await runRequest(harness, [first, second], { stream: false });
    assert.equal(result.toolRoundRecords.length, 1, 'one completed tool round must produce one bounded recovery record');
    const snapshot = result.toolRoundRecords[0];
    assert.equal(snapshot.content, 'before search', 'the recovery record must keep the partial assistant text');
    assert.equal(snapshot.trace.status, 'unknown', 'a pending final reply must be recorded as unknown, not completed');
    const round = snapshot.trace.rounds[0];
    assert.equal(round.calls[0].id, 'draft_call');
    assert.equal(round.calls[0].status, 'completed');
    assert.ok(round.calls[0].resultPreview.includes('{{user}}'), 'the durable record must keep the actual result body');
    assert.equal(round.assistantNative.tool_calls[0].id, 'draft_call', 'the native assistant tool call must be preserved');
    assert.equal(round.resultNative[0].tool_call_id, 'draft_call', 'the native tool result must be preserved');
    assert.equal(result.requests.length, 2);
}

async function testToolRoundDraftCheckpointAck() {
    for (const protocol of ['openai', 'anthropic']) {
        const harness = createIntegrationHarness(protocol);
        const ack = deferred();
        const executions = countExecutions(harness);
        const pending = requestViaIntegration(harness, [toolCallResponse(protocol), finalResponse(protocol)], { stream: false, flush: () => ack.promise });
        await settleTicks();
        assert.equal(executions.value, 1, protocol + ' must execute the searched tool exactly once');
        assert.equal(pending.draftCalls.length, 1, protocol + ' must queue the recovery record with the real trace');
        assert.equal(pending.draftCalls[0][3].status, 'unknown', protocol + ' recovery record must stay unknown before the final reply');
        assert.equal(pending.requests.length, 1, protocol + ' must not send the next round while the checkpoint ACK is pending');
        assert.equal(pending.completions.length, 0, protocol + ' must stay unsettled while the checkpoint ACK is pending');
        ack.resolve();
        await pending.promise;
        assert.equal(pending.requests.length, 2, protocol + ' must send the next round only after the checkpoint ACK');
        assert.equal(pending.errors.length, 0);
        assert.equal(pending.completions.length, 1, protocol + ' must settle exactly once');
        const completion = pending.completions[0][3];
        assert.equal(pending.completions[0][0], '最终正文');
        assert.equal(completion.interrupted, false);
        assert.equal(completion._modelToolTrace.status, 'completed');
        assert.equal(completion._modelToolTrace.rounds[0].calls[0].status, 'completed');
        assert.equal(executions.value, 1, protocol + ' must not re-run the tool for the next round');
        const second = pending.requests[1].messages;
        assert.equal(second.some(message => message.role === 'tool' || (Array.isArray(message.content) && message.content.some(block => block.type === 'tool_result'))), true, protocol + ' second round must carry the real tool result');
    }
}

async function testToolRoundDraftCheckpointReject() {
    const harness = createIntegrationHarness('openai');
    const executions = countExecutions(harness);
    const failure = new Error('草稿恢复存储事务超时。');
    const result = requestViaIntegration(harness, [toolCallResponse('openai', 'call_reject'), finalResponse('openai')], {
        stream: false,
        flush: () => Promise.reject(failure)
    });
    await result.promise;
    assert.equal(executions.value, 1, 'the executed tool must stay an actual fact');
    assert.equal(result.requests.length, 1, 'a rejected checkpoint must not request the next round');
    assert.equal(result.errors.length, 0, 'a rejected checkpoint must settle as an interrupted completion, not a transport error');
    assert.equal(result.completions.length, 1, 'a rejected checkpoint must settle exactly once');
    const completion = result.completions[0][3];
    assert.equal(completion.interrupted, true);
    assert.equal(completion.completionReason, 'abort', 'a rejected checkpoint settles through the bounded interruption path');
    const trace = completion._modelToolTrace;
    assert.ok(trace, 'the occurred tool round must remain readable');
    assert.equal(trace.status, 'interrupted');
    assert.equal(trace.rounds.length, 1, 'the occurred round must not be duplicated as not-run');
    assert.equal(trace.rounds[0].calls[0].id, 'call_reject');
    assert.equal(trace.rounds[0].calls[0].status, 'completed');
    assert.ok(trace.rounds[0].calls[0].resultPreview.includes('{{user}}'), 'the occurred result must remain readable');
    assert.equal(trace.diagnostics.errors.some(message => message.includes('草稿恢复存储事务超时')), true, 'the checkpoint failure must be recorded in the trace');
    assert.equal(executions.value, 1, 'a rejected checkpoint must not re-run the tool');
}

async function testLateDraftAckDoesNotResume() {
    for (const mode of ['cancel', 'revoke', 'source']) {
        const harness = createIntegrationHarness('openai');
        const ack = deferred();
        const executions = countExecutions(harness);
        const pending = requestViaIntegration(harness, [toolCallResponse('openai'), finalResponse('openai')], { stream: false, flush: () => ack.promise });
        await settleTicks();
        assert.equal(pending.requests.length, 1, mode + ' must wait for the checkpoint ACK');
        assert.equal(executions.value, 1, mode + ' must have run the tool once before the checkpoint');
        if (mode === 'cancel') pending.gen.controller.abort();
        if (mode === 'revoke') harness.state.settings.modelToolGrants = {};
        if (mode === 'source') pending.gen.operation.current = false;
        ack.resolve();
        await pending.promise;
        assert.equal(pending.requests.length, 1, mode + ' must not resume the old request after a late ACK');
        assert.equal(executions.value, 1, mode + ' must not re-run the tool after a late ACK');
        assert.equal(pending.errors.length, 0);
        assert.equal(pending.completions.length, 1, mode + ' must settle exactly once');
        const completion = pending.completions[0][3];
        assert.equal(completion.interrupted, true);
        assert.equal(completion.completionReason, 'abort');
        assert.equal(completion._modelToolTrace.status, 'interrupted', mode + ' must keep the occurred round readable');
        assert.equal(completion._modelToolTrace.rounds.length, 1);
        assert.equal(completion._modelToolTrace.rounds[0].calls[0].status, 'completed');
    }
}

testRegistryAndSchema();
await testOpenAiJson();
await testOpenAiFragmentedSse();
await testAnthropicJson();
await testAnthropicFragmentedSse();
await testInvalidCallsAndCache();
await testLimits();
await testStopAndRevokeBetweenRounds();
await testOffPathAndReplay();
await testDurableTraceAndDraft();
await testPostProcessNative();
await testIncompleteToolRounds();
await testInvalidToolIdentities();
await testTaskDeadline();
await testToolRoundDraftSnapshot();
await testToolRoundDraftCheckpointAck();
await testToolRoundDraftCheckpointReject();
await testLateDraftAckDoesNotResume();
console.log('Stage D1 runtime passed: schema/permissions, OpenAI JSON+SSE, Anthropic JSON+SSE, cache/error results, limits, stop/revoke/source changes, off-path, native replay, durable trace, post-processing isolation, strict tool-round completion, real task deadline abort, tool-round recovery records, checkpoint ACK ordering before the next round, checkpoint rejection as a bounded interrupted settlement with a readable failure and late ACK after cancel/revoke/source change without resuming.');
