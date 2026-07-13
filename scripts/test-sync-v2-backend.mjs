import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';

import { onRequest } from '../functions/api/sync.js';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const TOKEN = 'opentavern-sync-v2-backend-token';
const CHUNK_BYTES = 393216;
const MIB = 1024 * 1024;
const FORMER_OBJECT_BYTES = 16 * MIB;
const FORMER_TOKEN_BYTES = 64 * MIB;
const COUNT_LIMIT_PROBE_OBJECTS = 4097;

function normalizeSql(sql) {
  return String(sql || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function createMockD1() {
  const v1 = new Map();
  const meta = new Map();
  const chunks = new Map();
  const locks = new Map();
  let beforeCleanup = null;

  const chunkKey = (tokenHash, objectHash, index) => `${tokenHash}:${objectHash}:${index}`;
  const matchingChunks = (tokenHash, objectHash) => [...chunks.values()].filter((row) => (
    row.token_hash === tokenHash && row.object_hash === objectHash
  ));

  function prepare(sql) {
    const normalized = normalizeSql(sql);
    return {
      args: [],
      bind(...args) {
        this.args = args;
        return this;
      },
      async first() {
        if (normalized.includes('from opentavern_sync_v2_meta')) {
          return meta.get(this.args[0]) || null;
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
          const indexes = rows.map((row) => Number(row.chunk_index));
          const totals = rows.map((row) => Number(row.chunk_count));
          return {
            stored_chunks: rows.length,
            min_index: Math.min(...indexes),
            max_index: Math.max(...indexes),
            min_total: Math.min(...totals),
            max_total: Math.max(...totals),
          };
        }
        if (normalized.includes('from opentavern_sync_v2_chunks')) {
          return chunks.get(chunkKey(this.args[0], this.args[1], this.args[2])) || null;
        }
        if (normalized.includes('from opentavern_sync')) {
          return v1.get(this.args[0]) || null;
        }
        throw new Error(`Unsupported mock D1 first() SQL: ${normalized}`);
      },
      async run() {
        if (normalized.startsWith('insert into opentavern_sync_v2_locks')) {
          const [tokenHash, lockId, expiresAt, now] = this.args;
          const current = locks.get(tokenHash);
          if (current && Number(current.expires_at) > Number(now)) {
            return { success: true, meta: { changes: 0 } };
          }
          locks.set(tokenHash, { lock_id: lockId, expires_at: expiresAt });
          return { success: true, meta: { changes: 1 } };
        }
        if (normalized.startsWith('delete from opentavern_sync_v2_locks')) {
          const [tokenHash, lockId] = this.args;
          const current = locks.get(tokenHash);
          if (!current || current.lock_id !== lockId) return { success: true, meta: { changes: 0 } };
          locks.delete(tokenHash);
          return { success: true, meta: { changes: 1 } };
        }
        if (normalized.startsWith('insert into opentavern_sync_v2_chunks')) {
          assert.equal(this.args.length, 7,
            'Chunk writes must bind only chunk fields, without application capacity limits.');
          const [tokenHash, objectHash, index, total, data, chunkHash, createdAt] = this.args;
          const key = chunkKey(tokenHash, objectHash, index);
          if (chunks.has(key)) return { success: true, meta: { changes: 0 } };
          chunks.set(key, {
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
        if (normalized.startsWith('update opentavern_sync_v2_chunks')) {
          const [createdAt, tokenHash, objectHash, index, total, data, chunkHash] = this.args;
          const key = chunkKey(tokenHash, objectHash, index);
          const current = chunks.get(key);
          if (!current
              || Number(current.chunk_count) !== Number(total)
              || current.data !== data
              || current.chunk_hash !== chunkHash) {
            return { success: true, meta: { changes: 0 } };
          }
          current.created_at = createdAt;
          return { success: true, meta: { changes: 1 } };
        }
        if (normalized.startsWith('insert into opentavern_sync_v2_meta')) {
          const [tokenHash, manifestHash, manifestChunks, manifestBytes, revision, updatedAt, lastSaved] = this.args;
          if (meta.has(tokenHash)) return { success: true, meta: { changes: 0 } };
          meta.set(tokenHash, {
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
          const current = meta.get(tokenHash);
          if (!current || Number(current.revision) !== Number(expectedRevision)) {
            return { success: true, meta: { changes: 0 } };
          }
          meta.set(tokenHash, {
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
          const [tokenHash, revision] = this.args;
          const current = meta.get(tokenHash);
          if (!current || Number(current.revision) !== Number(revision)) {
            return { success: true, meta: { changes: 0 } };
          }
          meta.delete(tokenHash);
          return { success: true, meta: { changes: 1 } };
        }
        if (normalized.startsWith('delete from opentavern_sync_v2_chunks')) {
          const tokenHash = this.args[0];
          if (normalized.includes('json_each')) {
            const current = meta.get(this.args[1]);
            if (!current || Number(current.revision) !== Number(this.args[2])
                || current.manifest_hash !== this.args[3]) {
              return { success: true, meta: { changes: 0 } };
            }
            const referenced = new Set(JSON.parse(this.args[4]));
            const cleanupBefore = Number(this.args[5]);
            let changes = 0;
            for (const [key, row] of chunks) {
              if (row.token_hash === tokenHash
                  && !referenced.has(row.object_hash)
                  && (!Number.isFinite(cleanupBefore) || Number(row.created_at) < cleanupBefore)) {
                chunks.delete(key);
                changes += 1;
              }
            }
            return { success: true, meta: { changes } };
          }
          if (meta.has(this.args[1])) return { success: true, meta: { changes: 0 } };
          let changes = 0;
          for (const [key, row] of chunks) {
            if (row.token_hash === tokenHash) {
              chunks.delete(key);
              changes += 1;
            }
          }
          return { success: true, meta: { changes } };
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
  }

  const db = {
    async exec() {},
    prepare,
    async batch(statements) {
      const results = [];
      for (let index = 0; index < statements.length; index += 1) {
        if (index === 1 && beforeCleanup) {
          const hook = beforeCleanup;
          beforeCleanup = null;
          await hook();
        }
        results.push(await statements[index].run());
      }
      return results;
    },
  };
  const seedChunk = ({ tokenHash, objectHash, index, total, data, chunkHash, createdAt = Date.now() }) => {
    chunks.set(chunkKey(tokenHash, objectHash, index), {
      token_hash: tokenHash,
      object_hash: objectHash,
      chunk_index: index,
      chunk_count: total,
      data,
      chunk_hash: chunkHash,
      created_at: createdAt,
    });
  };
  return {
    db,
    v1,
    meta,
    chunks,
    seedChunk,
    setBeforeCleanup(callback) { beforeCleanup = callback; },
  };
}

async function hash(bytes) {
  const digest = new Uint8Array(await webcrypto.subtle.digest('SHA-256', bytes));
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function hashSync(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function seedSingleChunkObject(seedChunk, tokenHash, bytes) {
  const objectHash = hashSync(bytes);
  seedChunk({
    tokenHash,
    objectHash,
    index: 0,
    total: 1,
    data: Buffer.from(bytes).toString('base64'),
    chunkHash: objectHash,
  });
  return { objectHash, bytes: bytes.length, chunks: 1 };
}

function seedRepeatedChunkObject(seedChunk, tokenHash, byteCount, fillByte) {
  const total = Math.ceil(byteCount / CHUNK_BYTES);
  const finalByteCount = byteCount - ((total - 1) * CHUNK_BYTES);
  const fullChunk = new Uint8Array(CHUNK_BYTES).fill(fillByte);
  const finalChunk = new Uint8Array(finalByteCount).fill(fillByte);
  const fullData = Buffer.from(fullChunk).toString('base64');
  const finalData = Buffer.from(finalChunk).toString('base64');
  const fullHash = hashSync(fullChunk);
  const finalHash = hashSync(finalChunk);
  const objectHasher = createHash('sha256');

  for (let index = 0; index < total - 1; index += 1) objectHasher.update(fullChunk);
  objectHasher.update(finalChunk);
  const objectHash = objectHasher.digest('hex');

  for (let index = 0; index < total; index += 1) {
    const isFinal = index === total - 1;
    seedChunk({
      tokenHash,
      objectHash,
      index,
      total,
      data: isFinal ? finalData : fullData,
      chunkHash: isFinal ? finalHash : fullHash,
    });
  }
  return { objectHash, bytes: byteCount, chunks: total };
}

async function invoke(db, method, query = '', body, headers = {}) {
  const requestHeaders = new Headers({ Authorization: `Bearer ${TOKEN}`, ...headers });
  if (body !== undefined) requestHeaders.set('Content-Type', 'application/json');
  return onRequest({
    request: new Request(`https://example.test/api/sync${query ? `?${query}` : ''}`, {
      method,
      headers: requestHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    env: { SYNC_DB: db },
  });
}

async function readJson(response) {
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function uploadObject(db, bytes, objectHash) {
  objectHash = objectHash || await hash(bytes);
  const parts = [];
  for (let offset = 0; offset < bytes.length; offset += CHUNK_BYTES) {
    parts.push(bytes.slice(offset, Math.min(offset + CHUNK_BYTES, bytes.length)));
  }
  for (let index = 0; index < parts.length; index += 1) {
    const response = await invoke(db, 'POST', 'v=2&op=chunk', {
      objectHash,
      chunkHash: await hash(parts[index]),
      index,
      total: parts.length,
      data: Buffer.from(parts[index]).toString('base64'),
    });
    assert.equal(response.status, 200, JSON.stringify(await readJson(response)));
  }
  return { objectHash, bytes: bytes.length, chunks: parts.length };
}

async function uploadManifest(db, object, lastSaved) {
  const bytes = new TextEncoder().encode(JSON.stringify({
    version: 2,
    app: 'OpenTavern',
    lastSaved,
    encrypted: false,
    crypto: null,
    items: { settings: object },
  }));
  return uploadObject(db, bytes);
}

async function commit(db, expectedRevision, manifest, lastSaved, overrides = {}) {
  return invoke(db, 'POST', 'v=2&op=commit', {
    expectedRevision,
    manifestHash: manifest.objectHash,
    manifestChunks: manifest.chunks,
    manifestBytes: manifest.bytes,
    lastSaved,
    ...overrides,
  });
}

async function testRemovedFixedCapacityLimits() {
  const encoder = new TextEncoder();

  const manifestProbe = createMockD1();
  const oversizedManifestBytes = FORMER_OBJECT_BYTES + 1;
  const oversizedManifestChunks = Math.ceil(oversizedManifestBytes / CHUNK_BYTES);
  const probeBytes = encoder.encode('manifest-capacity-probe');
  const probeHash = await hash(probeBytes);
  const probeUpload = await invoke(manifestProbe.db, 'POST', 'v=2&op=chunk', {
    objectHash: probeHash,
    chunkHash: probeHash,
    index: oversizedManifestChunks - 1,
    total: oversizedManifestChunks,
    data: Buffer.from(probeBytes).toString('base64'),
  });
  assert.equal(probeUpload.status, 200, JSON.stringify(await readJson(probeUpload)));

  const probeCommit = await invoke(manifestProbe.db, 'POST', 'v=2&op=commit', {
    expectedRevision: 0,
    manifestHash: probeHash,
    manifestChunks: oversizedManifestChunks,
    manifestBytes: oversizedManifestBytes,
    lastSaved: 1_780_000_000_000,
  });
  const probeError = await readJson(probeCommit);
  assert.equal(probeCommit.status, 400);
  assert.match(probeError.error, /Manifest chunks are incomplete or inconsistent/,
    'Manifest metadata beyond the former size limit must reach integrity checks, not a capacity rejection.');

  const { db, chunks, seedChunk } = createMockD1();
  const tokenHash = await hash(encoder.encode(TOKEN));
  const lastSaved = 1_780_000_100_000;
  const items = {};
  let referencedBytes = 0;
  let referencedChunks = 0;

  for (let index = 0; index < 4; index += 1) {
    const object = seedRepeatedChunkObject(
      seedChunk,
      tokenHash,
      FORMER_OBJECT_BYTES + 1,
      index + 1,
    );
    items[`large:${index}`] = object;
    referencedBytes += object.bytes;
    referencedChunks += object.chunks;
  }
  assert.ok(referencedBytes > FORMER_TOKEN_BYTES);

  for (let index = 0; index < COUNT_LIMIT_PROBE_OBJECTS; index += 1) {
    const object = seedSingleChunkObject(
      seedChunk,
      tokenHash,
      encoder.encode(`count-capacity-probe-${index}`),
    );
    items[`small:${index}`] = object;
    referencedBytes += object.bytes;
    referencedChunks += object.chunks;
  }
  assert.ok(Object.keys(items).length > 1024);
  assert.ok(referencedChunks > 4096);

  const manifestBytes = encoder.encode(JSON.stringify({
    version: 2,
    app: 'OpenTavern',
    lastSaved,
    encrypted: false,
    crypto: null,
    items,
  }));
  const manifest = await uploadObject(db, manifestBytes);
  const response = await commit(db, 0, manifest, lastSaved);
  const body = await readJson(response);

  assert.equal(response.status, 200, JSON.stringify(body));
  assert.equal(body.revision, 1);
  assert.equal(chunks.size, referencedChunks + manifest.chunks,
    'A valid commit beyond former object, chunk, and total-byte limits must retain every referenced chunk.');
}

async function main() {
  await testRemovedFixedCapacityLimits();

  const { db, v1, chunks } = createMockD1();
  const encoder = new TextEncoder();
  const lastSaved = 1_780_000_000_000;

  const badBytes = encoder.encode('wrong object bytes');
  const falseObjectHash = await hash(encoder.encode('different bytes'));
  const badObject = await uploadObject(db, badBytes, falseObjectHash);
  const badManifest = await uploadManifest(db, badObject, lastSaved);

  const badManifestBytesResponse = await commit(db, 0, badManifest, lastSaved, {
    manifestBytes: badManifest.bytes + 1,
  });
  assert.equal(badManifestBytesResponse.status, 400);
  assert.match((await readJson(badManifestBytesResponse)).error, /byte length|manifestBytes/i);

  const badObjectHashResponse = await commit(db, 0, badManifest, lastSaved);
  assert.equal(badObjectHashResponse.status, 400);
  assert.match((await readJson(badObjectHashResponse)).error, /hash does not match/i);

  const objectA = await uploadObject(db, encoder.encode('{"theme":"light"}'));
  const manifestA = await uploadManifest(db, objectA, lastSaved + 1);
  const commitA = await commit(db, 0, manifestA, lastSaved + 1);
  assert.equal(commitA.status, 200, JSON.stringify(await readJson(commitA)));
  assert.deepEqual(new Set([...chunks.values()].map((row) => row.object_hash)), new Set([
    objectA.objectHash,
    manifestA.objectHash,
  ]), 'Commit must remove chunks not referenced by the current manifest.');

  const idempotentA = await uploadObject(db, encoder.encode('{"theme":"light"}'), objectA.objectHash);
  assert.equal(idempotentA.objectHash, objectA.objectHash);
  const originalA = [...chunks.values()].find((row) => row.object_hash === objectA.objectHash && row.chunk_index === 0);
  const replacementBytes = encoder.encode('{"theme":"corrupted"}');
  const conflictingChunk = await invoke(db, 'POST', 'v=2&op=chunk', {
    objectHash: objectA.objectHash,
    chunkHash: await hash(replacementBytes),
    index: 0,
    total: 1,
    data: Buffer.from(replacementBytes).toString('base64'),
  });
  assert.equal(conflictingChunk.status, 409);
  assert.match((await readJson(conflictingChunk)).error, /conflicts with existing/i);
  assert.equal(
    [...chunks.values()].find((row) => row.object_hash === objectA.objectHash && row.chunk_index === 0).data,
    originalA.data,
    'A conflicting chunk upload must not overwrite committed content-addressed data.',
  );

  const objectB = await uploadObject(db, encoder.encode('{"theme":"dark"}'));
  const manifestB = await uploadManifest(db, objectB, lastSaved + 2);
  const commitB = await commit(db, 1, manifestB, lastSaved + 2);
  assert.equal(commitB.status, 200, JSON.stringify(await readJson(commitB)));
  assert.deepEqual(new Set([...chunks.values()].map((row) => row.object_hash)), new Set([
    objectB.objectHash,
    manifestB.objectHash,
  ]), 'A newer commit must retain only its manifest and referenced objects.');

  const raceProbe = createMockD1();
  const raceObject = await uploadObject(raceProbe.db, encoder.encode('{"theme":"race"}'));
  const raceManifest = await uploadManifest(raceProbe.db, raceObject, lastSaved + 3);
  const retriedBytes = encoder.encode('old uncommitted object retried during commit');
  const retriedObject = await uploadObject(raceProbe.db, retriedBytes);
  for (const row of raceProbe.chunks.values()) {
    if (row.object_hash === retriedObject.objectHash) row.created_at = 1;
  }
  let concurrentObject = null;
  raceProbe.setBeforeCleanup(async () => {
    await uploadObject(raceProbe.db, retriedBytes, retriedObject.objectHash);
    concurrentObject = await uploadObject(raceProbe.db, encoder.encode('concurrent uncommitted object'));
  });
  const raceCommit = await commit(raceProbe.db, 0, raceManifest, lastSaved + 3);
  assert.equal(raceCommit.status, 200, JSON.stringify(await readJson(raceCommit)));
  assert.ok(concurrentObject && [...raceProbe.chunks.values()].some(
    (row) => row.object_hash === concurrentObject.objectHash,
  ), 'Commit cleanup must preserve chunks uploaded after the commit started.');
  assert.ok([...raceProbe.chunks.values()].some(
    (row) => row.object_hash === retriedObject.objectHash,
  ), 'Commit cleanup must preserve an old orphan chunk that was idempotently retried after the commit started.');

  const deleted = await invoke(db, 'DELETE', 'v=2', undefined, { 'If-Match': '"2"' });
  assert.equal(deleted.status, 200);
  assert.equal(chunks.size, 0, 'DELETE must clean all orphaned chunks for the token.');

  const v1Response = await invoke(db, 'POST', '', {
    settings: { theme: 'legacy' },
    conversations: {},
    characters: {},
    worldBooks: {},
    conversationOrder: [],
    activeConvId: null,
    charactersMigrated: false,
    lastSaved: lastSaved,
  });
  assert.equal(v1Response.status, 200);
  assert.equal(v1.size, 1, 'v1 storage must remain compatible.');

  console.log('sync v2 backend capacity, integrity and cleanup tests passed');
}

await main();
