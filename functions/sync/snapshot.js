import { isNonEmptyString, isPlainObject, normalizeTimestamp, normalizeObjectMap, normalizeBoolean, byteLength } from './http.js';


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
export { normalizeEncryptedIterations, validateEncryptedSnapshot, normalizeConversationOrder, normalizeActiveConversation, extractSnapshot, formatSyncEtag, parseExpectedUpdatedAt, assertSyncPrecondition, getNextUpdatedAt, syncMetadataHeaders };
