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
  const promptSource = await readFile(new URL('../src/app/53-summary-prompt-builder.js', import.meta.url), 'utf8');
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

  vm.runInNewContext(`${promptSource}\n${apiSource}\n${serviceSource}`, context);
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

async function assertFrontendFileProtocolOPFSSilence() {
  const opfsSource = await readFile(new URL('../src/app/20-storage-opfs.js', import.meta.url), 'utf8');
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

  vm.runInNewContext(`${opfsSource}\nthis.__opfs = OPFSStorage;`, context);

  assert(await context.__opfs.loadAll() === null, 'OPFS load should return null on file://.');
  await context.__opfs.saveAll({ lastSaved: Date.now(), conversations: {} });
  const info = await context.__opfs.getStorageInfo();
  await context.__opfs.clear();

  assert(info && info.backend === 'opfs' && info.used === 0, 'OPFS info should be empty on file://.');
  assert(warnings.length === 0, `OPFS file:// path should not warn: ${warnings.join('\n')}`);
  assert(errors.length === 0, `OPFS file:// path should not error: ${errors.join('\n')}`);
}

async function main() {
  await assertFrontendCloudSnapshot();
  await assertFrontendSummaryService();
  await assertFrontendPublicCardAssets();
  await assertFrontendI18nRuntime();
  await assertFrontendFileProtocolOPFSSilence();

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
