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

async function assertFrontendPublicCardAssets() {
  const dataSource = await readFile(new URL('../src/app/60-public-card-data.js', import.meta.url), 'utf8');
  const librarySource = await readFile(new URL('../src/app/60-public-card-library.js', import.meta.url), 'utf8');

  const context = {
    window: { location: { protocol: 'file:' } },
    JSON,
  };
  vm.runInNewContext(`${dataSource}\n${librarySource}\nthis.__cards = getPublicCards();\nthis.__resolve = resolvePublicCardAssetUrl;`, context);

  assert(Array.isArray(context.__cards), 'Public card library did not expose an array.');
  assert(context.__cards.length >= 10, 'Public card library should contain bundled cards.');
  assert(context.__resolve('/cards/Plana.png') === 'cards/Plana.png', 'File protocol should use relative card asset paths.');

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

async function assertFrontendFileProtocolOPFSSilence() {
  const opfsSources = await Promise.all([
    '../src/app/20-storage-opfs-environment.js',
    '../src/app/20-storage-opfs-io.js',
    '../src/app/20-storage-opfs.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));
  const warnings = [];
  const errors = [];
  const context = {
    location: { protocol: 'file:' },
    window: { isSecureContext: false },
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
  assert(warnings.length === 0, `OPFS file:// path should not warn: ${warnings.join('\n')}`);
  assert(errors.length === 0, `OPFS file:// path should not error: ${errors.join('\n')}`);
}

async function assertFrontendStorageServicePipeline() {
  const sources = await Promise.all([
    '../src/app/20-storage-service-helpers.js',
    '../src/app/20-storage-service-load.js',
    '../src/app/20-storage-service-save.js',
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

async function assertFrontendStorageServiceFileProtocolStatus() {
  const sources = await Promise.all([
    '../src/app/20-storage-service-helpers.js',
    '../src/app/20-storage-service-maintenance.js',
    '../src/app/20-storage-service-load.js',
    '../src/app/20-storage-service-save.js',
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
    location: { protocol: 'file:' },
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

  vm.runInNewContext(`${sources.join('\n')}\nthis.__StorageService = StorageService;\nthis.__getOPFSStatusText = getOPFSStatusText;\nthis.__buildStorageUsageText = buildStorageUsageText;`, context);
  const service = context.__StorageService;
  await service.init();
  const info = await service.getStorageInfo();
  const opfsText = context.__getOPFSStatusText(info);
  const usageText = context.__buildStorageUsageText(info);

  assert(service._opfsSkipped === true, 'StorageService should mark OPFS as skipped on file://.');
  assert(service._opfsFailed === false, 'StorageService should not mark file:// OPFS skip as a failure.');
  assert(info.fileProtocol === true, 'Storage info should expose file protocol mode.');
  assert(info.opfsSkipped === true && info.opfsSkippedReason === 'file-protocol', 'Storage info should expose OPFS skip reason.');
  assert(!info.opfsFailureReason, 'file:// OPFS skip should not populate failure reason.');
  assert(!opfsTouched, 'StorageService should not touch OPFS APIs on file://.');
  assert(opfsText.includes('\u672c\u5730\u6587\u4ef6\u6a21\u5f0f'), 'OPFS status should describe local file mode.');
  assert(!opfsText.includes('\u4e0d\u53ef\u7528'), 'OPFS status should not say unavailable for file://.');
  assert(!usageText.includes('\u4e0d\u53ef\u7528'), 'Storage usage text should not say unavailable for file://.');
  assert(!infos.some((msg) => /OPFS unavailable|file:\/\/ mode/i.test(msg)), 'file:// path should not log OPFS unavailable info.');
  assert(warnings.length === 0, `file:// path should not warn: ${warnings.join('\n')}`);
  assert(errors.length === 0, `file:// path should not error: ${errors.join('\n')}`);
}

async function main() {
  await assertFrontendCloudSnapshot();
  await assertFrontendSummaryService();
  await assertFrontendApiConnectionHelpers();
  await assertFrontendPublicCardAssets();
  await assertFrontendI18nRuntime();
  await assertFrontendSillyTavernPresetNormalizer();
  await assertFrontendFileProtocolOPFSSilence();
  await assertFrontendStorageServicePipeline();
  await assertFrontendStorageServiceFileProtocolStatus();

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
