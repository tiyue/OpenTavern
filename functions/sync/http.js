
/**
 * 新手导读：这是 Cloudflare Pages 版本的云同步后端。
 *
 * “快照”是一份包含设置、角色和聊天记录的 JSON 文本。客户端带着同步令牌请求
 * 本接口；v1 保留完整快照 CRUD 兼容，v2 使用内容寻址分块和清单提交实现增量同步，
 * 不再对完整快照设置人为大小上限。HEAD 只返回 v1 元数据，OPTIONS 处理跨域预检。
 *
 * ETag 和 updated_at 用于并发保护：如果两台设备同时修改数据，旧版本不能静默覆盖
 * 新版本。这里处理的是用户私人数据，切勿在日志或错误响应中输出令牌和快照正文。
 * 此模块负责响应头、认证与公共数据辅助函数；总入口位于 functions/api/sync.js。
 */
const SYNC_V2_CHUNK_BYTES = 393216;
const SYNC_V2_MAX_ENCODED_CHARS = 600000;
const SYNC_V2_MUTATION_LOCK_MS = 5 * 60 * 1000;

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, If-Match, X-OpenTavern-If-Match-Updated-At, X-OpenTavern-Token',
    'Access-Control-Expose-Headers': 'ETag, X-OpenTavern-Updated-At, X-OpenTavern-Data-Bytes, X-OpenTavern-Encrypted, X-OpenTavern-Exists, X-OpenTavern-Revision, X-OpenTavern-Protocol',
  };
}

function responseHeaders(headers = {}) {
  return {
    ...corsHeaders(),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  };
}

function json(data, init = {}) {
  return Response.json(data, {
    ...init,
    headers: responseHeaders(init.headers || {}),
  });
}

function empty(init = {}) {
  return new Response(null, {
    ...init,
    headers: responseHeaders(init.headers || {}),
  });
}

function getToken(request) {
  const auth = request.headers.get('Authorization') || '';
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return (request.headers.get('X-OpenTavern-Token') || '').trim();
}

function validateToken(token) {
  if (!token || token.length < 8) {
    return 'A sync token with at least 8 characters is required.';
  }
  if (token.length > 512) {
    return 'Sync token is too long.';
  }
  return null;
}

async function sha256(text) {
  const bytes = new TextEncoder().encode(text);
  return await sha256Bytes(bytes);
}

async function sha256Bytes(bytes) {
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function byteLength(text) {
  return new TextEncoder().encode(text).length;
}

function isHealthCheck(request) {
  const url = new URL(request.url);
  return url.searchParams.get('health') === '1';
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeObjectMap(value) {
  return isPlainObject(value) ? value : {};
}

function normalizeTimestamp(value, fallback = Date.now()) {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) ? timestamp : fallback;
}

function normalizeBoolean(value) {
  if (value === true || value === 1) return true;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === 'yes' || normalized === '1';
  }
  return false;
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}
export { SYNC_V2_CHUNK_BYTES, SYNC_V2_MAX_ENCODED_CHARS, SYNC_V2_MUTATION_LOCK_MS, corsHeaders, responseHeaders, json, empty, getToken, validateToken, sha256, sha256Bytes, byteLength, isHealthCheck, isPlainObject, normalizeObjectMap, normalizeTimestamp, normalizeBoolean, isNonEmptyString };
