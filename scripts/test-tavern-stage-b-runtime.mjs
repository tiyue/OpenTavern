import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, 'src/app', file), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));

function fakeFile(name, type, bytesOrText) {
  const bytes = typeof bytesOrText === 'string' ? new TextEncoder().encode(bytesOrText) : bytesOrText;
  return {
    name,
    type,
    size: bytes.length,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  };
}

function fakeEmbeddingVector(text, dimensions) {
  const value = String(text || '');
  const vector = new Array(dimensions).fill(0);
  if (/北境|风雪|雪|冬/.test(value)) vector[0] += 1;
  if (/龙|星辰|星/.test(value)) vector[1 % dimensions] += 1;
  if (/旧日|秘密|记忆|守夜/.test(value)) vector[2 % dimensions] += 1;
  if (/吃|饭|食物|今晚/.test(value)) vector[3 % dimensions] += 1;
  for (let index = 0; index < value.length; index += 1) {
    vector[(index + 4) % dimensions] += (value.charCodeAt(index) % 17) / 1000;
  }
  const length = Math.sqrt(vector.reduce((sum, item) => sum + item * item, 0)) || 1;
  return vector.map(item => item / length);
}

async function createHarness() {
  const behavior = {
    requests: 0,
    urls: [],
    headers: [],
    failStatus: 0,
    failBody: '',
    malformedVector: false,
    duplicateIndex: false,
    delayMs: 0,
    hang: false,
  };
  const context = {
    console,
    TextEncoder,
    TextDecoder,
    URL,
    AbortController,
    setTimeout,
    clearTimeout,
    Array,
    Object,
    JSON,
    Math,
    Number,
    String,
    Date,
    Promise,
    Map,
    Set,
    Uint8Array,
    t: key => key,
    appStore: { notify() {} },
    makeId: (() => { let id = 0; return () => 'doc-id-' + (++id); })(),
    state: {
      settings: { lang: 'zh-CN', contextLength: 20, retrieval: { memoryEnabled: false, documentsEnabled: false, topK: 6, memoryBudgetTokens: 500, documentBudgetTokens: 500, minScore: 0.15 } },
      conversations: {},
      conversationOrder: [],
      activeConvId: null,
      documents: {},
      characters: {},
      isGenerating: false,
    },
    fakeDimensions: 8,
    _persistFail: false,
    _durable: null,
  };
  context.getActiveConv = () => context.state.conversations[context.state.activeConvId];
  context.isolatePrimaryStageContent = text => String(text || '');
  context.getUserVisionAttachments = () => [];
  context.validateUserImageAttachments = () => [];
  context.normalizeApiProtocol = value => String(value || 'openai').toLowerCase();
  context.profiles = {
    id: 'embedding-profile-1',
    name: 'Embedding',
    purpose: 'embedding',
    protocol: 'openai',
    endpoint: 'https://embed.example/v1',
    model: 'text-embed-test',
    parameters: { embeddingDimensions: 8 },
  };
  context.getActiveConnectionProfile = purpose => purpose === 'embedding' ? context.profiles : null;
  context.getConnectionProfileCredential = profile => profile ? 'embedding-test-key' : '';
  context.persistState = async (_immediate, options = {}) => {
    if (options.beforePersist) options.beforePersist();
    const snapshot = options.transformSnapshot ? options.transformSnapshot({
      settings: clone(context.state.settings),
      conversations: clone(context.state.conversations || {}),
      conversationOrder: clone(context.state.conversationOrder || []),
      activeConvId: context.state.activeConvId || null,
      worldBooks: clone(context.state.worldBooks || {}),
      characters: clone(context.state.characters || {}),
      documents: clone(context.state.documents || {}),
    }) : {
      settings: clone(context.state.settings),
      conversations: clone(context.state.conversations || {}),
      documents: clone(context.state.documents || {}),
    };
    if (context._persistBeforeAck) await context._persistBeforeAck();
    if (context._persistFail) throw new Error('persist-failure');
    if (options.onPersistSuccess) options.onPersistSuccess();
    if (options.commitPendingSnapshot) options.commitPendingSnapshot(clone(snapshot));
    context._durable = clone(snapshot);
  };
  context.persistConversationMutation = async (conv, rollback, candidate, commit) => {
    if (context._persistFail) { rollback(conv); throw new Error('persist-failure'); }
    if (!commit(conv)) throw new Error('conversation-changed');
  };
  context.fetch = async (url, request) => {
    behavior.requests++;
    behavior.urls.push(String(url));
    behavior.headers.push(Object.assign({}, request.headers));
    if (behavior.hang) {
      return new Promise((resolve, reject) => {
        if (request.signal) request.signal.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        }, { once: true });
      });
    }
    if (behavior.delayMs) await new Promise(resolve => setTimeout(resolve, behavior.delayMs));
    if (behavior.failStatus) {
      return { ok: false, status: behavior.failStatus, text: async () => behavior.failBody || '{"error":{"message":"blocked"}}' };
    }
    const body = JSON.parse(request.body);
    const inputs = Array.isArray(body.input) ? body.input : [body.input];
    const dimensions = context.fakeDimensions;
    const data = inputs.map((text, index) => ({ index, embedding: fakeEmbeddingVector(text, dimensions) }));
    if (behavior.malformedVector && data.length) data[0].embedding[0] = 'not-a-number';
    if (behavior.duplicateIndex && data.length > 1) data[1].index = data[0].index;
    if (!behavior.malformedVector && !behavior.duplicateIndex) data.reverse();
    return { ok: true, status: 200, text: async () => JSON.stringify({ object: 'list', data }) };
  };
  vm.createContext(context);
  [
    'conversation/19-conversation-order-helpers.js',
    'conversation/32-message-identity.js',
    'summary/41-summary-validity.js',
    'prompt/41-prompt-history-messages.js',
    'retrieval/20-retrieval-index-store.js',
    'retrieval/31-retrieval-embeddings.js',
    'retrieval/32-retrieval-sources.js',
    'documents/32-documents.js',
    'retrieval/41-retrieval-runtime.js',
    'sync/22-cloud-sync-normalize.js',
    'sync/22-cloud-sync-incremental-core.js',
  ].forEach(file => vm.runInContext(read(file), context, { filename: file }));
  context.behavior = behavior;
  context.resetConversations = () => {
    context.state.conversations = {};
    context.state.conversationOrder = [];
    context.state.activeConvId = null;
    context.state.documents = {};
  };
  context.addConversation = (id, title, messages) => {
    const conv = { id, title, messages: [], summaries: [], branchOf: null, created: 1, updated: 1 };
    (messages || []).forEach(message => conv.messages.push(Object.assign({ id: message.id, role: message.role, content: message.content, stage: message.stage || 'main' }, message)));
    context.normalizeConversationMessageIdentity(conv);
    context.state.conversations[id] = conv;
    if (!context.state.conversationOrder.includes(id)) context.state.conversationOrder.push(id);
    if (!context.state.activeConvId) context.state.activeConvId = id;
    return conv;
  };
  context.resetRetrievalSettings = overrides => {
    context.state.settings.retrieval = Object.assign({
      memoryEnabled: false, documentsEnabled: false, topK: 6,
      memoryBudgetTokens: 500, documentBudgetTokens: 500, minScore: 0.1,
    }, overrides || {});
    context.ensureRetrievalSettings(context.state.settings);
  };
  return context;
}

