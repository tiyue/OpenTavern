import { SYNC_V2_MUTATION_LOCK_MS, json } from './http.js';


async function ensureTable(db) {
  const tableStatements = [
    `
    CREATE TABLE IF NOT EXISTS opentavern_sync (
      token_hash TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `,
    `
    CREATE TABLE IF NOT EXISTS opentavern_sync_v2_meta (
      token_hash TEXT PRIMARY KEY,
      manifest_hash TEXT NOT NULL,
      manifest_chunks INTEGER NOT NULL,
      manifest_bytes INTEGER NOT NULL,
      revision INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      last_saved INTEGER NOT NULL
    )
  `,
    `
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
  `,
    `
    CREATE TABLE IF NOT EXISTS opentavern_sync_v2_locks (
      token_hash TEXT PRIMARY KEY,
      lock_id TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    )
  `,
  ];

  if (typeof db.batch === 'function') {
    await db.batch(tableStatements.map((statement) => db.prepare(statement)));
    return;
  }

  for (const statement of tableStatements) {
    await db.exec(statement);
  }
}

async function readSyncRow(db, tokenHash) {
  return await db
    .prepare('SELECT data, updated_at FROM opentavern_sync WHERE token_hash = ?')
    .bind(tokenHash)
    .first();
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
export { ensureTable, readSyncRow, readSyncV2Meta, resultChanges, readManifestChunkState, acquireSyncV2MutationLock, releaseSyncV2MutationLock, syncV2MutationBusy, runSyncV2MutationAndCleanup, runSyncV2CleanupOnly };
