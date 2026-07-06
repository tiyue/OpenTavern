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

function extractSnapshot(body) {
  const snapshot = body && body.data !== undefined ? body.data : body;
  if (!snapshot || typeof snapshot !== 'object') throw new Error('Invalid sync payload.');
  if (body && body.encrypted === true) snapshot.encrypted = true;
  if (snapshot.encrypted === true) {
    if (!snapshot.payload || !snapshot.iv || !snapshot.salt) {
      throw new Error('Invalid encrypted sync payload.');
    }
    snapshot.lastSaved = Number(snapshot.lastSaved || body.updatedAt || Date.now());
    return snapshot;
  }
  if (!snapshot.conversations || typeof snapshot.conversations !== 'object') snapshot.conversations = {};
  if (!snapshot.settings || typeof snapshot.settings !== 'object') snapshot.settings = {};
  if (!snapshot.characters || typeof snapshot.characters !== 'object') snapshot.characters = {};
  if (!snapshot.worldBooks || typeof snapshot.worldBooks !== 'object') snapshot.worldBooks = {};
  if (!Array.isArray(snapshot.conversationOrder)) snapshot.conversationOrder = Object.keys(snapshot.conversations);
  snapshot.lastSaved = Number(snapshot.lastSaved || Date.now());
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
