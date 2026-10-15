import { readFile } from 'node:fs/promises';


const messageIdentitySource = await readFile(new URL('../../src/app/conversation/32-message-identity.js', import.meta.url), 'utf8');
const summaryValiditySource = await readFile(new URL('../../src/app/summary/41-summary-validity.js', import.meta.url), 'utf8');
const responseVersionsSource = await readFile(new URL('../../src/app/conversation/32-response-versions.js', import.meta.url), 'utf8');
const mutationPersistenceSource = await readFile(new URL('../../src/app/state/35-conversation-mutation-persistence.js', import.meta.url), 'utf8');

// These fixtures describe summaries created from the unchanged test messages, not legacy migration.
function prepareVerifiedSummaryFixture(context, conv) {
  conv.id = conv.id || 'summary-fixture';
  context.normalizeConversationMessageIdentity(conv);
  const regular = context.getSummaryRegularMessages(conv);
  (conv.summaries || []).forEach((summary) => {
    const start = Number.isInteger(summary.coveredStart) ? summary.coveredStart : 0;
    summary.text = summary.text || 'fixture summary';
    summary.summaryVersion = 2;
    summary.sourceMessages = context.captureSummarySources(regular.slice(start, summary.coveredEnd + 1));
  });
  return conv;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForTestCondition(predicate, message, attempts = 50) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error(message);
}

function createMockD1() {
  const store = new Map();
  return {
    store,
    db: {
      async exec() {},
      prepare(sql) {
        const normalizedSql = String(sql || '').trim().toLowerCase();
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
            if (normalizedSql.startsWith('delete')) {
              const key = this._bind[0];
              const existed = store.delete(key);
              return { success: true, meta: { changes: existed ? 1 : 0 } };
            }
            const [key, data, updatedAt] = this._bind;
            store.set(key, { data, updated_at: updatedAt });
            return { success: true };
          },
        };
      },
    },
  };
}

function request(method, token, body, extraHeaders = {}, url = 'https://example.com/api/sync') {
  const headers = { 'Content-Type': 'application/json', ...extraHeaders };
  if (token) headers.Authorization = `Bearer ${token}`;
  return new Request(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function readJson(response) {
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function assertOk(response, label) {
  if (!response.ok) throw new Error(`${label} failed: ${await response.text()}`);
}

async function assertRejects(promise, message) {
  let rejected = false;
  try {
    await promise;
  } catch (_) {
    rejected = true;
  }
  assert(rejected, message);
}

function assertThrows(fn, message) {
  let thrown = false;
  try {
    fn();
  } catch (_) {
    thrown = true;
  }
  assert(thrown, message);
}

function createConversationSaveAckHarness(context, events) {
  const pending = [];
  context.persistState = (immediate, options) => {
    assert(immediate === true && options.throwOnError === true, 'Conversation candidate saves must request reliable persistence.');
    if (options.beforePersist) options.beforePersist();
    let snapshot = JSON.parse(JSON.stringify(context.state));
    if (options.transformSnapshot) snapshot = options.transformSnapshot(snapshot);
    if (options.conversationSnapshot) {
      snapshot.conversations[options.conversationSnapshot.id] = JSON.parse(JSON.stringify(options.conversationSnapshot));
    }
    events.push('persist');
    return new Promise((resolve, reject) => {
      pending.push({
        snapshot,
        acknowledge() {
          try {
            if (options.onPersistSuccess) options.onPersistSuccess();
            resolve(true);
          } catch (error) { reject(error); }
        },
        fail() {
          const error = new Error('fixture save failure');
          if (options.onPersistError) options.onPersistError(error);
          reject(error);
        },
      });
    });
  };
  return pending;
}
export { messageIdentitySource, summaryValiditySource, responseVersionsSource, mutationPersistenceSource, prepareVerifiedSummaryFixture, assert, waitForTestCondition, createMockD1, request, readJson, assertOk, assertRejects, assertThrows, createConversationSaveAckHarness };
