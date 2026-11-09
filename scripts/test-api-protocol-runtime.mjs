import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const plain = value => JSON.parse(JSON.stringify(value));
const context = vm.createContext({ console, URL, AbortController, TextDecoder, setTimeout, clearTimeout, state: { settings: {} } });
for (const file of ['api/31-api-protocol.js', 'api/31-api-endpoint-normalizer.js', 'api/31-api-connection-endpoints.js', 'generation/50-generation-cot-utils.js', 'generation/50-generation-usage.js', 'generation/50-generation-api-request.js', 'generation/50-generation-transport-module.js', 'summary/53-summary-api-client.js']) {
    vm.runInContext(fs.readFileSync(new URL('../src/app/' + file, import.meta.url), 'utf8'), context, { filename: file });
}
assert.equal(context.getMainApiProtocol({}), 'openai');
assert.equal(context.getMainApiProtocol({ apiProtocol: 'unknown' }), 'openai');
assert.equal(context.getSummaryApiProtocol({ apiProtocol: 'anthropic' }), 'anthropic');
assert.equal(context.getSummaryApiProtocol({ apiProtocol: 'anthropic', summarizeUseMainAPI: false, summarizeApiProtocol: 'openai' }), 'openai');
for (const base of ['https://native.invalid', 'https://native.invalid/v1/', 'https://native.invalid/v1/messages', 'https://native.invalid/v1/models']) {
    assert.equal(context.resolveChatEndpoint(base, 'anthropic'), 'https://native.invalid/v1/messages');
    assert.equal(context.deriveApiModelsEndpoint(base, 'anthropic'), 'https://native.invalid/v1/models?limit=1000');
}
assert.deepEqual(plain(context.buildApiAuthHeaders('synthetic-key', 'openai', true)), { 'Content-Type': 'application/json', Authorization: 'Bearer synthetic-key' });
const nativeHeaders = context.buildApiAuthHeaders('synthetic-key', 'anthropic', true);
assert.equal(nativeHeaders['x-api-key'], 'synthetic-key');
assert.equal(nativeHeaders['anthropic-version'], '2023-06-01');
assert.equal(nativeHeaders.Authorization, undefined);
const payload = { model: 'test-native', max_tokens: 2048, temperature: 1.5, stream: true, frequency_penalty: 1, messages: [
    { role: 'system', content: 'system one' }, { role: 'system', content: 'system two' },
    { role: 'user', content: [{ type: 'text', text: 'look' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,iVBORw0KGgo=' } }] },
    { role: 'system', content: 'depth note' }, { role: 'assistant', content: 'answer' }
] };
assert.equal(context.toApiProtocolPayload(payload, 'openai'), payload);
const native = context.toApiProtocolPayload(payload, 'anthropic');
assert.equal(native.system, 'system one\n\nsystem two');
assert.equal(native.messages[0].content[1].source.media_type, 'image/png');
assert.equal(native.messages[0].content.at(-1).text, 'depth note');
assert.equal(native.messages.at(-1).role, 'user');
assert.equal(native.temperature, 1);
assert.equal(native.frequency_penalty, undefined);
assert.equal(payload.messages[0].role, 'system', 'Conversion must not mutate prompt diagnostics.');
assert.throws(() => context.toApiProtocolPayload({ ...payload, thinking: { type: 'enabled', budget_tokens: 2048 } }, 'anthropic'), /below max_tokens/);
assert.throws(() => context.toAnthropicContentBlocks([{ type: 'image_url', image_url: { url: 'javascript:bad' } }]), /image/);
const thinking = context.toApiProtocolPayload({ ...payload, thinking: { type: 'enabled', budget_tokens: 1024 } }, 'anthropic');
assert.equal(thinking.temperature, undefined);

const settings = { apiProtocol: 'anthropic', apiEndpoint: 'https://native.invalid/v1', apiKey: 'synthetic-key', model: 'test-native', maxTokens: 2048, temperature: 0.7, topP: 0.9, requestCotEnabled: true };
let requests = [], completed = [], errors = [], tokens = [];
let response;
const transport = context.createGenerationTransport({
    settings, TextDecoder, fetch: async (url, options) => { requests.push({ url, headers: options.headers, body: JSON.parse(options.body) }); return response; },
    stateController: { begin: () => new AbortController(), finish: () => 1000 },
    helpers: { shouldCaptureCot: context.shouldCaptureCotForRequest, buildPayload: context.buildChatCompletionPayload, buildFetchOptions: context.buildChatCompletionFetchOptions,
        normalizeEndpoint: context.resolveChatEndpoint, normalizeResponse: json => context.normalizeApiProtocolResponse(json, 'anthropic'),
        parseUsage: json => context.parseApiProtocolUsage(json, 'anthropic'), finalizeUsage: context.finalizeUsageMeta,
        extractCot: delta => delta?.reasoning_content || '', buildCotParts: (_capture, content, cot) => ({ content, cot }) }
});
const callbacks = { onToken: (...value) => tokens.push(value), onComplete: (...value) => completed.push(value), onError: error => errors.push(error) };
const events = [
    { type: 'message_start', message: { usage: { input_tokens: 10, cache_creation_input_tokens: 2, cache_read_input_tokens: 3, output_tokens: 0 } } },
    { type: 'ping' },
    { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: '思考' } },
    { type: 'content_block_delta', delta: { type: 'text_delta', text: '中文🙂' } },
    { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 7 } }, { type: 'message_stop' }
];
const bytes = new TextEncoder().encode(events.map(event => 'event: ' + event.type + '\ndata: ' + JSON.stringify(event) + '\n\n').join(''));
response = { ok: true, headers: { get: () => 'text/event-stream' }, body: new ReadableStream({ start(controller) { for (let i = 0; i < bytes.length; i += 7) controller.enqueue(bytes.slice(i, i + 7)); controller.close(); } }) };
await transport.request(payload.messages, callbacks, {});
assert.equal(errors.length, 0);
assert.equal(completed.length, 1);
assert.equal(completed[0][0], '中文🙂');
assert.equal(completed[0][1], '思考');
assert.equal(completed[0][2].promptTokens, 15);
assert.equal(completed[0][2].completionTokens, 7);
assert.equal(completed[0][2].cachedTokens, 3);
assert.equal(completed[0][3].interrupted, false);
assert.equal(requests[0].url, 'https://native.invalid/v1/messages');
assert.equal(requests[0].body.stream_options, undefined);
assert.equal(requests[0].body.messages[0].content[1].type, 'image');
response = { ok: true, headers: { get: () => 'application/json' }, json: async () => ({ type: 'message', content: [{ type: 'text', text: 'truncated' }], stop_reason: 'max_tokens', usage: { input_tokens: 5, output_tokens: 2 } }) };
await transport.request(payload.messages, callbacks, { stream: false });
assert.equal(completed[1][3].interrupted, true);
assert.equal(completed[1][3].finishReason, 'length');
response = { ok: true, headers: { get: () => 'application/json' }, json: async () => ({ type: 'error', error: { message: 'overloaded' } }) };
await transport.request(payload.messages, callbacks, { stream: false });
assert.equal(errors.length, 1);
assert.equal(requests.length, 3, 'Provider failures must never retry automatically.');
context.state.settings = settings;
context.fetch = async (_url, options) => { assert.equal(options.headers.Authorization, undefined); assert.equal(JSON.parse(options.body).stream, false); return { ok: true, json: async () => ({ type: 'message', content: [{ type: 'text', text: 'summary' }], stop_reason: 'end_turn' }) }; };
const summary = await context.requestSummaryCompletion('https://native.invalid/v1/messages', 'synthetic-key', 'test-native', [{ role: 'user', content: 'summarize text' }], 1024, 'anthropic');
assert.equal(summary.choices[0].message.content, 'summary');
console.log('API protocols passed: defaults, endpoint/auth pairing, multimodal conversion, split SSE/thinking/usage, stop/error settlement and native summary.');
