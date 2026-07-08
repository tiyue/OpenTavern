const MAX_SYNC_BYTES = 10 * 1024 * 1024;

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, If-Match, X-OpenTavern-If-Match-Updated-At, X-OpenTavern-Token',
    'Access-Control-Expose-Headers': 'ETag, X-OpenTavern-Updated-At, X-OpenTavern-Data-Bytes, X-OpenTavern-Encrypted, X-OpenTavern-Exists',
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
      maxBytes: MAX_SYNC_BYTES,
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
    if (bytes > MAX_SYNC_BYTES) {
      return json({ success: false, error: 'Sync payload is too large.' }, { status: 413 });
    }

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
