import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

import { onRequest } from '../functions/api/sync.js';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const TOKEN = 'opentavern-sync-v2-test-token';
const CHUNK_BYTES = 393216;
const TEN_MIB = 10 * 1024 * 1024;

function normalizeSql(sql) {
  return String(sql || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function createMockD1() {
  const v1 = new Map();
  const v2Meta = new Map();
  const v2Chunks = new Map();

  function chunkKey(tokenHash, objectHash, index) {
    return `${tokenHash}:${objectHash}:${index}`;
  }

  function matchingChunks(tokenHash, objectHash) {
    return [...v2Chunks.values()].filter((row) => (
      row.token_hash === tokenHash && row.object_hash === objectHash
    ));
  }

  const db = {
    async exec() {},
    prepare(sql) {
      const normalized = normalizeSql(sql);
      return {
        args: [],
        bind(...args) {
          this.args = args;
          return this;
        },
        async first() {
          if (normalized.includes('from opentavern_sync_v2_meta')) {
            return v2Meta.get(this.args[0]) || null;
          }

          if (normalized.includes('count(*) as stored_chunks')) {
            const rows = matchingChunks(this.args[0], this.args[1]);
            if (!rows.length) {
              return {
                stored_chunks: 0,
                min_index: null,
                max_index: null,
                min_total: null,
                max_total: null,
              };
            }
            const indexes = rows.map((row) => row.chunk_index);
            const totals = rows.map((row) => row.chunk_count);
            return {
              stored_chunks: rows.length,
              min_index: Math.min(...indexes),
              max_index: Math.max(...indexes),
              min_total: Math.min(...totals),
              max_total: Math.max(...totals),
            };
          }

          if (normalized.includes('from opentavern_sync_v2_chunks')) {
            return v2Chunks.get(chunkKey(this.args[0], this.args[1], this.args[2])) || null;
          }

          if (normalized.includes('from opentavern_sync')) {
            return v1.get(this.args[0]) || null;
          }

          throw new Error(`Unsupported mock D1 first() SQL: ${normalized}`);
        },
        async run() {
          if (normalized.startsWith('insert into opentavern_sync_v2_chunks')) {
            const [tokenHash, objectHash, index, total, data, chunkHash, createdAt] = this.args;
            v2Chunks.set(chunkKey(tokenHash, objectHash, index), {
              token_hash: tokenHash,
              object_hash: objectHash,
              chunk_index: index,
              chunk_count: total,
              data,
              chunk_hash: chunkHash,
              created_at: createdAt,
            });
            return { success: true, meta: { changes: 1 } };
          }

          if (normalized.startsWith('insert into opentavern_sync_v2_meta')) {
            const [tokenHash, manifestHash, manifestChunks, manifestBytes, revision, updatedAt, lastSaved] = this.args;
            if (v2Meta.has(tokenHash)) return { success: true, meta: { changes: 0 } };
            v2Meta.set(tokenHash, {
              manifest_hash: manifestHash,
              manifest_chunks: manifestChunks,
              manifest_bytes: manifestBytes,
              revision,
              updated_at: updatedAt,
              last_saved: lastSaved,
            });
            return { success: true, meta: { changes: 1 } };
          }

          if (normalized.startsWith('update opentavern_sync_v2_meta')) {
            const [manifestHash, manifestChunks, manifestBytes, revision, updatedAt, lastSaved, tokenHash, expectedRevision] = this.args;
            const current = v2Meta.get(tokenHash);
            if (!current || Number(current.revision) !== Number(expectedRevision)) {
              return { success: true, meta: { changes: 0 } };
            }
            v2Meta.set(tokenHash, {
              manifest_hash: manifestHash,
              manifest_chunks: manifestChunks,
              manifest_bytes: manifestBytes,
              revision,
              updated_at: updatedAt,
              last_saved: lastSaved,
            });
            return { success: true, meta: { changes: 1 } };
          }

          if (normalized.startsWith('delete from opentavern_sync_v2_meta')) {
            const [tokenHash, expectedRevision] = this.args;
            const current = v2Meta.get(tokenHash);
            if (!current || (expectedRevision !== undefined && Number(current.revision) !== Number(expectedRevision))) {
              return { success: true, meta: { changes: 0 } };
            }
            v2Meta.delete(tokenHash);
            return { success: true, meta: { changes: 1 } };
          }

          if (normalized.startsWith('insert into opentavern_sync ')) {
            const [tokenHash, data, updatedAt] = this.args;
            v1.set(tokenHash, { data, updated_at: updatedAt });
            return { success: true, meta: { changes: 1 } };
          }

          if (normalized.startsWith('delete from opentavern_sync ')) {
            const existed = v1.delete(this.args[0]);
            return { success: true, meta: { changes: existed ? 1 : 0 } };
          }

          throw new Error(`Unsupported mock D1 run() SQL: ${normalized}`);
        },
      };
    },
  };

  return { db, v1, v2Meta, v2Chunks };
}

function makeRequest(method, url, body, headers = {}) {
  const requestHeaders = new Headers(headers);
  if (!requestHeaders.has('Authorization') && !url.includes('health=1')) {
    requestHeaders.set('Authorization', `Bearer ${TOKEN}`);
  }
  if (body !== undefined) requestHeaders.set('Content-Type', 'application/json');
  return new Request(url, {
    method,
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function invoke(db, method, query = '', body, headers) {
  const suffix = query ? `?${query}` : '';
  return onRequest({
    request: makeRequest(method, `https://example.test/api/sync${suffix}`, body, headers),
    env: { SYNC_DB: db },
  });
}

async function json(response) {
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function sha256Hex(bytes) {
  const digest = new Uint8Array(await webcrypto.subtle.digest('SHA-256', bytes));
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function testCloudflareSyncV2Protocol() {
  const { db, v1 } = createMockD1();

  const healthResponse = await invoke(db, 'GET', 'health=1');
  assert.equal(healthResponse.status, 200);
  const health = await json(healthResponse);
  assert.deepEqual(health.protocols, [1, 2]);
  assert.equal(health.chunkBytes, CHUNK_BYTES);
  assert.equal(health.maxBytes, null, 'Health must advertise that the application has no snapshot byte limit.');

  const emptyMetaResponse = await invoke(db, 'GET', 'v=2&op=meta');
  assert.equal(emptyMetaResponse.status, 200);
  assert.equal(emptyMetaResponse.headers.get('X-OpenTavern-Protocol'), '2');
  assert.equal(emptyMetaResponse.headers.get('X-OpenTavern-Revision'), '0');
  assert.deepEqual(await json(emptyMetaResponse), {
    success: true,
    exists: false,
    protocol: 2,
    revision: 0,
  });

  const sample = new TextEncoder().encode('{"version":2,"items":{}}');
  const objectHash = await sha256Hex(sample);
  const chunkHash = await sha256Hex(sample);
  const base64 = Buffer.from(sample).toString('base64');

  const wrongHashResponse = await invoke(db, 'POST', 'v=2&op=chunk', {
    objectHash,
    chunkHash: '0'.repeat(64),
    index: 0,
    total: 1,
    data: base64,
  });
  assert.equal(wrongHashResponse.status, 400);
  assert.match((await json(wrongHashResponse)).error, /chunkHash/);

  const oversized = new Uint8Array(CHUNK_BYTES + 1);
  const oversizedResponse = await invoke(db, 'POST', 'v=2&op=chunk', {
    objectHash: await sha256Hex(oversized),
    chunkHash: await sha256Hex(oversized),
    index: 0,
    total: 1,
    data: Buffer.from(oversized).toString('base64'),
  });
  assert.equal(oversizedResponse.status, 413);
  assert.match((await json(oversizedResponse)).error, /exceeds/);

  const uploadResponse = await invoke(db, 'POST', 'v=2&op=chunk', {
    objectHash,
    chunkHash,
    index: 0,
    total: 1,
    data: base64,
  });
  assert.equal(uploadResponse.status, 200);
  assert.equal((await json(uploadResponse)).uploaded, true);

  const getChunkResponse = await invoke(db, 'GET', `v=2&op=chunk&hash=${objectHash}&index=0`);
  assert.equal(getChunkResponse.status, 200);
  assert.equal(getChunkResponse.headers.get('X-OpenTavern-Protocol'), '2');
  assert.deepEqual(await json(getChunkResponse), {
    success: true,
    data: base64,
    chunkHash,
    index: 0,
    total: 1,
  });

  const lastSaved = 1_765_432_100_000;
  const commitBody = {
    expectedRevision: 0,
    manifestHash: objectHash,
    manifestChunks: 1,
    manifestBytes: sample.length,
    lastSaved,
  };
  const commitResponse = await invoke(db, 'POST', 'v=2&op=commit', commitBody);
  assert.equal(commitResponse.status, 200);
  assert.equal(commitResponse.headers.get('X-OpenTavern-Revision'), '1');
  assert.equal(commitResponse.headers.get('ETag'), '"1"');
  const committed = await json(commitResponse);
  assert.equal(committed.protocol, 2);
  assert.equal(committed.revision, 1);
  assert.equal(committed.manifestHash, objectHash);
  assert.equal(committed.manifestBytes, sample.length);

  const committedMetaResponse = await invoke(db, 'GET', 'v=2&op=meta');
  assert.equal(committedMetaResponse.status, 200);
  const committedMeta = await json(committedMetaResponse);
  assert.equal(committedMeta.exists, true);
  assert.equal(committedMeta.revision, 1);
  assert.equal(committedMeta.manifestHash, objectHash);
  assert.equal(committedMeta.lastSaved, lastSaved);

  const conflictResponse = await invoke(db, 'POST', 'v=2&op=commit', commitBody);
  assert.equal(conflictResponse.status, 409);
  assert.equal(conflictResponse.headers.get('X-OpenTavern-Revision'), '1');
  const conflict = await json(conflictResponse);
  assert.equal(conflict.currentRevision, 1);

  const deleteConflictResponse = await invoke(db, 'DELETE', 'v=2', undefined, { 'If-Match': '0' });
  assert.equal(deleteConflictResponse.status, 409);

  const deleteResponse = await invoke(db, 'DELETE', 'v=2', undefined, { 'If-Match': '"1"' });
  assert.equal(deleteResponse.status, 200);
  assert.equal(deleteResponse.headers.get('X-OpenTavern-Exists'), 'false');
  assert.equal((await json(deleteResponse)).deleted, true);

  const deletedMeta = await json(await invoke(db, 'GET', 'v=2&op=meta'));
  assert.equal(deletedMeta.exists, false);
  assert.equal(deletedMeta.revision, 0);

  const largeValue = 'x'.repeat(TEN_MIB + 1024);
  const largeV1Response = await invoke(db, 'POST', '', {
    settings: { largeValue },
    conversations: {},
    characters: {},
    worldBooks: {},
    conversationOrder: [],
    activeConvId: null,
    charactersMigrated: false,
    lastSaved: Date.now(),
  });
  assert.notEqual(largeV1Response.status, 413, 'v1 must not retain the old application-level 10 MiB rejection.');
  assert.equal(largeV1Response.status, 200);
  const largeV1 = await json(largeV1Response);
  assert.ok(largeV1.bytes > TEN_MIB);
  assert.equal(v1.size, 1);
}

async function loadFrontendV2Context(options = {}) {
  const paths = [
    '../src/app/conversation/19-conversation-order-helpers.js',
    '../src/app/sync/22-cloud-sync-normalize.js',
    '../src/app/sync/22-cloud-sync-incremental-core.js',
    '../src/app/sync/22-cloud-sync-incremental-crypto.js',
    '../src/app/sync/22-cloud-sync-incremental-operations.js',
  ];
  const sources = await Promise.all(paths.map((path) => readFile(new URL(path, import.meta.url), 'utf8')));
  const uploaded = [];
  const useWebCrypto = options.webCrypto !== false;
  const context = {
    crypto: useWebCrypto ? webcrypto : null,
    TextEncoder,
    TextDecoder,
    Uint8Array,
    Array,
    Date,
    JSON,
    Math,
    Number,
    Object,
    Promise,
    Set,
    String,
    console,
    hashYieldCount: 0,
    cloudSyncSettings: { cloudSyncEncrypted: false },
    remoteManifest: null,
    readManifestCalls: 0,
    commitCalls: 0,
    uploaded,
    getCloudSyncWebCryptoApi() { return useWebCrypto ? webcrypto : null; },
    getCloudSyncWebCryptoUnavailableMessage() { return 'Web Crypto unavailable'; },
    setTimeout(handler) {
      context.hashYieldCount += 1;
      return globalThis.setTimeout(handler, 0);
    },
    ensureCloudSyncSettings() { return context.cloudSyncSettings; },
    async readCloudSyncV2Manifest() {
      context.readManifestCalls += 1;
      return context.remoteManifest;
    },
    async uploadCloudSyncV2Object(objectHash, bytes) {
      uploaded.push({ objectHash, bytes: new Uint8Array(bytes) });
      return { bytes: bytes.length, chunks: 1 };
    },
    async commitCloudSyncV2Manifest(manifest, expectedRevision) {
      context.commitCalls += 1;
      context.committed = { manifest, expectedRevision };
      return { revision: expectedRevision + 1, updatedAt: Date.now() };
    },
  };

  vm.runInNewContext(`${sources.join('\n')}\n    this.api = {
      splitItems: splitCloudSyncSnapshotItems,
      rebuild: rebuildCloudSyncSnapshotFromItems,
      buildRecords: buildCloudSyncIncrementalItemRecords,
      splitBytes: splitCloudSyncBytes,
      combineChunks: combineCloudSyncByteChunks,
      hashBytes: hashCloudSyncBytes,
      uploadSnapshot: uploadCloudSyncSnapshotV2,
      prepareCrypto: prepareCloudSyncV2UploadCrypto,
      encryptionUnsupportedMessage: getCloudSyncV2EncryptionUnsupportedMessage,
      validateManifest: validateCloudSyncV2Manifest,
      validateTransfer: validateCloudSyncV2TransferReference,
      prepareManifest: prepareCloudSyncV2ManifestTransfer
    };`, context);
  return context;
}

async function testFrontendShaFallbackWithoutWebCrypto() {
  const context = await loadFrontendV2Context({ webCrypto: false });
  const { api } = context;
  const encoder = new TextEncoder();
  assert.equal(
    await api.hashBytes(encoder.encode('')),
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    'The JavaScript SHA-256 fallback must match the standard empty-input vector.',
  );
  assert.equal(
    await api.hashBytes(encoder.encode('abc')),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    'The JavaScript SHA-256 fallback must match the standard abc vector.',
  );

  const largeBytes = new Uint8Array(300_000);
  for (let index = 0; index < largeBytes.length; index += 1) largeBytes[index] = index % 251;
  const expectedLargeHash = await sha256Hex(largeBytes);
  assert.equal(await api.hashBytes(largeBytes), expectedLargeHash,
    'The yielding JavaScript SHA-256 fallback must match WebCrypto for multi-block data.');
  assert.ok(context.hashYieldCount > 0,
    'Large JavaScript SHA-256 operations should yield periodically instead of monopolizing the event loop.');

  context.hashYieldCount = 0;
  const result = await api.uploadSnapshot(makeFrontendSnapshot(), {
    exists: false,
    revision: 0,
  });
  assert.equal(result.incremental, true, 'Plaintext v2 upload should complete without WebCrypto.');
  assert.ok(context.uploaded.length > 0, 'Plaintext v2 upload should transfer content-addressed objects without WebCrypto.');
  assert.equal(context.committed.expectedRevision, 0, 'Plaintext v2 upload should commit the expected initial revision.');
  assert.ok(context.uploaded.every((entry) => /^[a-f0-9]{64}$/.test(entry.objectHash)),
    'Fallback-hashed v2 objects should keep standard SHA-256 content addresses.');
}

async function testStorageServiceRuntimeSnapshotOwnership() {
  const source = await readFile(new URL('../src/app/storage/20-storage-service-save.js', import.meta.url), 'utf8');
  const context = {
    console: { warn() {}, error() {} },
    async trySaveStorageServiceIDBCanonical() { return { saved: true, error: null }; },
    markStorageServiceLocalStorageCanonical(_service, saved) { return !!saved; },
    mirrorStorageServiceSnapshotToOPFS() {},
    scheduleStorageServiceInfoRefresh() {},
    throwStorageServiceCanonicalSaveFailure(_service, error) { throw error || new Error('save failed'); },
  };
  vm.runInNewContext(`${source}\nthis.save = saveStorageServiceData;`, context);

  const runtimeLatest = { settings: { marker: 'latest-runtime' }, conversations: { c1: { messages: ['latest'] } }, lastSaved: 200 };
  const service = {
    _lastSaveSnapshot: runtimeLatest,
    _clearMarkerTime() { return 0; },
    _cloneForPersist(value) { return JSON.parse(JSON.stringify(value)); },
    async _readNewestStoredSnapshotNoSync() { return null; },
    _saveLocalHistorySnapshot() {},
    _isDangerouslyEmptySnapshot() { return false; },
    _hasUserData() { return true; },
    async _syncSnapshotToAvailableBackends() {},
    _tryWriteLocalSnapshot() { return true; },
  };
  const saved = await context.save(service, { settings: { marker: 'older-write' }, conversations: { c1: { messages: ['old'] } }, lastSaved: 100 }, {
    preserveRuntimeSnapshot: true,
  });
  assert.equal(service._lastSaveSnapshot, runtimeLatest,
    'A queue-managed StorageService write must not take ownership of the latest runtime snapshot cache.');
  assert.equal(saved.refusedEmpty, false);

  const recovered = { settings: { marker: 'recovered' }, conversations: { c1: { messages: ['safe'] } }, lastSaved: 150 };
  service._readNewestStoredSnapshotNoSync = async function() { return { data: recovered, backend: 'idb' }; };
  service._isDangerouslyEmptySnapshot = function() { return true; };
  const refused = await context.save(service, { settings: {}, conversations: {}, lastSaved: 300 }, {
    preserveRuntimeSnapshot: true,
  });
  assert.equal(service._lastSaveSnapshot, runtimeLatest,
    'A refused empty queued write must leave runtime-cache ownership with the persistence queue.');
  assert.equal(refused.refusedEmpty, true);
  assert.equal(refused.runtimeSnapshot.settings.marker, 'recovered',
    'The persistence queue must receive the safe recovered snapshot when an empty overwrite is refused.');
}

async function testV2WriteTransportEncryptionDefense() {
  const sources = await Promise.all([
    '../src/app/sync/22-cloud-sync-incremental-core.js',
    '../src/app/sync/22-cloud-sync-incremental-crypto.js',
    '../src/app/sync/22-cloud-sync-incremental-transport.js',
  ].map((path) => readFile(new URL(path, import.meta.url), 'utf8')));
  const settings = {
    cloudSyncEncrypted: true,
    cloudSyncEndpoint: '/api/sync',
    cloudSyncToken: 'valid-token',
  };
  let fetchCalls = 0;
  const context = {
    TextEncoder,
    TextDecoder,
    Uint8Array,
    Array,
    Date,
    JSON,
    Math,
    Number,
    Object,
    Promise,
    String,
    Error,
    console,
    ensureCloudSyncSettings() { return settings; },
    getCloudSyncEndpoint() { return settings.cloudSyncEndpoint; },
    async fetch() { fetchCalls += 1; throw new Error('fetch must stay unreachable'); },
  };
  vm.runInNewContext(`${sources.join('\n')}
    this.api = {
      request: requestCloudSyncV2,
      uploadObject: uploadCloudSyncV2Object,
      commit: commitCloudSyncV2Manifest,
      setDisabling: function(value) { _cloudSyncEncryptionDisableInProgress = value === true; }
    };`, context);

  await assert.rejects(context.api.request('POST', { op: 'chunk' }, {}), /加密上传功能尚未实现|已阻止/);
  await assert.rejects(context.api.uploadObject('a'.repeat(64), new Uint8Array([1])), /加密上传功能尚未实现|已阻止/);
  settings.cloudSyncEncrypted = false;
  context.api.setDisabling(true);
  await assert.rejects(context.api.request('POST', { op: 'commit' }, {}), /正在保存|仍被阻止/);
  await assert.rejects(context.api.commit({ lastSaved: 1, items: {} }, 0), /正在保存|仍被阻止/);
  assert.equal(fetchCalls, 0,
    'Direct v2 chunk/commit calls must be blocked at the final transport boundary before fetch.');
}

function createDeferredOperation() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function loadEncryptionDisableRaceContext() {
  const paths = [
    '../src/app/sync/19-cloud-sync-settings-policy.js',
    '../src/app/conversation/19-conversation-order-helpers.js',
    '../src/app/sync/22-cloud-sync-incremental-crypto.js',
    '../src/app/sync/22-cloud-sync-operation-helpers.js',
    '../src/app/state/35-persist-records.js',
    '../src/app/state/35-state-persistence.js',
    '../src/app/state/35-persist-snapshot-helpers.js',
  ];
  const sources = await Promise.all(paths.map((path) => readFile(new URL(path, import.meta.url), 'utf8')));
  const baseline = {
    settings: {
      cloudSyncEncrypted: true,
      cloudSyncEnabled: true,
      cloudSyncAutoUpload: true,
      cloudSyncLastStatus: 'previous status',
    },
    conversations: { c1: { id: 'c1', messages: [] } },
    conversationOrder: ['c1'],
    activeConvId: 'c1',
    worldBooks: {},
    characters: {},
    charactersMigrated: false,
    lastSaved: 100,
  };
  const saveOperations = [];
  const pendingTimers = new Map();
  let nextTimerId = 1000;
  const context = {
    Array,
    Date,
    JSON,
    Number,
    Object,
    Promise,
    String,
    console: { error() {}, warn() {}, log() {} },
    state: {
      settings: { ...baseline.settings },
      conversations: JSON.parse(JSON.stringify(baseline.conversations)),
      conversationOrder: [...baseline.conversationOrder],
      activeConvId: baseline.activeConvId,
      worldBooks: {},
      characters: {},
      _charactersMigrated: false,
    },
    scheduledUploads: 0,
    clearedUploadTimers: 0,
    clearedPersistTimers: 0,
    durableSnapshot: baseline,
    _cloudSyncUploadTimer: 77,
    _cloudSyncSavingStatus: false,
    StorageService: {
      _lastSaveSnapshot: baseline,
      _isQuotaError() { return false; },
      _cloneForPersist(snapshot) { return JSON.parse(JSON.stringify(snapshot)); },
      async saveAll(snapshot, options = {}) {
        const deferred = createDeferredOperation();
        saveOperations.push({ snapshot, options, ...deferred });
        await deferred.promise;
        context.durableSnapshot = JSON.parse(JSON.stringify(snapshot));
        if (options.preserveRuntimeSnapshot !== true) this._lastSaveSnapshot = snapshot;
      },
    },
    ensureCloudSyncSettings() { return context.state.settings; },
    getSafeSettingsForPersist() { return { ...context.state.settings }; },
    getPersistableConversationOrder(order) { return Array.isArray(order) ? [...order] : []; },
    getPersistableActiveConversationId(activeId) { return activeId || null; },
    scheduleCloudSyncUpload() { context.scheduledUploads += 1; },
    updateStorageInfo() {},
    setCloudSyncStatus() {},
    setCloudSyncPendingStatus(statusEl, message) {
      if (statusEl) statusEl.textContent = message;
    },
    clearTimeout(timer) {
      if (timer === 77) context.clearedUploadTimers += 1;
      if (pendingTimers.delete(timer)) context.clearedPersistTimers += 1;
    },
    setTimeout(handler) {
      const timer = nextTimerId++;
      pendingTimers.set(timer, handler);
      return timer;
    },
  };
  vm.runInNewContext(`${sources.join('\n')}
    this.api = {
      persist: persistState,
      disable: disableCloudSyncEncryptionForFutureUploads,
      encryptionState: getCloudSyncEncryptionUploadState,
      assertUploadAllowed: assertCloudSyncEncryptionUploadAllowed,
      rememberBaseline: rememberCloudSyncConversationBaseline,
      signature: function() { return _cloudSyncConversationSignature; }
    };`, context);
  context.api.rememberBaseline(baseline);
  context.saveOperations = saveOperations;
  context.pendingTimers = pendingTimers;
  return context;
}

async function waitForSaveOperationCount(context, expected) {
  for (let attempt = 0; attempt < 50 && context.saveOperations.length < expected; attempt += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.equal(context.saveOperations.length, expected,
    `Expected ${expected} serialized persistence operation(s) to have started.`);
}

async function testEncryptionDisablePersistenceRace() {
  const context = await loadEncryptionDisableRaceContext();
  context.state.conversations.c1.messages.push({ role: 'user', content: 'changed before disable' });

  const persistStartedBeforeDisable = context.api.persist(true);
  await waitForSaveOperationCount(context, 1);
  assert.equal(context.saveOperations[0].options.preserveRuntimeSnapshot, true,
    'Serialized persistence must prevent an older backend write from owning the latest runtime snapshot cache.');

  const disablePromise = context.api.disable({ textContent: '' });
  assert.equal(context.state.settings.cloudSyncEncrypted, false,
    'The explicit disable transaction should update memory before persisting it.');
  assert.equal(context.api.encryptionState().disabling, true);
  assert.equal(context.api.encryptionState().blocked, true,
    'Uploads must remain blocked while the plaintext setting is still being persisted.');
  assert.throws(() => context.api.assertUploadAllowed(), /正在保存|仍被阻止/);
  assert.equal(context.saveOperations.length, 1,
    'The disable write must wait behind an already-running persistence operation.');

  // Simulate closing settings immediately while the disable save is still pending.
  const persistStartedDuringDisable = context.api.persist(true);
  assert.equal(context.saveOperations.length, 1,
    'A settings-close write must queue behind the disable transaction too.');

  context.saveOperations[0].resolve();
  await persistStartedBeforeDisable;
  await waitForSaveOperationCount(context, 2);
  assert.equal(context.scheduledUploads, 0,
    'The old encrypted save must not schedule upload while disable is pending.');
  context.saveOperations[1].resolve();
  const disableResult = await disablePromise;
  assert.equal(disableResult.success, true);
  assert.equal(disableResult.uploadStarted, false);
  assert.equal(context.api.encryptionState().blocked, false);

  await waitForSaveOperationCount(context, 3);
  // The settings-close save starts after the transaction lock clears, but its captured in-progress
  // guard must still prevent a delayed plaintext auto-upload.
  context.saveOperations[2].resolve();
  await persistStartedDuringDisable;
  assert.equal(context.scheduledUploads, 0,
    'Saves that straddle explicit encryption disable must never enqueue plaintext upload later.');
  assert.equal(context.clearedUploadTimers, 1,
    'The transaction should cancel an auto-upload timer that was already pending.');
  assert.equal(context.durableSnapshot.settings.cloudSyncEncrypted, false,
    'Serialized writes must leave the successfully committed plaintext setting as the durable latest value.');

  // The old pre-transaction completion must not roll the signature back to encrypted=true.
  const noOpPersist = context.api.persist(true);
  await waitForSaveOperationCount(context, 4);
  context.saveOperations[3].resolve();
  await noOpPersist;
  assert.equal(context.scheduledUploads, 0,
    'A no-op save after the race must not be misdetected as a plaintext change.');

  // A genuinely new save after the completed transaction is allowed to use the normal scheduler.
  context.state.conversations.c1.messages.push({ role: 'assistant', content: 'new change after disable' });
  const laterPersist = context.api.persist(true);
  await waitForSaveOperationCount(context, 5);
  context.saveOperations[4].resolve();
  await laterPersist;
  assert.equal(context.scheduledUploads, 1,
    'The epoch guard must not permanently disable automatic sync for later user changes.');
}

async function testEncryptionDisableCancelsQueuedDebounce() {
  const context = await loadEncryptionDisableRaceContext();
  context.state.conversations.c1.messages.push({ role: 'user', content: 'queued change' });
  await context.api.persist(false);
  assert.equal(context.saveOperations.length, 0);
  assert.equal(context.pendingTimers.size, 1);

  const disablePromise = context.api.disable({ textContent: '' });
  await waitForSaveOperationCount(context, 1);
  assert.equal(context.clearedPersistTimers, 1,
    'The immediate disable persist must cancel the older 450ms encrypted snapshot.');
  assert.equal(context.pendingTimers.size, 0);
  context.saveOperations[0].resolve();
  await disablePromise;
  assert.equal(context.durableSnapshot.settings.cloudSyncEncrypted, false);
  assert.equal(context.scheduledUploads, 0);
}

async function testEncryptionDisablePersistenceRollback() {
  const context = await loadEncryptionDisableRaceContext();
  const cachedSnapshotBefore = context.StorageService._lastSaveSnapshot;
  const signatureBefore = context.api.signature();
  const disablePromise = context.api.disable({ textContent: '' });
  await waitForSaveOperationCount(context, 1);
  context.saveOperations[0].reject(new Error('simulated storage failure'));

  await assert.rejects(disablePromise, /simulated storage failure/);
  assert.equal(context.state.settings.cloudSyncEncrypted, true,
    'A failed disable save must restore the previous in-memory encryption setting.');
  assert.equal(context.state.settings.cloudSyncLastStatus, 'previous status');
  assert.equal(context.StorageService._lastSaveSnapshot, cachedSnapshotBefore,
    'A failed transactional persist must restore the cached durable snapshot.');
  assert.equal(context.api.signature(), signatureBefore,
    'A failed transactional persist must not advance the cloud-sync signature to plaintext settings.');
  assert.equal(context.api.encryptionState().blocked, true,
    'After rollback, uploads must remain blocked by the restored encrypted setting.');
  assert.equal(context.api.encryptionState().disabling, false);
  assert.equal(context.scheduledUploads, 0);
}

async function testEncryptionDisableRollbackWithQueuedSettingsClose() {
  const context = await loadEncryptionDisableRaceContext();
  const disablePromise = context.api.disable({ textContent: '' });
  await waitForSaveOperationCount(context, 1);
  const settingsClosePersist = context.api.persist(true);

  context.saveOperations[0].reject(new Error('simulated disable failure with queued close'));
  await assert.rejects(disablePromise, /simulated disable failure with queued close/);
  assert.equal(context.StorageService._lastSaveSnapshot.settings.cloudSyncEncrypted, true,
    'Rollback must repair the latest runtime snapshot before a queued settings-close write or pagehide can flush it.');
  await waitForSaveOperationCount(context, 2);
  assert.equal(context.saveOperations[1].snapshot.settings.cloudSyncEncrypted, true,
    'A settings-close save queued during disable must observe the restored encrypted state after rollback.');

  context.saveOperations[1].resolve();
  await settingsClosePersist;
  assert.equal(context.state.settings.cloudSyncEncrypted, true);
  assert.equal(context.durableSnapshot.settings.cloudSyncEncrypted, true,
    'The queued save after a failed disable must leave durable storage encrypted/blocked.');
  assert.equal(context.api.encryptionState().blocked, true);
  assert.equal(context.scheduledUploads, 0);
}

async function testSerializedPersistKeepsRealChangeUpload() {
  const context = await loadEncryptionDisableRaceContext();
  context.state.settings.cloudSyncEncrypted = false;
  context.StorageService._lastSaveSnapshot.settings.cloudSyncEncrypted = false;
  context.api.rememberBaseline(context.StorageService._lastSaveSnapshot);
  context.state.conversations.c1.messages.push({ role: 'user', content: 'real content change' });

  const changedPersist = context.api.persist(true);
  await waitForSaveOperationCount(context, 1);
  const statusOnlyPersist = context.api.persist(true, { preserveLastSaved: true });
  context.saveOperations[0].resolve();
  await changedPersist;
  assert.equal(context.scheduledUploads, 1,
    'An older real change must schedule before a newer status-only save advances the signature.');

  await waitForSaveOperationCount(context, 2);
  context.saveOperations[1].resolve();
  await statusOnlyPersist;
  assert.equal(context.scheduledUploads, 1,
    'The serialized status-only save must not add another upload or erase the earlier one.');
}

async function testSerializedPersistFreezesQueuedSnapshots() {
  const context = await loadEncryptionDisableRaceContext();
  context.state.settings.cloudSyncEncrypted = false;
  context.StorageService._lastSaveSnapshot.settings.cloudSyncEncrypted = false;
  context.state.conversations.c1.messages.push({ role: 'user', content: 'first snapshot message' });

  const firstPersist = context.api.persist(true);
  await waitForSaveOperationCount(context, 1);
  context.state.conversations.c1.messages.push({ role: 'assistant', content: 'queued snapshot message' });
  const secondPersist = context.api.persist(true);
  const secondLastSaved = context.StorageService._lastSaveSnapshot.lastSaved;
  context.state.conversations.c1.messages.push({ role: 'user', content: 'mutation after queueing' });

  assert.equal(context.saveOperations[0].snapshot.conversations.c1.messages.length, 1,
    'The running persistence record must keep the complete snapshot captured at invocation time.');
  context.saveOperations[0].resolve();
  await firstPersist;
  await waitForSaveOperationCount(context, 2);
  assert.equal(context.saveOperations[1].snapshot.conversations.c1.messages.length, 2,
    'A queued persistence record must not absorb later mutable state changes.');
  assert.equal(context.saveOperations[1].snapshot.lastSaved, secondLastSaved,
    'A frozen queued snapshot must keep its matching timestamp.');

  context.saveOperations[1].resolve();
  await secondPersist;
}

async function testSerializedPersistKeepsLatestTimestampCache() {
  const context = await loadEncryptionDisableRaceContext();
  context.state.settings.cloudSyncEncrypted = false;
  context.StorageService._lastSaveSnapshot.settings.cloudSyncEncrypted = false;
  context.state.conversations.c1.messages.push({ role: 'user', content: 'older queued write' });

  const olderPersist = context.api.persist(true);
  await waitForSaveOperationCount(context, 1);
  context.state.conversations.c1.messages.push({ role: 'assistant', content: 'newer queued write' });
  const newerPersist = context.api.persist(true);
  const newerLastSaved = context.StorageService._lastSaveSnapshot.lastSaved;

  // Simulate a backend that temporarily assigns the running old snapshot before it finishes.
  context.StorageService._lastSaveSnapshot = context.saveOperations[0].snapshot;
  context.saveOperations[0].resolve();
  await olderPersist;
  assert.equal(context.StorageService._lastSaveSnapshot.lastSaved, newerLastSaved,
    'Completion of an older write must restore the latest queued runtime snapshot cache.');

  await waitForSaveOperationCount(context, 2);
  const statusPersist = context.api.persist(true, { preserveLastSaved: true });
  assert.equal(context.StorageService._lastSaveSnapshot.lastSaved, newerLastSaved,
    'A status-only save must inherit the newest queued timestamp, not an older completed write.');
  context.saveOperations[1].resolve();
  await newerPersist;
  await waitForSaveOperationCount(context, 3);
  assert.equal(context.saveOperations[2].snapshot.lastSaved, newerLastSaved,
    'The durable status-only snapshot must not move cloud freshness backwards.');
  context.saveOperations[2].resolve();
  await statusPersist;
}

async function testPersistPostSaveHooksCannotRollbackCommittedData() {
  const context = await loadEncryptionDisableRaceContext();
  context.updateStorageInfo = function() {
    throw new Error('simulated storage-info UI failure');
  };
  const disablePromise = context.api.disable({ textContent: '' });
  await waitForSaveOperationCount(context, 1);
  context.saveOperations[0].resolve();
  const result = await disablePromise;
  assert.equal(result.success, true);
  assert.equal(context.state.settings.cloudSyncEncrypted, false,
    'A post-save UI failure must not roll back a successfully committed encryption-disable setting.');
  assert.equal(context.durableSnapshot.settings.cloudSyncEncrypted, false);

  context.state.conversations.c1.messages.push({ role: 'user', content: 'scheduling hook failure' });
  context.scheduleCloudSyncUpload = function() {
    throw new Error('simulated scheduler failure');
  };
  const persistPromise = context.api.persist(true);
  await waitForSaveOperationCount(context, 2);
  context.saveOperations[1].resolve();
  await persistPromise;
  assert.equal(context.durableSnapshot.conversations.c1.messages.length, 1,
    'A cloud-scheduling hook failure must not turn a successful local write into a rejected persist.');
}

async function loadFrontendV2TransportContext() {
  const paths = [
    '../src/app/sync/22-cloud-sync-incremental-core.js',
    '../src/app/sync/22-cloud-sync-incremental-transport.js',
  ];
  const sources = await Promise.all(paths.map((path) => readFile(new URL(path, import.meta.url), 'utf8')));
  const context = {
    TextEncoder,
    TextDecoder,
    Uint8Array,
    Array,
    Date,
    JSON,
    Math,
    Number,
    Object,
    Promise,
    String,
    console,
  };

  vm.runInNewContext(`${sources.join('\n')}
    this.api = {
      async probeResult(result) {
        var originalRequest = requestCloudSyncV2;
        requestCloudSyncV2 = async function() { return result; };
        try {
          return await probeCloudSyncV2Metadata();
        } finally {
          requestCloudSyncV2 = originalRequest;
        }
      }
    };`, context);
  return context;
}

function makeFrontendSnapshot(overrides = {}) {
  return {
    settings: { lang: 'zh-CN', theme: 'glass' },
    conversations: {
      c1: { id: 'c1', messages: [{ role: 'user', content: 'same content' }] },
      c2: { id: 'c2', messages: [{ role: 'assistant', content: 'second conversation' }] },
    },
    conversationOrder: ['c2', 'c1'],
    activeConvId: 'c2',
    characters: { alice: { id: 'alice', name: 'Alice' } },
    worldBooks: { lore: { id: 'lore', entries: [{ id: 'one', content: 'Lore' }] } },
    charactersMigrated: true,
    lastSaved: 123456,
    ...overrides,
  };
}

async function testFrontendIncrementalCore() {
  const context = await loadFrontendV2Context();
  const { api } = context;
  const snapshot = makeFrontendSnapshot();
  const items = api.splitItems(snapshot);

  assert.deepEqual(Object.keys(items).sort(), [
    'activeConvId',
    'character:alice',
    'charactersMigrated',
    'conversation:c1',
    'conversation:c2',
    'conversationOrder',
    'settings',
    'worldBook:lore',
  ]);
  assert.equal(items['conversation:c1'].messages[0].content, 'same content');

  const rebuilt = api.rebuild(items, snapshot.lastSaved);
  assert.deepEqual(
    JSON.parse(JSON.stringify(rebuilt)),
    JSON.parse(JSON.stringify(snapshot)),
  );

  const bytes = new Uint8Array(CHUNK_BYTES * 2 + 17);
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = index % 251;
  const chunks = api.splitBytes(bytes);
  assert.equal(chunks.length, 3);
  assert.equal(chunks[0].length, CHUNK_BYTES);
  assert.equal(chunks[1].length, CHUNK_BYTES);
  assert.equal(chunks[2].length, 17);
  assert.deepEqual([...api.combineChunks(chunks, bytes.length)], [...bytes]);
  assert.throws(() => api.combineChunks(chunks, bytes.length + 1), /./);

  const originalRecords = await api.buildRecords(snapshot);
  const changedSnapshot = makeFrontendSnapshot({
    settings: { lang: 'en', theme: 'glass' },
    lastSaved: 123999,
  });
  const changedRecords = await api.buildRecords(changedSnapshot);
  assert.equal(changedRecords['conversation:c1'].hash, originalRecords['conversation:c1'].hash);
  assert.equal(changedRecords['character:alice'].hash, originalRecords['character:alice'].hash);
  assert.notEqual(changedRecords.settings.hash, originalRecords.settings.hash);

  context.remoteManifest = {
    version: 2,
    app: 'OpenTavern',
    lastSaved: snapshot.lastSaved,
    encrypted: false,
    crypto: null,
    items: Object.fromEntries(Object.entries(originalRecords).map(([itemKey, record]) => [itemKey, {
      hash: record.hash,
      objectHash: record.hash,
      bytes: record.bytes.length,
      chunks: 1,
    }])),
  };
  const uploadResult = await api.uploadSnapshot(changedSnapshot, {
    exists: true,
    revision: 7,
  });
  assert.equal(uploadResult.stats.uploadedObjects, 1);
  assert.equal(uploadResult.stats.reusedObjects, Object.keys(originalRecords).length - 1);
  assert.equal(context.uploaded.length, 1);
  assert.equal(context.uploaded[0].objectHash, changedRecords.settings.hash);
  assert.equal(context.committed.expectedRevision, 7);

  context.cloudSyncSettings.cloudSyncEncrypted = true;
  const readsBeforeBlockedUpload = context.readManifestCalls;
  const uploadsBeforeBlockedUpload = context.uploaded.length;
  const commitsBeforeBlockedUpload = context.commitCalls;
  await assert.rejects(api.uploadSnapshot(changedSnapshot, {
    exists: true,
    revision: 7,
  }), new RegExp(api.encryptionUnsupportedMessage()));
  assert.equal(context.readManifestCalls, readsBeforeBlockedUpload,
    'Direct v2 encrypted uploads must stop before reading a remote manifest.');
  assert.equal(context.uploaded.length, uploadsBeforeBlockedUpload,
    'Direct v2 encrypted uploads must not send plaintext objects.');
  assert.equal(context.commitCalls, commitsBeforeBlockedUpload,
    'Direct v2 encrypted uploads must not commit or fall back after being blocked.');

  let encryptionError = null;
  try {
    await api.prepareCrypto(null);
  } catch (error) {
    encryptionError = error;
  }
  assert.ok(encryptionError, 'The reserved v2 encryption interface must reject encrypted uploads for now.');
  assert.equal(encryptionError.message, api.encryptionUnsupportedMessage());

  context.cloudSyncSettings.cloudSyncEncrypted = false;
  const readsBeforeUnsafeRevision = context.readManifestCalls;
  const uploadsBeforeUnsafeRevision = context.uploaded.length;
  await assert.rejects(api.uploadSnapshot(changedSnapshot, {
    exists: true,
    revision: Number.MAX_SAFE_INTEGER + 1,
  }), /修订号无效/);
  assert.equal(context.readManifestCalls, readsBeforeUnsafeRevision,
    'Unsafe v2 revisions must be rejected before reading or transferring objects.');
  assert.equal(context.uploaded.length, uploadsBeforeUnsafeRevision,
    'Unsafe v2 revisions must not cause object uploads.');

  const hash = 'a'.repeat(64);
  const descriptor = (bytes) => ({
    hash,
    objectHash: hash,
    bytes,
    chunks: Math.ceil(bytes / CHUNK_BYTES),
  });
  const requiredItems = {
    settings: descriptor(2),
    conversationOrder: descriptor(2),
    activeConvId: descriptor(2),
    charactersMigrated: descriptor(2),
  };
  const manifest = (items) => ({
    version: 2,
    app: 'OpenTavern',
    lastSaved: 1,
    encrypted: false,
    crypto: null,
    items,
  });

  const formerObjectLimit = 64 * 1024 * 1024 + 1;
  const largeReference = api.validateTransfer(
    formerObjectLimit,
    Math.ceil(formerObjectLimit / CHUNK_BYTES),
    'object',
  );
  assert.equal(largeReference.bytes, formerObjectLimit,
    'V2 transfer references must not impose a fixed object or total capacity limit.');

  const manyRequestBytes = CHUNK_BYTES * 100_000 + 1;
  const manyRequestReference = api.validateTransfer(
    manyRequestBytes,
    Math.ceil(manyRequestBytes / CHUNK_BYTES),
    'object',
  );
  assert.equal(manyRequestReference.chunks, 100_001,
    'V2 transfer references must not impose a fixed request-count limit.');

  const maxSafeReference = api.validateTransfer(
    Number.MAX_SAFE_INTEGER,
    Math.ceil(Number.MAX_SAFE_INTEGER / CHUNK_BYTES),
    'object',
  );
  assert.equal(maxSafeReference.bytes, Number.MAX_SAFE_INTEGER,
    'The safe-integer boundary must remain valid without adding a lower capacity limit.');
  assert.throws(() => api.validateTransfer(
    Number.MAX_SAFE_INTEGER + 1,
    Math.ceil((Number.MAX_SAFE_INTEGER + 1) / CHUNK_BYTES),
    'object',
  ), /无效/);
  assert.throws(() => api.validateTransfer(1, Number.MAX_SAFE_INTEGER + 1, 'object'), /无效/);

  const manyItems = { ...requiredItems };
  for (let index = 0; index < 3000; index += 1) {
    const itemHash = (index + 1).toString(16).padStart(64, '0');
    manyItems[`conversation:${index}`] = {
      ...descriptor(formerObjectLimit),
      hash: itemHash,
      objectHash: itemHash,
    };
  }
  assert.equal(api.validateManifest(manifest(manyItems)).items['conversation:2999'].bytes, formerObjectLimit,
    'V2 manifests must not impose a fixed object-count capacity limit.');
  const preparedLargeManifest = api.prepareManifest(manifest(manyItems));
  assert.ok(preparedLargeManifest.bytes.length > CHUNK_BYTES && preparedLargeManifest.chunks > 1,
    'V2 manifests larger than one chunk must remain valid and use normal chunking.');
}

async function testMessageReliabilityD1RoundTrip() {
  const { db } = createMockD1();
  const extraSources = await Promise.all([
    '../src/app/sync/19-cloud-sync-settings-policy.js',
    '../src/app/sync/22-cloud-sync-base64.js',
    '../src/app/sync/22-cloud-sync-incremental-transport.js',
    '../src/app/conversation/32-message-identity.js',
    '../src/app/conversation/32-response-versions.js',
    '../src/app/summary/41-summary-validity.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  async function makeDevice(localSnapshot) {
    const context = await loadFrontendV2Context();
    let generatedId = 0;
    context.makeId = () => `version-${++generatedId}`;
    context.btoa = btoa;
    context.atob = atob;
    context.cloudSyncSettings.cloudSyncToken = TOKEN;
    context.getCloudSyncEndpoint = () => 'https://sync.example/api/sync';
    context.prepareCloudSyncLocalSnapshotForComparison = () => localSnapshot;
    context.fetch = (url, options) => onRequest({ request: new Request(url, options), env: { SYNC_DB: db } });
    vm.runInNewContext(`${extraSources.join('\n')}\nthis.api.downloadSnapshot = downloadCloudSyncSnapshotV2;\nthis.api.probeMetadata = probeCloudSyncV2Metadata;`, context);
    return context;
  }

  const emptySnapshot = { settings: {}, conversations: {}, conversationOrder: [], activeConvId: null, characters: {}, worldBooks: {}, lastSaved: 0 };
  const uploader = await makeDevice(emptySnapshot);
  const snapshot = makeFrontendSnapshot();
  const conv = snapshot.conversations.c1;
  conv.messages = [
    { id: 'user-1', role: 'user', content: 'Question', extension: { futureField: ['retained'] } },
    { id: 'main-1', role: 'assistant', stage: 'main', content: 'Old answer', cot: 'Old reasoning', speaker: 'Alice', usage: { total_tokens: 12 }, extension: { author: 'future' } },
    { id: 'second-1', role: 'assistant', stage: 'second', parentId: 'main-1', content: '<options>old options</options>', usage: { total_tokens: 3 } },
  ];
  uploader.normalizeConversationMessageIdentity(conv);
  const originalVersion = uploader.captureResponseVersion(conv, conv.messages[1]);
  const selectedVersion = JSON.parse(JSON.stringify(originalVersion));
  selectedVersion.id = 'version-selected';
  selectedVersion.message.content = 'Selected answer';
  selectedVersion.message.cot = 'Selected reasoning';
  selectedVersion.message.usage = { total_tokens: 25 };
  selectedVersion.secondMessages[0].content = '<details><summary>Status</summary>HP 100</details>';
  selectedVersion.secondMessages[0].cot = 'Second-stage reasoning';
  conv.messages[1] = { ...selectedVersion.message, responseVersions: [originalVersion, selectedVersion], selectedResponseVersionId: selectedVersion.id };
  conv.messages[2] = { ...selectedVersion.secondMessages[0] };
  uploader.normalizeConversationMessageIdentity(conv);
  conv.messages[2].parentRevision = uploader.getMessageRevision(conv.messages[1]);
  conv.summaries = [
    { id: 'legacy-summary', text: 'Legacy text is retained', coveredStart: 0, coveredEnd: 1 },
    { id: 'verified-summary', text: 'Verified memory', coveredStart: 0, coveredEnd: 1, summaryVersion: 2, sourceMessages: uploader.captureSummarySources(conv.messages.slice(0, 2)) },
  ];
  uploader.refreshSummaryValidity(conv);
  snapshot.settings.apiKey = 'local-api-secret';
  snapshot.settings.summarizeApiKey = 'local-summary-secret';
  snapshot.settings.cloudSyncToken = 'local-sync-secret';
  snapshot.settings = uploader.getCloudSyncPortableSettings(snapshot.settings);
  assert.ok(!JSON.stringify(snapshot).includes('-secret'), 'The portable snapshot must exclude device-local credentials before transport.');

  const uploaded = await uploader.api.uploadSnapshot(snapshot, { exists: false, revision: 0 });
  assert.equal(uploaded.revision, 1);
  const receiver = await makeDevice(emptySnapshot);
  const metadata = await receiver.api.probeMetadata();
  const restored = await receiver.api.downloadSnapshot(metadata);
  assert.deepEqual(JSON.parse(JSON.stringify(restored)), JSON.parse(JSON.stringify(snapshot)),
    'The real v2 client transport and D1 handler must round-trip message identities, sources, versions and unknown fields.');
  const restoredConv = restored.conversations.c1;
  assert.equal(receiver.getSummaryValidity(restoredConv.summaries[0], restoredConv), 'unverified');
  assert.equal(receiver.getSummaryValidity(restoredConv.summaries[1], restoredConv), 'valid');
  assert.equal(restoredConv.messages[1].responseVersions[0].message.content, 'Old answer');
  assert.equal(restoredConv.messages[1].responseVersions[0].secondMessages[0].content, '<options>old options</options>');
  assert.equal(restoredConv.messages[1].selectedResponseVersionId, 'version-selected');
  assert.equal(restoredConv.messages[2].parentRevision, receiver.getMessageRevision(restoredConv.messages[1]));
  assert.ok(restored.__cloudSyncV2Stats.downloadedObjects > 0);

  const reloadedReceiver = await makeDevice(JSON.parse(JSON.stringify(restored)));
  const reused = await reloadedReceiver.api.downloadSnapshot(metadata);
  assert.equal(reused.__cloudSyncV2Stats.downloadedObjects, 0,
    'An identical persisted snapshot should reuse all local objects without discarding new fields.');
  assert.deepEqual(JSON.parse(JSON.stringify(reused.conversations.c1)), JSON.parse(JSON.stringify(restoredConv)));
}

async function testFrontendFallbackAndVersionSelection() {
  const [encryptionSource, uploadSource, transportSource] = await Promise.all([
    readFile(new URL('../src/app/sync/22-cloud-sync-incremental-crypto.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/sync/22-cloud-sync-upload.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/sync/22-cloud-sync-transport.js', import.meta.url), 'utf8'),
  ]);
  const requests = [];
  let v2Uploads = 0;
  const settings = { cloudSyncEncrypted: true };
  const uploadContext = {
    Object,
    Number,
    Date,
    console,
    ensureCloudSyncSettings() { return settings; },
    setCloudSyncPendingStatus() {},
    prepareCloudSyncLocalSnapshotForComparison() { return { lastSaved: 100 }; },
    buildAppDataSnapshot() { return { lastSaved: 200 }; },
    getCloudSyncSelectedRemoteSnapshot(metadata) { return metadata; },
    getCloudSyncFreshness() { return 'same'; },
    getCloudSyncRemoteUpdatedAt(snapshot) { return snapshot && snapshot.__cloudSyncUpdatedAt; },
    async uploadCloudSyncSnapshotV2() { v2Uploads += 1; },
    async encryptCloudSyncSnapshot() { throw new Error('Legacy encryption upload must not be called.'); },
    async requestCloudSync(method, payload, options) {
      requests.push({ method, payload, options });
      return { updatedAt: 555 };
    },
    formatCloudSyncTimestamp() { return 'now'; },
    setCloudSyncStatus() {},
    async persistCloudSyncOperationState() {},
  };
  vm.runInNewContext(`${encryptionSource}\n${uploadSource}\nthis.upload = uploadCloudSyncSnapshot;`, uploadContext);
  await assert.rejects(uploadContext.upload(null, {
    force: true,
    remoteMetadata: { protocol: 2, exists: true, revision: 7 },
  }), /加密上传功能尚未实现|已阻止/);
  assert.equal(v2Uploads, 0, 'Encrypted uploads must be explicitly blocked on v2.');
  assert.equal(requests.length, 0, 'Blocked v2 encryption must not silently upload through v1 or plaintext.');

  await assert.rejects(uploadContext.upload(null, {
    force: true,
    expectedRemoteUpdatedAt: 999,
    remoteMetadata: {
      protocol: 1,
      exists: true,
      snapshot: { lastSaved: 150, __cloudSyncUpdatedAt: 444 },
    },
  }), /加密上传功能尚未实现|已阻止/);
  assert.equal(requests.length, 0, 'Encrypted uploads must also be blocked on legacy v1 without attempting AES-GCM.');

  settings.cloudSyncEncrypted = false;
  await uploadContext.upload(null, {
    force: true,
    expectedRemoteUpdatedAt: 999,
    remoteMetadata: {
      protocol: 1,
      exists: true,
      snapshot: { lastSaved: 150, __cloudSyncUpdatedAt: 444 },
    },
  });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].payload.encrypted, false);
  assert.equal(requests[0].options.expectedUpdatedAt, 999, 'A v1 backend should remain writable as plaintext after encryption is explicitly disabled.');

  const selectionContext = {
    Number,
    Object,
    Math,
    CLOUD_SYNC_TIME_TOLERANCE_MS: 1000,
    getCloudSyncSnapshotLastSaved(value) { return Number(value && value.lastSaved) || 0; },
    getCloudSyncRemoteUpdatedAt(value) { return Number(value && value.__cloudSyncUpdatedAt) || 0; },
  };
  vm.runInNewContext(`${transportSource}\nthis.preferLegacy = preferCloudSyncLegacySnapshot;`, selectionContext);
  const v2 = { exists: true, lastSaved: 2000, updatedAt: 3000 };
  assert.equal(selectionContext.preferLegacy(v2, { lastSaved: 500, __cloudSyncUpdatedAt: 4000 }), false);
  assert.equal(selectionContext.preferLegacy(v2, { lastSaved: 4000, __cloudSyncUpdatedAt: 5000 }), true,
    'A later legacy-client v1 update must become selectable even while v2 exists.');
  assert.equal(selectionContext.preferLegacy(v2, { lastSaved: 2000, __cloudSyncUpdatedAt: 5000 }), false,
    'Equal timestamps must not use transport updatedAt as a second freshness signal.');
}

await testCloudflareSyncV2Protocol();
await testFrontendIncrementalCore();
await testMessageReliabilityD1RoundTrip();
await testFrontendShaFallbackWithoutWebCrypto();
await testStorageServiceRuntimeSnapshotOwnership();
await testV2WriteTransportEncryptionDefense();
await testEncryptionDisablePersistenceRace();
await testEncryptionDisableCancelsQueuedDebounce();
await testEncryptionDisablePersistenceRollback();
await testEncryptionDisableRollbackWithQueuedSettingsClose();
await testSerializedPersistKeepsRealChangeUpload();
await testSerializedPersistFreezesQueuedSnapshots();
await testSerializedPersistKeepsLatestTimestampCache();
await testPersistPostSaveHooksCannotRollbackCommittedData();
await testFrontendFallbackAndVersionSelection();

console.log('sync v2 targeted tests passed');
