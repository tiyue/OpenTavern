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

async function loadFrontendV2Context() {
  const paths = [
    '../src/app/19-conversation-order-helpers.js',
    '../src/app/22-cloud-sync-normalize.js',
    '../src/app/22-cloud-sync-incremental-core.js',
    '../src/app/22-cloud-sync-incremental-crypto.js',
    '../src/app/22-cloud-sync-incremental-operations.js',
  ];
  const sources = await Promise.all(paths.map((path) => readFile(new URL(path, import.meta.url), 'utf8')));
  const uploaded = [];
  const context = {
    crypto: webcrypto,
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
    cloudSyncSettings: { cloudSyncEncrypted: false },
    remoteManifest: null,
    readManifestCalls: 0,
    commitCalls: 0,
    uploaded,
    getCloudSyncWebCryptoApi() { return webcrypto; },
    getCloudSyncWebCryptoUnavailableMessage() { return 'Web Crypto unavailable'; },
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
      uploadSnapshot: uploadCloudSyncSnapshotV2,
      prepareCrypto: prepareCloudSyncV2UploadCrypto,
      encryptionUnsupportedMessage: getCloudSyncV2EncryptionUnsupportedMessage,
      validateManifest: validateCloudSyncV2Manifest,
      validateTransfer: validateCloudSyncV2TransferReference,
      prepareManifest: prepareCloudSyncV2ManifestTransfer
    };`, context);
  return context;
}

async function loadFrontendV2TransportContext() {
  const paths = [
    '../src/app/22-cloud-sync-incremental-core.js',
    '../src/app/22-cloud-sync-incremental-transport.js',
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

async function testFrontendFallbackAndVersionSelection() {
  const [uploadSource, transportSource] = await Promise.all([
    readFile(new URL('../src/app/22-cloud-sync-upload.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/22-cloud-sync-transport.js', import.meta.url), 'utf8'),
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
    disableCloudSyncEncryptionWhenUnavailable() { return false; },
    getCloudSyncFreshness() { return 'same'; },
    getCloudSyncRemoteUpdatedAt(snapshot) { return snapshot && snapshot.__cloudSyncUpdatedAt; },
    async uploadCloudSyncSnapshotV2() { v2Uploads += 1; },
    async encryptCloudSyncSnapshot(snapshot) { return { encrypted: true, lastSaved: snapshot.lastSaved }; },
    async requestCloudSync(method, payload, options) {
      requests.push({ method, payload, options });
      return { updatedAt: 555 };
    },
    formatCloudSyncTimestamp() { return 'now'; },
    setCloudSyncStatus() {},
    async persistCloudSyncOperationState() {},
  };
  vm.runInNewContext(`${uploadSource}\nthis.upload = uploadCloudSyncSnapshot;`, uploadContext);
  await assert.rejects(uploadContext.upload(null, {
    force: true,
    remoteMetadata: { protocol: 2, exists: true, revision: 7 },
  }), /增量同步暂未支持加密|已阻止/);
  assert.equal(v2Uploads, 0, 'Encrypted uploads must be explicitly blocked on v2.');
  assert.equal(requests.length, 0, 'Blocked v2 encryption must not silently upload through v1 or plaintext.');

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
  assert.equal(requests[0].payload.encrypted, true);
  assert.equal(requests[0].options.expectedUpdatedAt, 999, 'A v1 backend must keep the v1 encrypted upload path.');

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
await testFrontendFallbackAndVersionSelection();

console.log('sync v2 targeted tests passed');
