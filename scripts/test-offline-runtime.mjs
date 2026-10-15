/**
 * 本地离线运行测试：用假 CacheStorage / fetch 驱动真实的 Service Worker 与
 * LocalResourceManager，覆盖 API/凭据/POST 排除、离线导航与不可变白名单、按版本绑定的
 * 公共缓存、首次安装接管、严格清单校验、读体超时、活动/暂存隔离、断点续传与去重、
 * 未保存草稿/待确认写入门禁、清理缓存与 readPublic 本地优先。
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createHash, webcrypto } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readSource = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const encode = (text) => new TextEncoder().encode(text);
const hexId = (char) => char.repeat(24);
const R1 = hexId('1');
const R2 = hexId('2');
const R3 = hexId('3');
const R9 = hexId('9');

function normalizeKey(key) {
  if (typeof key === 'string') return key;
  if (key && typeof key.url === 'string') return key.url;
  return String(key);
}
function toBytes(body) {
  if (body == null) return new Uint8Array(0);
  if (typeof body === 'string') return encode(body);
  if (body instanceof Uint8Array) return body;
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  return encode(String(body));
}
class FakeHeaders {
  constructor(init) {
    this.map = {};
    if (init instanceof FakeHeaders) Object.assign(this.map, init.map);
    else if (init) for (const [key, value] of Object.entries(init)) this.map[String(key).toLowerCase()] = value;
  }
  get(name) { return this.map[String(name).toLowerCase()] || null; }
  set(name, value) { this.map[String(name).toLowerCase()] = value; }
}
class FakeResponse {
  constructor(body, init = {}) {
    this.status = init.status || 200;
    this.ok = this.status >= 200 && this.status < 300;
    this.redirected = !!init.redirected;
    this.url = init.url || '';
    this.headers = new FakeHeaders(init.headers);
    this.held = !!init.held;
    this.body = init.stream || null;
    this._bytes = init.stream ? null : toBytes(body);
    this.bodyUsed = false;
  }
  async arrayBuffer() {
    if (this.bodyUsed) throw new TypeError('Response body is already used');
    this.bodyUsed = true;
    if (this.held) return new Promise(() => {});
    const bytes = this._bytes || new Uint8Array(0);
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  }
  async text() { return new TextDecoder().decode(await this.arrayBuffer()); }
  async json() { return JSON.parse(await this.text()); }
  clone() {
    if (this.bodyUsed) throw new TypeError('Response body is already used');
    const copy = new FakeResponse(null, { status: this.status, redirected: this.redirected, url: this.url, headers: this.headers, held: this.held, stream: this.body });
    if (this._bytes) copy._bytes = this._bytes;
    return copy;
  }
}

function createFakeCaches() {
  const stores = new Map();
  function cacheFor(name) {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name);
    return {
      async put(key, response) { store.set(normalizeKey(key), response); },
      async match(key) { const hit = store.get(normalizeKey(key)); return hit ? hit.clone() : undefined; },
      async delete(key) { return store.delete(normalizeKey(key)); },
      async keys() { return [...store.keys()]; },
    };
  }
  return {
    stores,
    caches: {
      async open(name) { return cacheFor(name); },
      async keys() { return [...stores.keys()]; },
      async delete(name) { return stores.delete(name); },
      async match(key) {
        for (const store of stores.values()) { const hit = store.get(normalizeKey(key)); if (hit) return hit.clone(); }
        return undefined;
      },
    },
  };
}

class FakeMessagePort {
  constructor() { this.onmessage = null; this.peer = null; }
  postMessage(data) {
    const peer = this.peer;
    Promise.resolve().then(() => { if (peer && peer.onmessage) peer.onmessage({ data }); });
  }
}
class FakeMessageChannel {
  constructor() {
    this.port1 = new FakeMessagePort();
    this.port2 = new FakeMessagePort();
    this.port1.peer = this.port2;
    this.port2.peer = this.port1;
  }
}

function createScheduler() {
  const queue = [];
  let nextId = 1;
  return {
    setTimeout(fn, delay) { const id = nextId++; queue.push({ id, fn, delay: Number(delay) || 0 }); return id; },
    clearTimeout(id) { const index = queue.findIndex((item) => item.id === id); if (index >= 0) queue.splice(index, 1); },
    pending() { return queue.length; },
    fireNext() { const item = queue.shift(); if (!item) return false; item.fn(); return true; },
  };
}

// 假 Service Worker 端口：按 handler 返回响应，模拟真实的 postMessage + MessageChannel 往返。
function createFakeSwLink(options = {}) {
  const state = { payloads: [], handler: options.handler || null };
  const controller = {
    postMessage(payload, transfer) {
      state.payloads.push(payload);
      if (payload && payload.type === 'ot-register-release') return;
      const port = transfer && transfer[0];
      const reply = state.handler ? state.handler(payload) : { ok: true };
      if (port) Promise.resolve().then(() => port.postMessage(reply === undefined ? { ok: true } : reply));
    },
  };
  return { controller, state };
}

// ==================== Service Worker ====================
function createSwContext(scope) {
  const { caches, stores } = createFakeCaches();
  const listeners = {};
  const events = { skipWaiting: 0, claim: 0 };
  const clients = { list: [], async matchAll() { return clients.list; }, async claim() { events.claim += 1; } };
  const selfObj = {
    registration: { scope },
    location: new URL(scope + 'opentavern-sw.js'),
    clients,
    async skipWaiting() { events.skipWaiting += 1; },
    addEventListener(type, handler) { listeners[type] = handler; },
  };
  const fetchCalls = [];
  const fetchImpl = async (request) => {
    fetchCalls.push(typeof request === 'string' ? request : request.url);
    return new FakeResponse('network', { status: 200, headers: { 'Content-Type': 'text/html' } });
  };
  const context = {
    console, self: selfObj, caches, fetch: fetchImpl, Response: FakeResponse, Headers: FakeHeaders, URL,
    TextEncoder, TextDecoder, Promise, JSON, Object, Array, Number, String, Math, Error, Uint8Array, Map, Set,
  };
  vm.createContext(context);
  vm.runInContext(readSource('src/offline/opentavern-sw.js'), context, { filename: 'opentavern-sw.js' });
  return { listeners, events, clients, caches, stores, fetchCalls };
}

async function runFetch(listeners, request, clientId) {
  let promise = null;
  listeners.fetch({ request, clientId, respondWith(value) { promise = Promise.resolve(value); } });
  if (!promise) return { intercepted: false };
  return { intercepted: true, response: await promise };
}

async function runLifecycle(listeners, type) {
  let promise = null;
  listeners[type]({ waitUntil(value) { promise = Promise.resolve(value); } });
  if (promise) await promise;
}

async function runMessage(listeners, data, source) {
  let reply = null;
  let promise = null;
  listeners.message({
    data,
    source,
    ports: [{ postMessage(payload) { reply = payload; } }],
    waitUntil(value) { promise = Promise.resolve(value); },
  });
  if (promise) await promise;
  return reply;
}

function baseToken(base) {
  return base === '/' ? 'root' : (base.replace(/^\/+|\/+$/g, '').replace(/[^a-z0-9]+/gi, '-') || 'root');
}
function seedMeta(stores, base, meta) {
  stores.set(`opentavern-${baseToken(base)}-meta`, new Map([
    [`http://test${base}__ot-meta__`, new FakeResponse(JSON.stringify(meta), { headers: { 'Content-Type': 'application/json' } })],
  ]));
}
function readSwMeta(stores, base) {
  const store = stores.get(`opentavern-${baseToken(base)}-meta`);
  const response = store && store.get(`http://test${base}__ot-meta__`);
  return response ? response.json() : null;
}
function releaseRecord(releaseId, coreEntries, publicMap) {
  return {
    version: 2,
    activeReleaseId: releaseId,
    releases: {
      [releaseId]: {
        complete: true,
        manifest: { formatVersion: 1, dataVersion: 1, releaseId, basePath: '/', core: coreEntries.map((item) => item.record || item), public: [] },
        public: publicMap || {},
      },
    },
  };
}

// ---------- SW: POST / API / 凭据 / 快照白名单 / 导航 ----------
{
  const sw = createSwContext('http://test/');
  const post = await runFetch(sw.listeners, { method: 'POST', url: 'http://test/api/sync', mode: 'cors' });
  assert.equal(post.intercepted, false, 'POST must never be intercepted or replayed.');
  const postSnapshot = await runFetch(sw.listeners, { method: 'POST', url: `http://test/assets/offline/${R1}/assets/js/app.js`, mode: 'cors' });
  assert.equal(postSnapshot.intercepted, false, 'POST must never be served from the immutable snapshot.');
  const api = await runFetch(sw.listeners, { method: 'GET', url: 'http://test/api/sync', mode: 'cors' });
  assert.equal(api.intercepted, false, 'Cloud sync API must never be intercepted.');
  const other = await runFetch(sw.listeners, { method: 'GET', url: 'http://test/api/images/1', mode: 'cors' });
  assert.equal(other.intercepted, false, 'Unknown API paths must never become app HTML.');
  const auth = await runFetch(sw.listeners, { method: 'GET', url: 'http://test/cards/a.png', mode: 'cors', headers: new FakeHeaders({ Authorization: 'Bearer secret' }) });
  assert.equal(auth.intercepted, false, 'Authorized requests must bypass shared caches.');
  const noStore = await runFetch(sw.listeners, { method: 'GET', url: 'http://test/cards/a.png', mode: 'cors', cache: 'no-store' });
  assert.equal(noStore.intercepted, false, 'Manager no-store reads must bypass cached public bytes.');

  const shell = { path: 'index.html', mime: 'text/html' };
  const appJs = { path: 'assets/js/app.js', mime: 'application/javascript' };
  seedMeta(sw.stores, '/', releaseRecord(R1, [shell, appJs], { '/cards/a.png': sha256(encode('png-bytes')) }));
  sw.stores.set(`opentavern-root-core-${R1}`, new Map([
    [`http://test/assets/offline/${R1}/index.html`, new FakeResponse('<html>shell</html>', { headers: { 'Content-Type': 'text/html' } })],
    [`http://test/assets/offline/${R1}/assets/js/app.js`, new FakeResponse('app-bytes', { headers: { 'Content-Type': 'application/javascript' } })],
  ]));
  const nav = await runFetch(sw.listeners, { method: 'GET', url: 'http://test/', mode: 'navigate' });
  assert.equal(nav.intercepted, true);
  assert.equal(await nav.response.text(), '<html>shell</html>', 'Offline navigation must serve the verified active shell without hitting the network.');
  const noStoreNav = await runFetch(sw.listeners, { method: 'GET', url: 'http://test/', mode: 'navigate', cache: 'no-store' });
  assert.equal(noStoreNav.intercepted, true, 'Offline navigation must stay under the worker even with cache: no-store.');
  assert.equal(await noStoreNav.response.text(), '<html>shell</html>');
  const unknownNav = await runFetch(sw.listeners, { method: 'GET', url: 'http://test/secret/page', mode: 'navigate' });
  assert.equal(await unknownNav.response.text(), 'network', 'Unknown navigation must fall through to the network, never app HTML.');
  const immutable = await runFetch(sw.listeners, { method: 'GET', url: `http://test/assets/offline/${R1}/assets/js/app.js`, mode: 'cors' });
  assert.equal(await immutable.response.text(), 'app-bytes', 'Immutable snapshot bytes must be served from cache.');
  const immutableQuery = await runFetch(sw.listeners, { method: 'GET', url: `http://test/assets/offline/${R1}/assets/js/app.js?v=1`, mode: 'cors' });
  assert.equal(await immutableQuery.response.text(), 'app-bytes', 'Query strings must not break immutable snapshot reuse.');
  sw.stores.get(`opentavern-root-core-${R1}`).set(`http://test/assets/offline/${R1}/assets/js/extra.js`, new FakeResponse('extra', { headers: { 'Content-Type': 'application/javascript' } }));
  const notWhitelisted = await runFetch(sw.listeners, { method: 'GET', url: `http://test/assets/offline/${R1}/assets/js/extra.js`, mode: 'cors' });
  assert.equal(await notWhitelisted.response.text(), 'network', 'Paths outside the complete manifest must never be served from the snapshot cache.');
  sw.stores.set(`opentavern-root-core-${R9}`, new Map([
    [`http://test/assets/offline/${R9}/assets/js/app.js`, new FakeResponse('staged-bytes', { headers: { 'Content-Type': 'application/javascript' } })],
  ]));
  const staging = await runFetch(sw.listeners, { method: 'GET', url: `http://test/assets/offline/${R9}/assets/js/app.js`, mode: 'cors' });
  assert.equal(await staging.response.text(), 'network', 'Incomplete staging bytes must never be served as a snapshot.');
  sw.stores.get(`opentavern-root-core-${R1}`).delete(`http://test/assets/offline/${R1}/index.html`);
  const evictedNav = await runFetch(sw.listeners, { method: 'GET', url: 'http://test/', mode: 'navigate' });
  assert.equal(await evictedNav.response.text(), 'network', 'An evicted shell must not be reported as a complete offline page.');
  assert.ok(sw.fetchCalls.every((href) => !href.includes('/api/')), 'The Service Worker must never fetch API paths itself.');
}

// ---------- SW: 公共字节按版本绑定 + 更新/清理守卫 ----------
{
  const sw = createSwContext('http://test/');
  const d1 = sha256(encode('png-v1'));
  const d2 = sha256(encode('png-v2'));
  const shell = { path: 'index.html', mime: 'text/html' };
  seedMeta(sw.stores, '/', {
    version: 2,
    activeReleaseId: R1,
    releases: {
      [R1]: { complete: true, manifest: { core: [shell], public: [] }, public: { '/cards/a.png': d1 } },
      [R2]: { complete: true, manifest: { core: [shell], public: [] }, public: { '/cards/a.png': d2 } },
    },
  });
  sw.stores.set('opentavern-root-public', new Map([
    [`http://test/__ot-public__/${d1}`, new FakeResponse('png-v1', { headers: { 'Content-Type': 'image/png' } })],
    [`http://test/__ot-public__/${d2}`, new FakeResponse('png-v2', { headers: { 'Content-Type': 'image/png' } })],
  ]));
  const prepared = await runFetch(sw.listeners, { method: 'GET', url: 'http://test/cards/a.png', mode: 'cors' }, 'client-a');
  assert.equal(await prepared.response.text(), 'png-v1', 'Unregistered clients must read the active release public bytes.');
  await runMessage(sw.listeners, { type: 'ot-register-release', releaseId: R2 }, { id: 'client-old' });
  const oldClient = await runFetch(sw.listeners, { method: 'GET', url: 'http://test/cards/a.png', mode: 'cors' }, 'client-old');
  assert.equal(await oldClient.response.text(), 'png-v2', 'A page must read the public bytes of the release it actually loaded.');
  const otherClient = await runFetch(sw.listeners, { method: 'GET', url: 'http://test/cards/a.png', mode: 'cors' }, 'client-other');
  assert.equal(await otherClient.response.text(), 'png-v1', 'Other pages must keep reading their own bound release.');
  const unprepared = await runFetch(sw.listeners, { method: 'GET', url: 'http://test/cards/missing.png', mode: 'cors' }, 'client-a');
  assert.equal(await unprepared.response.text(), 'network');
  assert.deepEqual(sw.fetchCalls, ['http://test/cards/missing.png'], 'Only the unprepared public read should reach the network.');

  sw.clients.list = [{ id: 'a' }, { id: 'b' }];
  const refused = await runMessage(sw.listeners, { type: 'ot-apply-update', releaseId: R1 }, { id: 'a' });
  assert.equal(refused.ok, false, 'Update must be refused while another app tab exists.');
  const refusedClear = await runMessage(sw.listeners, { type: 'ot-assert-idle-clients' }, { id: 'a' });
  assert.equal(refusedClear.ok, false, 'Cleanup must be refused while another app tab exists.');
  sw.clients.list = [{ id: 'a' }];
  const incomplete = await runMessage(sw.listeners, { type: 'ot-apply-update', releaseId: R9 }, { id: 'a' });
  assert.equal(incomplete.ok, false, 'Incomplete releases must not become active.');
  const applied = await runMessage(sw.listeners, { type: 'ot-apply-update', releaseId: R1 }, { id: 'a' });
  assert.equal(applied.ok, true, 'A single idle tab may switch to a complete release.');
  assert.equal((await readSwMeta(sw.stores, '/')).activeReleaseId, R1);
}

// ---------- SW: 首次安装接管（即使活动元数据已写入）与更新不抢占 ----------
{
  const fresh = createSwContext('http://test/');
  await runLifecycle(fresh.listeners, 'install');
  await runLifecycle(fresh.listeners, 'activate');
  assert.equal(fresh.events.skipWaiting, 1, 'First install may activate immediately.');
  assert.equal(fresh.events.claim, 1, 'First install may claim existing clients.');

  const raced = createSwContext('http://test/');
  seedMeta(raced.stores, '/', { version: 2, activeReleaseId: R1, releases: { [R1]: { complete: true, manifest: { core: [], public: [] }, public: {} } } });
  await runLifecycle(raced.listeners, 'install');
  await runLifecycle(raced.listeners, 'activate');
  assert.equal(raced.events.skipWaiting, 1, 'A first install must activate even after the page wrote active metadata.');
  assert.equal(raced.events.claim, 1, 'The first activation must claim the already-open initial page.');

  const existing = createSwContext('http://test/');
  seedMeta(existing.stores, '/', { version: 2, activeReleaseId: R1, releases: { [R1]: { complete: true, manifest: { core: [], public: [] }, public: {} } } });
  existing.stores.get('opentavern-root-meta').set('http://test/__ot-sw-activated__', new FakeResponse('1'));
  await runLifecycle(existing.listeners, 'install');
  await runLifecycle(existing.listeners, 'activate');
  assert.equal(existing.events.skipWaiting, 0, 'Updates must not skipWaiting unconditionally.');
  assert.equal(existing.events.claim, 0, 'Updates must not claim other clients.');
}

// ---------- 预览作用域：/.sites-public/ 不被放宽到根 ----------
{
  const sw = createSwContext('http://test/.sites-public/');
  const outside = await runFetch(sw.listeners, { method: 'GET', url: 'http://test/cards/root.png', mode: 'cors' });
  assert.equal(outside.intercepted, false, 'Preview scope must not widen to the site root.');
  const api = await runFetch(sw.listeners, { method: 'GET', url: 'http://test/.sites-public/api/probe', mode: 'cors' });
  assert.equal(api.intercepted, false, 'Preview API paths must never be served app HTML.');
  // 预览作用域之外的同源页面不得阻塞更新或清理，作用域内未受控窗口必须阻塞。
  sw.clients.list = [
    { id: 'preview', url: 'http://test/.sites-public/opentavern.html' },
    { id: 'site', url: 'http://test/blog/post' },
  ];
  const unrelated = await runMessage(sw.listeners, { type: 'ot-assert-idle-clients' }, { id: 'preview' });
  assert.equal(unrelated.ok, true, 'Unrelated pages outside the app scope must not block cleanup.');
  sw.clients.list = [
    { id: 'preview', url: 'http://test/.sites-public/opentavern.html' },
    { id: 'other', url: 'http://test/.sites-public/other.html' },
  ];
  const scoped = await runMessage(sw.listeners, { type: 'ot-assert-idle-clients' }, { id: 'preview' });
  assert.equal(scoped.ok, false, 'Other in-scope app pages must block cleanup.');
}

// ==================== Local Resource Manager ====================
function createManagerContext(options = {}) {
  const { caches, stores } = createFakeCaches();
  const files = options.files || new Map();
  const failureMap = options.failureMap || new Map();
  const calls = { fetch: [] };
  const scheduler = options.scheduler || createScheduler();
  const fetchImpl = async (url, init) => {
    const href = typeof url === 'string' ? url : url.url;
    calls.fetch.push({ url: href, method: (init && init.method) || 'GET', cache: init && init.cache });
    if (options.holdManifest === true && href.endsWith('/offline-manifest.json')) {
      return new FakeResponse('', { status: 200, headers: { 'Content-Type': 'application/json' }, url: href, held: true });
    }
    const failure = failureMap.get(href);
    if (failure === 'throw') throw new Error('network down: ' + href);
    const entry = files.get(href);
    if (!entry) return new FakeResponse('not found', { status: 404 });
    if (failure === 'html' || entry.html) return new FakeResponse('<!doctype html>challenge', { status: 200, headers: { 'Content-Type': 'text/html' } });
    const bytes = entry.corrupt ? encode('corrupted-bytes') : entry.bytes;
    return new FakeResponse(bytes, { status: 200, headers: { 'Content-Type': entry.type || 'application/octet-stream' }, url: href });
  };
  const runtime = options.runtime || { releaseId: '', basePath: '/', snapshotBase: '', manifestUrl: '/offline-manifest.json' };
  const serviceWorker = {
    register: async () => ({ update: async () => {} }),
    controller: options.sw ? options.sw.controller : null,
    addEventListener() {},
  };
  const navigatorObj = {
    serviceWorker,
    storage: { estimate: options.estimate || (async () => ({ quota: 1024 * 1024 * 1024, usage: 0 })) },
  };
  const sandbox = {
    console,
    window: { __OT_RUNTIME__: runtime, location: { pathname: '/', href: 'http://test/' }, caches, setTimeout: scheduler.setTimeout, clearTimeout: scheduler.clearTimeout },
    document: { baseURI: 'http://test/' },
    navigator: navigatorObj,
    caches,
    fetch: fetchImpl,
    Response: FakeResponse,
    Headers: FakeHeaders,
    URL,
    TextEncoder,
    TextDecoder,
    AbortController,
    MessageChannel: FakeMessageChannel,
    setTimeout: scheduler.setTimeout,
    clearTimeout: scheduler.clearTimeout,
    crypto: webcrypto,
    Promise,
    Set,
    Map,
    JSON,
    Object,
    Array,
    Number,
    String,
    Math,
    Date,
    Uint8Array,
    ArrayBuffer,
    Error,
  };
  vm.createContext(sandbox);
  vm.runInContext(
    readSource('src/app/core/10-runtime-assets.js') + '\n' + readSource('src/app/offline/21-local-resource-manager.js') +
      '\nthis.__manager = LocalResourceManager; this.__runtime = window.__OT_RUNTIME__; this.__assetUrl = getRuntimeAssetUrl;',
    sandbox, { filename: 'offline-manager.js' },
  );
  return { manager: sandbox.__manager, runtime: sandbox.__runtime, assetUrl: sandbox.__assetUrl, caches, stores, calls, failureMap, scheduler, sandbox };
}

function entryFor(relative, text, mime) {
  const bytes = encode(text);
  return { path: relative, mime, bytes, record: { path: relative, mime, bytes: bytes.length, sha256: sha256(bytes) } };
}
function totalsOf(records) {
  return { count: records.length, bytes: records.reduce((sum, item) => sum + item.bytes, 0) };
}
function manifestFixture(releaseId, core, publicEntries) {
  const coreRecords = core.map((item) => item.record);
  const publicRecords = publicEntries.map((item) => item.record);
  return {
    formatVersion: 1,
    dataVersion: 1,
    releaseId,
    basePath: '/',
    core: coreRecords,
    public: publicRecords,
    totals: { core: totalsOf(coreRecords), public: totalsOf(publicRecords) },
  };
}
function digestMapFor(manifest) {
  const map = {};
  manifest.public.forEach((item) => { map['/' + item.path] = item.sha256; });
  return map;
}
function serveUrl(files, base, relative, bytes, type) {
  files.set(base + relative, { bytes, type: type || 'application/javascript' });
}
// HTML 核心只提供 .txt 纯文本传输副本；其余核心仍按原路径与 MIME 提供。
function serveCoreSnapshot(files, base, item) {
  const transport = item.path === 'index.html';
  serveUrl(files, base, transport ? item.path + '.txt' : item.path, item.bytes, transport ? 'text/plain' : item.mime);
}
function seedManagerMeta(stores, meta) {
  stores.set('opentavern-root-meta', new Map([
    ['http://test/__ot-meta__', new FakeResponse(JSON.stringify(meta), { headers: { 'Content-Type': 'application/json' } })],
  ]));
}
async function readManagerMeta(stores) {
  const store = stores.get('opentavern-root-meta');
  const response = store && store.get('http://test/__ot-meta__');
  return response ? response.json() : null;
}
function seedCoreCache(ctx, releaseId, entries) {
  const store = new Map(entries.map((item) => [
    `http://test/assets/offline/${releaseId}/${item.path}`,
    new FakeResponse(item.bytes, { headers: { 'Content-Type': item.mime } }),
  ]));
  ctx.stores.set(`opentavern-root-core-${releaseId}`, store);
}
function fetchCount(ctx, fragment) {
  return ctx.calls.fetch.filter((call) => call.url.includes(fragment)).length;
}

const SHELL_TEXT = '<html>shell</html>';

// ---------- 核心快照校验、状态、运行时配置不被改写 ----------
{
  const app = entryFor('assets/js/app.js', 'APP', 'application/javascript');
  const css = entryFor('assets/css/app.css', 'CSS', 'text/css');
  const shell = entryFor('index.html', SHELL_TEXT, 'text/html');
  const pub = [entryFor('cards/a.png', 'png', 'image/png'), entryFor('cards/b.json', '{}', 'application/json')];
  const manifest = manifestFixture(R1, [app, css, shell], pub);
  const files = new Map();
  files.set('http://test/offline-manifest.json', { bytes: encode(JSON.stringify(manifest)), type: 'application/json' });
  for (const item of [app, css, shell]) serveCoreSnapshot(files, `http://test/assets/offline/${R1}/`, item);
  serveUrl(files, 'http://test/', 'cards/a.png', encode('png'), 'image/png');
  serveUrl(files, 'http://test/', 'cards/b.json', encode('{}'), 'application/json');

  const ctx = createManagerContext({
    files,
    runtime: { releaseId: R1, basePath: '/', snapshotBase: `/assets/offline/${R1}/`, manifestUrl: '/offline-manifest.json' },
  });
  const runtimeBefore = JSON.stringify(ctx.runtime);
  const status = await ctx.manager.start();
  assert.equal(status.supported, true);
  assert.equal(status.core.state, 'ready', 'All verified core entries must mark the release ready.');
  assert.equal(status.activeReleaseId, R1, 'The first complete release becomes active automatically.');
  assert.equal(status.loadedReleaseId, R1, 'loadedReleaseId must record the build-pinned release once.');
  assert.equal(status.update.available, false);
  assert.equal(status.public.running, false, 'start() must not await or start public preparation.');
  assert.equal(JSON.stringify(ctx.runtime), runtimeBefore, 'The manager must never mutate window.__OT_RUNTIME__.');
  assert.equal(ctx.runtime.snapshotBase, `/assets/offline/${R1}/`, 'The runtime snapshot base stays exactly as the builder pinned it.');
  assert.equal(ctx.assetUrl('assets/js/app.js'), `/assets/offline/${R1}/assets/js/app.js`, 'getRuntimeAssetUrl must resolve into the immutable snapshot.');
  assert.ok(ctx.calls.fetch.every((call) => call.method === 'GET'), 'The manager must never issue non-GET requests.');
  assert.ok(ctx.calls.fetch.every((call) => call.cache === 'no-store'), 'Immutable and manifest fetches must bypass shared caches.');
  assert.ok(ctx.calls.fetch.every((call) => !call.url.includes('/api/')), 'The manager must never fetch API paths.');

  const meta = await readManagerMeta(ctx.stores);
  assert.equal(meta.version, 2);
  assert.equal(meta.releases[R1].complete, true);
  assert.equal(meta.releases[R1].public['/cards/a.png'], sha256(encode('png')), 'Meta must expose a path→digest map for the Service Worker.');

  await ctx.manager.preparePublic();
  const publicStatus = ctx.manager.getStatus().public;
  assert.equal(publicStatus.state, 'ready');
  assert.equal(publicStatus.ready, 2);
  assert.equal(publicStatus.bytes, 5);
  assert.equal(ctx.manager.isPublicPrepared('cards/a.png'), true, 'Prepared public bytes must be reported as prepared.');
  assert.equal(ctx.manager.resolvePublicUrl('cards/a.png'), 'http://test/cards/a.png');
  assert.equal(ctx.manager.resolvePublicUrl('https://cdn.example/x.png'), 'https://cdn.example/x.png');
  const publicFetchesBefore = fetchCount(ctx, '/cards/a.png');
  const first = await ctx.manager.readPublic('cards/a.png');
  assert.equal(await first.text(), 'png', 'readPublic must return the verified public bytes.');
  await ctx.manager.readPublic('cards/a.png');
  assert.equal(fetchCount(ctx, '/cards/a.png'), publicFetchesBefore, 'A cached public resource must be reused, not refetched.');
  await assert.rejects(() => ctx.manager.readPublic('https://cdn.example/x.png'), /白名单/, 'Unlisted foreign public URLs must be rejected.');

  const downloadsBefore = fetchCount(ctx, `/assets/offline/${R1}/`);
  await ctx.manager.checkForUpdates();
  assert.equal(fetchCount(ctx, `/assets/offline/${R1}/`), downloadsBefore, 'A verified complete release must not be re-downloaded.');
  assert.equal(JSON.stringify(ctx.runtime), runtimeBefore);
}

// ---------- 清单恶意/错误输入一律拒绝，且不改写已知活动元数据 ----------
{
  const app = entryFor('assets/js/app.js', 'APP', 'application/javascript');
  const shell = entryFor('index.html', SHELL_TEXT, 'text/html');
  const known = manifestFixture(R2, [app, shell], [entryFor('cards/a.png', 'png', 'image/png')]);
  const good = manifestFixture(R1, [app, shell], [entryFor('cards/a.png', 'png', 'image/png')]);

  function badManifest(mutate) {
    const copy = JSON.parse(JSON.stringify(good));
    mutate(copy);
    copy.totals = { core: totalsOf(copy.core), public: totalsOf(copy.public) };
    return copy;
  }
  const cases = {
    'wrong format version': badManifest((data) => { data.formatVersion = 2; }),
    'missing data version': badManifest((data) => { delete data.dataVersion; }),
    'negative data version': badManifest((data) => { data.dataVersion = -1; }),
    'non-hex release id': badManifest((data) => { data.releaseId = '../escape'; }),
    'empty core': badManifest((data) => { data.core = []; }),
    'missing shell': badManifest((data) => { data.core = [app.record]; }),
    'traversal path': badManifest((data) => { data.core[0].path = 'assets/../secret.js'; }),
    'absolute path': badManifest((data) => { data.core[0].path = '/assets/js/app.js'; }),
    'backslash path': badManifest((data) => { data.core[0].path = 'assets\\js\\app.js'; }),
    'encoded traversal': badManifest((data) => { data.core[0].path = 'assets/%2e%2e/secret.js'; }),
    'query path': badManifest((data) => { data.core[0].path = 'assets/js/app.js?v=1'; }),
    'prototype path': badManifest((data) => { data.core[0].path = 'assets/__proto__/app.js'; }),
    'foreign prefix': badManifest((data) => { data.core[0].path = 'vendor/app.js'; }),
    'unknown mime': badManifest((data) => { data.core[0].mime = 'application/x-unknown'; }),
    'mime/extension mismatch': badManifest((data) => { data.core[0].mime = 'text/css'; }),
    'negative bytes': badManifest((data) => { data.core[0].bytes = -1; }),
    'fractional bytes': badManifest((data) => { data.core[0].bytes = 1.5; }),
    'bad sha256': badManifest((data) => { data.core[0].sha256 = 'nope'; }),
    'duplicate path': badManifest((data) => { data.core[1] = Object.assign({}, data.core[0]); }),
    'public outside cards': badManifest((data) => { data.public[0].path = 'assets/js/app.js'; }),
    'count mismatch': (() => { const data = badManifest(() => {}); data.totals.core.count = 99; return data; })(),
    'bytes mismatch': (() => { const data = badManifest(() => {}); data.totals.core.bytes = 1; return data; })(),
    'missing totals': (() => { const data = badManifest(() => {}); delete data.totals; return data; })(),
  };

  for (const [name, payload] of Object.entries(cases)) {
    const files = new Map();
    files.set('http://test/offline-manifest.json', { bytes: encode(JSON.stringify(payload)), type: 'application/json' });
    const ctx = createManagerContext({ files });
    seedManagerMeta(ctx.stores, {
      version: 2,
      activeReleaseId: R2,
      releases: { [R2]: { complete: true, manifest: known, public: digestMapFor(known) } },
    });
    await assert.rejects(() => ctx.manager.checkForUpdates(), Error, `A malformed manifest must be rejected: ${name}`);
    const meta = await readManagerMeta(ctx.stores);
    assert.equal(meta.activeReleaseId, R2, `Bad data must never replace the known active release: ${name}`);
    assert.deepEqual(Object.keys(meta.releases), [R2], `Bad data must never register a staged release: ${name}`);
  }

  const files = new Map();
  files.set('http://test/offline-manifest.json', { bytes: encode('x'.repeat(4 * 1024 * 1024 + 1)), type: 'application/json' });
  const ctx = createManagerContext({ files });
  await assert.rejects(() => ctx.manager.checkForUpdates(), /大小/, 'An oversized manifest body must be rejected.');
}

// ---------- 超时覆盖读体：响应体挂起也必须失败 ----------
{
  const scheduler = createScheduler();
  const ctx = createManagerContext({ holdManifest: true, scheduler });
  const pending = ctx.manager.checkForUpdates();
  pending.catch(() => {});
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(scheduler.pending() > 0, 'The body read must be guarded by a live timeout timer.');
  scheduler.fireNext();
  await assert.rejects(() => pending, /超时|timeout/, 'A held response body must be aborted by the fetch timeout.');
}

// ---------- 核心快照失败不提交、断点续传且不重复下载 ----------
{
  const a = entryFor('assets/js/a.js', 'AAA', 'application/javascript');
  const b = entryFor('assets/js/b.js', 'BBB', 'application/javascript');
  const shell = entryFor('index.html', SHELL_TEXT, 'text/html');
  const manifest = manifestFixture(R3, [a, b, shell], []);
  const files = new Map();
  files.set('http://test/offline-manifest.json', { bytes: encode(JSON.stringify(manifest)), type: 'application/json' });
  for (const item of [a, b, shell]) serveCoreSnapshot(files, `http://test/assets/offline/${R3}/`, item);
  const failureMap = new Map([[`http://test/assets/offline/${R3}/assets/js/b.js`, 'throw']]);
  const ctx = createManagerContext({ files, failureMap });
  await ctx.manager.start();
  assert.equal(ctx.manager.getStatus().core.state, 'error', 'A failed core entry must leave the release incomplete.');
  let meta = await readManagerMeta(ctx.stores);
  assert.ok(!meta || !meta.releases[R3], 'Partial downloads must never register or mark a release complete.');
  const aFetchesBefore = fetchCount(ctx, '/assets/js/a.js');
  failureMap.delete(`http://test/assets/offline/${R3}/assets/js/b.js`);
  await ctx.manager.checkForUpdates();
  assert.equal(ctx.manager.getStatus().core.state, 'ready', 'A retry must resume and complete the release.');
  assert.equal(fetchCount(ctx, '/assets/js/a.js'), aFetchesBefore, 'Verified staged items must not be re-downloaded.');
  meta = await readManagerMeta(ctx.stores);
  assert.equal(meta.releases[R3].complete, true);

  const htmlCtx = createManagerContext({
    files: new Map([
      ['http://test/offline-manifest.json', { bytes: encode(JSON.stringify(manifest)), type: 'application/json' }],
      [`http://test/assets/offline/${R3}/assets/js/a.js`, { bytes: a.bytes, type: 'application/javascript', html: true }],
    ]),
  });
  await htmlCtx.manager.start();
  assert.match(htmlCtx.manager.getStatus().lastError, /MIME|HTML/, 'An HTML challenge response must fail core verification.');

  const corruptCtx = createManagerContext({
    files: new Map([
      ['http://test/offline-manifest.json', { bytes: encode(JSON.stringify(manifest)), type: 'application/json' }],
      [`http://test/assets/offline/${R3}/assets/js/a.js`, { bytes: a.bytes, type: 'application/javascript', corrupt: true }],
    ]),
  });
  await corruptCtx.manager.start();
  assert.match(corruptCtx.manager.getStatus().lastError, /摘要|大小/, 'A hash/size mismatch must fail core verification.');
}

// ---------- HTML 入口只走纯文本传输副本：普通 HTML 地址即使被注入也不读取 ----------
{
  const app = entryFor('assets/js/app.js', 'APP', 'application/javascript');
  const shell = entryFor('index.html', SHELL_TEXT, 'text/html');
  const manifest = manifestFixture(R1, [app, shell], []);
  const snapshot = `http://test/assets/offline/${R1}/`;
  const files = new Map();
  files.set('http://test/offline-manifest.json', { bytes: encode(JSON.stringify(manifest)), type: 'application/json' });
  files.set(snapshot + 'assets/js/app.js', { bytes: app.bytes, type: 'application/javascript' });
  // 普通 HTML 地址被托管层注入了额外脚本，绝不能被当作 pinned 字节。
  files.set(snapshot + 'index.html', { bytes: encode(SHELL_TEXT + '<script>host-injected</script>'), type: 'text/html' });
  files.set(snapshot + 'index.html.txt', { bytes: shell.bytes, type: 'text/plain; charset=utf-8' });
  const ctx = createManagerContext({ files });
  const status = await ctx.manager.start();
  assert.equal(status.core.state, 'ready', 'A text/plain transport copy must satisfy the HTML core entry.');
  assert.equal(ctx.calls.fetch.filter((call) => call.url === snapshot + 'index.html.txt').length, 1, 'The HTML core must download the .txt transport copy.');
  assert.equal(ctx.calls.fetch.filter((call) => call.url === snapshot + 'index.html').length, 0, 'The possibly-rewritten HTML URL must never be downloaded.');
  const cachedShell = ctx.stores.get(`opentavern-root-core-${R1}`).get(snapshot + 'index.html');
  assert.ok(cachedShell, 'The shell must be cached under the original index.html key.');
  assert.equal(cachedShell.headers.get('content-type'), 'text/html', 'The cached shell must keep text/html for Service Worker navigation.');
  assert.equal(await cachedShell.text(), SHELL_TEXT, 'The cached shell must be the pinned bytes, not the injected HTML.');
}

// ---------- HTML 传输副本类型/字节错误必须拒绝，且不改动已就绪旧版 ----------
{
  const appV1 = entryFor('assets/js/app.js', 'APP-V1', 'application/javascript');
  const shellV1 = entryFor('index.html', '<html>v1</html>', 'text/html');
  const manifestV1 = manifestFixture(R1, [appV1, shellV1], []);
  const appV2 = entryFor('assets/js/app.js', 'APP-V2', 'application/javascript');
  const shellV2 = entryFor('index.html', '<html>v2</html>', 'text/html');
  const manifestV2 = manifestFixture(R2, [appV2, shellV2], []);

  function stagedTransportContext(transport) {
    const files = new Map();
    files.set('http://test/offline-manifest.json', { bytes: encode(JSON.stringify(manifestV2)), type: 'application/json' });
    files.set(`http://test/assets/offline/${R2}/assets/js/app.js`, { bytes: appV2.bytes, type: 'application/javascript' });
    if (transport) files.set(`http://test/assets/offline/${R2}/index.html.txt`, transport);
    const ctx = createManagerContext({
      files,
      runtime: { releaseId: R1, basePath: '/', snapshotBase: `/assets/offline/${R1}/`, manifestUrl: '/offline-manifest.json' },
    });
    seedManagerMeta(ctx.stores, { version: 2, activeReleaseId: R1, releases: { [R1]: { complete: true, manifest: manifestV1, public: {} } } });
    seedCoreCache(ctx, R1, [appV1, shellV1]);
    return ctx;
  }

  const wrongMime = stagedTransportContext({ bytes: shellV2.bytes, type: 'text/html' });
  await assert.rejects(() => wrongMime.manager.checkForUpdates(), /类型/, 'An HTML challenge at the transport URL must be rejected.');
  assert.equal(wrongMime.manager.getStatus().activeReleaseId, R1);
  assert.equal(wrongMime.manager.getStatus().core.state, 'ready', 'A rejected transport copy must keep the old release usable.');

  const wrongBytes = stagedTransportContext({ bytes: encode('<html>v2-rewritten</html>'), type: 'text/plain' });
  await assert.rejects(() => wrongBytes.manager.checkForUpdates(), /大小|摘要/, 'Rewritten transport bytes must fail the original size/hash check.');
  assert.equal(wrongBytes.manager.getStatus().activeReleaseId, R1);
  assert.equal(wrongBytes.manager.getStatus().core.state, 'ready', 'Rewritten transport bytes must not drop the old release.');

  const wrongHash = stagedTransportContext({ bytes: encode('<html>XX</html>'), type: 'text/plain' });
  await assert.rejects(() => wrongHash.manager.checkForUpdates(), /摘要/, 'Same-size corrupted transport bytes must fail SHA-256 validation.');
  assert.equal(wrongHash.manager.getStatus().activeReleaseId, R1);
  assert.equal(wrongHash.manager.getStatus().core.state, 'ready');

  const absent = stagedTransportContext(null);
  await assert.rejects(() => absent.manager.checkForUpdates(), 'A missing transport copy must fail explicitly instead of falling back to HTML.');
  assert.equal(absent.manager.getStatus().core.state, 'ready', 'A missing transport copy must not drop the old release.');
}

// ---------- 状态统计必须基于真实缓存：缺文件/校验失败都不算就绪 ----------
{
  const app = entryFor('assets/js/app.js', 'APP', 'application/javascript');
  const shell = entryFor('index.html', SHELL_TEXT, 'text/html');
  const manifest = manifestFixture(R1, [app, shell], []);
  const ctx = createManagerContext({
    runtime: { releaseId: R1, basePath: '/', snapshotBase: `/assets/offline/${R1}/`, manifestUrl: '/offline-manifest.json' },
  });
  seedManagerMeta(ctx.stores, { version: 2, activeReleaseId: R1, releases: { [R1]: { complete: true, manifest, public: digestMapFor(manifest) } } });
  await ctx.manager.refreshStatus();
  let status = ctx.manager.getStatus();
  assert.notEqual(status.core.state, 'ready', 'A complete marker without cached files must not report ready.');
  assert.equal(status.core.ready, 0);
  seedCoreCache(ctx, R1, [app]);
  ctx.stores.get(`opentavern-root-core-${R1}`).set(`http://test/assets/offline/${R1}/index.html`, new FakeResponse('<html>tampered-bytes</html>', { headers: { 'Content-Type': 'text/html' } }));
  await ctx.manager.refreshStatus();
  status = ctx.manager.getStatus();
  assert.equal(status.core.ready, 1, 'A mismatched cached file must be dropped from the ready count.');
  assert.notEqual(status.core.state, 'ready', 'A revalidation failure must not report a ready core.');
  assert.equal(ctx.stores.get(`opentavern-root-core-${R1}`).has(`http://test/assets/offline/${R1}/index.html`), false, 'Invalid cached core bytes must be deleted.');
}

// ---------- 公共资料中断如实暂停，恢复只补缺失项 ----------
{
  const app = entryFor('assets/js/app.js', 'APP', 'application/javascript');
  const shell = entryFor('index.html', SHELL_TEXT, 'text/html');
  const p1 = entryFor('cards/a.png', 'png-a', 'image/png');
  const p2 = entryFor('cards/b.json', '{}', 'application/json');
  const manifest = manifestFixture(R3, [app, shell], [p1, p2]);
  const files = new Map();
  files.set('http://test/offline-manifest.json', { bytes: encode(JSON.stringify(manifest)), type: 'application/json' });
  for (const item of [app, shell]) serveCoreSnapshot(files, `http://test/assets/offline/${R3}/`, item);
  serveUrl(files, 'http://test/', 'cards/a.png', p1.bytes, 'image/png');
  serveUrl(files, 'http://test/', 'cards/b.json', p2.bytes, 'application/json');
  const failureMap = new Map([['http://test/cards/b.json', 'throw']]);
  const ctx = createManagerContext({
    files, failureMap,
    runtime: { releaseId: R3, basePath: '/', snapshotBase: `/assets/offline/${R3}/`, manifestUrl: '/offline-manifest.json' },
  });
  await ctx.manager.start();
  assert.equal(await ctx.manager.preparePublic(), false, 'A failing public batch must report failure instead of completion.');
  const paused = ctx.manager.getStatus().public;
  assert.equal(paused.stopped, true, 'An interrupted public batch must be recorded as paused.');
  assert.equal(paused.ready, 1, 'Completed public entries must be counted truthfully.');
  failureMap.delete('http://test/cards/b.json');
  assert.equal(await ctx.manager.preparePublic(), true, 'Resuming must complete the public batch.');
  assert.equal(ctx.manager.getStatus().public.ready, 2);
  assert.equal(fetchCount(ctx, '/cards/a.png'), 1, 'Already prepared public bytes must not be re-downloaded.');
}

// ---------- 旧标签页保留自身版本，新版本只标记可切换且公共映射互不覆盖 ----------
async function makeUpdateReadyContext(options = {}) {
  const appV1 = entryFor('assets/js/app.js', 'APP-V1', 'application/javascript');
  const shellV1 = entryFor('index.html', '<html>v1</html>', 'text/html');
  const appV2 = entryFor('assets/js/app.js', 'APP-V2', 'application/javascript');
  const shellV2 = entryFor('index.html', '<html>v2</html>', 'text/html');
  const pngV1 = entryFor('cards/a.png', 'png-v1', 'image/png');
  const pngV2 = entryFor('cards/a.png', 'png-v2', 'image/png');
  const manifestV1 = manifestFixture(R1, [appV1, shellV1], [pngV1]);
  const manifestV2 = manifestFixture(R2, [appV2, shellV2], [pngV2]);
  const files = new Map();
  files.set('http://test/offline-manifest.json', { bytes: encode(JSON.stringify(manifestV2)), type: 'application/json' });
  for (const item of [appV2, shellV2]) serveCoreSnapshot(files, `http://test/assets/offline/${R2}/`, item);
  serveUrl(files, 'http://test/', 'cards/a.png', pngV2.bytes, 'image/png');
  const sw = createFakeSwLink({ handler: options.handler });
  const ctx = createManagerContext({
    files,
    sw,
    runtime: { releaseId: R1, basePath: '/', snapshotBase: `/assets/offline/${R1}/`, manifestUrl: '/offline-manifest.json' },
    estimate: options.estimate,
  });
  seedManagerMeta(ctx.stores, { version: 2, activeReleaseId: R1, releases: { [R1]: { complete: true, manifest: manifestV1, public: digestMapFor(manifestV1) } } });
  seedCoreCache(ctx, R1, [appV1, shellV1]);
  ctx.stores.set('opentavern-root-public', new Map([
    [`http://test/__ot-public__/${pngV1.record.sha256}`, new FakeResponse(pngV1.bytes, { headers: { 'Content-Type': 'image/png' } })],
  ]));
  Object.assign(ctx.sandbox, options.globals || {});
  await ctx.manager.start();
  return { ctx, sw, manifestV1, manifestV2 };
}

{
  const offline = await makeUpdateReadyContext({ globals: { fetch: async () => { throw new Error('offline'); } } });
  const ready = offline.ctx.manager.getStatus();
  assert.equal(ready.core.state, 'ready', 'Offline startup must restore cached readiness before trying the update service.');
  assert.equal(ready.core.ready, 2);
  assert.equal(ready.public.ready, 1);
  const damaged = await makeUpdateReadyContext();
  const cache = damaged.ctx.stores.get('opentavern-root-public');
  const key = [...cache.keys()][0];
  cache.set(key, new FakeResponse('PNG-V1', { headers: { 'Content-Type': 'image/png' } }));
  await damaged.ctx.manager.refreshStatus();
  assert.equal(damaged.ctx.manager.getStatus().public.ready, 0, 'Same-size corrupted public bytes must not remain marked ready.');
}

{
  const { ctx, sw, manifestV1, manifestV2 } = await makeUpdateReadyContext();
  const status = ctx.manager.getStatus();
  assert.equal(status.activeReleaseId, R1, 'An old tab must keep its active release while a new one is staged.');
  assert.equal(status.loadedReleaseId, R1);
  assert.equal(status.update.available, true, 'A staged, complete new release must be offered for switching.');
  assert.equal(status.update.releaseId, R2);
  assert.equal(ctx.runtime.snapshotBase, `/assets/offline/${R1}/`, 'The runtime must not repoint to an unapplied release.');
  const meta = await readManagerMeta(ctx.stores);
  assert.equal(meta.activeReleaseId, R1, 'Staging a new release must not change the active pointer.');
  assert.equal(meta.releases[R2].complete, true);
  assert.equal(meta.releases[R1].public['/cards/a.png'], manifestV1.public[0].sha256, 'Staging must not overwrite the active public map.');
  assert.equal(meta.releases[R2].public['/cards/a.png'], manifestV2.public[0].sha256);
  assert.equal(ctx.manager.isPublicPrepared('cards/a.png'), true, 'The loaded version binding must decide public readiness, not the staged one.');
  assert.equal(fetchCount(ctx, '/cards/a.png'), 0, 'Staging must not download the new public bytes for the loaded version.');
  assert.ok(sw.state.payloads.some((payload) => payload.type === 'ot-register-release' && payload.releaseId === R1), 'The page must register its loaded release with the worker.');
}

// ---------- 切换版本的前置门禁与异步后再校验 ----------
{
  const idle = await makeUpdateReadyContext();
  assert.equal(await idle.ctx.manager.applyUpdate(), true, 'An idle single tab must be allowed to switch.');
  assert.equal(idle.ctx.manager.getStatus().update.available, false);

  const blocked = [
    ['generating', { state: { isGenerating: true } }],
    ['message draft', { dom: { messageInput: { value: 'x' }, messagesContainer: { querySelector: () => null } } }],
    ['pending persist record', { _persistPendingRecords: [{ status: 'deferred' }] }],
    ['conversation commit', { state: { conversations: { c1: { _messageCommitInProgress: true } } } }],
    ['inline message edit', { dom: { messageInput: { value: '' }, messagesContainer: { querySelector: (selector) => (selector === '.msg-bubble textarea' ? {} : null) } } }],
    ['user draft request', { userDraftRequest: { id: 1 } }],
    ['changed settings draft', { settingsFormDraft: { a: 1 }, settingsFormBaseline: { a: 2 } }],
    ['unread settings control', { settingsFormDraft: { a: 1 }, settingsFormBaseline: { a: 1 }, readSettingsFormIntoState(target) { target.a = 2; } }],
    ['unsaved persona control', { settingsFormDraft: { a: 1 }, settingsFormBaseline: { a: 1 }, readSettingsPersonaCandidate() { return { keys: ['userName'] }; } }],
    ['unsaved image token', { settingsFormDraft: { a: 1 }, settingsFormBaseline: { a: 1 }, settingsImageTokenBaseline: 'before', dom: { imageGenerationToken: { value: 'after' } } }],
    ['backup restore pending', { isBackupRestorePending: () => true }],
    ['storage replacement', { storageReplacementActive: 1 }],
    ['cloud sync active', { cloudSyncActiveOperations: 1 }],
  ];
  for (const [name, globals] of blocked) {
    const scenario = await makeUpdateReadyContext({ globals });
    await assert.rejects(() => scenario.ctx.manager.applyUpdate(), /暂不切换版本/, `Pending work must block the switch: ${name}`);
    assert.equal(scenario.sw.state.payloads.filter((payload) => payload.type === 'ot-apply-update').length, 0, `No switch request may be sent while blocked: ${name}`);
  }

  const unchangedSettings = await makeUpdateReadyContext({ globals: { settingsFormDraft: { a: 1 }, settingsFormBaseline: { a: 1 } } });
  assert.equal(await unchangedSettings.ctx.manager.applyUpdate(), true, 'An open but unchanged settings form must not permanently block the switch.');

  const refused = await makeUpdateReadyContext({ handler: () => ({ ok: false, reason: '请先关闭其他标签页再切换版本' }) });
  await assert.rejects(() => refused.ctx.manager.applyUpdate(), /其他标签页/, 'Another app tab must block the switch.');

  // 等待 Service Worker 期间出现的草稿必须阻止重载。
  let holder = null;
  const racy = await makeUpdateReadyContext({
    handler: () => {
      holder.ctx.sandbox.dom = { messageInput: { value: 'late draft' }, messagesContainer: { querySelector: () => null } };
      return { ok: true };
    },
  });
  holder = racy;
  await assert.rejects(() => racy.ctx.manager.applyUpdate(), /暂不切换版本/, 'A draft appearing during the async switch must abort the update.');
}

// ---------- 清理缓存：保留活动核心，清掉公共与无用版本，其他窗口占用时拒绝 ----------
{
  const { ctx, manifestV2 } = await makeUpdateReadyContext();
  ctx.stores.set(`opentavern-root-core-${R9}`, new Map([
    [`http://test/assets/offline/${R9}/index.html`, new FakeResponse('<html>old</html>', { headers: { 'Content-Type': 'text/html' } })],
  ]));
  const seeded = await readManagerMeta(ctx.stores);
  seeded.releases[R9] = { complete: true, manifest: manifestV2, public: {} };
  seedManagerMeta(ctx.stores, seeded);
  assert.equal(await ctx.manager.clearDownloads(), true, 'Clearing must report the removed caches.');
  assert.equal(ctx.stores.has(`opentavern-root-core-${R9}`), false, 'Unused core versions must be deleted.');
  assert.equal(ctx.stores.has(`opentavern-root-core-${R1}`), true, 'The active complete core must be retained.');
  const publicStore = ctx.stores.get('opentavern-root-public');
  assert.ok(!publicStore || publicStore.size === 0, 'Public downloadable bytes must be cleared.');
  assert.equal(ctx.manager.isPublicPrepared('cards/a.png'), false, 'The in-memory public digest set must be cleared.');
  const after = await readManagerMeta(ctx.stores);
  assert.equal(after.releases[R9], undefined, 'Unused release metadata must be pruned.');
  assert.equal(after.releases[R1].complete, true, 'The active release metadata must be retained.');
  const status = ctx.manager.getStatus();
  assert.equal(status.public.ready, 0, 'Public status must be reset accurately.');
  assert.equal(status.core.state, 'ready', 'The retained active core must stay ready.');
}
{
  const busy = await makeUpdateReadyContext({ handler: (payload) => (payload.type === 'ot-assert-idle-clients' ? { ok: false, reason: 'busy' } : { ok: true }) });
  assert.equal(await busy.ctx.manager.clearDownloads(), false, 'Cleanup must be refused while other tabs may use the caches.');
  const busyPublic = busy.ctx.stores.get('opentavern-root-public');
  assert.ok(busyPublic && busyPublic.size > 0, 'A refused cleanup must not delete anything.');
  assert.equal(busy.ctx.stores.has(`opentavern-root-core-${R1}`), true);
}

{
  const ctx = createManagerContext({ files: new Map([['http://test/cards/legacy.json', { bytes: encode('{"name":"HTTP"}'), type: 'application/json' }]]) });
  ctx.sandbox.navigator.serviceWorker = null;
  ctx.sandbox.window.caches = null;
  ctx.sandbox.PUBLIC_CARDS = [{ jsonUrl: '/cards/legacy.json' }];
  await ctx.manager.start();
  assert.equal(ctx.manager.getStatus().supported, false);
  assert.equal((await (await ctx.manager.readPublic('/cards/legacy.json')).json()).name, 'HTTP', 'Plain HTTP must retain online imports from the embedded catalog.');
  const count = ctx.calls.length;
  await assert.rejects(() => ctx.manager.readPublic('/api/private'), /白名单/);
  assert.equal(ctx.calls.length, count, 'An unknown same-origin API must not be fetched by the public reader.');
}

console.log('Offline runtime checks passed: SW API/auth/POST exclusion, immutable whitelist, per-release public binding, first-install claim, strict manifest rejection, body timeout, atomic resume, active/pending isolation, pending-work gating, truthful cache clearing and local-first readPublic.');
