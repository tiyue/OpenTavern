// R5 私有图片本地字节的隔离运行时验证：只使用合成地址与合成字节，不访问任何真实站点或用户数据。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const readChunk = (name) => fs.readFileSync(new URL(`../src/app/${name}`, import.meta.url), 'utf8');
const copy = (value) => JSON.parse(JSON.stringify(value));

const CHUNKS = [
  'conversation/32-message-identity.js',
  'state/35-persist-records.js',
  'state/35-state-persistence.js',
  'state/35-persist-snapshot-helpers.js',
  'state/35-conversation-mutation-persistence.js',
  'summary/41-summary-validity.js',
  'transfer/63-conversation-export-helpers.js',
  'chat/61-message-attachments-render.js',
  'offline/21-private-media-local.js',
  'image/51-image-generation-message.js'
];

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52]);
const JPEG_BYTES = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01]);
const GIF_BYTES = new Uint8Array(Buffer.from('GIF89a0000000000', 'binary'));
const WEBP_BYTES = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x00, 0x00, 0x00, 0x00]);
const HTML_BYTES = new Uint8Array(Buffer.from('<html><body>not an image</body></html>', 'utf8'));
const SVG_BYTES = new Uint8Array(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>', 'utf8'));

class TestBlob {
  constructor(parts, options) {
    this.parts = (parts || []).map((part) => (part instanceof Uint8Array ? part : new Uint8Array(part)));
    this.type = (options && options.type) || '';
    this.size = this.parts.reduce((total, part) => total + part.byteLength, 0);
  }
  bytes() {
    const merged = new Uint8Array(this.size);
    let offset = 0;
    this.parts.forEach((part) => {
      merged.set(part, offset);
      offset += part.byteLength;
    });
    return merged;
  }
}

class TestFileReader {
  readAsDataURL(blob) {
    this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(blob.bytes()).toString('base64')}`;
    queueMicrotask(() => { if (this.onload) this.onload(); });
  }
  abort() {
    if (this.onabort) this.onabort();
  }
}

// 合成对象 URL：让 Image 后备解码路径能拿到对应的 Blob 字节，用于模拟真实解码。
const objectUrls = new Map();
let objectUrlSeq = 0;
class TestURL extends URL {}
TestURL.createObjectURL = (blob) => {
  const url = `blob:test/${++objectUrlSeq}`;
  objectUrls.set(url, blob);
  return url;
};
TestURL.revokeObjectURL = (url) => { objectUrls.delete(url); };

function makeResponse(parts, options = {}) {
  const chunks = (parts || []).map((part) => (part instanceof Uint8Array ? part : new Uint8Array(part)));
  const headers = {};
  Object.keys(options.headers || {}).forEach((key) => { headers[key.toLowerCase()] = String(options.headers[key]); });
  const status = options.status === undefined ? 200 : options.status;
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => (Object.prototype.hasOwnProperty.call(headers, String(name).toLowerCase()) ? headers[String(name).toLowerCase()] : null) },
    body: {
      getReader: () => {
        let index = 0;
        return {
          read: async () => (index < chunks.length ? { done: false, value: chunks[index++] } : { done: true }),
          cancel: async () => {},
          releaseLock: () => {}
        };
      },
      cancel: async () => {}
    },
    arrayBuffer: async () => {
      const merged = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.byteLength, 0));
      let offset = 0;
      chunks.forEach((chunk) => {
        merged.set(chunk, offset);
        offset += chunk.byteLength;
      });
      return merged.buffer;
    }
  };
}

const flush = async (rounds = 8) => {
  for (let i = 0; i < rounds; i += 1) await new Promise((resolve) => setImmediate(resolve));
};

async function waitFor(predicate, label) {
  for (let i = 0; i < 500; i += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

// 保存门闸：让一次可靠保存在落盘前停住，用于验证“确认前不改内存、失败保留原数据”。
function holdSave(context) {
  let release;
  const promise = new Promise((resolve) => { release = resolve; });
  context.saveHold = { promise };
  return { release: () => { context.saveHold = null; release(); } };
}

// 下载门闸：让一次图片读取停在响应返回前，用于验证删除/编辑/换 URL 竞态。
function holdFetch(context, response) {
  let release;
  const promise = new Promise((resolve) => { release = resolve; });
  context.fetchImpl = async () => { await promise; return response; };
  return () => release();
}

function createHarness(options = {}) {
  const conversations = options.conversations || {};
  const characters = options.characters || {};
  const context = {
    console: { log() {}, warn() {}, error() {} },
    Promise, URL: TestURL, Buffer, Uint8Array, setTimeout, clearTimeout, AbortController,
    Blob: TestBlob,
    FileReader: TestFileReader,
    createImageBitmap: async () => ({ width: 4, height: 4, close() {} }),
    caches: {
      open() { context.counters.caches += 1; return Promise.resolve({}); },
      match() { context.counters.caches += 1; return Promise.resolve(undefined); },
      delete() { context.counters.caches += 1; return Promise.resolve(false); },
      keys() { context.counters.caches += 1; return Promise.resolve([]); }
    },
    navigator: { get onLine() { context.counters.onLine += 1; return false; } },
    state: {
      settings: { contextLength: 4096 },
      conversations,
      characters,
      conversationOrder: Object.keys(conversations),
      activeConvId: Object.keys(conversations)[0] || null
    },
    t: (key) => key,
    getSafeSettingsForPersist: () => copy(context.state.settings),
    getCloudSyncPortableSettings: (value) => copy(value || {}),
    getSafeSettingsForCloudSync: () => ({}),
    getConversationIdsWithMissingFallback: (order, list) => [...new Set([...(order || []), ...Object.keys(list || {})])].filter((key) => list[key]),
    getValidConversationIdOrFallback: (active, order, list) => (list && list[active] ? active : (order || []).find((key) => list && list[key]) || null),
    scheduleCloudSyncUpload() {},
    renderMessagesOnly() { context.renderCalls.messages += 1; },
    renderConversationListOnly() { context.renderCalls.conversations += 1; },
    escapeHtml: (value) => String(value == null ? '' : value),
    StorageService: {
      _cloneForPersist: copy,
      _isQuotaError: () => false,
      async saveAll(snapshot) {
        const attempted = copy(snapshot);
        context.writes.push(attempted);
        const hold = context.saveHold;
        if (hold) {
          context.saveHold = null;
          await hold.promise;
        }
        if (context.saveFail) throw new Error('quota exceeded');
        context.durableWrites.push(attempted);
      }
    }
  };
  // 后备解码用的 Image 桩：默认按 Blob 字节“解码”成功，可按需模拟失败或悬挂；<16 字节视为截断拒绝。
  class HarnessImage {
    constructor() {
      this.naturalWidth = 0;
      this.naturalHeight = 0;
      this.width = 0;
      this.height = 0;
      this.onload = null;
      this.onerror = null;
      this._src = '';
    }
    set src(value) {
      this._src = value;
      const behavior = context.imageBehavior;
      const blob = objectUrls.get(value);
      queueMicrotask(() => {
        if (behavior === 'error' || !blob || blob.bytes().length < 16) {
          if (this.onerror) this.onerror();
          return;
        }
        if (behavior === 'hang') return;
        this.naturalWidth = 4;
        this.naturalHeight = 4;
        this.width = 4;
        this.height = 4;
        if (this.onload) this.onload();
      });
    }
    get src() { return this._src; }
  }
  context.Image = HarnessImage;
  context.imageBehavior = 'load';
  context.writes = [];
  context.durableWrites = [];
  context.fetchCalls = [];
  context.renderCalls = { messages: 0, conversations: 0 };
  context.counters = { caches: 0, onLine: 0 };
  context.inFlight = 0;
  context.maxInFlight = 0;
  context.saveFail = false;
  context.saveHold = null;
  context.fetchImpl = async () => { throw new Error('unexpected fetch'); };
  context.fetch = async (url, init) => {
    context.fetchCalls.push({ url, init });
    context.inFlight += 1;
    context.maxInFlight = Math.max(context.maxInFlight, context.inFlight);
    try {
      return await context.fetchImpl(url, init);
    } finally {
      context.inFlight -= 1;
    }
  };
  vm.createContext(context);
  CHUNKS.forEach((file) => vm.runInContext(readChunk(file), context, { filename: file }));
  return context;
}

const pngResponse = () => makeResponse([PNG_BYTES], { headers: { 'content-type': 'image/png' } });
const attachmentMessage = (url, extra = {}) => ({
  id: 'm1',
  role: 'assistant',
  content: 'image message',
  attachments: [Object.assign({ type: 'image', url, mime: 'image/png', width: 32, height: 32 }, extra)]
});
const conversation = (message) => ({ id: 'c1', title: 't', messages: [message], summaries: [], updated: 1 });

// 1) 非法地址：只接受无凭据的 http/https，且绝不发起请求。
{
  const context = createHarness();
  const illegal = ['file:///tmp/a.png', 'data:image/png;base64,AA==', 'blob:https://img.example/x', '/cards/a.png', 'cards/a.png',
    'javascript:alert(1)', 'https://user:pw@img.example/a.png', 'ftp://img.example/a.png', 'not a url', ''];
  for (const url of illegal) {
    await assert.rejects(() => context.downloadPrivateMediaBytes(url, {}), /仅支持无凭据的 http\/https 图片地址/);
    assert.equal(context.PrivateMediaLocal.isRemoteImageUrl(url), false, `${url} must not be a remote image url`);
  }
  assert.equal(context.PrivateMediaLocal.isRemoteImageUrl('https://img.example/a.png'), true);
  assert.equal(context.PrivateMediaLocal.isRemoteImageUrl('http://img.example/a.png'), true);
  assert.equal(context.fetchCalls.length, 0, 'illegal urls must never be fetched');
}

// 2) 请求形状：无凭据、拒绝重定向、无 referrer、无自定义头，且不使用 CacheStorage / navigator.onLine。
{
  const context = createHarness();
  context.fetchImpl = async () => pngResponse();
  const downloaded = await context.downloadPrivateMediaBytes('https://img.example/a.png', {});
  assert.equal(context.fetchCalls.length, 1);
  assert.equal(context.fetchCalls[0].url, 'https://img.example/a.png', 'the original url must not be rewritten');
  const init = context.fetchCalls[0].init;
  assert.equal(init.method, 'GET');
  assert.equal(init.credentials, 'omit');
  assert.equal(init.redirect, 'error');
  assert.equal(init.referrerPolicy, 'no-referrer');
  assert.equal(init.cache, 'no-store');
  assert.equal(init.headers, undefined, 'no auth header or token may be injected');
  assert.equal(downloaded.mime, 'image/png');
  assert.deepEqual(Array.from(downloaded.bytes), Array.from(PNG_BYTES));
  assert.equal(context.counters.caches, 0, 'private urls must never be stored in CacheStorage');
  assert.equal(context.counters.onLine, 0, 'local media must not consult navigator.onLine');
}

// 2b) 网络读取失败、超时与显式取消都必须是本地化错误，且不得断言“一定是 CORS”。
{
  const network = createHarness();
  network.fetchImpl = async () => { throw new TypeError('Failed to fetch'); };
  await assert.rejects(
    () => network.downloadPrivateMediaBytes('https://img.example/a.png', {}),
    (error) => /无法读取该图片地址/.test(error.message) && !/CORS/.test(error.message) && !/确认.*跨域/.test(error.message)
  );

  const httpStatus = createHarness();
  httpStatus.fetchImpl = async () => makeResponse([], { status: 403 });
  await assert.rejects(() => httpStatus.downloadPrivateMediaBytes('https://img.example/a.png', {}), /图片读取失败（HTTP 403）/);

  const timedOut = createHarness();
  const delays = [];
  timedOut.setTimeout = (callback, delay) => { delays.push(delay); callback(); return 0; };
  timedOut.clearTimeout = () => {};
  timedOut.fetchImpl = async () => { throw Object.assign(new Error('aborted'), { name: 'AbortError' }); };
  await assert.rejects(() => timedOut.downloadPrivateMediaBytes('https://img.example/a.png', {}), /超过 8 秒仍未完成/);
  assert.deepEqual(delays, [8000], 'the download timeout must be finite and bounded');

  const cancelled = createHarness();
  cancelled.fetchImpl = async (url, init) => new Promise((resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  });
  const controller = new AbortController();
  const pending = cancelled.downloadPrivateMediaBytes('https://img.example/a.png', { signal: controller.signal });
  await waitFor(() => cancelled.fetchCalls.length === 1, 'cancelled download start');
  controller.abort();
  await assert.rejects(() => pending, /图片准备已取消/);

  const preAborted = createHarness();
  preAborted.fetchImpl = async () => pngResponse();
  const abortedController = new AbortController();
  abortedController.abort();
  await assert.rejects(() => preAborted.downloadPrivateMediaBytes('https://img.example/a.png', { signal: abortedController.signal }), /图片准备已取消/);
  assert.equal(preAborted.fetchCalls.length, 0, 'an already cancelled download must not fetch');
}

// 3) MIME/签名矩阵：只接受 PNG/JPEG/WebP/GIF 真实位图。
{
  const cases = [
    { label: 'svg mime', bytes: SVG_BYTES, headers: { 'content-type': 'image/svg+xml' }, pattern: /该图片格式不受支持/ },
    { label: 'html mime', bytes: HTML_BYTES, headers: { 'content-type': 'text/html' }, pattern: /该图片格式不受支持/ },
    { label: 'png declared, html bytes', bytes: HTML_BYTES, headers: { 'content-type': 'image/png' }, pattern: /不是受支持的位图/ },
    { label: 'no mime, html bytes', bytes: HTML_BYTES, headers: {}, pattern: /不是受支持的位图/ },
    { label: 'jpeg declared, png bytes', bytes: PNG_BYTES, headers: { 'content-type': 'image/jpeg' }, pattern: /声明的格式与实际内容不一致/ },
    { label: 'svg bytes with png mime', bytes: SVG_BYTES, headers: { 'content-type': 'image/png' }, pattern: /不是受支持的位图/ }
  ];
  for (const item of cases) {
    const context = createHarness();
    context.fetchImpl = async () => makeResponse([item.bytes], { headers: item.headers });
    await assert.rejects(() => context.downloadPrivateMediaBytes('https://img.example/a.bin', {}), item.pattern, item.label);
  }
  const accepted = [
    { bytes: PNG_BYTES, mime: 'image/png', headers: { 'content-type': 'image/png' } },
    { bytes: JPEG_BYTES, mime: 'image/jpeg', headers: { 'content-type': 'image/jpg' } },
    { bytes: GIF_BYTES, mime: 'image/gif', headers: { 'content-type': 'image/gif' } },
    { bytes: WEBP_BYTES, mime: 'image/webp', headers: { 'content-type': 'image/webp' } },
    { bytes: PNG_BYTES, mime: 'image/png', headers: {} }
  ];
  for (const item of accepted) {
    const context = createHarness();
    context.fetchImpl = async () => makeResponse([item.bytes], { headers: item.headers });
    const downloaded = await context.downloadPrivateMediaBytes('https://img.example/a.bin', {});
    assert.equal(downloaded.mime, item.mime);
  }
}

// 4) 超限：声明长度与流式实际字节都受限，超限只报错，不写入任何状态。
{
  const declared = createHarness();
  declared.fetchImpl = async () => makeResponse([PNG_BYTES], { headers: { 'content-type': 'image/png', 'content-length': String(20 * 1024 * 1024) } });
  await assert.rejects(() => declared.downloadPrivateMediaBytes('https://img.example/big.png', {}), /超过本地保存上限/);

  const streamed = createHarness();
  streamed.fetchImpl = async () => makeResponse([PNG_BYTES, PNG_BYTES], { headers: { 'content-type': 'image/png' } });
  await assert.rejects(() => streamed.downloadPrivateMediaBytes('https://img.example/big.png', { maxBytes: 16 }), /超过本地保存上限/);

  const inMessage = createHarness({ conversations: { c1: conversation({ id: 'm1', role: 'assistant', content: '', attachments: [{ type: 'image', url: 'https://img.example/big.png' }] }) } });
  inMessage.fetchImpl = async () => makeResponse([PNG_BYTES], { headers: { 'content-type': 'image/png', 'content-length': String(20 * 1024 * 1024) } });
  const summary = await inMessage.PrivateMediaLocal.prepareMessage('c1', 'm1');
  assert.equal(summary.status, 'failed');
  assert.equal(summary.prepared, 0);
  assert.equal(inMessage.state.conversations.c1.messages[0].attachments[0].dataUrl, undefined);
  assert.equal(inMessage.writes.length, 0, 'an oversized image must not be written to state');
  assert.match(inMessage.PrivateMediaLocal.getStatus().failureMessage, /超过本地保存上限/);
}

// 5) 截断与解码：声明长度大于实际字节，或真实解码失败时都必须拒绝。
{
  const truncated = createHarness();
  truncated.fetchImpl = async () => makeResponse([PNG_BYTES], { headers: { 'content-type': 'image/png', 'content-length': '100' } });
  await assert.rejects(() => truncated.downloadPrivateMediaBytes('https://img.example/a.png', {}), /下载不完整/);

  const undecodable = createHarness();
  undecodable.createImageBitmap = async () => { throw new Error('decode failure'); };
  undecodable.fetchImpl = async () => pngResponse();
  await assert.rejects(() => undecodable.downloadPrivateMediaBytes('https://img.example/a.png', {}), /无法解码/);

  // 缺少 createImageBitmap 时退回 Image 真实加载：解码成功才通过。
  const imageFallback = createHarness();
  imageFallback.createImageBitmap = undefined;
  imageFallback.fetchImpl = async () => pngResponse();
  const decoded = await imageFallback.downloadPrivateMediaBytes('https://img.example/a.png', {});
  assert.equal(decoded.mime, 'image/png');

  // Image 解码失败（损坏/截断）必须拒绝，不能仅凭签名放行。
  const imageBroken = createHarness();
  imageBroken.createImageBitmap = undefined;
  imageBroken.imageBehavior = 'error';
  imageBroken.fetchImpl = async () => pngResponse();
  await assert.rejects(() => imageBroken.downloadPrivateMediaBytes('https://img.example/a.png', {}), /无法解码/);

  // 12 字节签名头必须在真实解码阶段被拦下，不能当成可用图片。
  const imageTruncated = createHarness();
  imageTruncated.createImageBitmap = undefined;
  imageTruncated.fetchImpl = async () => makeResponse([PNG_BYTES.slice(0, 12)], { headers: { 'content-type': 'image/png' } });
  await assert.rejects(() => imageTruncated.downloadPrivateMediaBytes('https://img.example/a.png', {}), /无法解码/);

  // 完全没有解码能力（无 createImageBitmap 也无 Image）时必须如实报“不支持”，而不是默认成功。
  const noDecoder = createHarness();
  noDecoder.createImageBitmap = undefined;
  noDecoder.Image = undefined;
  noDecoder.fetchImpl = async () => pngResponse();
  await assert.rejects(() => noDecoder.downloadPrivateMediaBytes('https://img.example/a.png', {}), /无法校验图片内容/);

  // 截断的位图也会被真实解码拦下（签名相同但内容不完整）。
  const truncatedBytes = createHarness();
  truncatedBytes.createImageBitmap = async (blob) => {
    if (blob.bytes().length < PNG_BYTES.length + 8) throw new Error('truncated');
    return { width: 4, height: 4, close() {} };
  };
  truncatedBytes.fetchImpl = async () => makeResponse([PNG_BYTES.slice(0, 12)], { headers: { 'content-type': 'image/png' } });
  await assert.rejects(() => truncatedBytes.downloadPrivateMediaBytes('https://img.example/a.png', {}), /无法解码/);
}

// 6) 附件落盘：dataUrl 优先生效、原始 URL 保留、状态与导出/备份 JSON 都携带本地字节。
{
  const context = createHarness({ conversations: { c1: conversation(attachmentMessage('https://img.example/a.png')) } });
  context.fetchImpl = async () => pngResponse();

  const before = context.PrivateMediaLocal.getStatus();
  assert.equal(before.pending, 1);
  assert.equal(before.ready, 0);
  assert.equal(before.total, 1);

  const result = await context.PrivateMediaLocal.prepareMessage('c1', 'm1');
  assert.equal(result.status, 'prepared');
  assert.equal(result.prepared, 1);
  assert.equal(result.failed, 0);

  const attachment = context.state.conversations.c1.messages[0].attachments[0];
  assert.match(attachment.dataUrl, /^data:image\/png;base64,/);
  assert.equal(attachment.url, 'https://img.example/a.png', 'the source url must be preserved');
  assert.equal(context.getRenderableImageAttachmentSource(attachment), attachment.dataUrl);
  const html = context.renderMessageAttachments(context.state.conversations.c1.messages[0]);
  assert.ok(html.includes(attachment.dataUrl), 'the renderer must prefer the local data url');
  assert.ok(!html.includes('https://img.example/a.png'), 'the renderer must not fall back to the remote url');

  const after = context.PrivateMediaLocal.getStatus();
  assert.equal(after.ready, 1);
  assert.equal(after.pending, 0);
  assert.match(after.text, /已准备 1 张本地图片；待准备 0 张/);

  assert.equal(context.durableWrites.length, 1);
  assert.match(context.durableWrites[0].conversations.c1.messages[0].attachments[0].dataUrl, /^data:image\/png;base64,/);
  const exported = JSON.stringify(context.buildAllConversationsExportData(context.state.conversations, '2026-10-15'));
  assert.ok(exported.includes(attachment.dataUrl), 'exported json must carry the local bytes');

  const repeated = await context.PrivateMediaLocal.prepareMessage('c1', 'm1');
  assert.equal(repeated.status, 'ready');
  assert.equal(context.fetchCalls.length, 1, 'already prepared bytes must not be downloaded again');
  assert.equal(context.renderCalls.messages, 1, 'only the affected active chat is refreshed');
}

// 7) 角色字段：写入现有 previewImage 字段，原 URL 记录在 previewImageSourceUrl，并同步会话内的角色副本。
{
  const context = createHarness({
    characters: { alice: { name: 'Alice', previewImage: 'https://img.example/alice.png' } },
    conversations: { c1: { id: 'c1', messages: [], summaries: [], character: { name: 'Alice', previewImage: 'https://img.example/alice.png' } } }
  });
  context.fetchImpl = async () => pngResponse();

  const result = await context.PrivateMediaLocal.prepareAll();
  assert.equal(result.failed, 0);
  assert.equal(result.prepared, 2, 'registry and conversation copies must both be updated');
  assert.equal(result.urls, 1, 'the same url must be downloaded once');
  assert.equal(context.fetchCalls.length, 1);

  const registered = context.state.characters.alice;
  assert.match(registered.previewImage, /^data:image\/png;base64,/);
  assert.equal(registered.previewImageSourceUrl, 'https://img.example/alice.png');
  const inConversation = context.state.conversations.c1.character;
  assert.match(inConversation.previewImage, /^data:image\/png;base64,/);
  assert.equal(inConversation.previewImageSourceUrl, 'https://img.example/alice.png');
  assert.equal(context.PrivateMediaLocal.getCharacterSourceField('previewImage'), 'previewImageSourceUrl');
  assert.equal(context.PrivateMediaLocal.getStatus().pending, 0);
  const exported = JSON.stringify(context.buildAllConversationsExportData(context.state.conversations, '2026-10-15'));
  assert.ok(exported.includes(registered.previewImage), 'exported json must carry the character local bytes');
  assert.ok(exported.includes('https://img.example/alice.png'), 'exported json must keep the character source url');
}

// 7b) 角色在下载期间被删除时同样不得重建或写入。
{
  const context = createHarness({ characters: { alice: { name: 'Alice', previewImage: 'https://img.example/alice.png' } } });
  const release = holdFetch(context, pngResponse());
  const preparing = context.PrivateMediaLocal.prepareAll();
  await waitFor(() => context.fetchCalls.length === 1, 'character download start');
  delete context.state.characters.alice;
  release();
  const result = await preparing;
  assert.equal(result.prepared, 0);
  assert.equal(result.skipped, 1);
  assert.equal(context.state.characters.alice, undefined, 'a deleted character must not be recreated');
  assert.equal(context.writes.length, 0);
}

// 8) 竞态一：下载期间目标消息被删除，不得重新创建消息或写入字节。
{
  const context = createHarness({ conversations: { c1: conversation(attachmentMessage('https://img.example/a.png')) } });
  const release = holdFetch(context, pngResponse());
  const preparing = context.PrivateMediaLocal.prepareMessage('c1', 'm1');
  await waitFor(() => context.fetchCalls.length === 1, 'download start');
  context.state.conversations.c1.messages = [];
  release();
  const result = await preparing;
  assert.equal(result.prepared, 0);
  assert.equal(result.skipped, 1);
  assert.equal(context.state.conversations.c1.messages.length, 0, 'a deleted message must not be recreated');
  assert.equal(context.writes.length, 0, 'a deleted target must not be persisted');
}

// 9) 竞态二：下载期间附件地址被换成别的图片，旧字节不得写入新 URL。
{
  const context = createHarness({ conversations: { c1: conversation(attachmentMessage('https://img.example/a.png')) } });
  const release = holdFetch(context, pngResponse());
  const preparing = context.PrivateMediaLocal.prepareMessage('c1', 'm1');
  await waitFor(() => context.fetchCalls.length === 1, 'download start');
  context.state.conversations.c1.messages[0].attachments[0].url = 'https://img.example/b.png';
  release();
  const result = await preparing;
  assert.equal(result.prepared, 0);
  const attachment = context.state.conversations.c1.messages[0].attachments[0];
  assert.equal(attachment.url, 'https://img.example/b.png');
  assert.equal(attachment.dataUrl, undefined);
  assert.equal(context.writes.length, 0);
}

// 10) 竞态三：候选已生成但确认前用户编辑了消息，事务拒绝且不覆盖新编辑。
{
  const context = createHarness({ conversations: { c1: conversation(attachmentMessage('https://img.example/a.png')) } });
  context.fetchImpl = async () => pngResponse();
  const hold = holdSave(context);
  const preparing = context.PrivateMediaLocal.prepareMessage('c1', 'm1');
  await waitFor(() => context.writes.length === 1, 'candidate write');
  assert.match(context.writes[0].conversations.c1.messages[0].attachments[0].dataUrl, /^data:image\/png;base64,/);
  assert.equal(context.state.conversations.c1.messages[0].attachments[0].dataUrl, undefined, 'live state must not change before the local ACK');
  context.state.conversations.c1.messages[0].content = 'edited by user';
  hold.release();
  const result = await preparing;
  await flush();
  assert.equal(result.status, 'failed');
  assert.equal(context.state.conversations.c1.messages[0].content, 'edited by user');
  assert.equal(context.state.conversations.c1.messages[0].attachments[0].dataUrl, undefined);
  assert.equal(context.durableWrites.length, 2, 'a landed candidate must be corrected by a recovery write');
  const finalSnapshot = context.durableWrites[context.durableWrites.length - 1];
  assert.equal(finalSnapshot.conversations.c1.messages[0].content, 'edited by user');
  assert.equal(finalSnapshot.conversations.c1.messages[0].attachments[0].dataUrl, undefined);
  assert.match(context.PrivateMediaLocal.getStatus().failureMessage, /generation_target_changed/);
}

// 9b) 竞态四：下载期间消息正文被编辑（URL 不变），不得写入过期字节，也不生成候选。
{
  const context = createHarness({ conversations: { c1: conversation(attachmentMessage('https://img.example/a.png')) } });
  const release = holdFetch(context, pngResponse());
  const preparing = context.PrivateMediaLocal.prepareMessage('c1', 'm1');
  await waitFor(() => context.fetchCalls.length === 1, 'download start');
  context.state.conversations.c1.messages[0].content = 'edited by user';
  release();
  const result = await preparing;
  assert.equal(result.prepared, 0);
  assert.equal(result.skipped, 1);
  assert.equal(result.status, 'missing');
  assert.equal(context.state.conversations.c1.messages[0].content, 'edited by user');
  assert.equal(context.state.conversations.c1.messages[0].attachments[0].dataUrl, undefined);
  assert.equal(context.writes.length, 0, 'a content edit during download must not produce a candidate write');
}

// 9c) 竞态五：下载期间回复版本被切换（selectedResponseVersionId 变），不得写入过期字节。
{
  const context = createHarness({ conversations: { c1: conversation(attachmentMessage('https://img.example/a.png')) } });
  const release = holdFetch(context, pngResponse());
  const preparing = context.PrivateMediaLocal.prepareMessage('c1', 'm1');
  await waitFor(() => context.fetchCalls.length === 1, 'download start');
  context.state.conversations.c1.messages[0].selectedResponseVersionId = 'v2';
  release();
  const result = await preparing;
  assert.equal(result.prepared, 0);
  assert.equal(context.state.conversations.c1.messages[0].selectedResponseVersionId, 'v2');
  assert.equal(context.state.conversations.c1.messages[0].attachments[0].dataUrl, undefined);
  assert.equal(context.writes.length, 0);
}

// 9d) 竞态六：下载期间附件元数据（assetId）被改但 URL 相同，不得写入过期字节。
{
  const context = createHarness({ conversations: { c1: conversation(attachmentMessage('https://img.example/a.png', { assetId: 'asset-1' })) } });
  const release = holdFetch(context, pngResponse());
  const preparing = context.PrivateMediaLocal.prepareMessage('c1', 'm1');
  await waitFor(() => context.fetchCalls.length === 1, 'download start');
  context.state.conversations.c1.messages[0].attachments[0].assetId = 'asset-2';
  release();
  const result = await preparing;
  assert.equal(result.prepared, 0);
  assert.equal(context.state.conversations.c1.messages[0].attachments[0].assetId, 'asset-2');
  assert.equal(context.state.conversations.c1.messages[0].attachments[0].dataUrl, undefined);
  assert.equal(context.writes.length, 0);
}

// 9e) 竞态七：下载期间角色记录被替换（同 key/name/url 但内容不同），不得写入过期字节。
{
  const context = createHarness({ characters: { alice: { name: 'Alice', previewImage: 'https://img.example/alice.png', description: 'old' } } });
  const release = holdFetch(context, pngResponse());
  const preparing = context.PrivateMediaLocal.prepareAll();
  await waitFor(() => context.fetchCalls.length === 1, 'character download start');
  context.state.characters.alice = { name: 'Alice', previewImage: 'https://img.example/alice.png', description: 'new' };
  release();
  const result = await preparing;
  assert.equal(result.prepared, 0);
  assert.equal(result.skipped, 1);
  assert.equal(context.state.characters.alice.description, 'new');
  assert.equal(context.state.characters.alice.previewImage, 'https://img.example/alice.png');
  assert.equal(context.state.characters.alice.previewImageSourceUrl, undefined);
  assert.equal(context.writes.length, 0, 'a replaced character record must not be written');
}

// 9f) 同一条消息里两个不同图片附件：一个附件写入后，另一个附件的目标签名不受本地字节影响，仍能保存。
{
  const message = { id: 'm1', role: 'assistant', content: 'two images', attachments: [
    { type: 'image', url: 'https://img.example/a.png', mime: 'image/png' },
    { type: 'image', url: 'https://img.example/b.png', mime: 'image/png' }
  ] };
  const context = createHarness({ conversations: { c1: conversation(message) } });
  context.fetchImpl = async () => pngResponse();
  const result = await context.PrivateMediaLocal.prepareMessage('c1', 'm1');
  assert.equal(result.prepared, 2);
  assert.equal(result.failed, 0);
  const attachments = context.state.conversations.c1.messages[0].attachments;
  assert.match(attachments[0].dataUrl, /^data:image\/png;base64,/);
  assert.match(attachments[1].dataUrl, /^data:image\/png;base64,/);
  assert.equal(attachments[0].url, 'https://img.example/a.png');
  assert.equal(attachments[1].url, 'https://img.example/b.png');
  assert.equal(context.durableWrites.length, 2, 'both image slots in one message must be persisted');
}

// 11) 保存失败：直接拒绝时保留原状态，并如实报告失败原因。
{
  const context = createHarness({ conversations: { c1: conversation(attachmentMessage('https://img.example/a.png')) } });
  context.fetchImpl = async () => pngResponse();
  context.saveFail = true;
  const result = await context.PrivateMediaLocal.prepareMessage('c1', 'm1');
  assert.equal(result.status, 'failed');
  assert.equal(result.failed, 1);
  assert.equal(context.state.conversations.c1.messages[0].attachments[0].dataUrl, undefined);
  assert.equal(context.durableWrites.length, 0);
  const status = context.PrivateMediaLocal.getStatus();
  assert.equal(status.pending, 1);
  assert.equal(status.failed, 1);
  assert.equal(status.failureMessage, 'quota exceeded');
}

// 12) 排队中的后续快照不得把已确认的本地字节退回成 URL。
{
  const context = createHarness({ characters: { alice: { name: 'Alice', previewImage: 'https://img.example/alice.png' } } });
  context.fetchImpl = async () => pngResponse();
  const hold = holdSave(context);
  const preparing = context.PrivateMediaLocal.prepareAll();
  await waitFor(() => context.writes.length === 1, 'first character save');
  assert.equal(context.PrivateMediaLocal.getStatus().preparing, true);
  assert.equal(context.state.characters.alice.previewImage, 'https://img.example/alice.png', 'live state must not change before the local ACK');
  assert.equal(context.state.characters.alice.previewImageSourceUrl, undefined);
  const reentrant = await context.PrivateMediaLocal.prepareAll();
  assert.equal(reentrant.started, false, 'a running batch must not start twice');
  context.persistState(true); // 后到的待写快照仍只捕捉到远端 URL
  hold.release();
  await preparing;
  await flush();
  assert.equal(context.PrivateMediaLocal.getStatus().preparing, false);
  assert.match(context.state.characters.alice.previewImage, /^data:image\/png;base64,/);
  assert.equal(context.state.characters.alice.previewImageSourceUrl, 'https://img.example/alice.png');
  assert.equal(context.durableWrites.length, 2);
  context.durableWrites.forEach((snapshot) => {
    assert.match(snapshot.characters.alice.previewImage, /^data:image\/png;base64,/);
    assert.equal(snapshot.characters.alice.previewImageSourceUrl, 'https://img.example/alice.png');
  });
}

// 13) 批量：同一 URL 只下载一次，并发上限为 2。
{
  const conversations = {};
  for (let i = 1; i <= 6; i += 1) {
    conversations[`c${i}`] = conversation(attachmentMessage(`https://img.example/${i}.png`));
    conversations[`c${i}`].id = `c${i}`;
  }
  const context = createHarness({ conversations });
  context.fetchImpl = async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    return pngResponse();
  };
  const summary = await context.PrivateMediaLocal.prepareAll();
  assert.equal(summary.prepared, 6);
  assert.equal(summary.failed, 0);
  assert.equal(context.maxInFlight, 2, `download concurrency must stay at 2, saw ${context.maxInFlight}`);
  assert.equal(context.durableWrites.length, 6);
  Object.keys(conversations).forEach((key) => {
    assert.match(context.state.conversations[key].messages[0].attachments[0].dataUrl, /^data:image\/png;base64,/);
  });
  assert.equal(context.PrivateMediaLocal.getStatus().pending, 0);
  assert.equal(context.counters.caches, 0);
  assert.equal(context.renderCalls.messages, 1, 'background preparation must only refresh the visible chat');
}

