import handler from "vinext/server/app-router-entry";
import { onRequest as handleSyncRequest } from "../functions/api/sync.js";

interface AssetFetcher {
  fetch(request: Request): Promise<Response>;
}

interface Env {
  ASSETS: AssetFetcher;
  DB: unknown;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/sync") {
      return handleSyncRequest({ request, env });
    }
    if (request.method === "GET" || request.method === "HEAD") {
      if (url.pathname === "/" || url.pathname === "/index.html") url.pathname = "/opentavern.html";
      const assetResponse = await env.ASSETS.fetch(new Request(url, request));
      if (assetResponse.status !== 404) return withCacheHeaders(url.pathname, assetResponse);
    }
    return handler.fetch(request, env, ctx);
  },
};

// 缓存策略按路径类别固定：
// - assets/offline/<releaseId>/ 是不可变快照，可长期缓存；
// - 清单与 Service Worker 必须及时重校验，避免中间缓存长期保留旧副本；
// - HTML 入口也必须重校验，否则更新无法落地。
// 全部加上 no-transform：Cloudflare 的 JavaScript Detection 可能向 HTML 注入脚本，
// no-transform 明确禁止这类改写，保证上机字节与已验证摘要一致（不剥离注入脚本来“凑”摘要）。
const HTML_ENTRY_PATHS = new Set(["/", "/index.html", "/opentavern.html"]);

function cacheControlFor(pathname: string): string | null {
  if (pathname.startsWith("/assets/offline/")) return "public, max-age=31536000, immutable, no-transform";
  if (pathname === "/opentavern-sw.js" || pathname === "/offline-manifest.json") return "no-cache, must-revalidate, no-transform";
  if (HTML_ENTRY_PATHS.has(pathname)) return "no-cache, must-revalidate, no-transform";
  return null;
}

function withCacheHeaders(pathname: string, response: Response): Response {
  const cacheControl = cacheControlFor(pathname);
  if (!cacheControl) return response;
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", cacheControl);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default worker;
