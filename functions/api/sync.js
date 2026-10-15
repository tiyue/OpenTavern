import { empty, json, isHealthCheck, SYNC_V2_CHUNK_BYTES, getToken, validateToken, sha256, byteLength } from '../sync/http.js';
import { ensureTable, readSyncRow } from '../sync/store.js';
import { isSyncV2 } from '../sync/objects.js';
import { handleSyncV2 } from '../sync/v2.js';
import { syncMetadataHeaders, extractSnapshot, parseExpectedUpdatedAt, assertSyncPrecondition, getNextUpdatedAt } from '../sync/snapshot.js';


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