// 14) 新生成图片：消息保存后异步补本地字节，稳定 ID 已存在。
{
  const context = createHarness({ conversations: { c1: { id: 'c1', title: 't', messages: [], summaries: [], updated: 1 } } });
  context.fetchImpl = async () => pngResponse();
  const message = context.createImageGenerationMessage(
    { asset: { id: 'a1', url: 'https://img.example/gen.png', mime: 'image/png', width: 32, height: 32 }, requestId: 'r1', model: 'gpt-image-2', provider: 'packy' },
    { prompt: 'p', size: '1024x1024', sourceMessageId: '', referenceCharacterName: '' }
  );
  context.appendImageGenerationMessage(context.state.conversations.c1, message);
  assert.match(message.id, /^legacy-/, 'the generated message must have a stable id before preparation');
  assert.equal(context.renderCalls.messages, 1);
  assert.equal(context.renderCalls.conversations, 1);
  await waitFor(() => !!(context.state.conversations.c1.messages[0].attachments[0] || {}).dataUrl, 'generated image local bytes');
  const savedMessage = context.state.conversations.c1.messages[0];
  assert.equal(savedMessage.id, message.id);
  assert.match(savedMessage.attachments[0].dataUrl, /^data:image\/png;base64,/);
  assert.equal(savedMessage.attachments[0].url, 'https://img.example/gen.png');
  assert.equal(context.durableWrites.length >= 2, true, 'the message and its local bytes must both be persisted');
  assert.match(context.durableWrites[context.durableWrites.length - 1].conversations.c1.messages[0].attachments[0].dataUrl, /^data:image\/png;base64,/);
}

