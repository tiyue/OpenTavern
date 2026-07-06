import { onRequest } from '../functions/api/sync.js';

function createMockD1() {
  const store = new Map();
  return {
    store,
    db: {
      async exec() {},
      prepare(sql) {
        return {
          _bind: [],
          bind(...args) {
            this._bind = args;
            return this;
          },
          async first() {
            const key = this._bind[0];
            const row = store.get(key);
            return row ? { data: row.data, updated_at: row.updated_at } : null;
          },
          async run() {
            const [key, data, updatedAt] = this._bind;
            store.set(key, { data, updated_at: updatedAt });
            return { success: true };
          },
        };
      },
    },
  };
}

function request(method, token, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return new Request('https://example.com/api/sync', {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function readJson(response) {
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function main() {
  const { db } = createMockD1();
  const env = { SYNC_DB: db };
  const tokenA = 'test-token-alpha';
  const tokenB = 'test-token-bravo';
  const snapshot = {
    settings: { model: 'demo-model', cloudSyncToken: 'must-not-be-added-by-server' },
    conversations: { c1: { id: 'c1', messages: [{ role: 'user', content: 'hello' }] } },
    conversationOrder: ['c1'],
    activeConvId: 'c1',
    characters: { arona: { name: 'Arona' } },
    worldBooks: { wb1: { id: 'wb1', name: 'World' } },
    lastSaved: 123,
  };

  const unauthorized = await onRequest({ request: request('GET'), env });
  if (unauthorized.status !== 401) throw new Error('Expected missing-token request to be unauthorized.');

  const post = await onRequest({ request: request('POST', tokenA, { data: snapshot }), env });
  if (!post.ok) throw new Error(`POST failed: ${await post.text()}`);
  const postJson = await readJson(post);
  if (!postJson.success || !postJson.updatedAt) throw new Error('POST response missing success metadata.');

  const getA = await onRequest({ request: request('GET', tokenA), env });
  if (!getA.ok) throw new Error(`GET A failed: ${await getA.text()}`);
  const getAJson = await readJson(getA);
  if (getAJson.data.settings.model !== 'demo-model') throw new Error('Settings were not restored.');
  if (!getAJson.data.conversations.c1) throw new Error('Conversation was not restored.');
  if (!getAJson.data.characters.arona) throw new Error('Character was not restored.');
  if (!getAJson.data.worldBooks.wb1) throw new Error('World book was not restored.');

  const getB = await onRequest({ request: request('GET', tokenB), env });
  if (!getB.ok) throw new Error(`GET B failed: ${await getB.text()}`);
  const getBJson = await readJson(getB);
  if (getBJson.data !== null) throw new Error('Different tokens must not share snapshots.');

  const badEncrypted = await onRequest({
    request: request('POST', tokenB, { encrypted: true, data: { encrypted: true, payload: 'missing-metadata' } }),
    env,
  });
  if (badEncrypted.status !== 400) throw new Error('Invalid encrypted payload should return 400.');

  const encryptedEnvelope = {
    encrypted: true,
    version: 1,
    algorithm: 'AES-GCM',
    kdf: 'PBKDF2-SHA256',
    iterations: 210000,
    salt: 'c2FsdA==',
    iv: 'aXY=',
    payload: 'Y2lwaGVydGV4dA==',
    lastSaved: 456,
  };
  const postEncrypted = await onRequest({
    request: request('POST', tokenB, { encrypted: true, data: encryptedEnvelope }),
    env,
  });
  if (!postEncrypted.ok) throw new Error(`encrypted POST failed: ${await postEncrypted.text()}`);

  const getEncrypted = await onRequest({ request: request('GET', tokenB), env });
  if (!getEncrypted.ok) throw new Error(`encrypted GET failed: ${await getEncrypted.text()}`);
  const getEncryptedJson = await readJson(getEncrypted);
  if (getEncryptedJson.data.encrypted !== true) throw new Error('Encrypted envelope flag was not preserved.');
  if (getEncryptedJson.data.payload !== encryptedEnvelope.payload) throw new Error('Encrypted payload was not preserved.');

  console.log('sync function tests passed');
}

await main();
