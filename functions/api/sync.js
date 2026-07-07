const MAX_SYNC_BYTES = 10 * 1024 * 1024;

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-OpenTavern-Token',
  };
}

function json(data, init = {}) {
  return Response.json(data, {
    ...init,
    headers: { ...corsHeaders(), ...(init.headers || {}) },
  });
}

function getToken(request) {
  const auth = request.headers.get('Authorization') || '';
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return (request.headers.get('X-OpenTavern-Token') || '').trim();
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
  const iterations = Number(value || 210000);
  if (!Number.isFinite(iterations) || iterations < 1) {
    throw new Error('Invalid encrypted sync payload.');
  }
  return Math.floor(iterations);
}

function validateEncryptedSnapshot(snapshot) {
  if (!isNonEmptyString(snapshot.payload) || !isNonEmptyString(snapshot.iv) || !isNonEmptyString(snapshot.salt)) {
    throw new Error('Invalid encrypted sync payload.');
  }
  if (snapshot.algorithm && snapshot.algorithm !== 'AES-GCM') {
    throw new Error('Unsupported encrypted sync payload algorithm.');
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

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders() });
  }

  const db = env.SYNC_DB || env.DB;
  if (!db) {
    return json({ success: false, error: 'Missing D1 binding: configure SYNC_DB or DB.' }, { status: 500 });
  }

  const token = getToken(request);
  if (!token || token.length < 8) {
    return json({ success: false, error: 'A sync token with at least 8 characters is required.' }, { status: 401 });
  }

  await ensureTable(db);
  const tokenHash = await sha256(token);

  if (request.method === 'GET') {
    const row = await db
      .prepare('SELECT data, updated_at FROM opentavern_sync WHERE token_hash = ?')
      .bind(tokenHash)
      .first();

    if (!row) {
      return json({ success: true, data: null, updatedAt: null });
    }

    return json({
      success: true,
      data: JSON.parse(row.data),
      updatedAt: row.updated_at,
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

    if (new TextEncoder().encode(serialized).length > MAX_SYNC_BYTES) {
      return json({ success: false, error: 'Sync payload is too large.' }, { status: 413 });
    }

    const updatedAt = Date.now();
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

    return json({ success: true, updatedAt });
  }

  return json({ success: false, error: 'Method not allowed.' }, { status: 405 });
}