function testChunkingAndBenchmark(context) {
  const sentence = '在遥远的北境，有一座被风雪包围的古老城镇。守夜人记录着每一段传说，旅人们在酒馆里交换关于龙与星辰的故事。';
  let sample = '';
  while (sample.length < 120000) sample += sentence;
  sample = sample.slice(0, 120000);
  const started = performance.now();
  const chunks = context.chunkRetrievalText(sample);
  const chunkMs = performance.now() - started;
  assert.ok(chunks.length > 1, 'Long Chinese text must be split into multiple chunks.');
  assert.ok(chunks.every(chunk => chunk.text.length <= context.RETRIEVAL_CHUNK_CHARS), 'Chunks must stay within the fixed character size.');
  assert.deepEqual(context.chunkRetrievalText(sample), chunks, 'Chunking must be deterministic.');
  assert.ok(chunks.length <= context.RETRIEVAL_MAX_CHUNKS_PER_SOURCE, 'Chunk count must stay within the fixed source limit.');
  const vectors = chunks.map(chunk => fakeEmbeddingVector(chunk.text, 1536));
  const serialized = JSON.stringify(vectors);
  const query = fakeEmbeddingVector('北境风雪里的旧日秘密', 1536);
  const searchStarted = performance.now();
  const scores = vectors.map(vector => context.cosineRetrievalSimilarity(query, vector));
  scores.sort((a, b) => b - a);
  const searchMs = performance.now() - searchStarted;
  console.log('Stage B benchmark ' + JSON.stringify({
    sampleChars: sample.length,
    chunks: chunks.length,
    dimensions: 1536,
    serializedBytes: serialized.length,
    chunkMs: Number(chunkMs.toFixed(2)),
    searchMs: Number(searchMs.toFixed(2)),
    topScore: Number(scores[0].toFixed(4)),
  }));
  assert.ok(chunkMs < 2000 && searchMs < 2000, 'Fixed sample chunking and local similarity search must stay bounded.');
}

async function testSettingsAndEmbeddingAdapter(context) {
  const defaults = {};
  context.ensureRetrievalSettings(defaults);
  assert.equal(defaults.retrieval.memoryEnabled, false);
  assert.equal(defaults.retrieval.documentsEnabled, false);

  const disabled = await context.prepareRetrievalForPrompt(context.getActiveConv(), context.state.settings, {});
  assert.equal(disabled.status, 'disabled');
  assert.equal(context.behavior.requests, 0, 'Opening/reading or disabled retrieval must not call embeddings.');

  assert.equal(context.normalizeRetrievalEmbeddingEndpoint('https://api.example.com'), 'https://api.example.com/v1/embeddings');
  assert.equal(context.normalizeRetrievalEmbeddingEndpoint('https://api.example.com/v1'), 'https://api.example.com/v1/embeddings');
  assert.equal(context.normalizeRetrievalEmbeddingEndpoint('https://api.example.com/v1/embeddings'), 'https://api.example.com/v1/embeddings');
  assert.equal(context.normalizeRetrievalEmbeddingEndpoint('https://api.example.com/v1/chat/completions'), 'https://api.example.com/v1/embeddings');
  assert.throws(() => context.normalizeRetrievalEmbeddingEndpoint('https://user:pass@api.example.com/v1'), /endpoint_invalid/);

  const service = context.buildRetrievalEmbeddingService(context.profiles);
  assert.ok(service.url.endsWith('/v1/embeddings'));
  const embedded = await context.requestRetrievalEmbeddings(service, ['北境风雪', '龙与星辰']);
  assert.equal(embedded.vectors.length, 2);
  assert.deepEqual(embedded.vectors[0].map(value => Number(value.toFixed(5))), fakeEmbeddingVector('北境风雪', 8).map(value => Number(value.toFixed(5))));
  assert.ok(context.behavior.headers.at(-1).Authorization.includes('embedding-test-key'));
  assert.ok(!context.behavior.urls.at(-1).includes('embedding-test-key'));

  const anthropic = Object.assign({}, context.profiles, { protocol: 'anthropic' });
  assert.throws(() => context.buildRetrievalEmbeddingService(anthropic), /protocol_unsupported/);
  const noCredentialContext = context.getConnectionProfileCredential;
  context.getConnectionProfileCredential = () => '';
  assert.throws(() => context.buildRetrievalEmbeddingService(context.profiles), /credential_missing/);
  context.getConnectionProfileCredential = noCredentialContext;

  context.behavior.malformedVector = true;
  await assert.rejects(context.requestRetrievalEmbeddings(service, ['bad vector']), /vector_invalid/);
  context.behavior.malformedVector = false;
  context.behavior.duplicateIndex = true;
  await assert.rejects(context.requestRetrievalEmbeddings(service, ['one', 'two']), /response_order/);
  context.behavior.duplicateIndex = false;
  context.behavior.failStatus = 401;
  await assert.rejects(context.requestRetrievalEmbeddings(service, ['blocked']), /http_error/);
  context.behavior.failStatus = 0;
  context.behavior.hang = true;
  await assert.rejects(context.requestRetrievalEmbeddings(service, ['timeout'], { timeoutMs: 30 }), /aborted/);
  context.behavior.hang = false;

  const oldDimensions = context.fakeDimensions;
  context.fakeDimensions = 6;
  await assert.rejects(context.requestRetrievalEmbeddings(service, ['dimension mismatch']), /dimension_mismatch/);
  context.fakeDimensions = oldDimensions;

  const testResult = await context.testRetrievalEmbeddingProfile(context.profiles);
  assert.equal(testResult.requests, 1);
  assert.equal(testResult.dimensions, 8);
  assert.ok(testResult.latencyMs >= 0);
}

