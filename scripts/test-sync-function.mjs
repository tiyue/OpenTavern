import { onRequest } from '../functions/api/sync.js';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function createMockD1() {
  const store = new Map();
  return {
    store,
    db: {
      async exec() {},
      prepare(sql) {
        return {
          _bind: [],
          bind(...args) {
            this._bind = args;
            return this;
          },
          async first() {
            const key = this._bind[0];
            const row = store.get(key);
            return row ? { data: row.data, updated_at: row.updated_at } : null;
          },
          async run() {
            const [key, data, updatedAt] = this._bind;
            store.set(key, { data, updated_at: updatedAt });
            return { success: true };
          },
        };
      },
    },
  };
}

function request(method, token, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return new Request('https://example.com/api/sync', {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function readJson(response) {
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function assertOk(response, label) {
  if (!response.ok) throw new Error(`${label} failed: ${await response.text()}`);
}

async function assertFrontendCloudSnapshot() {
  const compatSource = await readFile(new URL('../src/app/24-storage-compat.js', import.meta.url), 'utf8');
  const cloudSource = await readFile(new URL('../src/app/22-cloud-sync.js', import.meta.url), 'utf8');
  const context = {
    state: {
      settings: {
        model: 'frontend-model',
        lang: 'en',
        saveApiKey: true,
        apiKey: 'secret-api-key',
        summarizeApiKey: 'secret-summary-key',
        cloudSyncToken: 'secret-cloud-token',
        cloudSyncPassphrase: 'secret-passphrase',
        cloudSyncLastStatus: 'last status',
      },
      conversations: {
        c1: { id: 'c1', messages: [{ role: 'user', content: 'frontend hello' }] },
      },
      conversationOrder: ['c1'],
      activeConvId: 'c1',
      characters: {
        arona: { id: 'arona', name: 'Arona', first_mes: 'Sensei!' },
      },
      worldBooks: {
        wb1: { id: 'wb1', entries: [{ id: 'e1', content: 'Kivotos' }] },
      },
      _charactersMigrated: true,
    },
    console,
    Date,
    JSON,
  };

  vm.runInNewContext(`${compatSource}\n${cloudSource}`, context);
  const snapshot = context.buildAppDataSnapshot();

  assert(snapshot.settings.model === 'frontend-model', 'Frontend cloud snapshot did not include settings.');
  assert(snapshot.settings.apiKey === '', 'Frontend cloud snapshot must strip the main API key.');
  assert(snapshot.settings.summarizeApiKey === '', 'Frontend cloud snapshot must strip the summary API key.');
  assert(snapshot.settings.cloudSyncToken === '', 'Frontend cloud snapshot must strip the cloud sync token.');
  assert(snapshot.settings.cloudSyncPassphrase === '', 'Frontend cloud snapshot must strip the cloud sync passphrase.');
  assert(snapshot.settings.cloudSyncLastStatus === '', 'Frontend cloud snapshot must strip transient cloud status.');
  assert(snapshot.conversations.c1.messages[0].content === 'frontend hello', 'Frontend cloud snapshot did not include chat history.');
  assert(snapshot.conversationOrder[0] === 'c1', 'Frontend cloud snapshot did not include conversation order.');
  assert(snapshot.activeConvId === 'c1', 'Frontend cloud snapshot did not include active conversation id.');
  assert(snapshot.characters.arona.first_mes === 'Sensei!', 'Frontend cloud snapshot did not include character cards.');
  assert(snapshot.worldBooks.wb1.entries[0].content === 'Kivotos', 'Frontend cloud snapshot did not include world books.');
  assert(snapshot.charactersMigrated === true, 'Frontend cloud snapshot did not include character migration state.');
  assert(Number.isFinite(snapshot.lastSaved), 'Frontend cloud snapshot did not include a timestamp.');
}

async function assertFrontendStateStoreDefaults() {
  const sources = await Promise.all([
    '../src/app/30-state-store.js',
    '../src/app/30-state-default-settings.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  const events = [];
  const context = {
    DEFAULT_TWO_STAGE_PROMPT: 'two stage default',
    defaultSillyTavernPreset() { return { prompts: [] }; },
    console: { error() {} },
    JSON,
    Set,
    Array,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__store = createReactiveStore;\nthis.__defaults = defaultSettings;`, context);

  const defaults = context.__defaults();
  assert(defaults.cloudSyncEndpoint === '/api/sync', 'Default settings should include the cloud sync endpoint.');
  assert(defaults.cloudSyncEnabled === false && defaults.cloudSyncAutoUpload === false, 'Cloud sync should be disabled by default.');
  assert(defaults.sillyTavernPreset.prompts.length === 0, 'Default settings should include a SillyTavern preset object.');

  const store = context.__store({ settings: { lang: 'en' } });
  const unsubscribeKey = store.subscribe('settings', (key) => events.push(`key:${key}`));
  const unsubscribeGlobal = store.subscribe((keys) => events.push(`global:${keys.join(',')}`));
  store.notify('settings');
  unsubscribeKey();
  unsubscribeGlobal();
  store.notify('settings');

  assert(store.state.settings.lang === 'en', 'State store should expose cloned state.');
  assert(events.join('|') === 'key:settings|global:settings', 'State store notifications or unsubscribe behavior changed.');
}

async function assertFrontendCloudSnapshotApply() {
  const cloudSource = await readFile(new URL('../src/app/22-cloud-sync.js', import.meta.url), 'utf8');
  const applySource = await readFile(new URL('../src/app/22-cloud-sync-apply.js', import.meta.url), 'utf8');
  let persisted = false;
  let notified = null;
  let rendered = false;
  const context = {
    state: {
      settings: {
        cloudSyncEnabled: true,
        cloudSyncAutoUpload: true,
        cloudSyncEndpoint: 'https://sync.example/api',
        cloudSyncToken: 'local-token',
        cloudSyncEncrypted: true,
        cloudSyncPassphrase: 'local-passphrase',
      },
      conversations: {},
      conversationOrder: [],
      activeConvId: null,
      characters: {},
      worldBooks: {},
    },
    defaultSettings: () => ({
      model: 'default-model',
      cloudSyncEnabled: false,
      cloudSyncAutoUpload: false,
      cloudSyncEndpoint: '/api/sync',
      cloudSyncToken: '',
      cloudSyncEncrypted: false,
      cloudSyncPassphrase: '',
      cloudSyncLastAt: 0,
      cloudSyncLastStatus: '',
    }),
    normalizeConversation(conv) { conv.normalized = true; },
    defaultConversation() { return { id: 'default', messages: [] }; },
    persistState() { persisted = true; },
    appStore: { notify(value) { notified = value; } },
    requestFullRender() { rendered = true; },
    updateInputState() {},
    updateStorageInfo() {},
    Date,
    Object,
    Array,
    Number,
    String,
  };

  vm.runInNewContext(`${cloudSource}\n${applySource}\nthis.__apply = applyCloudSyncSnapshot;`, context);
  const applied = context.__apply({
    settings: { model: 'remote-model', cloudSyncToken: 'remote-token' },
    conversations: { c1: { id: 'c1', messages: [{ role: 'user', content: 'hello cloud' }] } },
    conversationOrder: ['c1'],
    activeConvId: 'c1',
    characters: { arona: { id: 'arona', name: 'Arona' } },
    worldBooks: { wb1: { id: 'wb1', entries: [] } },
    charactersMigrated: true,
    lastSaved: 123,
  });

  assert(applied.settings.model === 'remote-model', 'Applied cloud snapshot did not return remote settings.');
  assert(context.state.settings.model === 'remote-model', 'Cloud apply did not restore settings.');
  assert(context.state.settings.cloudSyncToken === 'local-token', 'Cloud apply must preserve local cloud sync token.');
  assert(context.state.settings.cloudSyncPassphrase === 'local-passphrase', 'Cloud apply must preserve local cloud sync passphrase.');
  assert(context.state.conversations.c1.normalized === true, 'Cloud apply did not normalize restored conversations.');
  assert(context.state.conversations.c1.messages[0].content === 'hello cloud', 'Cloud apply did not restore chat history.');
  assert(context.state.characters.arona.name === 'Arona', 'Cloud apply did not restore character cards.');
  assert(context.state.worldBooks.wb1.id === 'wb1', 'Cloud apply did not restore world books.');
  assert(context.state.activeConvId === 'c1', 'Cloud apply did not restore active conversation.');
  assert(context.state._charactersMigrated === true, 'Cloud apply did not restore character migration flag.');
  assert(persisted === true, 'Cloud apply did not persist restored snapshot.');
  assert(rendered === true, 'Cloud apply did not request a full render.');
  assert(Array.isArray(notified) && notified.includes('characters') && notified.includes('worldBooks'), 'Cloud apply did not notify restored data domains.');
}

async function assertFrontendSummaryService() {
  const promptSources = await Promise.all([
    '../src/app/53-summary-default-prompts.js',
    '../src/app/53-summary-prompt-limits.js',
    '../src/app/53-summary-prompt-builder.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));
  const apiSource = await readFile(new URL('../src/app/53-summary-api-client.js', import.meta.url), 'utf8');
  const serviceSource = await readFile(new URL('../src/app/53-summarization-service.js', import.meta.url), 'utf8');
  let capturedRequest = null;
  const context = {
    state: {
      settings: {
        summarizeUseMainAPI: false,
        summarizeApiEndpoint: 'https://summary.example/v1/chat/completions',
        summarizeApiKey: 'summary-key',
        summarizeModel: 'summary-model',
        apiEndpoint: 'https://main.example/v1/chat/completions',
        apiKey: 'main-key',
        model: 'main-model',
        userName: 'Tester',
        lang: 'en',
        summaryMaxWords: 500,
        summaryPrompt: '',
      },
    },
    console,
    JSON,
    Error,
    fetch: async (url, options) => {
      capturedRequest = {
        url,
        headers: options.headers,
        body: JSON.parse(options.body),
      };
      return {
        async json() {
          return {
            choices: [{
              finish_reason: 'length',
              message: { content: 'short generated summary' },
            }],
          };
        },
      };
    },
    t: (key) => key === 'summary_truncated_warning' ? '[truncated]' : key,
    normalizeApiEndpoint: (value) => value,
    shouldUseOllamaCompat: () => false,
    normalizeMessagesForOllamaCompatibility: (messages) => messages,
  };

  vm.runInNewContext(`${promptSources.join('\n')}\n${apiSource}\n${serviceSource}`, context);
  const result = await new Promise((resolve, reject) => {
    context.generateSummary([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'world' },
    ], (err, text) => err ? reject(err) : resolve(text));
  });

  assert(result.startsWith('[truncated]\nshort generated summary'), 'Summary truncation warning was not prepended.');
  assert(capturedRequest.url === 'https://summary.example/v1/chat/completions', 'Summary request did not use the custom endpoint.');
  assert(capturedRequest.headers.Authorization === 'Bearer summary-key', 'Summary request did not use the custom API key.');
  assert(capturedRequest.body.model === 'summary-model', 'Summary request did not use the custom model.');
  assert(capturedRequest.body.max_tokens === 1536, 'Summary max_tokens did not honor the word-limit budget floor.');
  assert(capturedRequest.body.messages[0].content.includes('[Word Limit] Keep the entire summary under 500 words'), 'Summary prompt did not include the word limit.');
  assert(capturedRequest.body.messages[1].content.includes('Tester: hello'), 'Summary user message was not labeled with the configured user name.');
  assert(capturedRequest.body.messages[1].content.includes('Assistant: world'), 'Summary assistant message was not labeled correctly.');
}

async function assertFrontendApiConnectionHelpers() {
  const helperSource = await readFile(new URL('../src/app/31-api-connection-test-helpers.js', import.meta.url), 'utf8');
  const translations = {
    api_test_success_title: 'Connection OK',
    api_test_models_prefix: 'Models ',
    api_test_models_total: ' of ',
    api_test_models_mid: ':',
    api_test_more_omitted: 'more omitted',
    api_test_models_empty_note: 'No models returned',
    api_test_tested_urls_label: 'Tested URLs',
    api_test_suggest_title: 'Suggestions',
    api_test_timeout_msg: 'Timeout after {s}s',
    api_test_typeerror_prefix: 'Network error: ',
    api_test_suggest_localhost: 'Check local server',
    api_test_suggest_cors: 'Check CORS',
    api_test_suggest_endpoint_path: 'Check endpoint path',
    api_test_suggest_apikey: 'Check API key',
    api_test_suggest_stream: 'Check stream',
    api_test_suggest_gateway: 'Check gateway',
  };
  const context = {
    t: (key) => translations[key] || key,
    JSON,
    String,
    Array,
    Boolean,
    TypeError,
    AbortController,
    setTimeout,
    clearTimeout,
  };

  vm.runInNewContext(`${helperSource}\nthis.__derive = deriveApiModelsEndpoint;\nthis.__collect = collectApiTestModelNames;\nthis.__readHttp = readApiTestHttpError;\nthis.__success = buildApiTestSuccessHtml;\nthis.__suggestions = buildApiTestSuggestions;`, context);

  assert(context.__derive('https://api.example.com/v1/chat/completions') === 'https://api.example.com/v1/models', 'Models URL was not derived from chat completions endpoint.');
  assert(context.__derive('https://api.deepseek.com') === 'https://api.deepseek.com/v1/models', 'Models URL should add /v1 when the endpoint has no version.');
  assert(context.__derive('https://host/openai/v1') === 'https://host/openai/v1/models', 'Models URL should preserve openai/v1 endpoints.');

  const names = context.__collect({ data: [{ id: 'alpha' }, { name: 'beta' }, 'gamma'] });
  assert(names.join(',') === 'alpha,beta,gamma', 'Model name collection did not preserve id/name/string entries.');

  const html = context.__success(Array.from({ length: 13 }, (_, idx) => `m${idx}`));
  assert(html.includes('m0') && html.includes('more omitted'), 'Success HTML did not render model list truncation.');

  const suggestions = context.__suggestions('http://127.0.0.1:11434/v1');
  assert(suggestions.includes('Check local server') && suggestions.includes('Check CORS'), 'API test suggestions missed local/CORS hints.');

  const errorText = await context.__readHttp({
    status: 401,
    async text() {
      return JSON.stringify({ error: { message: 'bad key' } });
    },
  });
  assert(errorText === 'HTTP 401 - bad key', 'HTTP error message parser did not preserve API error detail.');
}

async function assertFrontendGenerationHelpers() {
  const sources = await Promise.all([
    '../src/app/50-generation-cot-utils.js',
    '../src/app/50-generation-api-request.js',
    '../src/app/50-generation-stream-state.js',
    '../src/app/50-generation-integrations.js',
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
    isWebLLMBackend: () => false,
    streamChatWebLLMWithMessages() { throw new Error('WebLLM path should not be used.'); },
    t: (key) => key,
    normalizeApiEndpoint: (value) => value,
    shouldUseOllamaCompat: () => false,
    normalizeMessagesForOllamaCompatibility: (messages) => messages,
    fetch: async () => ({
      ok: false,
      status: 500,
      async text() { return JSON.stringify({ error: { message: 'server exploded' } }); },
    }),
    AbortController,
    Error,
    JSON,
    String,
    Array,
    Object,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__extract = extractCotDelta;\nthis.__split = splitInlineCot;\nthis.__parts = buildCotAwareParts;\nthis.__capture = shouldCaptureCotForRequest;\nthis.__payload = buildChatCompletionPayload;\nthis.__fetchOptions = buildChatCompletionFetchOptions;\nthis.__readError = readChatCompletionError;\nthis.__begin = beginGenerationStreamState;\nthis.__finish = finishGenerationStreamState;\nthis.__stream = streamChatWithMessages;`, context);

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

  const startedController = context.__begin();
  assert(context.state.isGenerating === true && context.state.abortController === startedController, 'Generation begin should set active stream state.');
  context.__finish();
  assert(context.state.isGenerating === false && context.state.abortController === null, 'Generation finish should clear active stream state.');
  assert(notifications.join(',') === 'isGenerating,isGenerating', 'Generation state helpers should notify state changes.');

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
}

async function assertFrontendPromptMessageHelpers() {
  const sources = await Promise.all([
    '../src/app/41-prompt-depth-insert.js',
    '../src/app/41-prompt-summary-messages.js',
    '../src/app/41-prompt-history-messages.js',
    '../src/app/41-prompt-outlet-resolution.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));
  const context = {
    normalizePromptRole(role) {
      const r = String(role || '').toLowerCase();
      return r === 'user' || r === 'assistant' ? r : 'system';
    },
    replacePlaceholders(text, charName, userName) {
      return String(text || '').replace(/\{\{char\}\}/g, charName).replace(/\{\{user\}\}/g, userName);
    },
    parseInt,
    isNaN,
    Object,
    Array,
    String,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__insert = insertMessagesAtDepth;\nthis.__summary = buildPromptSummaryMessage;\nthis.__regular = getRegularPromptMessages;\nthis.__outlets = resolvePromptOutletPlaceholders;\nthis.__replace = replacePromptMessagePlaceholders;`, context);

  const baseMessages = [
    { role: 'system', content: 'sys' },
    { role: 'user', content: 'u1' },
    { role: 'assistant', content: 'a1' },
  ];
  context.__insert(baseMessages, [
    { depth: 1, role: 1, content: 'hello {{char}}' },
    { _depth: -1, role: 'assistant', content: 'bye {{user}}' },
  ], 'Arona', 'Sensei');
  assert(baseMessages.map((m) => `${m.role}:${m.content}`).join('|') === 'system:sys|user:u1|user:hello Arona|assistant:a1|assistant:bye Sensei', 'Prompt depth insertion changed order, roles, or placeholders.');

  const summary = context.__summary([{ text: 'first' }, { text: 'second' }], 'en');
  assert(summary.role === 'system' && summary.content.includes('Automatic summary') && summary.content.includes('first\n---\nsecond'), 'Prompt summary message was not built correctly.');
  const zhSummary = context.__summary([{ text: '摘要' }], 'zh-CN');
  assert(zhSummary.content.startsWith('[以下是先前对话的自动摘要，供上下文参考]\n'), 'Prompt summary Chinese header should stay readable.');

  const conv = {
    summaries: [{ coveredEnd: 1 }],
    messages: [
      { role: 'system', content: 'hidden' },
      { role: 'user', content: 'old user' },
      { role: 'assistant', content: 'old assistant' },
      { role: 'user', content: 'visible one' },
      { role: 'assistant', content: 'visible two' },
      { role: 'user', content: 'visible three' },
      { role: 'assistant', content: '' },
    ],
  };
  const regular = context.__regular(conv, 2);
  assert(regular.map((m) => m.content).join(',') === 'visible two,visible three', 'Prompt regular history should skip summarized messages and respect context length.');
  regular[0].content = 'mutated';
  assert(conv.messages[4].content === 'visible two', 'Prompt regular history should clone messages before outlet mutation.');

  const outletMessages = [{ role: 'system', content: 'A {{outlet::Lore}} B {{outlet::Missing}} C {{char}}' }];
  context.__outlets(outletMessages, {
    Lore: [{ content: 'for {{user}}' }, { content: 'with {{char}}' }],
  }, 'Arona', 'Sensei');
  const replaced = context.__replace(outletMessages, 'Arona', 'Sensei');
  assert(replaced[0].content === 'A for Sensei\n\nwith Arona B  C Arona', 'Prompt outlet resolution or final placeholder replacement changed.');
}

async function assertFrontendCharacterImportHelpers() {
  const sources = await Promise.all([
    '../src/app/40-character-card-import.js',
    '../src/app/40-character-book-import.js',
    '../src/app/40-character-prompt-helpers.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  let createdBookName = null;
  const context = {
    state: {
      settings: {
        postHistoryInstructions: ' custom first ',
        twoStagePostHistoryInstructions: '',
      },
    },
    t: (key) => key,
    normalizeImportedWorldInfo(book) {
      return {
        name: book.normalizedName,
        entries: {
          e1: { uid: 'e1', content: 'Kivotos' },
        },
      };
    },
    createNewWorldBook(name) {
      createdBookName = name;
      return { id: 'wb1', name, entries: {} };
    },
    console: { log() {} },
    JSON,
    Object,
    Array,
    String,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__import = importCharacterCard;\nthis.__book = importCharacterBookFromCard;\nthis.__replace = replacePlaceholders;\nthis.__post = getEffectivePostHistoryInstructions;`, context);

  const imported = context.__import({
    spec: 'chara_card_v2',
    data: {
      name: 'Arona',
      description: 123,
      first_mes: 'Hello {{user}}',
      tags: ['ai'],
      extensions: { source: 'test' },
    },
  });
  assert(imported.name === 'Arona' && imported.description === '123', 'Character import should normalize v2 card fields to strings.');
  assert(imported.tags[0] === 'ai' && imported.extensions.source === 'test', 'Character import should preserve tags and extensions.');

  const book = context.__book({
    data: {
      character_book: {
        name: 'Embedded Lore',
        normalizedName: 'Normalized Lore',
        entries: [],
      },
    },
  }, 'Arona');
  assert(book && book.id === 'wb1' && book.name === 'Normalized Lore', 'Character book import should create and name a world book.');
  assert(createdBookName === 'Embedded Lore', 'Character book import should use embedded book name when creating the book.');

  assert(context.__replace('Hi {{char}} from {{user}}', 'Arona', 'Sensei') === 'Hi Arona from Sensei', 'Placeholder replacement changed.');
  assert(context.__post({ post_history_instructions: 'card post' }, 'first') === 'custom first', 'First-stage post-history override should win.');
  assert(context.__post({ post_history_instructions: 'card post' }, 'second') === 'card post', 'Second-stage post-history should fall back to character card when unset.');
}

async function assertFrontendWorldInfoNormalizerHelpers() {
  const sources = await Promise.all([
    '../src/app/41-world-info-constants.js',
    '../src/app/41-world-info-position.js',
    '../src/app/41-world-info-extension-fields.js',
    '../src/app/41-world-info-normalizer.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  const context = {
    JSON,
    Array,
    Object,
    isNaN,
    parseInt,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__normalize = normalizeWIEntry;\nthis.__position = normalizeWorldInfoPositionValue;`, context);

  assert(context.__position('before_example') === 2, 'World info position normalization should support before_example.');
  assert(context.__position('missing') === 1, 'World info position normalization should default to after character.');

  const entry = context.__normalize({
    uid: 'e1',
    keys: ['alpha'],
    secondary_keys: ['beta'],
    insertion_order: 7,
    enabled: false,
    position: 'outlet',
    extensions: {
      scan_depth: 5,
      outlet_name: 'Lore',
      group_override: true,
      match_character_description: true,
      match_whole_words: true,
    },
  });

  assert(entry.key[0] === 'alpha' && entry.keysecondary[0] === 'beta', 'World info normalizer should map ST keys.');
  assert(entry.order === 7 && entry.disable === true, 'World info normalizer should map insertion_order and enabled.');
  assert(entry.position === 7 && entry.extensions.position === 7, 'World info normalizer should normalize and round-trip position.');
  assert(entry.scanDepth === 5 && entry.outletName === 'Lore' && entry.groupOverride === true, 'World info normalizer should promote extension fields.');
  assert(entry.matchCharacterDescription === true && entry.matchWholeWords === true, 'World info normalizer should promote match flags.');
  assert(Array.isArray(entry.triggers) && entry.characterFilter.isExclude === false, 'World info normalizer should ensure required shape.');
}

async function assertFrontendSettingsSaveHelpers() {
  const sources = await Promise.all([
    '../src/app/68-settings-cloud-sync-form.js',
    '../src/app/68-settings-save-form.js',
    '../src/app/68-settings-save-effects.js',
    '../src/app/68-settings-save.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  const events = [];
  const activeConv = { _wiCache: { stale: true } };
  const classList = {
    values: new Set(),
    add(value) { this.values.add(value); },
  };
  const input = (value) => ({ value });
  const checkbox = (checked) => ({ checked });
  const context = {
    state: { settings: {} },
    dom: {
      apiEndpoint: input(' https://api.example/v1 '),
      apiKey: input(' key '),
      saveApiKey: checkbox(true),
      ollamaCompatMode: checkbox(true),
      modelName: input(' model-a '),
      contextLength: input('32'),
      maxTokens: input('2048'),
      temperature: input('0.4'),
      topP: input('0.8'),
      userName: input(' Sensei '),
      systemPrompt: input(' system '),
      postHistoryInstructions: input(' post '),
      twoStageEnabled: checkbox(true),
      twoStageTemperature: input('0.25'),
      twoStageTopP: input('0.75'),
      twoStageIncludeRecentContext: checkbox(true),
      twoStageSystemPrompt: input(''),
      twoStagePostHistoryInstructions: input(' two post '),
      requestCotEnabled: checkbox(true),
      showCotEnabled: checkbox(true),
      userDescription: input(' user desc '),
      summaryEnabled: checkbox(true),
      summaryThreshold: input('18'),
      summaryMaxWords: input('600'),
      summaryPrompt: input(' summarize '),
      worldInfoBudgetEnabled: checkbox(true),
      worldInfoBudget: input('4096'),
      uiTheme: input('new-dark'),
      lowPowerMode: checkbox(true),
      summarizeUseMainAPI: checkbox(false),
      summarizeApiEndpoint: input(' https://summary.example '),
      summarizeApiKey: input(' summary-key '),
      summarizeModel: input(' summary-model '),
      comfyEnabled: checkbox(true),
      comfyServer: input(' http://127.0.0.1:8188/ '),
      comfyPositiveNodeId: input(' 1 '),
      comfyNegativeNodeId: input(' 2 '),
      comfySeedNodeId: input(' 3 '),
      comfyNegativePrompt: input(' neg '),
      comfyPromptTemplate: input(''),
      cloudSyncEnabled: checkbox(true),
      cloudSyncAutoUpload: checkbox(true),
      cloudSyncEndpoint: input('   '),
      cloudSyncToken: input(' cloud-token '),
      cloudSyncEncrypted: checkbox(true),
      cloudSyncPassphrase: input(' pass phrase '),
      settingsModal: { classList },
    },
    document: {
      getElementById(id) {
        if (id === 'inferenceBackend') return { value: 'webllm' };
        if (id === 'webllmModel') return { value: 'Llama-Test' };
        return null;
      },
    },
    DEFAULT_TWO_STAGE_PROMPT: 'default two stage',
    ensureSillyTavernPresetSettings() { events.push('preset'); },
    normalizeUiTheme(value) { events.push('theme-normalize'); return value; },
    cacheUiTheme(value) { events.push(`cache:${value}`); },
    ensureComfySettings() { events.push('comfy'); },
    normalizeComfyServer(value) { return value.trim().replace(/\/+$/, ''); },
    defaultSettings() { return { comfyPromptTemplate: 'default comfy template' }; },
    ensureCloudSyncSettings() { events.push('cloud'); },
    persistState() { events.push('persist'); },
    applyUiTheme(value) { events.push(`apply-theme:${value}`); },
    applyPerformanceMode(value) { events.push(`perf:${value}`); },
    updateInputState() { events.push('input'); },
    getActiveConv() { return activeConv; },
    renderTokenBar() { events.push('token'); },
    autoSummarize() { events.push('auto'); },
    appStore: { notify(key) { events.push(`notify:${key}`); } },
    setTimeout(fn) { fn(); },
    parseInt,
    parseFloat,
    Number,
    Set,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__close = closeSettings;`, context);
  context.__close();

  assert(context.state.settings.apiEndpoint === 'https://api.example/v1', 'Settings save should trim API endpoint.');
  assert(context.state.settings.model === 'model-a' && context.state.settings.contextLength === 32, 'Settings save should read model and context length.');
  assert(context.state.settings.twoStageSystemPrompt === 'default two stage', 'Settings save should default empty two-stage prompt.');
  assert(context.state.settings.uiTheme === 'new-dark' && context.state.settings.lowPowerMode === true, 'Settings save should read UI behavior settings.');
  assert(context.state.settings.comfyServer === 'http://127.0.0.1:8188', 'Settings save should normalize Comfy server.');
  assert(context.state.settings.comfyPromptTemplate === 'default comfy template', 'Settings save should default empty Comfy prompt template.');
  assert(context.state.settings.cloudSyncEndpoint === '/api/sync', 'Settings save should default empty cloud sync endpoint.');
  assert(context.state.settings.cloudSyncToken === 'cloud-token', 'Settings save should trim cloud sync token.');
  assert(context.state.settings.cloudSyncPassphrase === ' pass phrase ', 'Settings save should preserve cloud sync passphrase exactly.');
  assert(context.state.settings.inferenceBackend === 'webllm' && context.state.settings.webllmModel === 'Llama-Test', 'Settings save should read WebLLM controls.');
  assert(classList.values.has('hidden'), 'Settings save should hide the modal.');
  assert(activeConv._wiCache === null, 'Settings save should clear world-info cache.');
  assert(events.includes('persist') && events.includes('apply-theme:new-dark') && events.includes('perf:true') && events.includes('notify:settings'), 'Settings save effects did not run.');
  assert(events.includes('auto'), 'Settings save should trigger auto summarize when enabled.');
}

async function assertFrontendPublicCardAssets() {
  const dataSource = await readFile(new URL('../src/app/60-public-card-data.js', import.meta.url), 'utf8');
  const assetSource = await readFile(new URL('../src/app/60-public-card-assets.js', import.meta.url), 'utf8');
  const librarySource = await readFile(new URL('../src/app/60-public-card-library.js', import.meta.url), 'utf8');

  const context = {
    window: { location: { protocol: 'file:' } },
    JSON,
  };
  vm.runInNewContext(`${dataSource}\n${assetSource}\n${librarySource}\nthis.__cards = getPublicCards();\nthis.__resolve = resolvePublicCardAssetUrl;\nthis.__resolveImage = resolvePublicCardImageUrl;\nthis.__resolveJson = resolvePublicCardJsonUrl;`, context);

  assert(Array.isArray(context.__cards), 'Public card library did not expose an array.');
  assert(context.__cards.length >= 10, 'Public card library should contain bundled cards.');
  assert(context.__resolve('/cards/Plana.png') === 'cards/Plana.png', 'File protocol should use relative card asset paths.');
  assert(context.__resolve('\\\\cards\\\\Plana.png') === 'cards/Plana.png', 'File protocol should normalize Windows-style card asset paths.');
  assert(context.__resolveImage({ previewImage: '/cards/Plana.png' }) === 'cards/Plana.png', 'Public card image helper should resolve preview assets.');
  assert(context.__resolveJson({ jsonUrl: '/cards/Plana.json' }) === 'cards/Plana.json', 'Public card JSON helper should resolve card data assets.');

  context.window.location.protocol = 'http:';
  assert(context.__resolve('/cards/Plana.png') === '/cards/Plana.png', 'HTTP protocol should preserve absolute card asset paths.');

  const assetPaths = [];
  context.__cards.forEach((card) => {
    assert(card.previewImage, `Public card ${card.id || card.name} is missing a preview image.`);
    assert(card.jsonUrl, `Public card ${card.id || card.name} is missing a JSON URL.`);
    assetPaths.push(context.__resolve(card.previewImage), context.__resolve(card.jsonUrl));
  });

  for (const assetPath of assetPaths) {
    const bytes = await readFile(new URL(`../${assetPath.replace(/^\/+/, '')}`, import.meta.url));
    assert(bytes.byteLength > 0, `Public card asset is empty: ${assetPath}`);
  }
}

async function assertFrontendPublicCardGridFiltering() {
  const source = await readFile(new URL('../src/app/60-library-public-card-grid-ui.js', import.meta.url), 'utf8');
  const cards = [
    { name: 'Alpha', tags: ['keep'] },
    { name: 'Beta', tags: ['skip'] },
  ];
  const context = {
    getPublicCards: () => cards,
    passesLibraryFilter: (card) => card.tags.includes('keep'),
  };

  vm.runInNewContext(`${source}\nthis.__filtered = getFilteredPublicLibraryCards;`, context);
  const filtered = context.__filtered();
  assert(filtered.length === 1 && filtered[0].name === 'Alpha', 'Public card grid filtering did not use the library filter.');
}

async function assertFrontendI18nRuntime() {
  const sources = await Promise.all([
    '../src/app/12-i18n-core.js',
    '../src/app/12-i18n-zh-cn.js',
    '../src/app/12-i18n-zh-tw.js',
    '../src/app/12-i18n-en.js',
    '../src/app/12-i18n-runtime.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  const context = {
    state: { settings: { lang: 'en' } },
  };
  vm.runInNewContext(`${sources.join('\n')}\nthis.__i18n = i18n;\nthis.__t = t;`, context);

  assert(context.__i18n['zh-CN'], 'Simplified Chinese i18n dictionary was not loaded.');
  assert(context.__i18n['zh-TW'], 'Traditional Chinese i18n dictionary was not loaded.');
  assert(context.__i18n.en, 'English i18n dictionary was not loaded.');
  assert(context.__t('settings') === 'Settings', 'English i18n lookup failed.');

  context.state.settings.lang = 'missing-locale';
  assert(context.__t('settings') === 'Settings', 'Unknown locale should fall back to English.');
  assert(context.__t('missing_key_for_test') === 'missing_key_for_test', 'Missing i18n keys should fall back to the key name.');
}

async function assertFrontendSillyTavernPresetNormalizer() {
  const sources = await Promise.all([
    '../src/app/62-sillytavern-preset-model.js',
    '../src/app/62-sillytavern-preset-normalizer.js',
    '../src/app/62-sillytavern-preset-runtime.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  const context = {
    state: { settings: {} },
    DEFAULT_TWO_STAGE_PROMPT: 'two stage default',
    defaultSettings: () => ({}),
    t: (key) => key,
    replacePlaceholders: (text, charName, userName) => text.replaceAll('{{char}}', charName).replaceAll('{{user}}', userName),
    Date,
    Object,
    String,
    Array,
    parseInt,
    isNaN,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__normalize = normalizeSillyTavernPreset;\nthis.__ensure = ensureSillyTavernPresetSettings;\nthis.__buildBuckets = buildSillyTavernPresetMessageBuckets;\nthis.__role = normalizePromptRole;`, context);

  assert(context.__role('0') === 'system', 'SillyTavern numeric system role was not normalized.');
  assert(context.__role('1') === 'user', 'SillyTavern numeric user role was not normalized.');
  assert(context.__role('2') === 'assistant', 'SillyTavern numeric assistant role was not normalized.');

  const preset = context.__normalize({
    name: 'Imported ST Preset',
    prompts: [
      { identifier: 'main', name: 'Main', role: '0', content: 'Hello {{char}}' },
      { identifier: 'after', role: 'system', content: 'After {{user}}' },
      { identifier: 'depth', role: 'assistant', content: 'Depth note', injection_depth: 2 },
    ],
    prompt_order: [{
      order: [
        { identifier: 'main', enabled: true, order: 2, position: 'before_history' },
        { identifier: 'chat_history', enabled: true, order: 3 },
        { identifier: 'after', enabled: true, order: 4, position: 'after_history' },
        { identifier: 'depth', enabled: true, order: 5, position: 'in_chat', depth: 2 },
      ],
    }],
  });

  assert(preset.name === 'Imported ST Preset', 'SillyTavern preset name was not preserved.');
  assert(preset.prompts.length === 3, 'SillyTavern preset prompts were not preserved.');
  assert(preset.prompts[0].role === 'system', 'SillyTavern preset prompt role was not normalized.');
  assert(preset.promptOrder.length === 4, 'SillyTavern prompt order was not preserved.');

  context.state.settings.sillyTavernPreset = preset;
  context.__ensure();
  const buckets = context.__buildBuckets('Arona', 'Sensei');
  assert(buckets.beforeHistory[0].content === 'Hello Arona', 'Before-history preset prompt did not render with placeholders.');
  assert(buckets.afterHistory[0].content === 'After Sensei', 'After-history preset prompt was not bucketed correctly.');
  assert(buckets.inChat[0]._depth === 2, 'In-chat preset prompt depth was not preserved.');

  const legacy = context.__normalize({ main_prompt: 'legacy main prompt' });
  assert(legacy.prompts[0].identifier === 'main_prompt', 'Legacy SillyTavern prompt fields were not imported.');
}

async function assertFrontendSillyTavernPresetSettingsRows() {
  const source = await readFile(new URL('../src/app/62-sillytavern-preset-settings-list-ui.js', import.meta.url), 'utf8');
  const context = { Array };

  vm.runInNewContext(`${source}\nthis.__rows = getSillyTavernPresetRows;`, context);
  const rows = context.__rows({
    prompts: [
      { id: 'late', order: 20 },
      { id: 'early', order: 1 },
      { id: 'middle', order: 10 },
    ],
  });

  assert(rows.map((row) => row.prompt.id).join(',') === 'early,middle,late', 'SillyTavern preset settings rows should sort by prompt order.');
  assert(rows.map((row) => row.index).join(',') === '1,2,0', 'SillyTavern preset settings rows should preserve original prompt indexes.');
}

async function assertFrontendNewChatPickerMultiSelection() {
  const sources = await Promise.all([
    '../src/app/59-new-chat-picker-helpers.js',
    '../src/app/59-new-chat-picker-model.js',
    '../src/app/59-new-chat-picker-header.js',
    '../src/app/59-new-chat-picker-multi-bar.js',
    '../src/app/59-new-chat-picker-card-ui.js',
    '../src/app/59-new-chat-picker-static-events.js',
    '../src/app/59-new-chat-picker-multi-session.js',
    '../src/app/59-new-chat-picker-multi-controls.js',
    '../src/app/59-new-chat-picker-multi-confirm.js',
    '../src/app/59-new-chat-picker-multi-ui.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  const context = {
    Set,
    Array,
    Object,
    t: (key) => key,
  };
  vm.runInNewContext(`${sources.join('\n')}\nthis.__key = getNewChatPickerCharacterKey;\nthis.__createSession = createNewChatPickerSession;\nthis.__selected = getNewChatPickerSelectedCharacters;\nthis.__toggleText = updateNewChatPickerMultiToggleText;`, context);
  assert(context.__key({ name: ' Alpha ' }) === 'alpha', 'New chat picker character key should normalize names.');
  const toggleBtn = { textContent: '' };
  context.__toggleText(toggleBtn, true);
  assert(toggleBtn.textContent === 'new_chat_multi_exit', 'New chat picker multi toggle should use exit label when enabled.');

  const characters = [
    { name: 'Alpha' },
    { name: 'Beta' },
    { name: 'Gamma' },
  ];
  const session = context.__createSession({}, {}, characters);
  session.selectedKeys.add('beta');
  session.selectedKeys.add('alpha');

  const selected = context.__selected(session);
  assert(selected.map((c) => c.name).join(',') === 'Beta,Alpha', 'New chat multi-select should preserve click order.');
}

async function assertFrontendNewChatWorkflowHelpers() {
  const sources = await Promise.all([
    '../src/app/59-new-chat-worldinfo.js',
    '../src/app/59-new-chat-first-message.js',
    '../src/app/59-new-chat-single.js',
    '../src/app/59-new-chat-group.js',
    '../src/app/59-new-chat-finalize.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  const events = [];
  const context = {
    state: {
      settings: { userName: 'Sensei' },
      conversations: {},
      conversationOrder: [],
      activeConvId: null,
    },
    dom: { messagesContainer: { innerHTML: 'old' } },
    currentView: 'library',
    currentCharacterName: null,
    makeId: () => 'group-id',
    replacePlaceholders: (text, charName, userName) => String(text || '').replaceAll('{{char}}', charName || '').replaceAll('{{user}}', userName || 'User'),
    t: (key) => key === 'chat_with' ? 'Chat with ' : key,
    isGroupChat: (conv) => !!(conv && conv.group),
    persistState: () => events.push('persist'),
    requestRender: (key) => events.push(`render:${key}`),
    renderTokenBar: () => events.push('token'),
    clearPendingGroupMention: () => events.push('clear-mention'),
    switchView: (view) => events.push(`switch:${view}`),
    isMobile: () => true,
    closeSidebar: () => events.push('close-sidebar'),
    JSON,
    Array,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__copyWorldInfo = copyWorldInfoFromCurrentConversation;\nthis.__single = configureSingleCharacterConversation;\nthis.__group = configureGroupConversation;\nthis.__register = registerNewConversation;\nthis.__render = renderNewConversationState;\nthis.__finalizeUi = finalizeNewConversationUi;`, context);

  const conv = { id: 'c1', messages: [] };
  const current = { worldInfo: { entries: { e1: { content: 'lore' } } } };
  context.__copyWorldInfo(conv, current);
  current.worldInfo.entries.e1.content = 'changed';
  assert(conv.worldInfo.entries.e1.content === 'lore', 'New chat should deep-copy current world info.');

  context.__single(conv, { name: 'Arona', first_mes: 'Hello {{user}}' });
  assert(conv.character.name === 'Arona' && conv.messages[0].content === 'Hello Sensei', 'Single-character new chat setup failed.');
  assert(conv.title === 'Chat with Arona', 'Single-character new chat title changed.');

  const groupConv = { id: 'g1', messages: [] };
  context.__group(groupConv, [
    { name: 'Arona', first_mes: 'Hi {{user}}' },
    { name: 'Plana', first_mes: 'Ignored' },
  ]);
  assert(groupConv.group.members.length === 2 && groupConv.group.members[0].order === 0, 'Group chat members were not created.');
  assert(groupConv.messages[0].speaker === 'Arona' && groupConv.messages[0].content === 'Hi Sensei', 'Group chat first message was not attributed.');

  groupConv._wiBudgetWarning = true;
  context.__register(groupConv);
  assert(context.state.activeConvId === 'g1' && context.state.conversationOrder[0] === 'g1', 'New chat registration did not update active conversation.');
  assert(groupConv._wiBudgetWarning === false && groupConv._historyWindow === 150 && groupConv._wiCache === null, 'New chat runtime state was not initialized.');

  context.__render(groupConv);
  context.__finalizeUi();
  assert(events.includes('persist') && events.includes('render:activeConvId') && events.includes('token'), 'New chat render side effects did not run.');
  assert(!events.includes('clear-mention'), 'Group chats should keep pending group mention state.');
  assert(events.includes('switch:chat') && events.includes('close-sidebar'), 'New chat UI finalization did not run.');
}

async function assertFrontendWorldBookActivation() {
  const sources = await Promise.all([
    '../src/app/41-world-info-constants.js',
    '../src/app/41-world-info-position.js',
    '../src/app/41-world-info-extension-fields.js',
    '../src/app/41-world-info-normalizer.js',
    '../src/app/44-worldbook-match-keys.js',
    '../src/app/44-worldbook-match-filters.js',
    '../src/app/44-worldbook-scan-text.js',
    '../src/app/44-worldbook-matching.js',
    '../src/app/44-worldbook-budget.js',
    '../src/app/44-worldbook-timed-effects.js',
    '../src/app/44-worldbook-activation-helpers.js',
    '../src/app/44-worldbook-activation-collection.js',
    '../src/app/44-worldbook-activation-cache.js',
    '../src/app/44-worldbook-activation-selection.js',
    '../src/app/44-worldbook-activation-result.js',
    '../src/app/44-worldbook-activation.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  let activeConv = null;
  const context = {
    state: {
      settings: {
        userName: 'Sensei',
        worldInfoBudgetEnabled: false,
      },
      worldBooks: {
        wb1: {
          id: 'wb1',
          entries: {
            global: {
              uid: 'global',
              key: ['Kivotos'],
              content: 'Global lore mentions recursive-key.',
              order: 20,
              position: 1,
            },
            recursive: {
              uid: 'recursive',
              key: ['recursive-key'],
              content: 'Recursive lore',
              order: 30,
              position: 1,
            },
            disabled: {
              uid: 'disabled',
              key: ['Kivotos'],
              content: 'Disabled lore',
              disable: true,
              order: 40,
            },
          },
        },
      },
    },
    getActiveConv: () => activeConv,
    getEffectivePostHistoryInstructions: () => '',
    console,
    JSON,
    Date,
    Math,
    Object,
    Array,
    String,
    RegExp,
    parseInt,
    isNaN,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__activate = getActivatedWorldInfo;\nthis.__WI_POS = WI_POS;`, context);

  activeConv = {
    id: 'c-worldbook',
    messages: [
      { role: 'user', content: 'We reached Kivotos today.' },
      { role: 'assistant', content: 'Welcome, Sensei.' },
    ],
    character: { name: 'Arona', tags: ['blue'] },
    worldBookIds: ['wb1'],
    worldInfo: {
      entries: {
        legacy: {
          uid: 'legacy',
          constant: true,
          content: 'Legacy lore',
          order: 10,
          position: 0,
        },
      },
    },
  };

  const first = context.__activate(activeConv);
  const ids = first.entries.map((entry) => entry.uid);
  assert(ids.join(',') === 'legacy,global,recursive', 'World book activation order or recursion changed.');
  assert(first.byPosition[context.__WI_POS.BEFORE_CHAR][0].uid === 'legacy', 'Legacy world info was not grouped before character.');
  assert(first.byPosition[context.__WI_POS.AFTER_CHAR].some((entry) => entry.uid === 'global'), 'Global world book entry did not activate.');
  assert(first.byPosition[context.__WI_POS.AFTER_CHAR].some((entry) => entry.uid === 'recursive'), 'Recursive world book entry did not activate.');
  assert(!first.entries.some((entry) => entry.uid === 'disabled'), 'Disabled world book entry activated.');
  assert(activeConv._wiCache && activeConv._wiCache.result === first, 'World book activation result was not cached.');

  const second = context.__activate(activeConv);
  assert(second === first, 'World book activation cache was not reused for the same conversation fingerprint.');
}

async function assertFrontendWorldBookActivationHelpers() {
  const sources = await Promise.all([
    '../src/app/44-worldbook-activation-collection.js',
    '../src/app/44-worldbook-activation-cache.js',
    '../src/app/44-worldbook-activation-selection.js',
    '../src/app/44-worldbook-activation-result.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  let activeConv = null;
  const context = {
    state: {
      settings: {},
      worldBooks: {
        wb1: {
          entries: {
            global: { uid: 'global', key: ['Kivotos'], content: 'Global lore' },
          },
        },
      },
    },
    normalizeWIEntry(entry) { return Object.assign({}, entry); },
    passesCharacterFilter: () => true,
    passesProbability: () => true,
    buildScanText: () => 'Kivotos trigger',
    entryMatchesKeys: (entry) => (entry.key || []).includes('Kivotos'),
    entryMatchesSecondary: () => true,
    applyWorldInfoBudget(entries) { return { entries, trimmed: entries.length > 2 }; },
    getActiveConv() { return activeConv; },
    WI_POS: { AFTER_CHAR: 1, OUTLET: 6 },
    JSON,
    Date,
    Object,
    Array,
    String,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__collect = collectWorldInfoActivationEntries;\nthis.__combined = buildCombinedWorldInfo;\nthis.__enabled = getEnabledWorldInfoEntries;\nthis.__key = buildWorldInfoActivationCacheKey;\nthis.__cache = cacheActivatedWorldInfoResult;\nthis.__direct = activateDirectWorldInfoEntries;\nthis.__recursive = expandRecursiveWorldInfoEntries;\nthis.__dedupe = dedupeWorldInfoEntries;\nthis.__winner = chooseWorldInfoGroupWinner;\nthis.__groups = resolveWorldInfoInclusionGroups;\nthis.__budget = applyWorldInfoBudgetWithWarning;\nthis.__grouped = groupActivatedWorldInfoByPosition;`, context);

  const conv = {
    worldBookIds: ['wb1'],
    worldInfo: { entries: { local: { uid: 'local', constant: true, content: 'Local lore' } } },
    messages: [
      { role: 'user', content: 'Kivotos first' },
      { role: 'assistant', content: 'reply' },
      { role: 'user', content: 'last message' },
    ],
  };
  const entries = context.__collect(conv);
  assert(entries.length === 2, 'World book activation collection should include linked and legacy entries.');
  assert(entries.find((entry) => entry.uid === 'global')._sourceWorldBookId === 'wb1', 'Linked world book entries should keep source world book id.');

  const combined = context.__combined(entries.concat([{ uid: 'disabled', disable: true }]));
  assert(Object.keys(combined.entries).length === 3, 'Combined world info should index entries by uid.');
  assert(context.__enabled(combined).map((entry) => entry.uid).join(',') === 'global,local', 'Enabled world info helper should filter disabled entries.');

  const keyA = context.__key(conv, combined);
  const keyB = context.__key(Object.assign({}, conv, { messages: conv.messages.concat({ role: 'assistant', content: 'new tail' }) }), combined);
  assert(keyA !== keyB, 'World info activation cache key should change when message fingerprint changes.');
  const result = { entries: [] };
  context.__cache(conv, keyA, result);
  assert(conv._wiCache.key === keyA && conv._wiCache.result === result, 'World info activation cache should store key and result.');

  const direct = context.__direct([
    { uid: 'hit', key: ['Kivotos'], content: 'hit' },
    { uid: 'constant', constant: true, content: 'constant' },
    { uid: 'miss', key: ['Other'], content: 'miss' },
  ], conv, 'Arona', []);
  assert(direct.map((entry) => entry.uid).join(',') === 'hit,constant', 'Direct world info activation should include key hits and constants.');

  const recursive = context.__recursive([{ uid: 'base', content: 'mentions recursive-key' }], [
    { uid: 'base', content: 'mentions recursive-key' },
    { uid: 'recursive', key: ['recursive-key'], content: 'recursive' },
  ], 'Arona', []);
  assert(recursive.some((entry) => entry.uid === 'recursive' && entry.isRecursive === true), 'Recursive world info activation should mark recursive entries.');

  assert(context.__dedupe([{ uid: 'a' }, { uid: 'a' }, { uid: 'b' }]).map((entry) => entry.uid).join(',') === 'a,b', 'World info dedupe should keep first uid occurrence.');
  const winner = context.__winner([
    { uid: 'low', group: 'g', key: ['a'], useGroupScoring: true },
    { uid: 'high', group: 'g', key: ['a', 'b'], keysecondary: ['c'], selectiveLogic: 0, useGroupScoring: true },
  ]);
  assert(winner.uid === 'high', 'World info group scoring should select highest score.');
  const resolved = context.__groups([{ uid: 'solo' }, { uid: 'low', group: 'g', order: 1 }, { uid: 'high', group: 'g', order: 5 }]);
  assert(resolved.map((entry) => entry.uid).sort().join(',') === 'high,solo', 'World info inclusion groups should keep one winner per group.');

  activeConv = {};
  const budgeted = context.__budget([{ uid: '1' }, { uid: '2' }, { uid: '3' }]);
  assert(budgeted.length === 3 && activeConv._wiBudgetWarning === true, 'World info budget helper should set warning on trimmed result.');

  const grouped = context.__grouped([
    { uid: 'normal', position: 1 },
    { uid: 'late', position: 6, outletName: 'Lore', order: 20 },
    { uid: 'early', position: 6, outletName: 'Lore', order: 5 },
  ]);
  assert(grouped.byPosition[1][0].uid === 'normal', 'World info grouping should preserve normal positions.');
  assert(grouped.outlets.Lore.map((entry) => entry.uid).join(',') === 'early,late', 'World info outlets should sort by order.');
}

async function assertFrontendWorldBookMatchingHelpers() {
  const sources = await Promise.all([
    '../src/app/44-worldbook-match-keys.js',
    '../src/app/44-worldbook-match-filters.js',
    '../src/app/44-worldbook-scan-text.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  const context = {
    state: { settings: { userName: 'Sensei' } },
    getEffectivePostHistoryInstructions: () => 'depth note',
    Math: Object.assign({}, Math, { random: () => 0.25 }),
    RegExp,
    String,
    Array,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__key = entryMatchesKeys;\nthis.__secondary = entryMatchesSecondary;\nthis.__charFilter = passesCharacterFilter;\nthis.__prob = passesProbability;\nthis.__scan = buildScanText;`, context);

  assert(context.__key({ key: ['Kivotos'] }, 'hello kivotos', false, false), 'World book key matching should be case-insensitive by default.');
  assert(context.__key({ key: ['/Ki.vo/i'] }, 'Kiavo', true, false), 'World book key matching should support regex keys.');
  assert(context.__secondary({ keysecondary: ['a', 'b'], selectiveLogic: 1 }, 'a b', false), 'World book secondary matching should support AND logic.');
  assert(!context.__secondary({ keysecondary: ['a'], selectiveLogic: 2 }, 'a', false), 'World book secondary matching should support NOT logic.');
  assert(context.__charFilter({ characterFilter: { isExclude: false, names: ['Arona'], tags: [] } }, 'arona', []), 'Character filter should match names case-insensitively.');
  assert(!context.__charFilter({ characterFilter: { isExclude: true, names: [], tags: ['ai'] } }, 'Plana', ['AI']), 'Character filter should exclude matching tags.');
  assert(context.__prob({ useProbability: true, probability: 30 }) === true, 'Probability filter should use percent chance.');
  assert(context.__prob({ useProbability: true, probability: 20 }) === false, 'Probability filter should fail when roll is above chance.');

  const scan = context.__scan({
    character: { name: 'Arona', description: 'desc', personality: 'kind', scenario: 'scene', creator_notes: 'notes' },
    messages: [
      { role: 'system', content: 'hidden' },
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ],
  }, 4, { matchCharacterDescription: true, matchCharacterDepthPrompt: true });
  assert(scan.includes('Sensei: hi') && scan.includes('Arona: hello'), 'Scan text should include labeled recent messages.');
  assert(scan.includes('CharacterDescription: desc') && scan.includes("Character's Note: depth note"), 'Scan text should include selected character sources.');
  assert(!scan.includes('hidden'), 'Scan text should exclude system messages.');
}

async function assertFrontendWebLLMConfirmHelpers() {
  const source = await readFile(new URL('../src/app/11-webllm-confirm-helpers.js', import.meta.url), 'utf8');
  const picker = { value: 'Picker-Model' };
  const started = [];
  const context = {
    WEBLLM_MODEL_INFO: {
      'Llama-3.2-3B-Instruct-q4f16_1-MLC': { label: 'Llama-3.2-3B', sizeMB: 2100 },
      'Picker-Model': { label: 'Picker', sizeMB: 850 },
    },
    state: { settings: { webllmModel: 'State-Model' } },
    document: { getElementById: (id) => (id === 'webllmModel' ? picker : null) },
    persistState: () => { context.persisted = true; },
    startWebLLMInitialization: (modelId) => { started.push(modelId); },
    String,
  };

  vm.runInNewContext(`${source}\nthis.__model = getWebLLMConfirmModelId;\nthis.__size = formatWebLLMModelSize;\nthis.__html = buildWebLLMConfirmHtml;\nthis.__start = startChosenWebLLMModel;`, context);

  assert(context.__model(null) === 'Picker-Model', 'WebLLM confirm should prefer the visible model picker.');
  assert(context.__model('Direct-Model') === 'Direct-Model', 'WebLLM confirm should prefer an explicit target model.');
  assert(context.__size(2100) === '2.1 GB' && context.__size(850) === '850 MB', 'WebLLM confirm should format model download sizes.');
  assert(context.__html('Llama-3.2-3B-Instruct-q4f16_1-MLC', true).includes('Llama-3.2-3B'), 'WebLLM model switch copy should include the target model label.');

  context.__start('Llama-3.2-3B-Instruct-q4f16_1-MLC');
  assert(context.state.settings.inferenceBackend === 'webllm' && picker.value === 'Llama-3.2-3B-Instruct-q4f16_1-MLC', 'WebLLM confirm should sync the selected local model.');
  assert(context.persisted === true && started[0] === 'Llama-3.2-3B-Instruct-q4f16_1-MLC', 'WebLLM confirm should persist and start initialization.');
}

async function assertFrontendWorldBookEntryListFiltering() {
  const source = await readFile(new URL('../src/app/43-worldbook-entry-list-filter.js', import.meta.url), 'utf8');
  const context = {
    dom: { wiSearch: { value: '  kivotos  ' } },
    normalizeWIEntry: (entry) => entry,
    Object,
    Array,
    String,
  };

  vm.runInNewContext(`${source}\nthis.__filter = getCurrentWorldBookFilter;\nthis.__entries = getFilteredWorldInfoEntries;`, context);

  const wi = {
    entries: {
      low: { uid: 'low', key: ['academy'], keysecondary: [], comment: 'Kivotos note', order: 10 },
      high: { uid: 'high', key: ['Kivotos'], keysecondary: [], comment: '', order: 50 },
      secondary: { uid: 'secondary', key: [], keysecondary: ['Kivotos'], comment: '', order: 30 },
      other: { uid: 'other', key: ['Gehenna'], keysecondary: [], comment: '', order: 100 },
    },
  };

  assert(context.__filter() === 'kivotos', 'World book filter did not trim search text.');
  const filtered = context.__entries(wi, context.__filter());
  assert(filtered.map((entry) => entry.uid).join(',') === 'high,secondary,low', 'World book entries were not filtered and sorted by order.');
}

async function assertFrontendWorldBookEntryListUIHelpers() {
  const source = await readFile(new URL('../src/app/43-worldbook-entry-list-row-ui.js', import.meta.url), 'utf8');

  function fakeElement() {
    const toggle = { listeners: {}, addEventListener(type, handler) { this.listeners[type] = handler; } };
    const del = { listeners: {}, addEventListener(type, handler) { this.listeners[type] = handler; } };
    return {
      className: '',
      innerHTML: '',
      textContent: '',
      children: [],
      listeners: {},
      addEventListener(type, handler) { this.listeners[type] = handler; },
      appendChild(child) { this.children.push(child); },
      querySelector(selector) {
        if (selector === '.wi-list-toggle') return toggle;
        if (selector === '.wi-list-del') return del;
        return null;
      },
    };
  }

  const emptyContainer = fakeElement();
  const context = {
    dom: { wiEntryStats: { textContent: '' } },
    wiState: { selectedUid: 'e1' },
    document: { createElement: fakeElement },
    t: (key) => key,
    escapeHtml: (value) => String(value),
    String,
  };

  vm.runInNewContext(`${source}\nthis.__empty = renderWorldBookEntryListEmpty;\nthis.__row = createWorldBookEntryListRow;`, context);

  context.__empty(emptyContainer);
  assert(emptyContainer.children.length === 1 && context.dom.wiEntryStats.textContent === '0 world_book_entry', 'World book entry empty state should update list stats.');

  const row = context.__row({ uid: 'e1', comment: 'Memo', key: ['Kivotos'], order: 7 }, { entries: { e1: {} } });
  assert(row.className.includes('bg-amber-500/10'), 'World book entry list row should mark the selected entry active.');
  assert(row.innerHTML.includes('&times;</button>'), 'World book entry delete button should render a valid close control.');
  assert(!row.innerHTML.includes('閴'), 'World book entry list row should not render mojibake button text.');
}

async function assertFrontendWorldBookEntryLiveHelpers() {
  const sources = await Promise.all([
    '../src/app/43-worldbook-entry-live-core.js',
    '../src/app/43-worldbook-entry-live-match.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  const entry = { uid: 'e1', extensions: {} };
  const context = {
    wiState: { selectedUid: 'e1' },
    getActiveWI() { return { entries: { e1: entry } }; },
    Object,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__entry = getSelectedWorldBookEntry;\nthis.__setPath = setWorldBookEntryPathValue;\nthis.__syncExt = syncWorldBookEntryExtensionField;\nthis.__matchExtKey = getWorldBookMatchExtensionKey;`, context);

  assert(context.__entry() === entry, 'World book live binding should resolve the selected entry.');
  context.__setPath(entry, 'characterFilter.isExclude', true);
  assert(entry.characterFilter.isExclude === true, 'World book live binding should write nested checkbox paths.');
  context.__syncExt(entry, 'position', 6);
  context.__syncExt(entry, 'role', 1);
  context.__syncExt(entry, 'comment', 'ignored');
  assert(entry.extensions.position === 6 && entry.extensions.role === 1 && entry.extensions.comment === undefined, 'World book live binding should sync supported extension fields only.');
  assert(context.__matchExtKey('matchCharacterDescription') === 'match_character_description', 'World book match extension keys should use snake_case.');
}

async function assertFrontendWorldBookEntryEditorHelpers() {
  const sources = await Promise.all([
    '../src/app/41-world-info-constants.js',
    '../src/app/43-worldbook-entry-editor-strategy-ui.js',
    '../src/app/43-worldbook-entry-editor-position-ui.js',
    '../src/app/43-worldbook-entry-editor-state.js',
    '../src/app/43-worldbook-entry-editor-header-ui.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  function classList() {
    const values = new Set();
    return {
      values,
      add(name) { values.add(name); },
      remove(name) { values.delete(name); },
      toggle(name, force) { if (force) values.add(name); else values.delete(name); },
    };
  }
  function button() {
    return {
      attrs: {},
      style: {},
      setAttribute(name, value) { this.attrs[name] = value; },
    };
  }

  const entry = { characterFilter: {} };
  const titleEl = { textContent: '' };
  const context = {
    dom: {
      wiStratConstant: button(),
      wiStratSelective: button(),
      wiDepthRow: { classList: classList() },
      wiOutletRow: { classList: classList() },
      wiNoSelection: { classList: classList() },
      wiEditorForm: { classList: classList() },
      wiCharNames: { value: ' Arona, Plana ' },
      wiCharTags: { value: ' ai, helper ' },
    },
    wiState: {
      selectedUid: 'e1',
      primaryKeys: ['old'],
      secondaryKeys: ['old2'],
      currentWorldBookId: 'wb1',
      dirty: false,
    },
    state: { worldBooks: { wb1: { name: 'Lore' } } },
    getActiveWI() { return { entries: { e1: entry } }; },
    document: { querySelector: () => titleEl },
    Set,
    parseInt,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__strategy = updateStrategyButtons;\nthis.__position = updatePositionConditionalRows;\nthis.__none = showNoSelection;\nthis.__update = updateEntryFromForm;\nthis.__header = updateWorldBookModalHeader;`, context);

  context.__strategy({ constant: true });
  assert(context.dom.wiStratConstant.attrs['data-active'] === 'true', 'World book strategy UI should mark constant active.');
  assert(context.dom.wiStratSelective.style.borderColor === '', 'World book strategy UI should clear inactive border.');

  context.__position(context.WI_POS.AT_DEPTH);
  assert(!context.dom.wiDepthRow.classList.values.has('hidden') && context.dom.wiOutletRow.classList.values.has('hidden'), 'World book position UI should show depth row only for AT_DEPTH.');

  context.__update();
  assert(entry.characterFilter.names.join(',') === 'Arona,Plana', 'World book editor should sync character filter names.');
  assert(entry.characterFilter.tags.join(',') === 'ai,helper' && context.wiState.dirty === true, 'World book editor should sync character filter tags and mark dirty.');

  context.__header();
  assert(titleEl.textContent === '世界书：Lore', 'World book editor header should show selected world book name.');

  context.__none();
  assert(context.wiState.selectedUid === null && context.wiState.primaryKeys.length === 0, 'World book no-selection state should clear selection and keys.');
}

async function assertFrontendWorldBookImportExportUIHelpers() {
  const sources = await Promise.all([
    '../src/app/43-worldbook-export-ui.js',
    '../src/app/43-worldbook-badge-ui.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  const badgeEl = { textContent: '', title: '' };
  const context = {
    dom: { wiEntryCount: badgeEl },
    state: {
      worldBooks: {
        wb1: { entries: { a: {}, b: {} } },
        wb2: { entries: { c: {} } },
      },
    },
    getActiveConv() {
      return { worldBookIds: ['wb1', 'wb2'], worldInfo: { entries: { legacy: {} } } };
    },
    t: (key) => key,
    String,
    Object,
    Array,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__name = sanitizeWorldInfoFileName;\nthis.__badge = renderWorldInfoBadge;\nthis.__suffix = buildWorldInfoBadgeSourceSuffix;`, context);

  assert(context.__name('Lore: A/B?') === 'Lore_A_B', 'World book export filename should replace unsafe characters.');
  assert(context.__name('') === 'world_info', 'World book export filename should keep a non-empty fallback.');

  context.__badge();
  assert(badgeEl.textContent === 4, 'World book badge should count linked and legacy entries.');
  assert(badgeEl.title.includes('\u6765\u81ea 2 \u4e2a\u4e16\u754c\u4e66'), 'World book badge title should describe multiple linked books.');
}

async function assertFrontendWorldBookGlobalListUIHelpers() {
  const source = await readFile(new URL('../src/app/43-worldbook-global-list-row-ui.js', import.meta.url), 'utf8');

  function fakeButton() {
    return { addEventListener() {} };
  }
  function fakeElement() {
    return {
      className: '',
      innerHTML: '',
      textContent: '',
      children: [],
      addEventListener() {},
      appendChild(child) { this.children.push(child); },
      querySelector(selector) {
        if (selector === '.world-book-del-btn' || selector === '.world-book-unlink-btn') return fakeButton();
        return null;
      },
    };
  }

  const context = {
    state: { worldBooks: {
      one: { id: 'one', name: 'Kivotos', entries: { a: {} } },
      two: { id: 'two', name: 'Gehenna', entries: {} },
    } },
    dom: { wiEntryStats: { textContent: '' } },
    wiState: { currentWorldBookId: 'one' },
    document: { createElement: fakeElement },
    t: (key) => ({ world_book_entry: 'entry', world_book_linked: 'Linked', world_book_unlink: 'Unlink', world_book_delete_book: 'Delete', world_book_no_books_hint: 'No books' }[key] || key),
    escapeHtml: (value) => String(value),
    Object,
    String,
  };

  vm.runInNewContext(`${source}\nthis.__filter = getFilteredWorldBookList;\nthis.__empty = renderWorldBookListEmpty;\nthis.__row = createWorldBookListRow;`, context);

  assert(context.__filter('kiv').map((book) => book.id).join(',') === 'one', 'World book global list should filter by book name.');

  const emptyContainer = fakeElement();
  context.__empty(emptyContainer);
  assert(emptyContainer.children.length === 1 && context.dom.wiEntryStats.textContent === '0 entry', 'World book global list empty state should update stats.');

  const row = context.__row({ id: 'one', name: '', entries: { a: {} } }, ['one']);
  assert(row.className.includes('bg-amber-500/10'), 'World book global list row should mark the selected book active.');
  assert(row.innerHTML.includes('&times;</button>'), 'World book global delete button should render a valid close control.');
  assert(row.innerHTML.includes('Linked') && !row.innerHTML.includes('鏈'), 'World book global list row should render translated linked text without mojibake.');
}

async function assertFrontendFileProtocolOPFSSilence() {
  const opfsSources = await Promise.all([
    '../src/app/20-storage-opfs-environment.js',
    '../src/app/20-storage-opfs-io.js',
    '../src/app/20-storage-opfs.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));
  const warnings = [];
  const errors = [];
  const context = {
    window: { location: { protocol: 'file:' }, isSecureContext: false },
    navigator: {
      storage: {
        getDirectory() {
          throw new Error('OPFS should be skipped on file://.');
        },
        estimate() {
          throw new Error('OPFS estimate should be skipped on file://.');
        },
      },
    },
    console: {
      ...console,
      warn: (...args) => warnings.push(args.join(' ')),
      error: (...args) => errors.push(args.join(' ')),
    },
    Date,
    Error,
    JSON,
  };

  vm.runInNewContext(`${opfsSources.join('\n')}\nthis.__opfs = OPFSStorage;`, context);

  assert(await context.__opfs.loadAll() === null, 'OPFS load should return null on file://.');
  await context.__opfs.saveAll({ lastSaved: Date.now(), conversations: {} });
  const info = await context.__opfs.getStorageInfo();
  await context.__opfs.clear();

  assert(info && info.backend === 'opfs' && info.used === 0, 'OPFS info should be empty on file://.');
  assert(info.fileProtocol === true, 'OPFS info should expose file protocol mode.');
  assert(info.opfsSkipped === true && info.opfsSkippedReason === 'file-protocol', 'OPFS info should expose file protocol skip state.');
  assert(warnings.length === 0, `OPFS file:// path should not warn: ${warnings.join('\n')}`);
  assert(errors.length === 0, `OPFS file:// path should not error: ${errors.join('\n')}`);
}

async function assertFrontendStorageServicePipeline() {
  const sources = await Promise.all([
    '../src/app/20-storage-service-helpers.js',
    '../src/app/20-storage-service-maintenance.js',
    '../src/app/20-storage-service-info.js',
    '../src/app/20-storage-service-clear.js',
    '../src/app/20-storage-service-load.js',
    '../src/app/20-storage-service-save.js',
    '../src/app/20-storage-service-init.js',
    '../src/app/20-storage-service-state.js',
    '../src/app/20-storage-service-api.js',
    '../src/app/20-storage-service.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  const backingStore = new Map();
  const localStorageMock = {
    getItem(key) { return Object.prototype.hasOwnProperty.call(this, key) ? this[key] : null; },
    setItem(key, value) { this[key] = String(value); },
    removeItem(key) { delete this[key]; },
  };
  const context = {
    STORAGE_KEY: 'opentavern-test-storage',
    STORAGE_BACKUP_PREFIX: 'opentavern-test-backup-',
    STORAGE_CLEAR_KEY: 'opentavern-test-clear',
    IDBStorage: {
      async loadAll() {
        return backingStore.has('idb') ? JSON.parse(JSON.stringify(backingStore.get('idb'))) : null;
      },
      async saveAll(data) {
        backingStore.set('idb', JSON.parse(JSON.stringify(data)));
      },
    },
    OPFSStorage: {
      async loadAll() { return null; },
      async saveAll() {},
    },
    localStorage: localStorageMock,
    location: { protocol: 'http:' },
    navigator: { storage: {} },
    window: {},
    console: {
      log() {},
      warn() {},
      error() {},
    },
    Date,
    JSON,
    Object,
    Array,
    Number,
    setTimeout,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__StorageService = StorageService;`, context);
  const service = context.__StorageService;
  service._idbAvailable = true;

  const userData = {
    settings: { model: 'storage-model', lang: 'en' },
    conversations: { c1: { id: 'c1', title: 'Stored chat', messages: [{ role: 'user', content: 'hello' }] } },
    conversationOrder: ['c1'],
    activeConvId: 'c1',
    characters: { arona: { id: 'arona', name: 'Arona', first_mes: 'Sensei!' } },
    worldBooks: {},
    lastSaved: 1000,
  };

  await service.saveAll(userData);
  assert(backingStore.get('idb').characters.arona.first_mes === 'Sensei!', 'StorageService saveAll did not persist character cards to IDB.');
  assert(JSON.parse(localStorageMock[context.STORAGE_KEY]).conversations.c1.messages[0].content === 'hello', 'StorageService saveAll did not persist localStorage snapshot.');

  const loaded = await service.loadAll({ sync: false, includeLegacy: false });
  assert(loaded.settings.model === 'storage-model', 'StorageService loadAll did not restore settings.');
  assert(loaded.conversations.c1.title === 'Stored chat', 'StorageService loadAll did not restore chats.');
  assert(loaded.characters.arona.name === 'Arona', 'StorageService loadAll did not restore character cards.');

  await service.saveAll({
    settings: {},
    conversations: { empty: { id: 'empty', messages: [] } },
    conversationOrder: ['empty'],
    activeConvId: 'empty',
    characters: {},
    worldBooks: {},
    lastSaved: 2000,
  });
  assert(backingStore.get('idb').conversations.c1, 'StorageService empty-start protection overwrote existing user data.');

  backingStore.delete('idb');
  service._idbAvailable = false;
  await service.saveAll({
    settings: { model: 'local-only' },
    conversations: {},
    characters: { local: { id: 'local', name: 'Local Card' } },
    worldBooks: {},
    lastSaved: 3000,
  });
  assert(service.getBackend() === 'localStorage', 'StorageService should use localStorage when IDB is unavailable.');
  assert(JSON.parse(localStorageMock[context.STORAGE_KEY]).characters.local.name === 'Local Card', 'StorageService localStorage fallback did not persist character cards.');
}

async function assertFrontendIDBStorageHelpers() {
  const sources = await Promise.all([
    '../src/app/20-storage-idb-connection.js',
    '../src/app/20-storage-idb-operations.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  const context = {
    Date,
    Error,
    Promise,
    setTimeout,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__normalize = normalizeIDBStorageData;\nthis.__retry = withRetryIDBStorage;`, context);

  const normalized = context.__normalize({ data: { conversations: {} } });
  assert(normalized.conversations && Number.isFinite(normalized.lastSaved), 'IDB normalize should unwrap stored snapshot data and add lastSaved.');

  let attempts = 0;
  let resets = 0;
  const storage = {
    async _open(options) {
      attempts += 1;
      if (attempts === 1) throw new Error('first failure');
      return { ok: true, fresh: !!options.fresh };
    },
    _resetConnection() { resets += 1; },
    async _delay() {},
  };
  const result = await context.__retry(storage, async (db) => db, { retries: 1 });
  assert(result.ok === true && result.fresh === true, 'IDB retry should reopen with a fresh connection after failure.');
  assert(attempts === 2 && resets === 1, 'IDB retry should reset once and retry exactly once.');
}

async function assertFrontendStorageServiceFileProtocolStatus() {
  const sources = await Promise.all([
    '../src/app/20-storage-service-helpers.js',
    '../src/app/20-storage-service-maintenance.js',
    '../src/app/20-storage-service-info.js',
    '../src/app/20-storage-service-clear.js',
    '../src/app/20-storage-service-load.js',
    '../src/app/20-storage-service-save.js',
    '../src/app/20-storage-service-init.js',
    '../src/app/20-storage-service-state.js',
    '../src/app/20-storage-service-api.js',
    '../src/app/20-storage-service.js',
    '../src/app/21-storage-usage-format.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  const warnings = [];
  const errors = [];
  const infos = [];
  let opfsTouched = false;
  const localStorageMock = {
    getItem(key) { return Object.prototype.hasOwnProperty.call(this, key) ? this[key] : null; },
    setItem(key, value) { this[key] = String(value); },
    removeItem(key) { delete this[key]; },
  };
  const context = {
    STORAGE_KEY: 'opentavern-test-storage',
    STORAGE_BACKUP_PREFIX: 'opentavern-test-backup-',
    STORAGE_CLEAR_KEY: 'opentavern-test-clear',
    IDBStorage: {
      async _open() {},
      async loadAll() {
        return {
          settings: { lang: 'zh-CN' },
          conversations: {},
          characters: {},
          worldBooks: {},
          lastSaved: 1,
        };
      },
      async saveAll() {},
    },
    OPFSStorage: {
      async _getRoot() {
        opfsTouched = true;
        throw new Error('OPFS should be skipped on file://.');
      },
      async loadAll() {
        opfsTouched = true;
        throw new Error('OPFS load should be skipped on file://.');
      },
      async saveAll() {
        opfsTouched = true;
        throw new Error('OPFS save should be skipped on file://.');
      },
    },
    localStorage: localStorageMock,
    navigator: {
      userAgent: 'TestBrowser',
      vendor: 'TestVendor',
      storage: {
        async estimate() { return { usage: 0, quota: 1000000 }; },
        async persisted() { return true; },
        async getDirectory() {
          opfsTouched = true;
          throw new Error('navigator.storage.getDirectory should be skipped on file://.');
        },
      },
    },
    window: {
      location: { protocol: 'file:' },
      indexedDB: {},
      addEventListener() {},
      isSecureContext: false,
    },
    document: { addEventListener() {} },
    console: {
      log() {},
      info: (...args) => infos.push(args.join(' ')),
      warn: (...args) => warnings.push(args.join(' ')),
      error: (...args) => errors.push(args.join(' ')),
    },
    Blob,
    Date,
    Error,
    JSON,
    Object,
    Array,
    Number,
    String,
    setTimeout,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__StorageService = StorageService;\nthis.__getOPFSStatusText = getOPFSStatusText;\nthis.__buildStorageUsageText = buildStorageUsageText;\nthis.__buildStorageHintText = buildStorageHintText;`, context);
  const service = context.__StorageService;
  await service.init();
  const info = await service.getStorageInfo();
  const opfsText = context.__getOPFSStatusText(info);
  const usageText = context.__buildStorageUsageText(info);
  const hintText = context.__buildStorageHintText(info, service.getBackend());

  assert(service._opfsSkipped === true, 'StorageService should mark OPFS as skipped on file://.');
  assert(service._opfsFailed === false, 'StorageService should not mark file:// OPFS skip as a failure.');
  assert(info.fileProtocol === true, 'Storage info should expose file protocol mode.');
  assert(info.opfsSkipped === true && info.opfsSkippedReason === 'file-protocol', 'Storage info should expose OPFS skip reason.');
  assert(!info.opfsFailureReason, 'file:// OPFS skip should not populate failure reason.');
  assert(!opfsTouched, 'StorageService should not touch OPFS APIs on file://.');
  assert(opfsText.includes('\u672c\u5730\u6587\u4ef6\u6a21\u5f0f'), 'OPFS status should describe local file mode.');
  assert(hintText.includes('\u672c\u5730\u6587\u4ef6\u6a21\u5f0f\u5df2\u8df3\u8fc7 OPFS'), 'Storage hint should describe OPFS as skipped in local file mode.');
  assert(!opfsText.includes('\u4e0d\u53ef\u7528'), 'OPFS status should not say unavailable for file://.');
  assert(!usageText.includes('\u4e0d\u53ef\u7528'), 'Storage usage text should not say unavailable for file://.');
  assert(!hintText.includes('\u4e0d\u53ef\u7528'), 'Storage hint should not say unavailable for file://.');
  assert(!hintText.includes('\u6b63\u5728\u4f7f\u7528 OPFS'), 'Storage hint should not claim OPFS is active on file://.');
  assert(!infos.some((msg) => /OPFS unavailable|file:\/\/ mode/i.test(msg)), 'file:// path should not log OPFS unavailable info.');
  assert(warnings.length === 0, `file:// path should not warn: ${warnings.join('\n')}`);
  assert(errors.length === 0, `file:// path should not error: ${errors.join('\n')}`);
}

async function assertFrontendStateInitialization() {
  const sources = await Promise.all([
    '../src/app/34-state-init-helpers.js',
    '../src/app/34-state-init-load.js',
    '../src/app/34-state-init-settings.js',
    '../src/app/34-state-init-conversations.js',
    '../src/app/34-state-init.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  let persisted = false;
  const context = {
    state: {
      settings: {},
      conversations: {},
      conversationOrder: [],
      activeConvId: null,
      characters: {},
      worldBooks: {},
    },
    StorageService: {
      async loadAll() {
        return {
          settings: { lang: 'en', saveApiKey: false, apiKey: 'secret', summarizeApiKey: 'summary-secret', uiTheme: 'new-light' },
          conversations: {
            c1: { id: 'c1', messages: [{ role: 'user', content: 'hello' }] },
            c2: { id: 'c2', messages: [{ role: 'assistant', content: 'world' }] },
          },
          conversationOrder: ['c2', 'c1'],
          activeConvId: 'missing',
          characters: { arona: { name: 'Arona' } },
          worldBooks: { wb1: { id: 'wb1', entries: [] } },
          charactersMigrated: false,
          lastSaved: 10,
        };
      },
      getBackend() { return 'idb'; },
      _hasUserData() { return true; },
    },
    loadAll() { return null; },
    defaultConversation() { return { id: 'default', messages: [] }; },
    migrateCharactersToRegistry() {},
    persistState() { persisted = true; },
    normalizeUiTheme(value) { return value; },
    cacheUiTheme() {},
    applyUiTheme() {},
    applyPerformanceMode() {},
    DEFAULT_TWO_STAGE_PROMPT: 'two stage default',
    console: { log() {}, warn() {} },
    Object,
    Array,
    Set,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__initState = initState;`, context);
  await context.__initState();

  assert(context.state.settings.lang === 'en', 'initState did not restore settings.');
  assert(context.state.settings.apiKey === '', 'initState should clear API key when saveApiKey is false/defaulted.');
  assert(context.state.settings.summarizeApiKey === '', 'initState should clear summarize API key when saveApiKey is false/defaulted.');
  assert(context.state.settings.twoStageSystemPrompt === 'two stage default', 'initState did not apply two-stage prompt default.');
  assert(context.state.conversations.c1.messages[0].content === 'hello', 'initState did not restore conversations.');
  assert(context.state.activeConvId === 'c2', 'initState did not recover active conversation from conversationOrder.');
  assert(context.state.characters.arona.name === 'Arona', 'initState did not restore character cards.');
  assert(context.state.worldBooks.wb1.id === 'wb1', 'initState did not restore world books.');
  assert(context.state._charactersMigrated === true, 'initState did not set character migration flag.');
  assert(context.state._storageMigration.backend === 'idb', 'initState did not record storage backend.');
  assert(persisted === true, 'initState should persist first character migration when user data exists.');
}

async function assertFrontendConversationImportHelpers() {
  const source = await readFile(new URL('../src/app/63-conversation-import-helpers.js', import.meta.url), 'utf8');
  let renderRequested = null;
  let persistCount = 0;
  const context = {
    state: {
      conversations: {
        existing: { id: 'existing', messages: [{ role: 'user', content: 'old' }] },
      },
      conversationOrder: ['existing'],
      activeConvId: null,
      characters: {},
      worldBooks: {},
    },
    makeId: () => 'new-id',
    persistState: () => { persistCount += 1; },
    requestRender: (key) => { renderRequested = key; },
    updateStorageInfo() {},
    renderLibraryGrids() {},
    renderMyCards() {},
    t: (key) => ({
      import_conv_success: 'Imported ',
      import_conv_success_suffix: ' conversation(s).',
      import_conv_duplicate: ' duplicates',
    }[key] || key),
    JSON,
    Object,
    Array,
  };

  vm.runInNewContext(`${source}\nthis.__records = getConversationImportRecords;\nthis.__import = importConversationRecords;\nthis.__apply = applySuccessfulConversationImport;\nthis.__message = buildConversationImportSuccessMessage;`, context);

  const data = {
    conversations: [
      { id: 'existing', messages: [{ role: 'user', content: 'new' }], character: { name: 'Arona' } },
      {
        id: 'group',
        messages: [{ role: 'assistant', content: 'group' }],
        group: { members: [{ character: { name: 'Plana' } }] },
      },
    ],
    characters: { top: { name: 'Top Card' } },
    worldBooks: { wb1: { id: 'wb1', entries: [{ content: 'Kivotos' }] } },
  };

  const records = context.__records(data);
  assert(records.length === 2, 'Conversation import records were not detected.');
  const result = context.__import(records);
  context.__apply(data, result);

  assert(result.imported === 2, 'Conversation import did not count imported conversations.');
  assert(result.skipped === 1, 'Conversation import did not count duplicated IDs.');
  assert(context.state.conversations['new-id'].messages[0].content === 'new', 'Duplicated conversation was not assigned a new ID.');
  assert(context.state.conversations.group.messages[0].content === 'group', 'Non-duplicated conversation was not imported.');
  assert(context.state.characters.top.name === 'Top Card', 'Top-level imported character card was not preserved.');
  assert(context.state.characters.arona.name === 'Arona', 'Single-chat character was not registered.');
  assert(context.state.characters.plana.name === 'Plana', 'Group member character was not registered.');
  assert(context.state.worldBooks.wb1.entries[0].content === 'Kivotos', 'World book was not imported.');
  assert(context.state.activeConvId === 'group', 'Import should select the first imported conversation when no active conversation exists.');
  assert(persistCount === 2, 'Successful import should persist before and after active conversation update.');
  assert(renderRequested === 'activeConvId', 'Successful import should request active conversation render.');
  assert(context.__message(2, 1).includes('duplicates'), 'Import success message should include duplicate count.');
}

async function main() {
  await assertFrontendCloudSnapshot();
  await assertFrontendStateStoreDefaults();
  await assertFrontendCloudSnapshotApply();
  await assertFrontendSummaryService();
  await assertFrontendApiConnectionHelpers();
  await assertFrontendGenerationHelpers();
  await assertFrontendPromptMessageHelpers();
  await assertFrontendCharacterImportHelpers();
  await assertFrontendWorldInfoNormalizerHelpers();
  await assertFrontendSettingsSaveHelpers();
  await assertFrontendPublicCardAssets();
  await assertFrontendPublicCardGridFiltering();
  await assertFrontendI18nRuntime();
  await assertFrontendSillyTavernPresetNormalizer();
  await assertFrontendSillyTavernPresetSettingsRows();
  await assertFrontendNewChatPickerMultiSelection();
  await assertFrontendNewChatWorkflowHelpers();
  await assertFrontendWorldBookActivation();
  await assertFrontendWorldBookActivationHelpers();
  await assertFrontendWorldBookMatchingHelpers();
  await assertFrontendWebLLMConfirmHelpers();
  await assertFrontendWorldBookEntryListFiltering();
  await assertFrontendWorldBookEntryListUIHelpers();
  await assertFrontendWorldBookEntryLiveHelpers();
  await assertFrontendWorldBookEntryEditorHelpers();
  await assertFrontendWorldBookImportExportUIHelpers();
  await assertFrontendWorldBookGlobalListUIHelpers();
  await assertFrontendFileProtocolOPFSSilence();
  await assertFrontendIDBStorageHelpers();
  await assertFrontendStorageServicePipeline();
  await assertFrontendStorageServiceFileProtocolStatus();
  await assertFrontendStateInitialization();
  await assertFrontendConversationImportHelpers();

  const { db } = createMockD1();
  const env = { SYNC_DB: db };
  const tokenA = 'test-token-alpha';
  const tokenB = 'test-token-bravo';
  const snapshot = {
    settings: {
      model: 'demo-model',
      lang: 'zh-CN',
      summaryEnabled: true,
      cloudSyncToken: 'frontend-should-strip-before-upload',
    },
    conversations: {
      c1: {
        id: 'c1',
        title: 'Cloud sync chat',
        messages: [
          { role: 'user', content: 'hello' },
          { role: 'assistant', content: 'world', speaker: 'Arona' },
        ],
        summaries: [{ id: 's1', text: 'short summary' }],
      },
    },
    conversationOrder: ['c1'],
    activeConvId: 'c1',
    characters: {
      arona: {
        id: 'arona',
        name: 'Arona',
        description: 'Student council AI',
        first_mes: 'Sensei!',
        tags: ['blue-archive'],
      },
    },
    worldBooks: {
      wb1: {
        id: 'wb1',
        name: 'World',
        entries: [{ id: 'e1', key: ['academy'], content: 'Kivotos' }],
      },
    },
    lastSaved: 123,
  };

  const unauthorized = await onRequest({ request: request('GET'), env });
  assert(unauthorized.status === 401, 'Expected missing-token request to be unauthorized.');

  const post = await onRequest({ request: request('POST', tokenA, { data: snapshot }), env });
  await assertOk(post, 'POST');
  const postJson = await readJson(post);
  assert(postJson.success && postJson.updatedAt, 'POST response missing success metadata.');

  const getA = await onRequest({ request: request('GET', tokenA), env });
  await assertOk(getA, 'GET A');
  const getAJson = await readJson(getA);
  assert(getAJson.data.settings.model === 'demo-model', 'Settings were not restored.');
  assert(getAJson.data.settings.lang === 'zh-CN', 'Settings language was not restored.');
  assert(getAJson.data.conversations.c1, 'Conversation was not restored.');
  assert(getAJson.data.conversations.c1.messages[0].content === 'hello', 'Chat user message was not restored.');
  assert(getAJson.data.conversations.c1.messages[1].speaker === 'Arona', 'Chat speaker metadata was not restored.');
  assert(getAJson.data.conversations.c1.summaries[0].text === 'short summary', 'Chat summary was not restored.');
  assert(getAJson.data.conversationOrder[0] === 'c1', 'Conversation order was not restored.');
  assert(getAJson.data.activeConvId === 'c1', 'Active conversation id was not restored.');
  assert(getAJson.data.characters.arona, 'Character card was not restored.');
  assert(getAJson.data.characters.arona.first_mes === 'Sensei!', 'Character card first message was not restored.');
  assert(getAJson.data.characters.arona.tags.includes('blue-archive'), 'Character card tags were not restored.');
  assert(getAJson.data.worldBooks.wb1, 'World book was not restored.');
  assert(getAJson.data.worldBooks.wb1.entries[0].content === 'Kivotos', 'World book entry was not restored.');

  const getB = await onRequest({ request: request('GET', tokenB), env });
  await assertOk(getB, 'GET B');
  const getBJson = await readJson(getB);
  assert(getBJson.data === null, 'Different tokens must not share snapshots.');

  const partialToken = 'test-token-partial';
  const partialPost = await onRequest({
    request: request('POST', partialToken, { data: { settings: { model: 'partial-model' } } }),
    env,
  });
  await assertOk(partialPost, 'partial POST');
  const partialGet = await onRequest({ request: request('GET', partialToken), env });
  await assertOk(partialGet, 'partial GET');
  const partialJson = await readJson(partialGet);
  assert(partialJson.data.settings.model === 'partial-model', 'Partial settings were not preserved.');
  assert(partialJson.data.conversations && typeof partialJson.data.conversations === 'object', 'Missing conversations should normalize to an object.');
  assert(partialJson.data.characters && typeof partialJson.data.characters === 'object', 'Missing character cards should normalize to an object.');
  assert(partialJson.data.worldBooks && typeof partialJson.data.worldBooks === 'object', 'Missing world books should normalize to an object.');
  assert(Array.isArray(partialJson.data.conversationOrder), 'Missing conversation order should normalize to an array.');
  assert(Number.isFinite(partialJson.data.lastSaved), 'Missing lastSaved should normalize to a timestamp.');

  const badEncrypted = await onRequest({
    request: request('POST', tokenB, { encrypted: true, data: { encrypted: true, payload: 'missing-metadata' } }),
    env,
  });
  assert(badEncrypted.status === 400, 'Invalid encrypted payload should return 400.');

  const encryptedEnvelope = {
    encrypted: true,
    version: 1,
    algorithm: 'AES-GCM',
    kdf: 'PBKDF2-SHA256',
    iterations: 210000,
    salt: 'c2FsdA==',
    iv: 'aXY=',
    payload: 'Y2lwaGVydGV4dA==',
    lastSaved: 456,
  };
  const postEncrypted = await onRequest({
    request: request('POST', tokenB, { encrypted: true, data: encryptedEnvelope }),
    env,
  });
  await assertOk(postEncrypted, 'encrypted POST');

  const getEncrypted = await onRequest({ request: request('GET', tokenB), env });
  await assertOk(getEncrypted, 'encrypted GET');
  const getEncryptedJson = await readJson(getEncrypted);
  assert(getEncryptedJson.data.encrypted === true, 'Encrypted envelope flag was not preserved.');
  assert(getEncryptedJson.data.payload === encryptedEnvelope.payload, 'Encrypted payload was not preserved.');

  console.log('frontend and sync function tests passed');
}

await main();
