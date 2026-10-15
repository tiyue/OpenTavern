import { isPlainObject, json, SYNC_V2_CHUNK_BYTES } from './http.js';
import { isSha256Hex, requireInteger, syncV2Conflict, readVerifiedSyncV2Object, parseSyncV2ManifestReferences, syncV2MetadataHeaders, parseExpectedRevision } from './objects.js';
import { acquireSyncV2MutationLock, syncV2MutationBusy, readSyncV2Meta, runSyncV2MutationAndCleanup, resultChanges, releaseSyncV2MutationLock, runSyncV2CleanupOnly } from './store.js';
import { getNextUpdatedAt } from './snapshot.js';


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

  const commitStartedAt = Date.now();
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
          AND created_at < ?
      `)
      .bind(tokenHash, tokenHash, revision, manifestHash, referencedHashes, commitStartedAt);
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
export { handleSyncV2Commit, handleSyncV2Delete };
