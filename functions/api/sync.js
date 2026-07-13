/**
 * 新手导读：这是 Cloudflare Pages 版本的云同步后端。
 *
 * “快照”是一份包含设置、角色和聊天记录的 JSON 文本。客户端带着同步令牌请求
 * 本接口；v1 保留完整快照 CRUD 兼容，v2 使用内容寻址分块和清单提交实现增量同步，
 * 不再对完整快照设置人为大小上限。HEAD 只返回 v1 元数据，OPTIONS 处理跨域预检。
 *
 * ETag 和 updated_at 用于并发保护：如果两台设备同时修改数据，旧版本不能静默覆盖
 * 新版本。这里处理的是用户私人数据，切勿在日志或错误响应中输出令牌和快照正文。
 * 辅助函数负责统一响应头、验证数据和创建数据库表，最下面的 onRequest 是总入口。
 */
const SYNC_V2_CHUNK_BYTES = 393216;
const SYNC_V2_MAX_ENCODED_CHARS = 600000;
const SYNC_V2_MUTATION_LOCK_MS = 5 * 60 * 1000;

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, If-Match, X-OpenTavern-If-Match-Updated-At, X-OpenTavern-Token',
    'Access-Control-Expose-Headers': 'ETag, X-OpenTavern-Updated-At, X-OpenTavern-Data-Bytes, X-OpenTavern-Encrypted, X-OpenTavern-Exists, X-OpenTavern-Revision, X-OpenTavern-Protocol',
  };
}

function responseHeaders(headers = {}) {
  return {
    ...corsHeaders(),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  };
}

function json(data, init = {}) {
  return Response.json(data, {
    ...init,
    headers: responseHeaders(init.headers || {}),
  });
}

function empty(init = {}) {
  return new Response(null, {
    ...init,
    headers: responseHeaders(init.headers || {}),
  });
}

function getToken(request) {
  const auth = request.headers.get('Authorization') || '';
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return (request.headers.get('X-OpenTavern-Token') || '').trim();
}

function validateToken(token) {
  if (!token || token.length < 8) {
    return 'A sync token with at least 8 characters is required.';
  }
  if (token.length > 512) {
    return 'Sync token is too long.';
  }
  return null;
}

async function sha256(text) {
  const bytes = new TextEncoder().encode(text);
  return await sha256Bytes(bytes);
}