async function testEmbeddingStrictnessAndCancellation(context) {
  for (const scalar of [null, true, false, '1', '', {}, []]) {
    assert.throws(
      () => context.parseRetrievalEmbeddingResponse({ data: [{ index: 0, embedding: [1, scalar] }] }, 1, { configuredDimensions: 0 }),
      /vector_invalid/,
      'Non-number embedding elements must not be coerced: ' + String(scalar)
    );
  }
  assert.deepEqual(
    Array.from(context.parseRetrievalEmbeddingResponse({ data: [{ index: 0, embedding: [1, 0.2] }] }, 1, { configuredDimensions: 0 }).vectors[0]),
    [1, 0.2]
  );
  assert.throws(() => context.buildRetrievalEmbeddingService(Object.assign({}, context.profiles, {
    parameters: { embeddingDimensions: 3.5 },
  })), /dimensions_invalid/, 'Fractional configured dimensions must be rejected instead of floored.');
  assert.throws(() => context.buildRetrievalEmbeddingService(Object.assign({}, context.profiles, {
    parameters: { embeddingDimensions: true },
  })), /dimensions_invalid/, 'Boolean configured dimensions must be rejected.');

  const service = context.buildRetrievalEmbeddingService(context.profiles);
  const originalFetch = context.fetch;
  let calls = 0;
  context.fetch = async () => {
    calls += 1;
    return { ok: true, status: 200, text: async () => JSON.stringify({ data: [{ index: 0, embedding: [1, 0] }] }) };
  };
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(context.requestRetrievalEmbeddings(service, ['测试'], { signal: controller.signal }), /aborted/);
  assert.equal(calls, 0, 'A pre-aborted embedding request must not reach fetch.');
  context.fetch = originalFetch;
}

