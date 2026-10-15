import { assert, messageIdentitySource } from '../support.mjs';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';


async function assertFrontendGenerationHelpers() {
  const sources = await Promise.all([
    '../../../src/app/generation/50-generation-cot-utils.js',
    '../../../src/app/generation/50-generation-usage.js',
    '../../../src/app/generation/50-generation-api-request.js',
    '../../../src/app/generation/50-generation-stream-state.js',
    '../../../src/app/generation/50-generation-transport-module.js',
    '../../../src/app/generation/50-generation-response-stream.js',
    '../../../src/app/generation/50-generation-integrations.js',
    '../../../src/app/generation/50-request-diagnostics.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));
  const notifications = [];
  const context = {
    state: {
      isGenerating: false,
      abortController: null,
      settings: {
        apiEndpoint: 'https://chat.example/v1/chat/completions',
        apiKey: 'chat-key',
        model: 'chat-model',
        maxTokens: 1024,
        temperature: 0.7,
        topP: 0.9,
        requestCotEnabled: false,
      },
    },
    appStore: {
      notify(key) { notifications.push(key); },
    },
    t: (key) => key,
    normalizeStreamIdleTimeoutSec(value) {
      const parsed = Number.parseInt(value, 10);
      return Number.isFinite(parsed) && parsed > 0 ? Math.max(15, Math.min(300, parsed)) : 0;
    },
    normalizeApiEndpoint: (value) => value,
    shouldUseOllamaCompat: () => false,
    normalizeMessagesForOllamaCompatibility: (messages) => messages,
    fetch: async () => ({
      ok: false,
      status: 500,
      async text() { return JSON.stringify({ error: { message: 'server exploded' } }); },
    }),
    AbortController,
    TextDecoder,
    TextEncoder,
    Error,
    JSON,
    String,
    Array,
    Object,
    setTimeout,
    clearTimeout,
    getActiveConv: () => ({ id: 'test', messages: [], worldBookMode: 'default' }),
    isGroupChat: () => false,
    getCharacterDepthPrompt: () => null,
    getValidConversationSummaries: () => [],
    defaultAuthorNote: () => ({ enabled: false, content: '', role: 'system', position: 'in_chat', depth: 4, interval: 1 }),
    getEffectiveAuthorNote: (_conv, settings) => settings.authorNote || { enabled: false },
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__extract = extractCotDelta;\nthis.__split = splitInlineCot;\nthis.__parts = buildCotAwareParts;\nthis.__capture = shouldCaptureCotForRequest;\nthis.__payload = buildChatCompletionPayload;\nthis.__fetchOptions = buildChatCompletionFetchOptions;\nthis.__readError = readChatCompletionError;\nthis.__begin = beginGenerationStreamState;\nthis.__touch = touchGenerationIdleTimeout;\nthis.__finish = finishGenerationStreamState;\nthis.__stream = streamChatWithMessages;\nthis.__operation = createPromptBuildOperation;\nthis.__runtime = createGenerationRuntimeContext;\nthis.__transportFactory = createGenerationTransport;\nthis.__completionRuntime = getGenerationCompletionContext;\nthis.__updateDiagnosticCompletion = updateRequestDiagnosticCompletion;\nthis.__updateDiagnosticError = updateRequestDiagnosticError;`, context);

  assert(context.__extract({ reasoning_content: 'chain' }) === 'chain', 'CoT delta should read reasoning_content.');
  assert(context.__extract({ thinking: [{ text: 'a' }, { content: 'b' }, 'c'] }) === 'abc', 'CoT delta should flatten array parts.');

  const split = context.__split('hello <think>hidden</think> world <thinking>more</thinking>', 'seed');
  assert(split.content === 'hello  world', 'Inline CoT splitter should remove think blocks from content.');
  assert(split.cot === 'seed\nhidden\nmore', 'Inline CoT splitter should append think blocks to existing CoT.');
  const noCotParts = context.__parts(false, 'visible', 'secret');
  assert(noCotParts.content === 'visible' && noCotParts.cot === '', 'CoT parts should ignore CoT when capture is disabled.');

  const settings = {
    model: 'chat-model',
    apiKey: 'secret',
    requestCotEnabled: true,
    maxTokens: 1024,
    temperature: 0.7,
    topP: 0.9,
  };
  const messages = [{ role: 'user', content: 'hi' }];
  const payload = context.__payload(settings, messages, { maxTokens: 256, temperature: 0.2 });
  assert(payload.model === 'chat-model' && payload.messages === messages && payload.stream === true, 'Payload should preserve model/messages/stream.');
  assert(payload.max_tokens === 256 && payload.temperature === 0.2 && payload.top_p === 0.9, 'Payload should apply request overrides and defaults.');
  assert(context.__capture(settings, {}) === true && context.__capture(settings, { requestCot: false }) === false, 'CoT capture flag should respect request override.');

  const controller = new AbortController();
  const fetchOptions = context.__fetchOptions(settings, payload, controller);
  assert(fetchOptions.method === 'POST', 'Fetch options should use POST.');
  assert(fetchOptions.headers.Authorization === 'Bearer secret', 'Fetch options should include bearer token.');
  assert(JSON.parse(fetchOptions.body).model === 'chat-model', 'Fetch options should serialize payload.');
  assert(fetchOptions.signal === controller.signal, 'Fetch options should use the provided abort signal.');

  const parsedError = await context.__readError({
    status: 429,
    async text() { return JSON.stringify({ error: { message: 'rate limited' } }); },
  });
  assert(parsedError.message === 'API Error 429: rate limited', 'API error parser should preserve provider message.');

  const parserContext = {
    state: { isGenerating: false, abortController: null, settings: {} },
    appStore: { notify() {} },
    TextDecoder,
    Error,
    JSON,
    String,
    Array,
    Object,
    setTimeout,
    clearTimeout,
  };
  vm.runInNewContext(`${sources.slice(0, 6).join('\n')}\nthis.__streamResponse = streamChatCompletionResponse;\nthis.__readResponse = readChatCompletionResponse;\nthis.__transportFactory = createGenerationTransport;`, parserContext);

  const standaloneSseController = new AbortController();
  parserContext.state.abortController = standaloneSseController;
  parserContext.state.isGenerating = true;
  let standaloneSseCompletions = 0;
  let standaloneSseErrors = 0;
  let standaloneSseMetadata;
  let standaloneSseSettlementError;
  try {
    await parserContext.__streamResponse(
      streamResponseFromLines(['data: [DONE]\n']),
      false,
      () => {},
      (_content, _cot, _usage, completion) => {
        standaloneSseCompletions += 1;
        standaloneSseMetadata = completion;
      },
      () => { standaloneSseErrors += 1; },
      standaloneSseController
    );
  } catch (error) {
    standaloneSseSettlementError = error;
  }
  assert(standaloneSseSettlementError === undefined, 'A standalone SSE parser must settle without diagnostic helpers.');
  assert(standaloneSseCompletions === 1 && standaloneSseErrors === 0, 'A standalone SSE parser must report one success and no error.');
  assert(standaloneSseMetadata && standaloneSseMetadata.finishReason === null && standaloneSseMetadata.completionReason === 'done', 'DONE without a provider reason must complete as done.');

  const standaloneJsonController = new AbortController();
  parserContext.state.abortController = standaloneJsonController;
  parserContext.state.isGenerating = true;
  let standaloneJsonCompletions = 0;
  let standaloneJsonErrors = 0;
  let standaloneJsonMetadata;
  await parserContext.__readResponse(
    { async json() { return { choices: [{ message: { content: 'legacy' }, finish_reason: null }] }; } },
    false,
    (_content, _cot, _usage, completion) => {
      standaloneJsonCompletions += 1;
      standaloneJsonMetadata = completion;
    },
    () => { standaloneJsonErrors += 1; },
    standaloneJsonController
  );
  assert(standaloneJsonCompletions === 1 && standaloneJsonErrors === 0, 'A standalone JSON parser must report one success and no error.');
  assert(standaloneJsonMetadata && standaloneJsonMetadata.finishReason === null && standaloneJsonMetadata.completionReason === 'json', 'Legacy JSON without a provider reason must complete as json.');

  const standaloneReadFailure = new Error('standalone read failed');
  const standaloneFailureController = new AbortController();
  parserContext.state.abortController = standaloneFailureController;
  parserContext.state.isGenerating = true;
  let standaloneFailureCompletions = 0;
  let standaloneFailureErrors = 0;
  let standaloneFailureObserved;
  let standaloneFailureSettlementError;
  try {
    await parserContext.__readResponse(
      { async json() { throw standaloneReadFailure; } },
      false,
      () => { standaloneFailureCompletions += 1; },
      (error) => {
        standaloneFailureErrors += 1;
        standaloneFailureObserved = error;
      },
      standaloneFailureController
    );
  } catch (error) {
    standaloneFailureSettlementError = error;
  }
  assert(standaloneFailureSettlementError === undefined, 'A standalone parser failure must settle without diagnostic helpers.');
  assert(standaloneFailureCompletions === 0 && standaloneFailureErrors === 1 && standaloneFailureObserved === standaloneReadFailure, 'A standalone JSON parser must report its real failure once.');

  const startedController = context.__begin();
  assert(context.state.isGenerating === true && context.state.abortController === startedController, 'Generation begin should set active stream state.');
  context.__finish();
  assert(context.state.isGenerating === false && context.state.abortController === null, 'Generation finish should clear active stream state.');
  assert(notifications.join(',') === 'isGenerating,isGenerating', 'Generation state helpers should notify state changes.');

  const staleController = context.__begin();
  const currentController = context.__begin();
  context.__finish(staleController);
  assert(context.state.abortController === currentController && context.state.isGenerating === true, 'A stale stream must not clear a newer generation operation.');
  context.__finish(currentController);
  assert(context.state.abortController === null && context.state.isGenerating === false, 'The current stream should still release generation state.');

  notifications.length = 0;
  let streamErrorMessage = '';
  await new Promise((resolve) => {
    context.__stream(
      [{ role: 'user', content: 'hi' }],
      () => {},
      () => { throw new Error('HTTP error path should not complete.'); },
      (err) => { streamErrorMessage = err && err.message; resolve(); }
    );
  });
  assert(streamErrorMessage === 'API Error 500: server exploded', 'Streaming HTTP error should preserve API error detail.');
  assert(context.state.isGenerating === false && context.state.abortController === null, 'Streaming HTTP error should clear active generation state.');
  assert(notifications.join(',') === 'isGenerating,isGenerating', 'Streaming HTTP error should notify begin and finish state changes.');

  notifications.length = 0;
  let httpErrorCallbacks = 0;
  const httpErrorSettlement = context.__stream(
    [{ role: 'user', content: 'hi' }],
    () => {},
    () => {},
    () => {
      httpErrorCallbacks += 1;
      throw new Error('HTTP error callback failed');
    }
  );
  let httpErrorObserved;
  try {
    if (httpErrorSettlement && typeof httpErrorSettlement.then === 'function') await httpErrorSettlement;
    else await new Promise((resolve) => setTimeout(resolve, 0));
  } catch (error) {
    httpErrorObserved = error;
  }
  assert(httpErrorCallbacks === 1, 'HTTP error settlement must not re-enter the error callback.');
  assert(httpErrorObserved && httpErrorObserved.message === 'HTTP error callback failed', 'An HTTP error callback exception must remain observable to the caller.');

  function streamResponseFromLines(lines) {
    const encoder = new TextEncoder();
    const chunks = lines.map((line) => encoder.encode(line));
    let index = 0;
    return {
      ok: true,
      body: {
        getReader() {
          return {
            read() {
              if (index < chunks.length) return Promise.resolve({ done: false, value: chunks[index++] });
              return Promise.resolve({ done: true });
            },
          };
        },
      },
    };
  }

  const transportEvents = [];
  const transport = context.__transportFactory({
    fetch: async () => streamResponseFromLines(['data: {"choices":[{"delta":{"content":"factory"},"finish_reason":"stop"}]}\n', 'data: [DONE]\n']),
    clock: { now: () => 1234, setTimeout, clearTimeout },
    stateController: { begin: () => new AbortController(), finish: () => 7, touch() {}, arm() {} },
    settings,
    helpers: {
      shouldCaptureCot: context.__capture,
      buildPayload: context.__payload,
      buildFetchOptions: context.__fetchOptions,
      readError: context.__readError,
      normalizeEndpoint: (value) => value,
      shouldUseOllamaCompat: () => false,
      parseUsage: (payload) => payload.usage || null,
      extractCot: context.__extract,
      buildCotParts: context.__parts,
      finalizeUsage: (value) => value,
    },
    TextDecoder,
  });
  await transport.request(messages, {
    onToken: (delta, content) => transportEvents.push(['token', delta, content]),
    onComplete: (content, cot, usage, completion) => transportEvents.push(['complete', content, cot, usage, completion]),
    onError: (error) => transportEvents.push(['error', error]),
  }, { settings, stream: true });
  assert(transportEvents[0][0] === 'token' && transportEvents.at(-1)[0] === 'complete', 'The transport factory must report token and terminal events.');
  assert(transportEvents.at(-1)[1] === 'factory' && transportEvents.at(-1)[4].completionReason === 'stop', 'The transport factory must parse SSE and settle once.');

  const delayedFetches = [];
  context.fetch = (_endpoint, options) => new Promise((resolve) => delayedFetches.push({ resolve, signal: options.signal }));
  const requestA = context.__stream(
    [{ role: 'user', content: 'A' }],
    () => {},
    (content, cot, usage, metadata) => ({ content, cot, usage, metadata }),
    (error) => ({ error })
  );
  assert(typeof requestA.then === 'function', 'streamChatWithMessages should return its request settlement for caller observation.');
  const controllerA = context.state.abortController;
  controllerA.abort();
  const requestB = context.__stream(
    [{ role: 'user', content: 'B' }],
    () => {},
    (content, cot, usage, metadata) => ({ content, cot, usage, metadata }),
    (error) => ({ error })
  );
  const controllerB = context.state.abortController;
  assert(controllerA !== controllerB && controllerA.signal.aborted, 'Each request must capture its own controller before the next request starts.');
  delayedFetches[0].resolve(streamResponseFromLines([
    'data: {"choices":[{"delta":{"content":"late"},"finish_reason":"stop"}]}\n',
    'data: [DONE]\n',
  ]));
  const resultA = await requestA;
  assert(resultA && resultA.metadata, 'The late first response must complete through its own callbacks.');
  const rawRuntimeA = context.__completionRuntime(resultA.metadata);
  assert(rawRuntimeA && rawRuntimeA.operation === null, 'Legacy raw streamChatWithMessages calls must remain usable without an explicit operation.');
  assert(
    resultA.metadata.interrupted === true &&
    resultA.metadata.finishReason === 'stop' &&
    resultA.metadata.completionReason === 'abort',
    'A late response must retain the completion metadata of the controller that initiated it.'
  );
  assert(context.state.abortController === controllerB && context.state.isGenerating, 'A late response must not clear the newer generation controller.');

  delayedFetches[1].resolve(streamResponseFromLines(['data: [DONE]\n']));
  const resultB = await requestB;
  assert(resultB && resultB.metadata && resultB.metadata.completionReason === 'done', 'The newer request must still complete normally.');
  assert(context.state.abortController === null && !context.state.isGenerating, 'The newer request should release generation state once it completes.');

  context.fetch = async () => streamResponseFromLines([
    'data: {"choices":[{"delta":{"content":"partial"}}]}\n',
    'data: [DONE]\n',
  ]);
  const completeCallbackError = new Error('complete callback failed');
  let completeCallbackCalls = 0;
  let terminalErrorCalls = 0;
  const callbackSettlement = context.__stream(
    [{ role: 'user', content: 'callback' }],
    () => {},
    () => {
      completeCallbackCalls += 1;
      throw completeCallbackError;
    },
    () => { terminalErrorCalls += 1; }
  );
  let callbackErrorObserved;
  try {
    await callbackSettlement;
  } catch (error) {
    callbackErrorObserved = error;
  }
  assert(completeCallbackCalls === 1, 'The complete callback must be attempted once.');
  assert(terminalErrorCalls === 0, 'A complete callback exception must not be re-dispatched as a terminal error callback.');
  assert(callbackErrorObserved === completeCallbackError, 'A complete callback exception must remain observable to the request caller.');

  context.fetch = async () => {
    const abortError = new Error('fetch aborted');
    abortError.name = 'AbortError';
    throw abortError;
  };
  const abortCompleteError = new Error('abort complete callback failed');
  let abortCompleteCalls = 0;
  let abortErrorCalls = 0;
  const abortSettlement = context.__stream(
    [{ role: 'user', content: 'abort' }],
    () => {},
    () => {
      abortCompleteCalls += 1;
      throw abortCompleteError;
    },
    () => { abortErrorCalls += 1; }
  );
  let abortObserved;
  try {
    await abortSettlement;
  } catch (error) {
    abortObserved = error;
  }
  assert(abortCompleteCalls === 1, 'Fetch AbortError must settle completion exactly once.');
  assert(abortErrorCalls === 0, 'Fetch AbortError must not dispatch a transport error after completion.');
  assert(abortObserved === abortCompleteError, 'Fetch AbortError completion failures must remain observable to the caller.');
  assert(context.state.isGenerating === false && context.state.abortController === null, 'Fetch AbortError must release generation state.');

  context.fetch = async () => ({ ok: true, body: null });
  const bodyNullErrors = [];
  let bodyNullCompletions = 0;
  let bodyNullSettlementError;
  try {
    await context.__stream(
      [{ role: 'user', content: 'null body' }],
      () => {},
      () => { bodyNullCompletions += 1; },
      (error) => bodyNullErrors.push(error)
    );
  } catch (error) {
    bodyNullSettlementError = error;
  }
  assert(bodyNullSettlementError === undefined, 'A missing SSE body must settle through onError.');
  assert(bodyNullCompletions === 0, 'A missing SSE body must not report completion.');
  assert(bodyNullErrors.length === 1, 'A missing SSE body must report exactly one terminal error.');
  assert(context.state.isGenerating === false && context.state.abortController === null, 'A missing SSE body must release generation state.');

  notifications.length = 0;
  const tokenEvents = [];
  let completedContent = '';
  let completedCot = '';
  context.state.settings.requestCotEnabled = true;
  context.fetch = async () => streamResponseFromLines([
    'data: {"choices":[{"delta":{"content":"Hel","reasoning_content":"R1"}}]}\n',
    'data: {"choices":[{"delta":{"content":"lo","reasoning_content":"R2"}}]}\n',
    'data: [DONE]\n',
  ]);
  await new Promise((resolve, reject) => {
    context.__stream(
      [{ role: 'user', content: 'hi' }],
      (delta, content, cot) => tokenEvents.push({ delta, content, cot }),
      (content, cot) => {
        completedContent = content;
        completedCot = cot;
        resolve();
      },
      reject,
      { requestCot: true }
    );
  });
  assert(tokenEvents.length === 2 && tokenEvents[1].content === 'Hello', 'Streaming success should emit incremental content.');
  assert(completedContent === 'Hello' && completedCot === 'R1R2', 'Streaming success should complete with content and CoT.');
  assert(context.state.isGenerating === false && context.state.abortController === null, 'Streaming success should clear active generation state.');
  assert(notifications.join(',') === 'isGenerating,isGenerating', 'Streaming success should notify begin and finish state changes.');

  const pendingRequests = [];
  const timers = new Map();
  let timerId = 0;
  context.setTimeout = (callback, delay) => {
    const id = ++timerId;
    timers.set(id, { callback, delay });
    return id;
  };
  context.clearTimeout = (id) => timers.delete(id);
  context.fetch = (_endpoint, options) => new Promise((resolve) => pendingRequests.push({ options, resolve }));

  const settingsA = {
    apiEndpoint: 'https://old.example/v1/chat/completions',
    apiKey: 'old-key',
    model: 'old-model',
    maxTokens: 128,
    temperature: 0.1,
    topP: 0.7,
    streamEnabled: true,
    streamIdleTimeoutSec: 15,
    activePresetId: 'old-preset',
    sillyTavernPreset: { name: 'Old preset' },
  };
  const settingsB = {
    apiEndpoint: 'https://new.example/v1/chat/completions',
    apiKey: 'new-key',
    model: 'new-model',
    maxTokens: 64,
    temperature: 0.8,
    topP: 0.95,
    streamEnabled: true,
    streamIdleTimeoutSec: 300,
    activePresetId: 'new-preset',
    sillyTavernPreset: { name: 'New preset' },
  };
  Object.assign(context.state.settings, settingsA);
  const messagesA = [{ role: 'user', content: 'A' }];
  Object.defineProperty(messagesA, '_requestSettings', { value: settingsA });
  const operationA = context.__operation(0, context.getActiveConv());
  const runtimeA = context.__runtime(operationA, settingsA, context.getActiveConv(), 'main');
  const requestCompletionsA = [];
  const snapshotRequestA = context.__stream(messagesA, () => {}, (_content, _cot, _usage, completion) => requestCompletionsA.push(completion), (error) => ({ error }), { stage: 'main', operation: 41, promptBuildOperation: operationA, generationContext: runtimeA });
  const requestControllerA = context.state.abortController;
  assert([...timers.values()][0].delay === 15000, 'The current request must use its captured idle timeout.');
  Object.assign(context.state.settings, settingsB);
  const messagesB = [{ role: 'user', content: 'B' }];
  Object.defineProperty(messagesB, '_requestSettings', { value: settingsB });
  const operationB = context.__operation(0, context.getActiveConv());
  const runtimeB = context.__runtime(operationB, settingsB, context.getActiveConv(), 'second');
  const requestCompletionsB = [];
  const snapshotRequestB = context.__stream(messagesB, () => {}, (_content, _cot, _usage, completion) => requestCompletionsB.push(completion), (error) => ({ error }), { stage: 'second', corrected: true, operation: 42, promptBuildOperation: operationB, generationContext: runtimeB });
  const requestControllerB = context.state.abortController;

  assert(JSON.parse(pendingRequests[0].options.body).model === 'old-model', 'A request must use its captured model snapshot.');
  assert(JSON.parse(pendingRequests[1].options.body).model === 'new-model', 'A later operation must use the newly captured settings.');
  assert([...timers.values()].length === 1 && [...timers.values()][0].delay === 300000, 'A later request must replace the stale timer with its newly captured idle timeout.');
  assert(requestControllerA._generationIdleTimeoutSec === 15 && requestControllerB._generationIdleTimeoutSec === 300, 'Each controller must retain its own idle timeout snapshot.');

  context.__touch(requestControllerA);
  assert([...timers.values()].some((timer) => timer.delay === 300000), 'A late first request must not replace or clear the newer request timer.');
  assert([...timers.values()].length === 1, 'A late touch must not add a second timer for the stale request.');

  pendingRequests[0].resolve(streamResponseFromLines([
    'data: {"choices":[{"delta":{"content":"partial"},"finish_reason":"length"}]}\n',
    'data: [DONE]\n',
  ]));
  pendingRequests[1].resolve(streamResponseFromLines([
    'data: {"choices":[{"delta":{"content":"valid"},"finish_reason":"stop"}]}\n',
    'data: [DONE]\n',
  ]));
  await Promise.all([snapshotRequestA, snapshotRequestB]);

  const diagnosticA = context.recentRequestDiagnostics.at(-2);
  const diagnosticB = context.recentRequestDiagnostics.at(-1);
  assert(diagnosticA.payload.model === 'old-model' && diagnosticA.stage === 'main', 'Diagnostics must retain the actual first request and stage.');
  assert(diagnosticA.operation === 41, 'Diagnostics must retain the actual operation scalar, not the runtime object.');
  assert(requestCompletionsA.length === 1 && diagnosticA.finishReason === requestCompletionsA[0].finishReason && diagnosticA.completionReason === requestCompletionsA[0].completionReason, 'Diagnostics must retain the actual first completion metadata.');
  assert(diagnosticA.finishReason === 'length' && diagnosticA.completionReason === 'length', 'Diagnostics must retain the actual first completion reason.');
  assert(diagnosticA.actualMaxTokens === 128 && diagnosticA.corrected === false, 'Diagnostics must retain the actual first budget and correction flag.');
  assert(diagnosticB.payload.model === 'new-model' && diagnosticB.stage === 'second' && diagnosticB.corrected === true, 'Diagnostics must not apply a late first result to the newer request.');
  assert(diagnosticB.operation === 42 && diagnosticB.corrected === true, 'Diagnostics must retain the newer operation scalar and explicit correction flag.');
  assert(requestCompletionsB.length === 1 && diagnosticB.finishReason === requestCompletionsB[0].finishReason && diagnosticB.completionReason === requestCompletionsB[0].completionReason, 'Diagnostics must retain the actual newer completion metadata.');
  assert(diagnosticB.finishReason === 'stop' && diagnosticB.completionReason === 'stop' && diagnosticB.actualMaxTokens === 64, 'Diagnostics must retain the actual newer completion and budget.');
  assert(!JSON.stringify(context.recentRequestDiagnostics).includes('old-key') && !JSON.stringify(context.recentRequestDiagnostics).includes('new-key'), 'Diagnostics must not expose captured credentials.');
  assert(context.__completionRuntime(requestCompletionsA[0]) === runtimeA && context.__completionRuntime(requestCompletionsB[0]) === runtimeB, 'Each completion must carry its own non-enumerable runtime context.');
  assert(!Object.keys(requestCompletionsA[0]).includes('_generationRuntime') && !JSON.stringify(requestCompletionsA[0]).includes('old-key'), 'Runtime identity and settings must stay out of enumerable completion metadata.');

  const fallbackController = context.__begin();
  assert(fallbackController._generationIdleTimeoutSec === 300, 'beginGenerationStreamState without settings must capture the current state settings once.');
  context.__finish(fallbackController);

  const invalidRuleDiagnostic = {};
  context.__updateDiagnosticError(invalidRuleDiagnostic, {
    message: 'blocked known-secret',
    name: 'DoNotGuessRuleName',
    ruleName: {
      headers: { authorization: 'known-secret' },
      settings: { apiKey: 'known-secret' },
      permissions: { token: 'known-secret' },
    },
  }, { apiKey: 'known-secret' });
  assert(invalidRuleDiagnostic.ruleName === undefined, 'A non-string rule name must not be stored or guessed.');
  assert(!['headers', 'settings', 'permissions'].some((key) => Object.prototype.hasOwnProperty.call(invalidRuleDiagnostic, key)), 'Diagnostic errors must not store headers, full settings, or permission objects.');
  assert(invalidRuleDiagnostic.error === 'blocked [redacted]' && !JSON.stringify(invalidRuleDiagnostic).includes('known-secret'), 'Known credentials must be redacted from diagnostic errors.');

  const legalRuleDiagnostic = {};
  context.__updateDiagnosticError(legalRuleDiagnostic, {
    message: 'known-secret rejected',
    ruleName: 'rule-known-secret',
  }, { apiKey: 'known-secret' });
  assert(legalRuleDiagnostic.error === '[redacted] rejected' && legalRuleDiagnostic.ruleName === 'rule-[redacted]', 'A legal string rule name must be retained with known credentials redacted.');
  assert(!JSON.stringify(legalRuleDiagnostic).includes('known-secret'), 'Rule-name redaction must match diagnostic error redaction.');
}

async function assertFrontendGenerationStageIsolation() {
  const streamingSources = await Promise.all([
    '../../../src/app/prompt/41-second-stage-content-isolation.js',
    '../../../src/app/chat/61-message-text-format.js',
    '../../../src/app/chat/61-message-status-bar-render.js',
    '../../../src/app/chat/61-message-options-render.js',
    '../../../src/app/chat/61-message-display-model.js',
    '../../../src/app/chat/61-message-content-render.js',
    '../../../src/app/generation/52-generation-streaming-isolation.js',
    '../../../src/app/generation/52-generation-stream-animation.js',
    '../../../src/app/generation/52-generation-message-lifecycle.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));
  const mainStreamingContent = { innerHTML: 'main-before' };
  const mainStreamingCot = { innerHTML: 'cot-before' };
  const elements = {
    streamingContent: mainStreamingContent,
    streamingCot: mainStreamingCot,
  };
  const appended = [];
  const streamingContext = {
    state: { settings: { twoStageEnabled: true, streamTextAnimEnabled: false, lowPowerMode: false } },
    document: {
      getElementById(id) { return elements[id] || null; },
      createElement() { return { id: '', className: '', innerHTML: '' }; },
    },
    dom: {
      messagesContainer: {
        scrollTop: 0,
        scrollHeight: 100,
        appendChild(node) { appended.push(node); },
      },
    },
    formatMessage: (text) => String(text),
    renderStaticMessage: (text) => String(text),
    renderDeclarativeTemplateSubset: (text) => ({ output: String(text), diagnostics: [] }),
    getMvuDataForMessage: () => ({}),
    getMvuWorldInfoEntries: () => ({}),
    getMvuDiagnostics: () => [],
    stripMvuControlBlocks: (text) => String(text),
    t: (key) => key,
    renderAssistantSenderHtml(name) { return `<p>${name}</p>`; },
    isGroupChat() { return false; },
    renderCotBlock: (content) => `cot:${content || ''}`,
    escapeHtml: (content) => String(content || ''),
    getCurrentGeneratingSpeakerName: () => 'Arona',
    makeId: () => 'id',
    persistState() {},
    appendFinalAssistantMessage() {},
    renderTokenBar() {},
    Date,
    Array,
    String,
    setTimeout: () => 0,
    clearTimeout() {},
  };

  vm.runInNewContext(`${streamingSources.join('\n')}\nthis.__strip = stripSecondStageOptionBlocks;\nthis.__update = updateStreamingBubble;\nthis.__stream = renderStreamingAssistantContent;\nthis.__assistant = renderAssistantContent;\nthis.__display = prepareMessageDisplay;`, streamingContext);

  function createStreamElement() {
    return {
      innerHTML: '',
      childNodes: [],
      style: { setProperty() {} },
      appendChild(node) { this.childNodes.push(node); return node; },
    };
  }
  streamingContext.STREAM_TEXT_ANIM_EFFECTS = { fade: true, rise: true };
  streamingContext.ensureInterfaceBehaviorSettings = () => {};
  streamingContext.document.createTextNode = (text) => ({ textContent: String(text), parentNode: null });
  streamingContext.document.createElement = () => ({
    className: '',
    textContent: '',
    style: { setProperty() {}, animationDelay: '' },
    addEventListener() {},
  });

  const leaked = '正文内容\n<options><option><title>不应混入正文</title></option></options>';
  assert(streamingContext.__strip(leaked) === '正文内容', 'Primary content isolation should strip option XML blocks.');

  streamingContext.__update('<options><option><title>独立选项</title></option></options>', {}, '第二阶段', '', 'second');
  assert(mainStreamingContent.innerHTML === 'main-before', 'Second-stage streaming must not overwrite the primary streaming content node.');
  assert(appended.length === 1 && appended[0].id === 'secondStageStreamingMsg' && appended[0].innerHTML.includes('secondStageStreamingContent'), 'Second-stage streaming should create a dedicated DOM bubble and content id.');

  streamingContext.__update(leaked, {}, 'Arona', '', 'main');
  assert(mainStreamingContent.innerHTML === '正文内容', 'Primary streaming should hide option XML that leaked from the model.');

  const streamSample = [
    '正文开头',
    '```xml',
    '<options><option><title>流式示例</title><description>不能变成按钮</description></option>',
    '```',
    '正文结尾',
  ].join('\n');
  const streamElement = { innerHTML: '', childNodes: [] };
  for (let length = 1; length <= streamSample.length; length += 1) {
    streamingContext.__stream(streamElement, streamSample.slice(0, length), {}, true);
  }
  const finalDisplay = streamingContext.__display({ text: streamSample, processMessage: false, isolatePrimary: false });
  assert(streamElement.innerHTML === finalDisplay.display.html, 'Unclosed streaming chunks must converge to the same prepared final display.');
  assert(finalDisplay.display.html.includes('正文开头') && finalDisplay.display.html.includes('正文结尾') && !finalDisplay.display.html.includes('message-option-choice'), 'Streaming display preparation must preserve code examples and surrounding prose.');

  streamingContext.state.settings.streamTextAnimEnabled = true;
  streamingContext.state.settings.lowPowerMode = false;
  const optionStreamRaw = '前文。<options><option><title>动作</title><description>受控行动。</description></option></options>尾文。';
  const optionStreamElement = createStreamElement();
  streamingContext.__stream(optionStreamElement, optionStreamRaw, { conv: { id: 'options' }, character: { name: 'Arona' } }, true);
  const optionFinalHtml = streamingContext.__assistant(optionStreamRaw, { conv: { id: 'options' }, character: { name: 'Arona' } });
  assert(optionStreamElement.innerHTML === optionFinalHtml, 'Structured streaming content must converge to the same prepared static output as final rendering.');
  assert(optionStreamElement.innerHTML.includes('message-option-choice'), 'Streaming options must remain selectable instead of being reduced to plain prose.');
  assert(optionStreamElement.innerHTML.includes('前文。') && optionStreamElement.innerHTML.includes('尾文。'), 'Streaming option rendering must preserve text around the options.');

  const plainStreamElement = createStreamElement();
  streamingContext.__stream(plainStreamElement, '普通流式正文', {}, true);
  assert(plainStreamElement.childNodes.some((node) => String(node.className).includes('stream-anim-')), 'Plain streaming prose should keep the text animation path.');

  const secondStagePrepared = streamingContext.__display({
    text: '二阶段正文 `<options>` 示例',
    context: { stage: 'second' },
    messageRole: 'assistant',
    sourcePlacement: 'AI_OUTPUT',
    isolatePrimary: false,
    processMessage: false,
  });
  assert(secondStagePrepared.stage === 'second' && secondStagePrepared.secondStageContent === true, 'Second-stage display preparation must consume the explicit context stage.');

  let streamFormatCalls = 0;
  let streamMvuCalls = 0;
  streamingContext.formatMessage = (text) => {
    streamFormatCalls += 1;
    return String(text);
  };
  streamingContext.renderDeclarativeTemplateSubset = (text) => {
    streamMvuCalls += 1;
    return { output: String(text), diagnostics: [] };
  };
  streamingContext.__stream(createStreamElement(), '单次流式准备', { conv: { id: 'single' }, msg: { id: 'single-msg' } }, true);
  assert(streamFormatCalls === 1 && streamMvuCalls === 1, 'Each streaming display preparation should execute formatting and MVU rendering exactly once.');

  const runtimeSource = await readFile(new URL('../../../src/app/generation/52-generation-runtime.js', import.meta.url), 'utf8');
  const runtimeEvents = [];
  const conv = { id: 'conv', messages: [] };
  const runtimeContext = {
    state: { isGenerating: true, settings: { twoStageEnabled: true }, conversations: { conv } },
    getActiveConv: () => conv,
    removeGenerationStreamingBubble(stage) { runtimeEvents.push(`remove:${stage}`); },
    isolatePrimaryStageContent: streamingContext.isolatePrimaryStageContent,
    isolatePrimaryStageContentWithSettings: streamingContext.isolatePrimaryStageContentWithSettings,
    isGroupChat: () => false,
    finishAssistantMessage(target, content) {
      runtimeEvents.push(`finish:${content}`);
      return { id: 'main-id', content };
    },
    runSecondStageGeneration(message) { runtimeEvents.push(`second:${message.content}`); },
    completeGenerationTurn() { runtimeEvents.push('complete'); },
    appStore: { notify(key) { runtimeEvents.push(`notify:${key}`); } },
  };
  vm.runInNewContext(`${messageIdentitySource}\n${runtimeSource}\nthis.__completePrimary = handlePrimaryAssistantComplete;`, runtimeContext);
  await runtimeContext.__completePrimary(leaked, '');
  assert(runtimeEvents.includes('finish:正文内容') && runtimeEvents.includes('second:正文内容'), 'Completed primary messages should save only narrative content before starting stage two.');
}
export { assertFrontendGenerationHelpers, assertFrontendGenerationStageIsolation };