async function sha256Bytes(bytes) {
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function ensureTable(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS opentavern_sync (
      token_hash TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS opentavern_sync_v2_meta (
      token_hash TEXT PRIMARY KEY,
      manifest_hash TEXT NOT NULL,
      manifest_chunks INTEGER NOT NULL,
      manifest_bytes INTEGER NOT NULL,
      revision INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      last_saved INTEGER NOT NULL
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS opentavern_sync_v2_chunks (
      token_hash TEXT NOT NULL,
      object_hash TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      chunk_count INTEGER NOT NULL,
      data TEXT NOT NULL,
      chunk_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (token_hash, object_hash, chunk_index)
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS opentavern_sync_v2_locks (
      token_hash TEXT PRIMARY KEY,
      lock_id TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    )
  `);
}

function byteLength(text) {
  return new TextEncoder().encode(text).length;
}

function isHealthCheck(request) {
  const url = new URL(request.url);
  return url.searchParams.get('health') === '1';
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeObjectMap(value) {
  return isPlainObject(value) ? value : {};
}

function normalizeTimestamp(value, fallback = Date.now()) {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) ? timestamp : fallback;
}

function normalizeBoolean(value) {
  if (value === true || value === 1) return true;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === 'yes' || normalized === '1';
  }
  return false;
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function normalizeEncryptedIterations(value) {
  const iterations = value === undefined || value === null || value === '' ? 210000 : Number(value);
  if (!Number.isFinite(iterations) || iterations < 1) {
    throw new Error('Invalid encrypted sync payload.');
  }
  return Math.floor(iterations);
}

function validateEncryptedSnapshot(snapshot) {
  if (!isNonEmptyString(snapshot.payload) || !isNonEmptyString(snapshot.iv) || !isNonEmptyString(snapshot.salt)) {
    throw new Error('Invalid encrypted sync payload.');
  }
  if (snapshot.algorithm !== 'AES-GCM') {
    throw new Error('Unsupported encrypted sync payload algorithm.');
  }
  if (snapshot.kdf !== undefined && snapshot.kdf !== 'PBKDF2-SHA256') {
    throw new Error('Unsupported encrypted sync payload key derivation.');
  }
  snapshot.iterations = normalizeEncryptedIterations(snapshot.iterations);
}

function normalizeConversationOrder(snapshot) {
  const conversationIds = Object.keys(snapshot.conversations);
  const knownConversationIds = new Set(conversationIds);
  const seenIds = new Set();
  const order = [];

  if (Array.isArray(snapshot.conversationOrder)) {
    for (const id of snapshot.conversationOrder) {
      if (!knownConversationIds.has(id) || seenIds.has(id)) continue;
      seenIds.add(id);
      order.push(id);
    }
  }

  for (const id of conversationIds) {
    if (seenIds.has(id)) continue;
    seenIds.add(id);
    order.push(id);
  }

  snapshot.conversationOrder = order;
}

function normalizeActiveConversation(snapshot) {
  const knownConversationIds = new Set(Object.keys(snapshot.conversations));
  if (!knownConversationIds.has(snapshot.activeConvId)) {
    snapshot.activeConvId = snapshot.conversationOrder[0] || null;
  }
}

function extractSnapshot(body) {
  const snapshot = body && body.data !== undefined ? body.data : body;
  if (!isPlainObject(snapshot)) throw new Error('Invalid sync payload.');
  if (body && body.encrypted === true) snapshot.encrypted = true;
  if (snapshot.encrypted === true) {
    validateEncryptedSnapshot(snapshot);
    snapshot.lastSaved = normalizeTimestamp(snapshot.lastSaved || body.updatedAt);
    return snapshot;
  }
  snapshot.conversations = normalizeObjectMap(snapshot.conversations);
  snapshot.settings = normalizeObjectMap(snapshot.settings);
  snapshot.characters = normalizeObjectMap(snapshot.characters);
  snapshot.worldBooks = normalizeObjectMap(snapshot.worldBooks);
  normalizeConversationOrder(snapshot);
  normalizeActiveConversation(snapshot);
  snapshot.charactersMigrated = normalizeBoolean(snapshot.charactersMigrated);
  snapshot.lastSaved = normalizeTimestamp(snapshot.lastSaved);
  return snapshot;
}

function formatSyncEtag(updatedAt) {
  return `"${Number(updatedAt || 0)}"`;
}

function parseExpectedUpdatedAt(request) {
  const explicit = request.headers.get('X-OpenTavern-If-Match-Updated-At');
  const ifMatch = request.headers.get('If-Match');
  const raw = explicit || ifMatch;
  if (!raw) return null;
  const normalized = raw.trim().replace(/^W\//, '').replace(/^"|"$/g, '');
  if (normalized === '*') return '*';
  const timestamp = Number(normalized);
  if (!Number.isFinite(timestamp) || timestamp < 0) {
    throw new Error('Invalid sync precondition timestamp.');
  }
  return Math.floor(timestamp);
}

function assertSyncPrecondition(expectedUpdatedAt, currentRow) {
  if (expectedUpdatedAt === null) return;
  if (expectedUpdatedAt === '*') {
    if (!currentRow) throw new Error('Cloud snapshot does not exist.');
    return;
  }
  const currentUpdatedAt = currentRow ? Number(currentRow.updated_at || 0) : 0;
  if (currentUpdatedAt !== expectedUpdatedAt) {
    const error = new Error('Cloud snapshot was modified by another client.');
    error.status = 409;
    error.currentUpdatedAt = currentRow ? currentUpdatedAt : null;
    throw error;
  }
}

function getNextUpdatedAt(currentRow) {
  const now = Date.now();
  const currentUpdatedAt = Number(currentRow && currentRow.updated_at || 0) || 0;
  return now <= currentUpdatedAt ? currentUpdatedAt + 1 : now;
}

function syncMetadataHeaders(row, data, extra = {}) {
  const headers = { ...extra };
  if (!row) return headers;
  const dataText = data === undefined ? row.data : data;
  headers.ETag = formatSyncEtag(row.updated_at);
  headers['X-OpenTavern-Updated-At'] = String(row.updated_at);
  headers['X-OpenTavern-Data-Bytes'] = String(byteLength(dataText || ''));
  try {
    const parsed = JSON.parse(dataText);
    headers['X-OpenTavern-Encrypted'] = parsed && parsed.encrypted === true ? 'true' : 'false';
  } catch (_) {}
  return headers;
}

async function readSyncRow(db, tokenHash) {
  return await db
    .prepare('SELECT data, updated_at FROM opentavern_sync WHERE token_hash = ?')
    .bind(tokenHash)
    .first();
}

function isSyncV2(request) {
  return new URL(request.url).searchParams.get('v') === '2';
}

function isSha256Hex(value) {
  return typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value);
}

function requireInteger(value, name, minimum, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}.`);
  }
  return value;
}

function parseQueryInteger(value, name, minimum, maximum) {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new Error(`${name} must be a non-negative integer.`);
  }
  return requireInteger(Number(value), name, minimum, maximum);
}

function decodeBase64Chunk(data) {
  if (typeof data !== 'string') throw new Error('data must be a base64 string.');
  if (data.length > SYNC_V2_MAX_ENCODED_CHARS) {
    const error = new Error(`Encoded chunk data exceeds ${SYNC_V2_MAX_ENCODED_CHARS} characters.`);
    error.status = 413;
    throw error;
  }
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data)) {
    throw new Error('data is not valid base64.');
  }

  let binary;
  try {
    binary = atob(data);
  } catch (_) {
    throw new Error('data is not valid base64.');
  }

  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function syncV2MetadataHeaders(row, extra = {}) {
  const headers = {
    'X-OpenTavern-Protocol': '2',
    'X-OpenTavern-Revision': String(row ? Number(row.revision) : 0),
    ...extra,
  };
  if (!row) return headers;
  headers.ETag = formatSyncEtag(row.revision);
  headers['X-OpenTavern-Updated-At'] = String(row.updated_at);
  return headers;
}