// 14b) 新生成图片保存失败：原始消息写盘失败时不启动本地化，也不产生未处理的拒绝。
{
  const context = createHarness({ conversations: { c1: { id: 'c1', title: 't', messages: [], summaries: [], updated: 1 } } });
  context.saveFail = true;
  let prepared = 0;
  const original = context.PrivateMediaLocal.prepareMessage;
  context.PrivateMediaLocal.prepareMessage = function() {
    prepared += 1;
    return original.apply(null, arguments);
  };
  const message = context.createImageGenerationMessage(
    { asset: { id: 'a1', url: 'https://img.example/gen.png', mime: 'image/png', width: 32, height: 32 }, requestId: 'r1', model: 'gpt-image-2', provider: 'packy' },
    { prompt: 'p', size: '1024x1024', sourceMessageId: '', referenceCharacterName: '' }
  );
  context.appendImageGenerationMessage(context.state.conversations.c1, message);
  await flush(16);
  assert.equal(prepared, 0, 'PrivateMediaLocal.prepareMessage must not run after a failed original save');
  assert.equal(context.durableWrites.length, 0);
}

// 15) 订阅：状态变化只通知订阅者，退订后不再收到。
{
  const context = createHarness({ conversations: { c1: conversation(attachmentMessage('https://img.example/a.png')) } });
  context.fetchImpl = async () => pngResponse();
  const seen = [];
  const unsubscribe = context.PrivateMediaLocal.subscribe((status) => seen.push(status.text));
  assert.equal(typeof unsubscribe, 'function');
  await context.PrivateMediaLocal.prepareMessage('c1', 'm1');
  assert.equal(seen.length, 1);
  assert.match(seen[0], /已准备 1 张本地图片/);
  unsubscribe();
  context.state.conversations.c1.messages[0].attachments.push({ type: 'image', url: 'https://img.example/b.png' });
  await context.PrivateMediaLocal.prepareMessage('c1', 'm1');
  assert.equal(seen.length, 1, 'an unsubscribed listener must not be notified again');
  assert.equal(context.PrivateMediaLocal.subscribe('not a function')(), undefined);
}

// 16) 非法输入不进入状态统计：无法处理的地址既不算未准备，也不会被下载。
{
  const context = createHarness({ conversations: { c1: conversation(attachmentMessage('file:///tmp/a.png')) } });
  const status = context.PrivateMediaLocal.getStatus();
  assert.equal(status.total, 0);
  assert.equal(status.pending, 0);
  assert.equal(context.PrivateMediaLocal.isLocalImageDataUrl('data:image/png;base64,AA=='), true);
  assert.equal(context.PrivateMediaLocal.isLocalImageDataUrl('https://img.example/a.png'), false);
  const result = await context.PrivateMediaLocal.prepareMessage('c1', 'm1');
  assert.equal(result.status, 'ready');
  assert.equal(context.fetchCalls.length, 0);
}

console.log('Private media runtime passed: url/mime/signature/truncation/oversize guards, Image fallback decode and no-decoder rejection, no CacheStorage or onLine gating, no auth token injection, data url persistence with preserved source url, delete/content/version/attachment-metadata/character-record races, multi-slot batch, save rejection, queued snapshot byte retention, concurrency 2, generated-image hook (incl. failed-save gating) and subscriptions.');
