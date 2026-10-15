import { SYNC_V2_MAX_ENCODED_CHARS, json, SYNC_V2_CHUNK_BYTES, sha256Bytes, isPlainObject } from './http.js';
import { formatSyncEtag } from './snapshot.js';
import { readManifestChunkState } from './store.js';


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
export { isSyncV2, isSha256Hex, requireInteger, parseQueryInteger, decodeBase64Chunk, syncV2MetadataHeaders, parseExpectedRevision, syncV2Conflict, manifestChunksAreComplete, syncV2ClientError, readVerifiedSyncV2Object, parseSyncV2ManifestReferences };