async function readSyncV2Meta(db, tokenHash) {
  return await db
    .prepare(`
      SELECT manifest_hash, manifest_chunks, manifest_bytes, revision, updated_at, last_saved
      FROM opentavern_sync_v2_meta
      WHERE token_hash = ?
    `)
    .bind(tokenHash)
    .first();
}

function resultChanges(result) {
  return Number((result && result.meta && result.meta.changes) || (result && result.changes) || 0);
}

function parseExpectedRevision(request) {
  const raw = request.headers.get('If-Match');
  if (!raw) return null;
  let normalized = raw.trim();
  if (normalized.startsWith('W/')) normalized = normalized.slice(2).trim();
  if (normalized.startsWith('"') || normalized.endsWith('"')) {
    if (normalized.length < 2 || !normalized.startsWith('"') || !normalized.endsWith('"')) {
      throw new Error('If-Match revision has invalid quotes.');
    }
    normalized = normalized.slice(1, -1);
  }
  return parseQueryInteger(normalized, 'If-Match revision', 0, Number.MAX_SAFE_INTEGER);
}

function syncV2Conflict(currentRow) {
  return json({
    success: false,
    error: 'Cloud manifest was modified by another client.',
    currentRevision: currentRow ? Number(currentRow.revision) : 0,
    currentUpdatedAt: currentRow ? Number(currentRow.updated_at) : null,
  }, {
    status: 409,
    headers: syncV2MetadataHeaders(currentRow),
  });
}

async function handleSyncV2Meta(db, tokenHash) {
  const row = await readSyncV2Meta(db, tokenHash);
  if (!row) {
    return json({ success: true, exists: false, protocol: 2, revision: 0 }, {
      headers: syncV2MetadataHeaders(null),
    });
  }

  return json({
    success: true,
    exists: true,
    protocol: 2,
    manifestHash: row.manifest_hash,
    manifestChunks: Number(row.manifest_chunks),
    manifestBytes: Number(row.manifest_bytes),
    revision: Number(row.revision),
    updatedAt: Number(row.updated_at),
    lastSaved: Number(row.last_saved),
  }, {
    headers: syncV2MetadataHeaders(row),
  });
}

async function handleSyncV2GetChunk(request, db, tokenHash) {
  const url = new URL(request.url);
  const objectHash = (url.searchParams.get('hash') || '').toLowerCase();
  if (!isSha256Hex(objectHash)) {
    return json({ success: false, error: 'hash must be a 64-character hexadecimal SHA-256 value.' }, { status: 400 });
  }

  let index;
  try {
    index = parseQueryInteger(url.searchParams.get('index'), 'index', 0, Number.MAX_SAFE_INTEGER);
  } catch (error) {
    return json({ success: false, error: error.message }, { status: 400 });
  }

  const row = await db
    .prepare(`
      SELECT data, chunk_hash, chunk_index, chunk_count
      FROM opentavern_sync_v2_chunks
      WHERE token_hash = ? AND object_hash = ? AND chunk_index = ?
    `)
    .bind(tokenHash, objectHash, index)
    .first();

  if (!row) {
    return json({ success: false, error: 'Sync chunk was not found.' }, {
      status: 404,
      headers: { 'X-OpenTavern-Protocol': '2' },
    });
  }

  return json({
    success: true,
    data: row.data,
    chunkHash: row.chunk_hash,
    index: Number(row.chunk_index),
    total: Number(row.chunk_count),
  }, {
    headers: { 'X-OpenTavern-Protocol': '2' },
  });
}

