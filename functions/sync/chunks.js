import { readSyncV2Meta, resultChanges } from './store.js';
import { json, isPlainObject, SYNC_V2_CHUNK_BYTES, sha256Bytes } from './http.js';
import { syncV2MetadataHeaders, isSha256Hex, parseQueryInteger, requireInteger, decodeBase64Chunk } from './objects.js';


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

  const chunkSeenAt = Date.now();
  const result = await db
    .prepare(`
      INSERT INTO opentavern_sync_v2_chunks (
        token_hash, object_hash, chunk_index, chunk_count, data, chunk_hash, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(token_hash, object_hash, chunk_index) DO NOTHING
    `)
    .bind(
      tokenHash, objectHash, index, total, body.data, chunkHash, chunkSeenAt,
    )
    .run();

  const uploaded = resultChanges(result) === 1;
  if (!uploaded) {
    const existing = await db
      .prepare(`
        SELECT data, chunk_hash, chunk_count
        FROM opentavern_sync_v2_chunks
        WHERE token_hash = ? AND object_hash = ? AND chunk_index = ?
      `)
      .bind(tokenHash, objectHash, index)
      .first();
    if (!existing
        || Number(existing.chunk_count) !== total
        || existing.data !== body.data
        || String(existing.chunk_hash || '').toLowerCase() !== chunkHash) {
      return json({
        success: false,
        error: 'Sync chunk conflicts with existing content-addressed data.',
      }, {
        status: 409,
        headers: { 'X-OpenTavern-Protocol': '2' },
      });
    }
    const refreshed = await db
      .prepare(`
        UPDATE opentavern_sync_v2_chunks
        SET created_at = ?
        WHERE token_hash = ? AND object_hash = ? AND chunk_index = ?
          AND chunk_count = ? AND data = ? AND chunk_hash = ?
      `)
      .bind(chunkSeenAt, tokenHash, objectHash, index, total, body.data, chunkHash)
      .run();
    if (resultChanges(refreshed) !== 1) {
      return json({ success: false, error: 'Sync chunk changed while it was being verified.' }, {
        status: 409,
        headers: { 'X-OpenTavern-Protocol': '2' },
      });
    }
  }

  if (!uploaded && resultChanges(result) !== 0) {
    return json({ success: false, error: 'Sync chunk could not be stored.' }, {
      status: 500,
      headers: { 'X-OpenTavern-Protocol': '2' },
    });
  }

  return json({
    success: true,
    uploaded,
    objectHash,
    index,
    total,
    chunkHash,
  }, {
    headers: { 'X-OpenTavern-Protocol': '2' },
  });
}
export { handleSyncV2Meta, handleSyncV2GetChunk, handleSyncV2PostChunk };