function testRetrievalSettingsFormReader() {
  const inputs = {
    retrievalMemoryEnabled: { checked: true },
    retrievalDocumentsEnabled: { checked: false },
    retrievalTopK: { value: '6' },
    retrievalMinScore: { value: '0.15' },
    retrievalMemoryBudgetTokens: { value: '500' },
    retrievalDocumentBudgetTokens: { value: '600' },
  };
  const context = {
    console,
    t: key => key,
    state: { settings: { retrieval: {} } },
    document: { getElementById: id => inputs[id] || null },
  };
  vm.createContext(context);
  vm.runInContext(read('retrieval/68-retrieval-ui.js'), context, { filename: 'retrieval/68-retrieval-ui.js' });
  context.readRetrievalSettingsFromForm(context.state.settings);
  assert.deepEqual(clone(context.state.settings.retrieval), {
    memoryEnabled: true, documentsEnabled: false, topK: 6,
    memoryBudgetTokens: 500, documentBudgetTokens: 600, minScore: 0.15,
  });
  inputs.retrievalTopK.value = '0';
  assert.throws(() => context.readRetrievalSettingsFromForm(context.state.settings), /retrieval_top_k_invalid/);
  inputs.retrievalTopK.value = '6';
  inputs.retrievalMemoryBudgetTokens.value = '100.5';
  assert.throws(() => context.readRetrievalSettingsFromForm(context.state.settings), /retrieval_budget_invalid/);
  inputs.retrievalMemoryBudgetTokens.value = '500';
  inputs.retrievalMinScore.value = '2';
  assert.throws(() => context.readRetrievalSettingsFromForm(context.state.settings), /retrieval_min_score_invalid/);
  inputs.retrievalMinScore.value = '0.15';
  delete inputs.retrievalDocumentBudgetTokens;
  const before = clone(context.state.settings.retrieval);
  context.readRetrievalSettingsFromForm(context.state.settings);
  assert.equal(JSON.stringify(context.state.settings.retrieval), JSON.stringify(before), 'A missing retrieval panel must not overwrite settings.');
  assert.ok(/\bretrieval\b/.test(read('settings/68-settings-draft.js').match(/var SETTINGS_FORM_KEYS = \('[^']*'\)/)[0]), 'Retrieval settings must use the existing settings draft contract.');
}

function createIndexStoreContext() {
  const context = {
    console,
    setTimeout,
    clearTimeout,
    AbortController,
    URL,
    t: key => key,
  };
  vm.createContext(context);
  vm.runInContext(read('retrieval/20-retrieval-index-store.js'), context, { filename: 'retrieval/20-retrieval-index-store.js' });
  return context;
}

async function testIndexStoreFences() {
  const timeoutContext = createIndexStoreContext();
  let request;
  let closed = 0;
  timeoutContext.indexedDB = { open() { request = {}; return request; } };
  timeoutContext.RETRIEVAL_INDEX_OPEN_TIMEOUT_MS = 15;
  const open = timeoutContext.openRetrievalIndexDatabase();
  await assert.rejects(open, /超时/);
  request.result = { close() { closed += 1; } };
  request.onsuccess();
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(closed, 1, 'A late IndexedDB open after timeout must close its live connection.');
  assert.equal(timeoutContext.retrievalIndexDb, null);

  const transactionContext = createIndexStoreContext();
  let aborted = 0;
  let transactionClosed = 0;
  const transaction = { abort() { aborted += 1; if (transaction.onabort) transaction.onabort(); } };
  transactionContext.indexedDB = {};
  transactionContext.retrievalIndexDb = {
    transaction() { return transaction; },
    close() { transactionClosed += 1; },
  };
  transactionContext.RETRIEVAL_INDEX_TRANSACTION_TIMEOUT_MS = 15;
  await assert.rejects(transactionContext.runRetrievalIndexTransaction(['sources'], 'readwrite', () => true), /超时/);
  assert.ok(aborted >= 1, 'A timed-out IndexedDB transaction must be aborted.');
  assert.ok(transactionClosed >= 1, 'A connection with an uncertain transaction must be discarded.');

  const rejectionContext = createIndexStoreContext();
  const unhandled = [];
  const onUnhandled = reason => unhandled.push(reason);
  process.on('unhandledRejection', onUnhandled);
  try {
    let rejectionAborted = 0;
    let rejectionClosed = 0;
    const rejectionTransaction = { abort() { rejectionAborted += 1; if (rejectionTransaction.onabort) rejectionTransaction.onabort(); } };
    rejectionContext.indexedDB = {};
    rejectionContext.retrievalIndexDb = {
      transaction() { return rejectionTransaction; },
      close() { rejectionClosed += 1; },
    };
    rejectionContext.RETRIEVAL_INDEX_TRANSACTION_TIMEOUT_MS = 200;
    const quotaError = new Error('quota exceeded');
    quotaError.name = 'QuotaExceededError';
    await assert.rejects(
      rejectionContext.runRetrievalIndexTransaction(['sources'], 'readwrite', () => Promise.reject(quotaError)),
      /quota exceeded/
    );
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.deepEqual(unhandled, [], 'The worker promise rejection must be observed immediately.');
    assert.ok(rejectionAborted >= 1, 'A rejected worker promise must abort the transaction.');
    assert.ok(rejectionClosed >= 1, 'A rejected worker promise must discard the connection.');
  } finally {
    process.removeListener('unhandledRejection', onUnhandled);
  }
}

async function testRetrievalOwnershipAndCounting(context) {
  context.resetConversations();
  context.resetRetrievalSettings({ memoryEnabled: false, documentsEnabled: true, minScore: 0.1 });
  const current = context.addConversation('own1', 'Ownership', [
    { id: 'q1', role: 'user', content: '钥匙在哪里？' },
  ]);
  context.state.documents = {
    doc1: { id: 'doc1', name: 'doc.txt', format: 'txt', content: '钥匙放在三楼档案柜。', bindings: [{ scope: 'conversation', targetId: 'own1' }] },
  };
  context.ensureDocumentsState();
  const document = context.state.documents.doc1;
  const snapshot = {
    sources: [{ sourceKey: 'document:doc1', sourceType: 'document', sourceId: 'doc1', revision: document.revision, signature: 'sig', ready: true }],
    chunks: [{ sourceKey: 'document:doc1', sourceType: 'document', sourceId: 'doc1', revision: document.revision, signature: 'sig', chunkIndex: 0, text: document.content, vector: [1, 0] }],
  };
  const originalSnapshot = context.readRetrievalIndexSnapshot;
  context.readRetrievalIndexSnapshot = async () => clone(snapshot);
  assert.equal((await context.searchRetrievalIndex(current, [1, 0], 'sig', {})).length, 1, 'A still-bound document must be returned.');
  let resolveSnapshot;
  context.readRetrievalIndexSnapshot = () => new Promise(resolve => { resolveSnapshot = resolve; });
  const pending = context.searchRetrievalIndex(current, [1, 0], 'sig', {});
  context.state.documents.doc1.bindings = [];
  resolveSnapshot(clone(snapshot));
  assert.equal((await pending).length, 0, 'A document unbound during the read must be discarded.');
  context.readRetrievalIndexSnapshot = originalSnapshot;

  const service = context.buildRetrievalEmbeddingService(context.profiles);
  const cacheKey = context.retrievalQueryCacheKey(current.id, context.getRetrievalQueryText(current), context.getRetrievalEmbeddingBaseSignature(service));
  context.putRetrievalQueryCache(cacheKey, { vector: [1, 0], dimensions: 8, signature: context.getRetrievalEmbeddingIndexSignature(service, 8) });
  const originalFetch = context.fetch;
  let queryCalls = 0;
  context.fetch = async () => { queryCalls += 1; throw new Error('unexpected query request'); };
  const cachedResult = await context.prepareRetrievalForPrompt(current, context.state.settings, { operation: { isCurrent: () => true } });
  context.fetch = originalFetch;
  assert.equal(queryCalls, 0);
  assert.equal(cachedResult.requests, 0, 'A cached query must report zero real embedding requests.');
  assert.equal(cachedResult.batches, 0);

  context.retrievalQueryEmbeddingCache.clear();
  const originalModel = context.profiles.model;
  let resolveEmbedding;
  const originalRequest = context.requestRetrievalEmbeddings;
  context.requestRetrievalEmbeddings = () => new Promise(resolve => { resolveEmbedding = resolve; });
  const modelPending = context.prepareRetrievalForPrompt(current, clone(context.state.settings), { operation: { isCurrent: () => true } });
  for (let count = 0; count < 30 && !resolveEmbedding; count += 1) await new Promise(resolve => setTimeout(resolve, 0));
  assert.ok(resolveEmbedding, 'The query must actually be pending before changing the model.');
  context.profiles.model = 'changed-model';
  resolveEmbedding({ vectors: [[1, 0]], dimensions: 8 });
  assert.equal((await modelPending).status, 'cancelled', 'A changed embedding model must invalidate a pending generation result.');
  context.profiles.model = originalModel;
  context.requestRetrievalEmbeddings = originalRequest;

  context.resetConversations();
  context.state.documents = {};
  context.ensureDocumentsState();
  context._persistFail = true;
  await assert.rejects(context.addDocumentFromFile(fakeFile('失败.txt', 'text/plain', '失败草稿内容')), /persist-failure/);
  assert.ok(context.getFailedDocumentCandidate(), 'A failed document save must keep its draft.');
  context._persistFail = false;
  context.state.documents.concurrent = context.normalizeDocumentRecord({ name: '并发.txt', content: '并发成功资料', bindings: [] }, 'concurrent');
  await assert.rejects(context.retryFailedDocumentSave(), /document_library_changed/);
  assert.ok(context.getDocumentById('concurrent'), 'Retrying an old baseline must not remove concurrent data.');
  assert.ok(context.getFailedDocumentCandidate(), 'A conflicting retry must keep the exportable draft.');
}

async function testMemoryRetrieval(context) {
  context.resetConversations();
  context.resetRetrievalSettings({ memoryEnabled: true, documentsEnabled: false, minScore: 0.1 });
  const current = context.addConversation('c1', 'Current', [
    { id: 'u1', role: 'user', content: '我想聊聊北境风雪的旧日故事。' },
    { id: 'a1', role: 'assistant', content: '龙与星辰的传说很久以前就开始了。' },
    { id: 'u2', role: 'user', content: '你还记得北境风雪和龙与星辰的旧事吗？' },
  ]);
  const linked = context.addConversation('c2', 'Linked', [
    { id: 'm1', role: 'user', content: '北境风雪里藏着旧日的秘密，守夜人知道。' },
    { id: 'm2', role: 'assistant', content: '守夜人把秘密写进了旧日的记录。' },
  ]);
  const unlinked = context.addConversation('c3', 'Unlinked', [
    { id: 'x1', role: 'user', content: '龙与星辰的禁忌写在禁书里。' },
  ]);
  current.memorySourceConversationIds = ['c2'];
  context.state.activeConvId = 'c1';

  const indexed = await context.indexRetrievalSources(current, { memory: true, documents: false });
  assert.ok(indexed.indexedSources >= 4, 'Current and explicitly linked conversation messages should be indexed.');
  assert.ok(!Object.keys(context.state.documents).length, 'Indexing memory must not create document entities.');
  const statusAfterIndex = context.getRetrievalIndexStatus();
  assert.ok(statusAfterIndex.requests > 0, 'Index status must expose actual embedding request batches.');

  const requestsBefore = context.behavior.requests;
  const actual = await context.prepareRetrievalForPrompt(current, context.state.settings, {});
  assert.ok(actual.injected.length > 0, 'A relevant linked memory must be retrieved.');
  assert.ok(actual.injected.every(item => item.sourceType === 'memory'));
  assert.ok(actual.injected.some(item => item.conversationId === 'c2'));
  assert.ok(actual.injected.every(item => item.conversationId !== 'c3'), 'Unlinked conversation content must not be retrieved.');
  assert.ok(actual.injected.every(item => item.conversationId !== 'c1'), 'Recent current-conversation history must be deduplicated.');
  assert.equal(context.behavior.requests, requestsBefore + 1, 'An actual send should use exactly one query embedding after the index is current.');
  assert.ok(actual.signature.includes('d8'));
  assert.equal(actual.requests, 1);

  const requestsBeforePreview = context.behavior.requests;
  const preview = await context.prepareRetrievalForPrompt(current, context.state.settings, { preview: true });
  assert.equal(preview.status, 'preview-cached');
  assert.equal(context.behavior.requests, requestsBeforePreview, 'Preview must use the cached query vector and send zero embeddings.');
  assert.ok(preview.injected.length > 0);

  const originalAuto = context.autoIndexRetrievalSources;
  context.autoIndexRetrievalSources = async () => ({ skipped: true, reason: 'test' });
  linked.messages[0].content = '完全无关的新内容。';
  context.normalizeConversationMessageIdentity(linked);
  const afterEdit = await context.prepareRetrievalForPrompt(current, context.state.settings, {});
  assert.ok(!afterEdit.injected.some(item => item.sourceId === 'm1'), 'An edited message revision must stop the old snippet immediately.');
  const readiness = await context.getRetrievalReadiness(current);
  assert.ok(readiness.pending > 0 || readiness.stale > 0, 'Changed sources must be reported as pending/stale.');
  linked.messages.splice(0, 1);
  const afterDelete = await context.prepareRetrievalForPrompt(current, context.state.settings, {});
  assert.ok(!afterDelete.injected.some(item => item.sourceId === 'm1'), 'Deleted messages must stop being injected immediately.');
  context.autoIndexRetrievalSources = originalAuto;

  const oldModel = context.profiles.model;
  const oldSignature = (await context.readRetrievalIndexSourceRecord('memory:message:c2:m2')).signature;
  context.profiles.model = 'text-embed-test-2';
  const requestsBeforeModelPreview = context.behavior.requests;
  const modelPreview = await context.prepareRetrievalForPrompt(current, context.state.settings, { preview: true });
  assert.equal(modelPreview.status, 'preview-not-run', 'A changed model must not reuse another model’s cached query or index.');
  assert.equal(context.behavior.requests, requestsBeforeModelPreview);
  await context.indexRetrievalSources(current, { memory: true, documents: false });
  const newSignature = (await context.readRetrievalIndexSourceRecord('memory:message:c2:m2')).signature;
  assert.notEqual(newSignature, oldSignature, 'A changed embedding model must produce a different index signature.');
  const oldSignatureSnapshot = await context.readRetrievalIndexSnapshot(oldSignature);
  assert.ok(!oldSignatureSnapshot.sources.some(source => source.sourceKey === 'memory:message:c2:m2'), 'Reindexing must not leave the old model vectors ready for that source.');
  const modelActual = await context.prepareRetrievalForPrompt(current, context.state.settings, {});
  assert.equal(modelActual.signature, newSignature);
  context.profiles.model = oldModel;

  const summaryConversation = context.addConversation('c4', 'Summary source', [
    { id: 's1m1', role: 'user', content: '旧日的第一段北境记录。' },
    { id: 's1m2', role: 'assistant', content: '旧日的第二段龙与星辰记录。' },
  ]);
  summaryConversation.memorySourceConversationIds = [];
  current.memorySourceConversationIds = ['c2', 'c4'];
  summaryConversation.summaries = [{
    id: 'sum1', summaryVersion: 2, text: '北境与星辰的旧日摘要。',
    sourceMessages: summaryConversation.messages.map(message => ({ id: message.id, revision: context.getMessageRevision(message) })),
  }];
  await context.indexRetrievalSources(current, { memory: true, documents: false });
  assert.equal(context.getValidConversationSummaries(summaryConversation).length, 1);
  summaryConversation.messages[0].content = '被编辑后摘要失效。';
  context.normalizeConversationMessageIdentity(summaryConversation);
  assert.equal(context.getValidConversationSummaries(summaryConversation).length, 0, 'Editing a summarized message must invalidate the summary.');
  const afterSummaryInvalidation = await context.prepareRetrievalForPrompt(current, context.state.settings, {});
  assert.ok(!afterSummaryInvalidation.injected.some(item => item.sourceId === 'sum1'), 'An invalid summary must not be injected.');
}

async function testDocumentLifecycle(context) {
  context.resetConversations();
  context.resetRetrievalSettings({ memoryEnabled: false, documentsEnabled: true, minScore: 0.1 });
  const current = context.addConversation('c1', 'Current', [
    { id: 'q1', role: 'user', content: '北境风雪的资料里写了什么？' },
  ]);
  context.state.characters.alice = { name: 'Alice' };

  const first = await context.addDocumentFromFile(fakeFile('北境设定.txt', 'text/plain', '北境风雪中的古老城镇与守夜人的秘密记录。'));
  const second = await context.addDocumentFromFile(fakeFile('北境设定.txt', 'text/plain', '同名但内容不同的第二份资料。'));
  assert.notEqual(first.id, second.id, 'Same-name imports must not overwrite.');
  assert.notEqual(first.name, second.name, 'Same-name imports must receive distinct names.');
  assert.ok(Object.keys(context.state.documents).length === 2);
  await assert.rejects(context.addDocumentFromFile(fakeFile('bad.pdf', 'application/pdf', 'x')), /format_unsupported/);
  await assert.rejects(context.addDocumentFromFile(fakeFile('bad.txt', 'text/plain', new Uint8Array([0xff, 0xfe, 0x00]))), /encoding_invalid/);
  await assert.rejects(context.addDocumentFromFile(fakeFile('empty.txt', 'text/plain', '   ')), /document_empty/);
  await assert.rejects(context.addDocumentFromFile(fakeFile('huge.txt', 'text/plain', '北'.repeat(context.DOCUMENT_MAX_CHARS + 1))), /too_large/);

  await context.setDocumentBindings(first.id, [{ scope: 'conversation', targetId: 'c1' }]);
  assert.throws(() => context.setDocumentBindings(first.id, [{ scope: 'conversation', targetId: 'missing' }]), /binding_target_missing/);
  let sources = context.buildDocumentSourceRecords(current);
  assert.ok(sources.some(source => source.sourceId === first.id));
  assert.ok(!sources.some(source => source.sourceId === second.id), 'Unbound documents must not be retrieved.');

  const indexed = await context.indexRetrievalSources(current, { memory: false, documents: true });
  assert.ok(indexed.indexedSources >= 1);
  const docResult = await context.prepareRetrievalForPrompt(current, context.state.settings, {});
  assert.ok(docResult.injected.some(item => item.sourceType === 'document' && item.sourceId === first.id));
  assert.ok(docResult.injected.every(item => item.sourceId !== second.id));

  const oldContent = first.content;
  context._persistFail = true;
  await assert.rejects(context.replaceDocumentFromFile(first.id, fakeFile('北境设定.txt', 'text/plain', '替换后的北境风雪资料。')), /persist-failure/);
  assert.equal(context.getDocumentById(first.id).content, oldContent, 'A failed replacement must keep the original document.');
  assert.ok(context.getFailedDocumentCandidate(), 'A failed replacement must keep a retryable candidate.');
  context._persistFail = false;
  await context.retryFailedDocumentSave();
  assert.notEqual(context.getDocumentById(first.id).content, oldContent);
  assert.equal(context.getDocumentById(first.id).bindings[0].targetId, 'c1', 'Replacement must keep bindings.');
  const oldIndex = await context.readRetrievalIndexSourceRecord('document:' + first.id);
  assert.notEqual(oldIndex.revision, context.getDocumentById(first.id).revision, 'Replacement must invalidate the old revision.');

  const exported = context.buildDocumentExportData(first.id);
  assert.equal(exported.document.content, context.getDocumentById(first.id).content);
  assert.equal(exported.document.bindings[0].scope, 'conversation');
  const renamedRevision = context.getDocumentById(first.id).revision;
  const renamed = await context.renameDocument(first.id, '  重命名资料  ');
  assert.equal(renamed.name, '重命名资料');
  assert.equal(context.getDocumentById(first.id).revision, renamedRevision, 'Renaming must not change the text revision.');
  assert.throws(() => context.renameDocument(first.id, '   '), /document_name_required/);
  assert.throws(() => context.renameDocument(first.id, '名'.repeat(context.DOCUMENT_NAME_MAX_CHARS + 1)), /document_name_too_long/);
  assert.equal(context.getDocumentById(first.id).name, '重命名资料', 'Invalid names must keep the saved name.');
  await context.renameDocument(first.id, second.name);
  assert.notEqual(context.getDocumentById(first.id).name, second.name, 'Duplicate rename must follow the existing copy rule.');
  assert.ok(context.getDocumentById(first.id).name.startsWith(second.name.replace(/\.[^.]+$/, '')), 'Duplicate rename must keep the original stem.');

  await context.deleteDocument(first.id);
  assert.equal(context.getDocumentById(first.id), null);
  assert.equal(await context.readRetrievalIndexSourceRecord('document:' + first.id), null, 'Deleting a document must remove its local index source.');
  assert.ok(context.getDocumentById(second.id), 'Deleting one document must not delete another.');
}

async function testQuotaCancelAndFence(context) {
  context.resetConversations();
  context.resetRetrievalSettings({ memoryEnabled: true, documentsEnabled: false, minScore: 0.1 });
  const conv = context.addConversation('q1', 'Quota', [
    { id: 'q1u', role: 'user', content: '北境风雪中的第一条记录。' },
    { id: 'q1a', role: 'assistant', content: '北境风雪中的第二条记录。' },
  ]);

  const originalWrite = context.writeRetrievalIndexSource;
  context.writeRetrievalIndexSource = async () => {
    const error = new Error('quota exceeded');
    error.name = 'QuotaExceededError';
    throw error;
  };
  await assert.rejects(context.indexRetrievalSources(conv, { memory: true, documents: false }), /quota exceeded/);
  assert.equal(context.getRetrievalIndexStatus().phase, 'quota-error');
  context.writeRetrievalIndexSource = originalWrite;
  assert.equal(await context.readRetrievalIndexSourceRecord('memory:message:q1:q1u'), null, 'Quota failure must not mark a source ready.');

  const originalEmbed = context.requestRetrievalEmbeddings;
  context.requestRetrievalEmbeddings = async () => {
    await new Promise(resolve => setTimeout(resolve, 80));
    return { vectors: [fakeEmbeddingVector('late', 8)], dimensions: 8 };
  };
  const pending = context.indexRetrievalSources(conv, { memory: true, documents: false });
  await new Promise(resolve => setTimeout(resolve, 5));
  context.cancelRetrievalIndexing();
  await assert.rejects(pending, /index_cancelled/);
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(await context.readRetrievalIndexSourceRecord('memory:message:q1:q1u'), null, 'A late index result must not be written after cancellation.');
  context.requestRetrievalEmbeddings = originalEmbed;

  const operation = { isCurrent: () => true };
  context.behavior.hang = true;
  const delayed = context.prepareRetrievalForPrompt(conv, context.state.settings, { operation });
  await new Promise(resolve => setTimeout(resolve, 10));
  operation.isCurrent = () => false;
  context.cancelRetrievalRequests();
  const cancelled = await delayed;
  assert.equal(cancelled.status, 'cancelled');
  context.behavior.hang = false;
}

async function testSyncAndSecondClient(context) {
  context.resetConversations();
  context.resetRetrievalSettings({ memoryEnabled: false, documentsEnabled: true });
  const current = context.addConversation('sync1', 'Sync', [
    { id: 'sync-user', role: 'user', content: '同步资料。' },
  ]);
  const document = await context.addDocumentFromFile(fakeFile('同步资料.md', 'text/markdown', '# 北境\n\n同步资料原文。'));
  await context.setDocumentBindings(document.id, [{ scope: 'conversation', targetId: 'sync1' }]);
  const snapshot = {
    settings: clone(context.state.settings),
    conversations: clone(context.state.conversations),
    conversationOrder: clone(context.state.conversationOrder),
    activeConvId: context.state.activeConvId,
    worldBooks: {},
    characters: clone(context.state.characters),
    documents: clone(context.state.documents),
    charactersMigrated: false,
    lastSaved: 123,
  };
  const items = context.splitCloudSyncSnapshotItems(snapshot);
  assert.ok(items['document:' + document.id], 'Cloud sync v2 must include document entities.');
  const rebuilt = context.rebuildCloudSyncSnapshotFromItems(items, snapshot.lastSaved);
  assert.deepEqual(JSON.parse(JSON.stringify(rebuilt.documents)), snapshot.documents, 'Cloud sync v2 must round-trip document text and bindings.');
  const normalized = context.normalizeCloudSyncSnapshot({ documents: snapshot.documents });
  assert.deepEqual(JSON.parse(JSON.stringify(normalized.documents)), snapshot.documents, 'Cloud sync v1 normalization must not drop documents.');

  const secondClientState = { conversations: {}, documents: {} };
  secondClientState.documents = clone(rebuilt.documents);
  assert.equal(Object.keys(secondClientState.documents).length, 1);
  assert.equal(Object.values(secondClientState.documents)[0].content, '# 北境\n\n同步资料原文。');
  assert.equal(Object.values(secondClientState.documents)[0].bindings[0].targetId, 'sync1');
  assert.ok(Object.keys(context.state.documents).length === 1, 'The source client must keep the original document.');
  assert.equal(context.behavior.requests > 0, true);
}

async function testPromptInjectionLabels(context) {
  const result = {
    status: 'ready',
    injected: [
      { sourceType: 'memory', sourceKey: 'memory:message:c:1', sourceId: '1', sourceLabel: '旧会话', revision: 'm1:abcdef', chunkIndex: 0, text: '记忆片段内容 {{setvar::probe::changed}}' },
      { sourceType: 'document', sourceKey: 'document:d', sourceId: 'd', sourceLabel: '{{getvar::host}}.md', revision: 'd1:abcdef', chunkIndex: 2, text: '资料片段内容 {{char}}' },
    ],
    requests: 2,
    serviceModel: 'text-embed-test',
    dimensions: 8,
  };
  const messages = context.buildRetrievalPromptMessages(result, context.state.settings);
  assert.equal(messages.length, 2);
  assert.ok(messages[0].content.includes('retrieval_source_memory'));
  assert.ok(messages[0].content.includes('记忆片段内容'));
  assert.ok(messages[0].content.includes('{{setvar::probe::changed}}'), 'Retrieval text must stay literal before prompt assembly.');
  assert.ok(messages[1].content.includes('retrieval_source_document'));
  assert.ok(messages[1].content.includes('{{getvar::host}}.md'), 'Source metadata must stay literal before prompt assembly.');
  assert.ok(messages[1].content.includes('{{char}}'));
  assert.ok(messages[1].content.includes('retrieval_source_chunk 3'));
  assert.ok(messages.every(message => message.__retrievalReference === true), 'Retrieval blocks must carry the raw-reference boundary marker.');
  const diagnostics = context.getRetrievalDiagnostics(result);
  assert.equal(diagnostics.requests, 2);
  assert.equal(diagnostics.sources.length, 2);
  assert.ok(!JSON.stringify(diagnostics).includes('记忆片段内容'), 'Diagnostics must not duplicate raw retrieved text.');
}

async function testRetrievalReferenceBoundary() {
  const calls = { format: 0, formatAsync: 0, outlets: 0 };
  const context = {
    console,
    state: { settings: { lang: 'zh-CN', contextLength: 20, userName: 'User' }, activeConvId: 'probe' },
    t: key => key,
    WI_POS: { AT_DEPTH: 'at_depth', TOP_AN: 'top_an', BOTTOM_AN: 'bottom_an' },
    isGroupChat: () => false,
    getCurrentSpeakerCharacter: () => null,
    getActivatedWorldInfo: () => ({}),
    getEffectiveAuthorNote: () => ({ enabled: false }),
    buildSystemPrompt: () => '角色设定 {{char}} 与 {{user}}',
    buildSillyTavernPresetMessageBuckets: () => ({ beforeHistory: [], afterHistory: [], inChat: [] }),
    buildPromptSummaryMessage: () => null,
    getValidConversationSummaries: () => [],
    getRegularPromptMessages: () => [{ role: 'user', content: '普通历史 {{char}} {{setvar::normal_probe::ok}}' }],
    insertMessagesAtDepth: () => {},
    insertAdditionalPromptMessages: () => {},
    resolvePromptOutletPlaceholders: messages => {
      calls.outlets += 1;
      messages.forEach(message => {
        if (message.content && message.content.includes('{{outlet::')) message.content = 'OUTLET-EXPANDED';
      });
      return messages;
    },
    normalizePromptRole: role => role || 'system',
    formatMessage: text => { calls.format += 1; return 'FORMATTED:' + text; },
    formatMessageAsync: async text => { calls.formatAsync += 1; return 'ASYNC:' + text; },
    renderDeclarativeTemplateSubset: text => ({ output: String(text).includes('<%') ? 'MVU-EXPANDED' : String(text) }),
    getMvuWorldInfoEntries: () => [],
    getMvuDataForMessage: () => null,
    applyUserImagesToApiMessages: messages => messages,
    isLiveConversation: () => true,
    normalizeConversation: () => {},
    getMessageRevision: () => 'revision',
    prepareRetrievalForPrompt: async () => ({ status: 'ready', injected: [], requests: 0 }),
    buildRetrievalPromptMessages: () => [{
      role: 'system',
      content: '参考 {{setvar::probe::changed}} {{getvar::host}} {{char}} {{outlet::demo}} <%= stat_data.secret %>',
      __retrievalReference: true
    }]
  };
  vm.createContext(context);
  vm.runInContext(read('prompt/40-sillytavern-macro-runtime.js'), context, { filename: 'prompt/40-sillytavern-macro-runtime.js' });
  vm.runInContext(read('prompt/40-character-prompt-helpers.js'), context, { filename: 'prompt/40-character-prompt-helpers.js' });
  vm.runInContext(read('prompt/41-prompt-message-builder.js'), context, { filename: 'prompt/41-prompt-message-builder.js' });
  const conv = {
    id: 'probe', character: { name: 'Alice' },
    messages: [{ id: 'm1', role: 'user', content: '普通历史 {{char}} {{setvar::normal_probe::ok}}' }],
    summaries: [], stLocalVars: { host_private_marker: 'synthetic-host-private-value' }
  };
  const messages = await context.buildMessagesForAPIAsync(conv);
  const reference = messages.find(message => message.content.includes('{{setvar::probe::changed}}'));
  assert.ok(reference, 'The retrieval reference must reach the actual prompt.');
  assert.equal(reference.content, '参考 {{setvar::probe::changed}} {{getvar::host}} {{char}} {{outlet::demo}} <%= stat_data.secret %>',
    'Retrieval text and metadata must bypass macros, templates, regex and outlet expansion.');
  assert.equal(calls.format, 0, 'The async builder must not use the synchronous formatter.');
  assert.equal(calls.formatAsync, 1, 'Only the ordinary chat history may run through message formatting.');
  assert.equal(calls.outlets, 1, 'Outlet resolution still runs for the whole prompt once.');
  assert.ok(messages.some(message => message.content.includes('角色设定 Alice 与 User')),
    'Ordinary system macros must keep expanding.');
  assert.ok(messages.some(message => message.content === 'ASYNC:普通历史 Alice '),
    'Ordinary history must keep its existing formatting and macro behavior.');
  assert.equal(conv.stLocalVars.retrieval_probe, undefined, 'Retrieval references must not mutate host variables.');
  assert.equal(conv.stLocalVars.host_private_marker, 'synthetic-host-private-value', 'Retrieval references must not alter existing host variables.');
  assert.equal(conv.stLocalVars.normal_probe, 'ok', 'Ordinary message macros must still write their configured variables.');
}

function testDocumentExportNaming() {
  const context = {};
  vm.createContext(context);
  vm.runInContext(read('documents/67-documents-ui.js'), context, { filename: 'documents/67-documents-ui.js' });
  assert.equal(context.documentExportFileName({ name: '独立资料.md', format: 'markdown' }), '独立资料.md');
  assert.equal(context.documentExportMimeType({ format: 'markdown' }), 'text/markdown;charset=utf-8');
  assert.equal(context.documentExportFileName({ name: '重命名后', format: 'markdown' }), '重命名后.md');
  assert.equal(context.documentExportFileName({ name: '说明.txt', format: 'txt' }), '说明.txt');
  assert.equal(context.documentExportMimeType({ format: 'txt' }), 'text/plain;charset=utf-8');
  assert.equal(context.documentExportFileName({ name: 'a/b.md', format: 'markdown' }), 'a_b.md');
}

async function main() {
  const context = await createHarness();
  testChunkingAndBenchmark(context);
  await testSettingsAndEmbeddingAdapter(context);
  await testEmbeddingStrictnessAndCancellation(context);
  testRetrievalSettingsFormReader();
  await testIndexStoreFences();
  await testMemoryRetrieval(context);
  await testRetrievalOwnershipAndCounting(context);
  await testDocumentLifecycle(context);
  await testQuotaCancelAndFence(context);
  await testSyncAndSecondClient(context);
  await testPromptInjectionLabels(context);
  await testRetrievalReferenceBoundary();
  testDocumentExportNaming();
  console.log('Tavern stage B runtime checks passed: chunking benchmark, strict embeddings/cancellation, IndexedDB fences, memory revisions/dedupe/preview, ownership/counting, document lifecycle/retry baseline, quota/cancel fencing, sync round-trip, prompt labels, literal retrieval references and document export naming.');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