async function handleSyncV2PostChunk(request, db, tokenHash) {
  const body = await request.json().catch(() => null);
  if (!isPlainObject(body)) {
    return json({ success: false, error: 'Invalid chunk payload.' }, { status: 400 });
  }

  const objectHash = typeof body.objectHash === 'string' ? body.objectHash.toLowerCase() : '';
  const chunkHash = typeof body.chunkHash === 'string' ? body.chunkHash.toLowerCase() : '';
  if (!isSha256Hex(objectHash)) {
    return json({ success: false, error: 'objectHash must be a 64-character hexadecimal SHA-256 value.' }, { status: 400 });
  }
  if (!isSha256Hex(chunkHash)) {
    return json({ success: false, error: 'chunkHash must be a 64-character hexadecimal SHA-256 value.' }, { status: 400 });
  }

  let index;
  let total;
  let bytes;
  try {
    total = requireInteger(body.total, 'total', 1);
    index = requireInteger(body.index, 'index', 0, total - 1);
    bytes = decodeBase64Chunk(body.data);
    if (bytes.length < 1) {
      throw new Error('Decoded chunk data must not be empty.');
    }
    if (bytes.length > SYNC_V2_CHUNK_BYTES) {
      const error = new Error(`Decoded chunk data exceeds ${SYNC_V2_CHUNK_BYTES} bytes.`);
      error.status = 413;
      throw error;
    }
    if (index < total - 1 && bytes.length !== SYNC_V2_CHUNK_BYTES) {
      throw new Error(`Every non-final chunk must contain exactly ${SYNC_V2_CHUNK_BYTES} bytes.`);
    }
  } catch (error) {
    return json({ success: false, error: error.message || 'Invalid chunk payload.' }, {
      status: error.status || 400,
      headers: { 'X-OpenTavern-Protocol': '2' },
    });
  }

  const computedChunkHash = await sha256Bytes(bytes);
  if (computedChunkHash !== chunkHash) {
    return json({ success: false, error: 'chunkHash does not match the decoded chunk data.' }, { status: 400 });
  }

  const result = await db
    .prepare(`
      INSERT INTO opentavern_sync_v2_chunks (
        token_hash, object_hash, chunk_index, chunk_count, data, chunk_hash, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(token_hash, object_hash, chunk_index) DO UPDATE SET
        chunk_count = excluded.chunk_count,
        data = excluded.data,
        chunk_hash = excluded.chunk_hash,
        created_at = excluded.created_at
    `)
    .bind(
      tokenHash, objectHash, index, total, body.data, chunkHash, Date.now(),
    )
    .run();

  if (resultChanges(result) !== 1) {
    return json({ success: false, error: 'Sync chunk could not be stored.' }, {
      status: 500,
      headers: { 'X-OpenTavern-Protocol': '2' },
    });
  }

  return json({
    success: true,
    uploaded: true,
    objectHash,
    index,
    total,
    chunkHash,
  }, {
    headers: { 'X-OpenTavern-Protocol': '2' },
  });
}

async function readManifestChunkState(db, tokenHash, manifestHash) {
  return await db
    .prepare(`
      SELECT
        COUNT(*) AS stored_chunks,
        MIN(chunk_index) AS min_index,
        MAX(chunk_index) AS max_index,
        MIN(chunk_count) AS min_total,
        MAX(chunk_count) AS max_total
      FROM opentavern_sync_v2_chunks
      WHERE token_hash = ? AND object_hash = ?
    `)
    .bind(tokenHash, manifestHash)
    .first();
}

function manifestChunksAreComplete(state, expectedChunks) {
  return state
    && Number(state.stored_chunks) === expectedChunks
    && Number(state.min_index) === 0
    && Number(state.max_index) === expectedChunks - 1
    && Number(state.min_total) === expectedChunks
    && Number(state.max_total) === expectedChunks;
}

function syncV2ClientError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  error.isSyncV2ClientError = true;
  return error;
}

