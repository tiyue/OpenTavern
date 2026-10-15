/*
 * OpenTavern 本地离线 Service Worker。
 *
 * 唯一源码；构建时会被复制到实际发布根（opentavern-sw.js）与 .sites-public/
 * 预览根，部署副本不得手改。它只为本应用作用域与离线清单白名单提供缓存与离线导航：
 * 从不缓存未知 GET、API、带凭据响应、POST、云同步或私有 URL，也绝不为未知
 * 导航/接口返回聊天 HTML。作用域严格限制在 "/" 或 "/.sites-public/"，
 * 不对预览做根作用域放宽；只有首次安装才 skipWaiting/claim。
 *
 * 元数据（opentavern-<base>-meta 中的 __ot-meta__）按版本分级保存：
 *   { version: 2, activeReleaseId, releases: { <releaseId>: { complete, manifest, public } } }
 * active 版本在用户显式切换前保持不变；public 是“该版本清单”的路径→摘要映射，
 * 保证旧版本页面只会读到自己那一版的公共字节，暂存新版本不会改动旧版本读取。
 */
(function () {
    'use strict';
    var self_ = self;
    var scopeUrl = new URL(self_.registration.scope);
    var base = scopeUrl.pathname;
    var baseToken = base === '/' ? 'root' : (base.replace(/^\/+|\/+$/g, '').replace(/[^a-z0-9]+/gi, '-') || 'root');
    var CORE_PREFIX = 'opentavern-' + baseToken + '-core-';
    var PUBLIC_CACHE = 'opentavern-' + baseToken + '-public';
    var META_CACHE = 'opentavern-' + baseToken + '-meta';
    var META_URL = new URL(base + '__ot-meta__', scopeUrl).href;
    var ACTIVATED_MARKER = new URL(base + '__ot-sw-activated__', scopeUrl).href;
    var PUBLIC_PREFIX = base + '__ot-public__/';
    var MANIFEST_PATH = base + 'offline-manifest.json';
    var SW_PATH = base + 'opentavern-sw.js';
    var SNAPSHOT_PREFIX = base + 'assets/offline/';
    var RELEASE_PATTERN = /^[0-9a-f]{24}$/;
    var clientReleases = Object.create(null);
    var NAVIGATION_PATHS = {};
    [base, base + 'index.html', base + 'opentavern', base + 'opentavern.html'].forEach(function (path) {
        NAVIGATION_PATHS[path] = true;
    });

    function inScope(pathname) {
        return base === '/' || pathname.indexOf(base) === 0;
    }

    function snapshotCacheName(releaseId) {
        return CORE_PREFIX + String(releaseId || '');
    }

    function releaseIdOf(value) {
        var text = String(value == null ? '' : value);
        return RELEASE_PATTERN.test(text) ? text : '';
    }

    async function readMeta() {
        try {
            var cache = await caches.open(META_CACHE);
            var response = await cache.match(META_URL);
            if (!response) return null;
            var data = await response.json();
            return normalizeMeta(data);
        } catch (error) {
            return null;
        }
    }

    // 只接受版本 2 的元数据，其它形状（含旧版单份 manifest）一律视为“无活动版本”，
    // 绝不把无法确认的缓存当作可离线内容。
    function normalizeMeta(data) {
        if (!data || typeof data !== 'object') return null;
        if (data.version !== 2) return null;
        var meta = { version: 2, activeReleaseId: releaseIdOf(data.activeReleaseId), releases: Object.create(null) };
        var source = data.releases && typeof data.releases === 'object' ? data.releases : {};
        Object.keys(source).forEach(function (key) {
            var releaseId = releaseIdOf(key);
            if (!releaseId) return;
            var release = source[key];
            if (!release || typeof release !== 'object') return;
            meta.releases[releaseId] = {
                complete: release.complete === true,
                manifest: release.manifest && typeof release.manifest === 'object' ? release.manifest : null,
                public: release.public && typeof release.public === 'object' ? release.public : null,
            };
        });
        return meta;
    }

    async function writeMeta(meta) {
        var cache = await caches.open(META_CACHE);
        await cache.put(META_URL, new Response(JSON.stringify(meta), {
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
        }));
    }

    function releaseFor(meta, releaseId) {
        var id = releaseIdOf(releaseId);
        if (!id || !meta || !meta.releases) return null;
        return meta.releases[id] || null;
    }

    function isCompleteRelease(meta, releaseId) {
        var release = releaseFor(meta, releaseId);
        return !!(release && release.complete === true);
    }

    function corePathSet(release) {
        var paths = new Set();
        var core = release && release.manifest && Array.isArray(release.manifest.core) ? release.manifest.core : [];
        core.forEach(function (entry) {
            if (entry && typeof entry.path === 'string' && entry.path) paths.add(entry.path);
        });
        return paths;
    }

    async function readMarker() {
        try {
            var cache = await caches.open(META_CACHE);
            return !!(await cache.match(ACTIVATED_MARKER));
        } catch (error) {
            return false;
        }
    }

    async function writeMarker() {
        try {
            var cache = await caches.open(META_CACHE);
            await cache.put(ACTIVATED_MARKER, new Response('1', { headers: { 'Cache-Control': 'no-store' } }));
        } catch (error) { /* 标记写入失败不影响离线能力 */ }
    }

    // 带 Authorization 的请求可能携带凭据，一律绕过共享缓存直接走网络。
    function hasAuthorization(request) {
        try {
            return !!(request.headers && request.headers.get && request.headers.get('authorization'));
        } catch (error) {
            return false;
        }
    }

    // API 路径绝不能被共享缓存或应用外壳接管（包含预览基址下的 /api 片段）。
    function isApiPath(pathname) {
        return pathname === '/api' || pathname.indexOf('/api/') !== -1 || pathname.slice(-4) === '/api';
    }

    async function handleNavigation(request, url) {
        if (!NAVIGATION_PATHS[url.pathname]) return fetch(request);
        var meta = await readMeta();
        if (isCompleteRelease(meta, meta && meta.activeReleaseId)) {
            var releaseId = meta.activeReleaseId;
            var shellUrl = new URL(SNAPSHOT_PREFIX + releaseId + '/index.html', scopeUrl).href;
            var cache = await caches.open(snapshotCacheName(releaseId));
            var shell = await cache.match(shellUrl);
            // 只有确实命中完整版本的入口外壳才离线返回；缓存被清理时退回网络，绝不假装完整。
            if (shell) {
                var release = releaseFor(meta, releaseId);
                var core = release && release.manifest && release.manifest.core || [];
                var present = await Promise.all(core.map(function(entry) {
                    return cache.match(new URL(SNAPSHOT_PREFIX + releaseId + '/' + entry.path, scopeUrl).href);
                }));
                if (core.length && present.every(function(response) { return !!response; })) return shell;
            }
        }
        return fetch(request);
    }

    async function handleImmutable(request, url) {
        var rest = url.pathname.slice(SNAPSHOT_PREFIX.length);
        var separator = rest.indexOf('/');
        var releaseId = separator < 0 ? '' : rest.slice(0, separator);
        var relative = separator < 0 ? '' : rest.slice(separator + 1);
        if (!releaseIdOf(releaseId) || !relative) return fetch(request);
        // 只从“完整的、清单白名单内”的版本缓存读取；暂存版本一律走网络。
        var meta = await readMeta();
        var release = releaseFor(meta, releaseId);
        if (!release || release.complete !== true || !corePathSet(release).has(relative)) return fetch(request);
        var cache = await caches.open(snapshotCacheName(releaseId));
        // 只按路径匹配：入口外壳给固定 vendor 带了 ?v= 查询串，快照缓存本身不含查询串。
        var cached = await cache.match(new URL(url.pathname, url.origin).href);
        if (cached) return cached;
        return fetch(request);
    }

    // 公共字节绑定到“当前页面加载的版本”：客户端注册过版本就按注册版本解析，
    // 否则退回活动版本，避免旧页面读到他版公共资源。
    async function handlePublic(request, url, clientId) {
        var meta = await readMeta();
        var boundId = releaseIdOf(clientReleases[clientId]) || (meta && meta.activeReleaseId);
        var release = releaseFor(meta, boundId) || releaseFor(meta, meta && meta.activeReleaseId);
        var digest = release && release.public ? release.public[url.pathname] : null;
        if (digest) {
            var cache = await caches.open(PUBLIC_CACHE);
            var cached = await cache.match(new URL(PUBLIC_PREFIX + digest, scopeUrl).href);
            if (cached) return cached;
        }
        return fetch(request);
    }

    function isScopedClient(client) {
        if (!client) return false;
        if (typeof client.url !== 'string' || !client.url) return true; // 地址未知时按应用客户端保守处理
        try {
            return inScope(new URL(client.url).pathname);
        } catch (error) {
            return false;
        }
    }

    // 统计除发起者之外还在使用本应用缓存（含未受控）的窗口数量。
    async function countOtherClients(event) {
        var list = [];
        try {
            list = await self_.clients.matchAll({ type: 'window', includeUncontrolled: true });
        } catch (error) {
            try { list = await self_.clients.matchAll(); } catch (inner) { list = []; }
        }
        var scoped = (list || []).filter(isScopedClient);
        if (event && event.source && event.source.id != null) {
            return scoped.filter(function (client) { return client.id !== event.source.id; }).length;
        }
        // 无法识别发起者时，仅在存在多个窗口时拒绝，保持保守。
        return scoped.length > 1 ? 1 : 0;
    }

    function registerClientRelease(event, data) {
        var releaseId = releaseIdOf(data.releaseId);
        if (!releaseId || !event.source || event.source.id == null) return;
        clientReleases[event.source.id] = releaseId;
    }

    self_.addEventListener('fetch', function (event) {
        var request = event.request;
        if (request.method !== 'GET') return;
        var url = new URL(request.url);
        if (url.origin !== self_.location.origin) return;
        if (!inScope(url.pathname)) return;
        var isNavigation = request.mode === 'navigate';
        // 管理器显式要求新字节（cache: 'no-store'）时必须绕过旧的活动公共缓存；导航仍由本 SW 负责离线外壳。
        if (!isNavigation && request.cache === 'no-store') return;
        if (hasAuthorization(request)) return;
        if (isApiPath(url.pathname)) return;
        if (url.pathname === MANIFEST_PATH || url.pathname === SW_PATH) return;
        if (isNavigation) {
            event.respondWith(handleNavigation(request, url));
            return;
        }
        if (url.pathname.indexOf(SNAPSHOT_PREFIX) === 0) {
            event.respondWith(handleImmutable(request, url));
            return;
        }
        if (url.pathname.indexOf(base + 'cards/') === 0) {
            event.respondWith(handlePublic(request, url, event.clientId));
        }
    });

    self_.addEventListener('install', function (event) {
        event.waitUntil((async function () {
            // 只有真正的首次安装才立即激活；后续更新不会被无条件抢占。
            var activated = await readMarker();
            if (!activated) await self_.skipWaiting();
        })());
    });

    self_.addEventListener('activate', function (event) {
        event.waitUntil((async function () {
            // 首次激活必须接管已存在的窗口，即使页面已经先写入活动版本元数据（否则首屏永远不受控）。
            var activated = await readMarker();
            if (activated) return;
            if (self_.clients && self_.clients.claim) await self_.clients.claim();
            await writeMarker();
        })());
    });

    self_.addEventListener('message', function (event) {
        var data = event.data || {};
        if (data.type === 'ot-register-release') {
            registerClientRelease(event, data);
            return;
        }
        if (data.type !== 'ot-apply-update' && data.type !== 'ot-assert-idle-clients') return;
        event.waitUntil((async function () {
            var port = event.ports && event.ports[0];
            function reply(payload) { if (port) port.postMessage(payload); }
            try {
                var others = await countOtherClients(event);
                if (others > 0) { reply({ ok: false, reason: '请先关闭其他标签页再切换版本' }); return; }
                if (data.type === 'ot-assert-idle-clients') { reply({ ok: true }); return; }
                var releaseId = releaseIdOf(data.releaseId);
                var meta = await readMeta();
                if (!isCompleteRelease(meta, releaseId)) { reply({ ok: false, reason: '该版本尚未完整验证' }); return; }
                meta.activeReleaseId = releaseId;
                await writeMeta(meta);
                reply({ ok: true, releaseId: releaseId });
            } catch (error) {
                reply({ ok: false, reason: '切换失败：' + ((error && error.message) || error) });
            }
        })());
    });
})();