async function readVerifiedSyncV2Object(db, tokenHash, objectHash, expectedChunks, expectedBytes, label) {
  if (!Number.isSafeInteger(expectedBytes) || expectedBytes < 1
      || !Number.isSafeInteger(expectedChunks) || expectedChunks < 1
      || Math.ceil(expectedBytes / SYNC_V2_CHUNK_BYTES) !== expectedChunks) {
    throw syncV2ClientError(`${label} has invalid chunk metadata.`);
  }

  const state = await readManifestChunkState(db, tokenHash, objectHash);
  if (!manifestChunksAreComplete(state, expectedChunks)) {
    throw syncV2ClientError(`${label} chunks are incomplete or inconsistent.`);
  }

  const combined = new Uint8Array(expectedBytes);
  let offset = 0;
  for (let index = 0; index < expectedChunks; index += 1) {
    const row = await db
      .prepare(`
        SELECT data, chunk_hash, chunk_index, chunk_count
        FROM opentavern_sync_v2_chunks
        WHERE token_hash = ? AND object_hash = ? AND chunk_index = ?
      `)
      .bind(tokenHash, objectHash, index)
      .first();
    if (!row || Number(row.chunk_index) !== index || Number(row.chunk_count) !== expectedChunks) {
      throw syncV2ClientError(`${label} chunks are incomplete or inconsistent.`);
    }

    let bytes;
    try {
      bytes = decodeBase64Chunk(row.data);
    } catch (_) {
      throw syncV2ClientError(`${label} contains invalid stored chunk data.`);
    }
    if (bytes.length < 1 || bytes.length > SYNC_V2_CHUNK_BYTES
        || (index < expectedChunks - 1 && bytes.length !== SYNC_V2_CHUNK_BYTES)
        || offset + bytes.length > expectedBytes) {
      throw syncV2ClientError(`${label} byte length does not match its chunk metadata.`);
    }
    if (await sha256Bytes(bytes) !== String(row.chunk_hash || '').toLowerCase()) {
      throw syncV2ClientError(`${label} contains a chunk whose hash does not match its data.`);
    }
    combined.set(bytes, offset);
    offset += bytes.length;
  }

  if (offset !== expectedBytes) {
    throw syncV2ClientError(`${label} byte length does not match the declared byte length.`);
  }
  if (await sha256Bytes(combined) !== objectHash) {
    throw syncV2ClientError(`${label} hash does not match the concatenated chunk data.`);
  }
  return combined;
}

function parseSyncV2ManifestReferences(bytes, manifestHash, manifestChunks, manifestBytes) {
  let manifest;
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    manifest = JSON.parse(text);
  } catch (_) {
    throw syncV2ClientError('Manifest data must be valid UTF-8 JSON.');
  }
  if (!isPlainObject(manifest) || !isPlainObject(manifest.items)) {
    throw syncV2ClientError('Manifest must contain an object-valued items index.');
  }

  const references = new Map();
  references.set(manifestHash, {
    objectHash: manifestHash,
    chunks: manifestChunks,
    bytes: manifestBytes,
    label: 'Manifest',
  });

  for (const [itemKey, descriptor] of Object.entries(manifest.items)) {
    if (!isPlainObject(descriptor)) {
      throw syncV2ClientError(`Manifest item ${itemKey} has an invalid descriptor.`);
    }
    const objectHash = typeof descriptor.objectHash === 'string' ? descriptor.objectHash.toLowerCase() : '';
    if (!isSha256Hex(objectHash)) {
      throw syncV2ClientError(`Manifest item ${itemKey} has an invalid objectHash.`);
    }

    let chunks;
    let objectBytes;
    try {
      chunks = requireInteger(descriptor.chunks, `Manifest item ${itemKey} chunks`, 1);
      objectBytes = requireInteger(descriptor.bytes, `Manifest item ${itemKey} bytes`, 1);
    } catch (error) {
      throw syncV2ClientError(error.message, 400);
    }
    if (Math.ceil(objectBytes / SYNC_V2_CHUNK_BYTES) !== chunks) {
      throw syncV2ClientError(`Manifest item ${itemKey} has inconsistent byte and chunk counts.`);
    }

    const existing = references.get(objectHash);
    if (existing && (existing.chunks !== chunks || existing.bytes !== objectBytes)) {
      throw syncV2ClientError(`Manifest item ${itemKey} conflicts with another reference to the same objectHash.`);
    }
    if (!existing) {
      references.set(objectHash, {
        objectHash,
        chunks,
        bytes: objectBytes,
        label: `Manifest item ${itemKey}`,
      });
    }
  }
  return { manifest, references };
}

async function acquireSyncV2MutationLock(db, tokenHash) {
  if (typeof db.batch !== 'function') return { acquired: true, lockId: null };
  const now = Date.now();
  const lockId = typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${now}-${Math.random().toString(16).slice(2)}`;
  const result = await db
    .prepare(`
      INSERT INTO opentavern_sync_v2_locks (token_hash, lock_id, expires_at)
      VALUES (?, ?, ?)
      ON CONFLICT(token_hash) DO UPDATE SET
        lock_id = excluded.lock_id,
        expires_at = excluded.expires_at
      WHERE opentavern_sync_v2_locks.expires_at <= ?
    `)
    .bind(tokenHash, lockId, now + SYNC_V2_MUTATION_LOCK_MS, now)
    .run();
  return { acquired: resultChanges(result) === 1, lockId };
}

async function releaseSyncV2MutationLock(db, tokenHash, lockId) {
  if (!lockId) return;
  await db
    .prepare('DELETE FROM opentavern_sync_v2_locks WHERE token_hash = ? AND lock_id = ?')
    .bind(tokenHash, lockId)
    .run();
}

function syncV2MutationBusy() {
  return json({
    success: false,
    error: 'Another sync v2 commit or delete is already in progress for this token.',
  }, {
    status: 409,
    headers: { 'X-OpenTavern-Protocol': '2', 'Retry-After': '1' },
  });
}

async function runSyncV2MutationAndCleanup(db, mutation, cleanup) {
  if (typeof db.batch === 'function') return await db.batch([mutation, cleanup]);
  return [await mutation.run()];
}

async function runSyncV2CleanupOnly(db, cleanup) {
  if (typeof db.batch === 'function') return await db.batch([cleanup]);
  return [];
}

async function handleSyncV2Commit(request, db, tokenHash) {
  const body = await request.json().catch(() => null);
  if (!isPlainObject(body)) {
    return json({ success: false, error: 'Invalid commit payload.' }, { status: 400 });
  }

  const manifestHash = typeof body.manifestHash === 'string' ? body.manifestHash.toLowerCase() : '';
  if (!isSha256Hex(manifestHash)) {
    return json({ success: false, error: 'manifestHash must be a 64-character hexadecimal SHA-256 value.' }, { status: 400 });
  }

  let expectedRevision;
  let manifestChunks;
  let manifestBytes;
  let lastSaved;
  try {
    expectedRevision = requireInteger(body.expectedRevision, 'expectedRevision', 0);
    manifestChunks = requireInteger(body.manifestChunks, 'manifestChunks', 1);
    manifestBytes = requireInteger(body.manifestBytes, 'manifestBytes', 1);
    lastSaved = requireInteger(body.lastSaved, 'lastSaved', 0);
  } catch (error) {
    return json({ success: false, error: error.message || 'Invalid commit payload.' }, { status: 400 });
  }
  if (Math.ceil(manifestBytes / SYNC_V2_CHUNK_BYTES) !== manifestChunks) {
    return json({ success: false, error: 'manifestBytes does not match manifestChunks.' }, { status: 400 });
  }

  const lock = await acquireSyncV2MutationLock(db, tokenHash);
  if (!lock.acquired) return syncV2MutationBusy();

  let currentRow = null;
  try {
    currentRow = await readSyncV2Meta(db, tokenHash);
    const currentRevision = currentRow ? Number(currentRow.revision) : 0;
    if (expectedRevision !== currentRevision) return syncV2Conflict(currentRow);

    const manifestData = await readVerifiedSyncV2Object(
      db, tokenHash, manifestHash, manifestChunks, manifestBytes, 'Manifest',
    );
    const { references } = parseSyncV2ManifestReferences(
      manifestData, manifestHash, manifestChunks, manifestBytes,
    );
    for (const reference of references.values()) {
      if (reference.objectHash === manifestHash) continue;
      await readVerifiedSyncV2Object(
        db, tokenHash, reference.objectHash, reference.chunks, reference.bytes, reference.label,
      );
    }

    const revision = currentRevision + 1;
    const updatedAt = getNextUpdatedAt(currentRow);
    let mutation;
    if (currentRow) {
      mutation = db
        .prepare(`
          UPDATE opentavern_sync_v2_meta
          SET manifest_hash = ?, manifest_chunks = ?, manifest_bytes = ?,
              revision = ?, updated_at = ?, last_saved = ?
          WHERE token_hash = ? AND revision = ?
        `)
        .bind(
          manifestHash, manifestChunks, manifestBytes, revision, updatedAt, lastSaved,
          tokenHash, currentRevision,
        );
    } else {
      mutation = db
        .prepare(`
          INSERT INTO opentavern_sync_v2_meta (
            token_hash, manifest_hash, manifest_chunks, manifest_bytes, revision, updated_at, last_saved
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(token_hash) DO NOTHING
        `)
        .bind(tokenHash, manifestHash, manifestChunks, manifestBytes, revision, updatedAt, lastSaved);
    }

    const referencedHashes = JSON.stringify([...references.keys()]);
    const cleanup = db
      .prepare(`
        DELETE FROM opentavern_sync_v2_chunks
        WHERE token_hash = ?
          AND EXISTS (
            SELECT 1 FROM opentavern_sync_v2_meta
            WHERE token_hash = ? AND revision = ? AND manifest_hash = ?
          )
          AND NOT EXISTS (
            SELECT 1 FROM json_each(?) AS referenced
            WHERE referenced.value = opentavern_sync_v2_chunks.object_hash
          )
      `)
      .bind(tokenHash, tokenHash, revision, manifestHash, referencedHashes);
    const results = await runSyncV2MutationAndCleanup(db, mutation, cleanup);
    if (resultChanges(results[0]) !== 1) {
      return syncV2Conflict(await readSyncV2Meta(db, tokenHash));
    }

    const committedRow = {
      manifest_hash: manifestHash,
      manifest_chunks: manifestChunks,
      manifest_bytes: manifestBytes,
      revision,
      updated_at: updatedAt,
      last_saved: lastSaved,
    };
    return json({
      success: true,
      protocol: 2,
      revision,
      updatedAt,
      lastSaved,
      manifestHash,
      manifestChunks,
      manifestBytes,
    }, {
      headers: syncV2MetadataHeaders(committedRow),
    });
  } catch (error) {
    if (!error || !error.isSyncV2ClientError) throw error;
    return json({ success: false, error: error.message }, {
      status: error.status || 400,
      headers: syncV2MetadataHeaders(currentRow),
    });
  } finally {
    try {
      await releaseSyncV2MutationLock(db, tokenHash, lock.lockId);
    } catch (_) {}
  }
}

async function handleSyncV2Delete(request, db, tokenHash) {
  let expectedRevision;
  try {
    expectedRevision = parseExpectedRevision(request);
  } catch (error) {
    return json({ success: false, error: error.message || 'Invalid revision precondition.' }, { status: 400 });
  }

  const lock = await acquireSyncV2MutationLock(db, tokenHash);
  if (!lock.acquired) return syncV2MutationBusy();

  try {
    const currentRow = await readSyncV2Meta(db, tokenHash);
    const currentRevision = currentRow ? Number(currentRow.revision) : 0;
    if (expectedRevision !== null && expectedRevision !== currentRevision) {
      return syncV2Conflict(currentRow);
    }

    const cleanup = db
      .prepare(`
        DELETE FROM opentavern_sync_v2_chunks
        WHERE token_hash = ?
          AND NOT EXISTS (
            SELECT 1 FROM opentavern_sync_v2_meta WHERE token_hash = ?
          )
      `)
      .bind(tokenHash, tokenHash);

    if (!currentRow) {
      await runSyncV2CleanupOnly(db, cleanup);
      return json({
        success: true,
        deleted: false,
        protocol: 2,
        previousRevision: null,
        previousUpdatedAt: null,
      }, {
        headers: syncV2MetadataHeaders(null, { 'X-OpenTavern-Exists': 'false' }),
      });
    }

    const mutation = db
      .prepare('DELETE FROM opentavern_sync_v2_meta WHERE token_hash = ? AND revision = ?')
      .bind(tokenHash, currentRevision);
    const results = await runSyncV2MutationAndCleanup(db, mutation, cleanup);
    if (resultChanges(results[0]) !== 1) {
      const latestRow = await readSyncV2Meta(db, tokenHash);
      if (latestRow) return syncV2Conflict(latestRow);
    }

    return json({
      success: true,
      deleted: resultChanges(results[0]) === 1,
      protocol: 2,
      previousRevision: currentRevision,
      previousUpdatedAt: Number(currentRow.updated_at),
    }, {
      headers: syncV2MetadataHeaders(null, { 'X-OpenTavern-Exists': 'false' }),
    });
  } finally {
    try {
      await releaseSyncV2MutationLock(db, tokenHash, lock.lockId);
    } catch (_) {}
  }
}

async function handleSyncV2(request, db, tokenHash) {
  const url = new URL(request.url);
  const operation = (url.searchParams.get('op') || '').toLowerCase();
  let response;

  if (request.method === 'GET' && operation === 'meta') {
    response = await handleSyncV2Meta(db, tokenHash);
  } else if (request.method === 'GET' && operation === 'chunk') {
    response = await handleSyncV2GetChunk(request, db, tokenHash);
  } else if (request.method === 'POST' && operation === 'chunk') {
    response = await handleSyncV2PostChunk(request, db, tokenHash);
  } else if (request.method === 'POST' && operation === 'commit') {
    response = await handleSyncV2Commit(request, db, tokenHash);
  } else if (request.method === 'DELETE') {
    response = await handleSyncV2Delete(request, db, tokenHash);
  } else {
    response = json({ success: false, error: 'Unsupported sync protocol v2 operation.' }, { status: 405 });
  }

  const headers = new Headers(response.headers);
  headers.set('X-OpenTavern-Protocol', '2');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return empty();
  }

  const db = env.SYNC_DB || env.DB;
  if (!db) {
    return json({ success: false, error: 'Missing D1 binding: configure SYNC_DB or DB.' }, { status: 500 });
  }

  if (request.method === 'GET' && isHealthCheck(request)) {
    await ensureTable(db);
    return json({
      success: true,
      service: 'opentavern-sync',
      storage: 'd1',
      protocols: [1, 2],
      chunkBytes: SYNC_V2_CHUNK_BYTES,
      maxBytes: null,
      methods: ['GET', 'HEAD', 'POST', 'DELETE', 'OPTIONS'],
    });
  }

  const token = getToken(request);
  const tokenError = validateToken(token);
  if (tokenError) {
    return json({ success: false, error: tokenError }, { status: token && token.length > 512 ? 400 : 401 });
  }

  await ensureTable(db);
  const tokenHash = await sha256(token);

  if (isSyncV2(request)) {
    return await handleSyncV2(request, db, tokenHash);
  }

  if (request.method === 'HEAD') {
    const row = await readSyncRow(db, tokenHash);
    return empty({
      status: 200,
      headers: syncMetadataHeaders(row, undefined, { 'X-OpenTavern-Exists': row ? 'true' : 'false' }),
    });
  }

  if (request.method === 'GET') {
    const row = await readSyncRow(db, tokenHash);

    if (!row) {
      return json({ success: true, data: null, updatedAt: null }, {
        headers: { 'X-OpenTavern-Exists': 'false' },
      });
    }

    let data;
    try {
      data = JSON.parse(row.data);
    } catch (_) {
      return json({ success: false, error: 'Stored sync snapshot is corrupted.' }, { status: 500 });
    }

    return json({
      success: true,
      data,
      updatedAt: row.updated_at,
      bytes: byteLength(row.data),
    }, {
      headers: syncMetadataHeaders(row, row.data, { 'X-OpenTavern-Exists': 'true' }),
    });
  }

  if (request.method === 'POST') {
    const body = await request.json().catch(() => null);
    let snapshot;
    try {
      snapshot = extractSnapshot(body);
    } catch (error) {
      return json({ success: false, error: error.message || 'Invalid sync payload.' }, { status: 400 });
    }
    const serialized = JSON.stringify(snapshot);

    const bytes = byteLength(serialized);

    let expectedUpdatedAt;
    try {
      expectedUpdatedAt = parseExpectedUpdatedAt(request);
    } catch (error) {
      return json({ success: false, error: error.message || 'Invalid sync precondition.' }, { status: 400 });
    }

    const currentRow = await readSyncRow(db, tokenHash);
    try {
      assertSyncPrecondition(expectedUpdatedAt, currentRow);
    } catch (error) {
      return json({
        success: false,
        error: error.message || 'Cloud snapshot precondition failed.',
        currentUpdatedAt: error.currentUpdatedAt,
      }, {
        status: error.status || 412,
        headers: syncMetadataHeaders(currentRow, undefined, { 'X-OpenTavern-Exists': currentRow ? 'true' : 'false' }),
      });
    }

    const updatedAt = getNextUpdatedAt(currentRow);
    await db
      .prepare(`
        INSERT INTO opentavern_sync (token_hash, data, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(token_hash) DO UPDATE SET
          data = excluded.data,
          updated_at = excluded.updated_at
      `)
      .bind(tokenHash, serialized, updatedAt)
      .run();

    return json({ success: true, updatedAt, bytes }, {
      headers: syncMetadataHeaders({ data: serialized, updated_at: updatedAt }, serialized, { 'X-OpenTavern-Exists': 'true' }),
    });
  }

  if (request.method === 'DELETE') {
    let expectedUpdatedAt;
    try {
      expectedUpdatedAt = parseExpectedUpdatedAt(request);
    } catch (error) {
      return json({ success: false, error: error.message || 'Invalid sync precondition.' }, { status: 400 });
    }

    const currentRow = await readSyncRow(db, tokenHash);
    try {
      assertSyncPrecondition(expectedUpdatedAt, currentRow);
    } catch (error) {
      return json({
        success: false,
        error: error.message || 'Cloud snapshot precondition failed.',
        currentUpdatedAt: error.currentUpdatedAt,
      }, {
        status: error.status || 412,
        headers: syncMetadataHeaders(currentRow, undefined, { 'X-OpenTavern-Exists': currentRow ? 'true' : 'false' }),
      });
    }

    if (currentRow) {
      await db
        .prepare('DELETE FROM opentavern_sync WHERE token_hash = ?')
        .bind(tokenHash)
        .run();
    }

    return json({
      success: true,
      deleted: !!currentRow,
      previousUpdatedAt: currentRow ? currentRow.updated_at : null,
    }, {
      headers: {
        'X-OpenTavern-Deleted': currentRow ? 'true' : 'false',
        'X-OpenTavern-Exists': 'false',
      },
    });
  }

  return json({ success: false, error: 'Method not allowed.' }, { status: 405 });
}
