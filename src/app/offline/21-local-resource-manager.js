/**
 * 新手导读（文件：21-local-resource-manager.js）
 *
 * 负责什么：这是“本地优先资源与后台更新”中的“离线、资源、管理”部分。
 * 在程序中的位置：启动完成后异步注册受限 Service Worker、读取构建期离线清单，
 * 逐项校验并缓存核心快照、后台准备公共资料，并把真实缓存状态汇总给设置界面。
 * 从哪里开始看：主要从 `start(无参数)`、`checkForUpdates(无参数)`、`preparePublic(无参数)`、
 * `getStatus(无参数)`、`readPublic(url)`、`resolvePublicUrl(url)` 开始阅读。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：只使用浏览器原生 CacheStorage / Service Worker；不得写用户存储、不得改云同步协议、
 * 不得在状态更新时触发 renderAll 或消息重建，也不得缓存 API、带凭据或私有的响应。
 *
 * 版本规则：构建期写入入口 HTML 的 window.__OT_RUNTIME__ 固定了本页实际执行的字节，
 * 本模块永不改写它，只用 getStatus().loadedReleaseId 记录一次。缓存元数据按 release 分级保存
 * （releases[releaseId] = { complete, manifest, public }），active 指针只在用户显式切换时变化，
 * 暂存新版本不会覆盖旧版本的清单与公共路径映射。
 */
// ==================== Local Resource Manager ====================
var LOCAL_RESOURCE_FETCH_TIMEOUT_MS = 8000;
var LOCAL_RESOURCE_PUBLIC_CONCURRENCY = 2;
var LOCAL_RESOURCE_QUOTA_RESERVE_BYTES = 20 * 1024 * 1024;
var LOCAL_RESOURCE_QUOTA_RESERVE_RATIO = 0.1;
var LOCAL_RESOURCE_RETRY_BACKOFF_MS = [2000, 5000, 15000, 30000];
var LOCAL_RESOURCE_MANIFEST_MAX_BYTES = 4 * 1024 * 1024;
var LOCAL_RESOURCE_META_VERSION = 2;
var LOCAL_RESOURCE_RELEASE_PATTERN = /^[0-9a-f]{24}$/;

var LocalResourceManager = (function() {
    var status = {
        supported: false,
        offlineReopen: false,
        registered: false,
        controlled: false,
        basePath: '/',
        activeReleaseId: '',
        loadedReleaseId: '',
        core: { state: 'idle', ready: 0, total: 0, bytes: 0, bytesTotal: 0 },
        public: { state: 'idle', ready: 0, total: 0, bytes: 0, bytesTotal: 0, running: false, stopped: false },
        update: { available: false, releaseId: '' },
        lastError: '',
        lastCheckAt: 0
    };
    var listeners = [];
    var releases = Object.create(null);
    var checkRequest = null;
    var coreRequest = null;
    var publicRequest = null;
    var manifestRequest = null;
    var started = false;
    var retryIndex = 0;
    var retryTimer = null;
    var cacheStore = null;

    function runtime() {
        return typeof getRuntimeConfig === 'function' ? (getRuntimeConfig() || {}) : {};
    }

    function basePath() {
        var config = runtime();
        var value = typeof config.basePath === 'string' ? config.basePath : '';
        if (!value && typeof getRuntimeBasePath === 'function') value = getRuntimeBasePath();
        value = String(value || '/');
        return value.replace(/\/+$/, '') + '/';
    }

    function absoluteUrl(path) {
        var value = String(path || '');
        try {
            return new URL(value, document.baseURI).href;
        } catch (error) {
            return value;
        }
    }

    function pathnameOf(target) {
        try {
            return new URL(String(target || ''), document.baseURI).pathname;
        } catch (error) {
            return '';
        }
    }

    function manifestUrl() {
        var config = runtime();
        if (typeof config.manifestUrl === 'string' && config.manifestUrl) return absoluteUrl(config.manifestUrl);
        return absoluteUrl(basePath() + 'offline-manifest.json');
    }

    function swUrl() {
        return absoluteUrl(basePath() + 'opentavern-sw.js');
    }

    function baseToken() {
        var base = basePath();
        if (base === '/') return 'root';
        return base.replace(/^\/+|\/+$/g, '').replace(/[^a-z0-9]+/gi, '-') || 'root';
    }

    function coreCachePrefix() {
        return 'opentavern-' + baseToken() + '-core-';
    }

    function coreCacheName(releaseId) {
        return coreCachePrefix() + String(releaseId || 'unknown');
    }

    function publicCacheName() {
        return 'opentavern-' + baseToken() + '-public';
    }

    function metaCacheName() {
        return 'opentavern-' + baseToken() + '-meta';
    }

    function metaKey() {
        return absoluteUrl(basePath() + '__ot-meta__');
    }

    function publicKey(sha256) {
        return absoluteUrl(basePath() + '__ot-public__/' + String(sha256 || ''));
    }

    function snapshotBaseFor(releaseId) {
        return basePath() + 'assets/offline/' + String(releaseId || '') + '/';
    }

    function snapshotUrl(releaseId, path) {
        return absoluteUrl(snapshotBaseFor(releaseId) + String(path || '').replace(/^\/+/, ''));
    }

    function hasCacheApi() {
        try {
            return typeof caches !== 'undefined' && typeof caches.open === 'function' && !!window.caches;
        } catch (error) {
            return false;
        }
    }

    function supportsOffline() {
        try {
            return hasCacheApi() && typeof fetch === 'function' && !!navigator.serviceWorker;
        } catch (error) {
            return false;
        }
    }

    function supportedContext() {
        try { return typeof fetch === 'function'; } catch (error) { return false; }
    }

    function clone(value) {
        return JSON.parse(JSON.stringify(value == null ? null : value));
    }

    function emit() {
        var snapshot = getStatus();
        listeners.slice().forEach(function(listener) {
            try { listener(snapshot); } catch (error) { /* 订阅者异常不影响资源流程 */ }
        });
    }

    function setError(message) {
        status.lastError = message ? String(message.message || message) : '';
    }

    function releaseIdOf(value) {
        var text = String(value == null ? '' : value);
        return LOCAL_RESOURCE_RELEASE_PATTERN.test(text) ? text : '';
    }

    async function sha256Hex(bytes) {
        var view = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
        if (typeof crypto !== 'undefined' && crypto && crypto.subtle && crypto.subtle.digest) {
            var digest = await crypto.subtle.digest('SHA-256', view);
            return Array.from(new Uint8Array(digest), function(byte) { return byte.toString(16).padStart(2, '0'); }).join('');
        }
        if (typeof window !== 'undefined' && typeof window.sha256 === 'function') {
            return window.sha256(view);
        }
        throw new Error('缺少可用的 SHA-256 实现');
    }

    function mediaType(value) {
        return String(value || '').split(';')[0].trim().toLowerCase();
    }

    // 允许同类等价类型（例如 text/javascript 与 application/javascript），但不同类型一律拒绝，
    // 以便 HTML 挑战页或错误类型不会通过核心快照校验。
    var LOCAL_RESOURCE_MIME_FAMILIES = [
        ['text/html', 'application/xhtml+xml'],
        ['application/javascript', 'text/javascript', 'application/x-javascript', 'application/ecmascript', 'text/ecmascript'],
        ['text/css'],
        ['application/json', 'text/json'],
        ['image/png'], ['image/jpeg'], ['image/webp'], ['image/gif'], ['image/svg+xml']
    ];

    // 允许的扩展名 → 可接受的 MIME 家族成员；未登记的扩展名一律拒绝。
    var LOCAL_RESOURCE_EXTENSION_MIME = {
        html: ['text/html', 'application/xhtml+xml'],
        htm: ['text/html', 'application/xhtml+xml'],
        js: ['application/javascript', 'text/javascript', 'application/x-javascript', 'application/ecmascript', 'text/ecmascript'],
        mjs: ['application/javascript', 'text/javascript', 'application/x-javascript', 'application/ecmascript', 'text/ecmascript'],
        css: ['text/css'],
        json: ['application/json', 'text/json'],
        png: ['image/png'],
        jpg: ['image/jpeg'],
        jpeg: ['image/jpeg'],
        webp: ['image/webp'],
        gif: ['image/gif'],
        svg: ['image/svg+xml']
    };

    function mimeFamilyOf(value) {
        var type = mediaType(value);
        for (var index = 0; index < LOCAL_RESOURCE_MIME_FAMILIES.length; index++) {
            if (LOCAL_RESOURCE_MIME_FAMILIES[index].indexOf(type) !== -1) return LOCAL_RESOURCE_MIME_FAMILIES[index][0];
        }
        return type;
    }

    function isKnownMime(value) {
        return LOCAL_RESOURCE_MIME_FAMILIES.some(function(family) { return family.indexOf(mediaType(value)) !== -1; });
    }

    function extensionOf(path) {
        var match = /\.([a-z0-9]+)$/i.exec(String(path || ''));
        return match ? match[1].toLowerCase() : '';
    }

    function mimeMatchesExtension(path, mime) {
        var allowed = LOCAL_RESOURCE_EXTENSION_MIME[extensionOf(path)];
        return !!allowed && allowed.indexOf(mediaType(mime)) !== -1;
    }

    function mimeMatches(expected, actual) {
        var wanted = mimeFamilyOf(expected);
        var found = mimeFamilyOf(actual);
        if (!found) return false;
        if (wanted === found) return true;
        return mediaType(expected) === found;
    }

    // 清单路径必须是规范化的相对路径：没有 scheme/凭据、绝对路径、反斜杠、重复斜杠、
    // 查询/片段、百分号编码穿越、"."/".." 段以及原型键段。
    function isSafeRelativePath(value) {
        var text = String(value == null ? '' : value);
        if (!text) return false;
        if (/^[a-z][a-z0-9+.-]*:/i.test(text)) return false;
        if (text.charAt(0) === '/' || text.charAt(0) === '\\') return false;
        if (text.indexOf('\\') !== -1 || text.indexOf('//') !== -1) return false;
        if (text.indexOf('?') !== -1 || text.indexOf('#') !== -1 || text.indexOf('%') !== -1) return false;
        return !text.split('/').some(function(segment) {
            return segment === '' || segment === '.' || segment === '..' || segment === '__proto__' || segment === 'constructor' || segment === 'prototype';
        });
    }

    function validateEntries(entries, label, prefixes, seen) {
        entries.forEach(function(entry, index) {
            var where = label + '[' + index + ']';
            if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('离线清单条目无效：' + where);
            if (!isSafeRelativePath(entry.path)) throw new Error('离线清单路径不安全：' + where);
            var allowed = prefixes.some(function(prefix) { return entry.path === prefix || entry.path.indexOf(prefix) === 0; });
            if (!allowed) throw new Error('离线清单路径超出允许范围：' + entry.path);
            if (seen[entry.path]) throw new Error('离线清单路径重复：' + entry.path);
            seen[entry.path] = true;
            if (!isKnownMime(entry.mime)) throw new Error('离线清单 MIME 未知：' + entry.path);
            if (!mimeMatchesExtension(entry.path, entry.mime)) throw new Error('离线清单 MIME 与扩展名不符：' + entry.path);
            if (!Number.isInteger(entry.bytes) || entry.bytes < 0) throw new Error('离线清单大小无效：' + entry.path);
            if (typeof entry.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(entry.sha256)) throw new Error('离线清单摘要无效：' + entry.path);
        });
    }

    function validateTotals(totals, entries, label) {
        if (!totals || typeof totals !== 'object') throw new Error('离线清单缺少 ' + label + ' 总计');
        if (!Number.isInteger(totals.count) || totals.count !== entries.length) throw new Error('离线清单 ' + label + ' 数量不符');
        if (!Number.isInteger(totals.bytes) || totals.bytes !== totalBytes(entries)) throw new Error('离线清单 ' + label + ' 字节总数不符');
    }

    // 网络清单在运行时也要完整校验：格式/版本/十六进制版本号、非空核心含入口外壳、
    // 规范相对路径、MIME 与扩展名、大小/摘要、精确数量与总计，任何一项不合格都拒绝。
    function validateManifest(data) {
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('离线清单格式无效');
        if (data.formatVersion !== 1) throw new Error('离线清单格式版本不支持');
        if (!Number.isInteger(data.dataVersion) || data.dataVersion < 0) throw new Error('离线清单数据版本无效');
        var releaseId = releaseIdOf(data.releaseId);
        if (!releaseId) throw new Error('离线清单版本号无效');
        if (typeof data.basePath !== 'string') throw new Error('离线清单缺少基址');
        if (!Array.isArray(data.core) || !data.core.length) throw new Error('离线清单缺少核心资源');
        if (!Array.isArray(data.public)) throw new Error('离线清单缺少公共资源列表');
        validateEntries(data.core, 'core', ['assets/', 'index.html'], Object.create(null));
        validateEntries(data.public, 'public', ['cards/'], Object.create(null));
        if (!data.core.some(function(entry) { return entry.path === 'index.html'; })) throw new Error('离线清单缺少入口外壳');
        validateTotals(data.totals && data.totals.core, data.core, 'core');
        validateTotals(data.totals && data.totals.public, data.public, 'public');
        return {
            formatVersion: 1,
            dataVersion: data.dataVersion,
            releaseId: releaseId,
            basePath: data.basePath,
            core: data.core,
            public: data.public,
            totals: { core: data.totals.core, public: data.totals.public }
        };
    }

    function totalBytes(entries) {
        return (entries || []).reduce(function(sum, entry) { return sum + (Number(entry && entry.bytes) || 0); }, 0);
    }

    function normalizeMeta(data) {
        if (!data || typeof data !== 'object' || data.version !== LOCAL_RESOURCE_META_VERSION) return null;
        var meta = { version: LOCAL_RESOURCE_META_VERSION, activeReleaseId: releaseIdOf(data.activeReleaseId), releases: Object.create(null) };
        var source = data.releases && typeof data.releases === 'object' ? data.releases : {};
        Object.keys(source).forEach(function(key) {
            var releaseId = releaseIdOf(key);
            if (!releaseId) return;
            var release = source[key];
            if (!release || typeof release !== 'object') return;
            meta.releases[releaseId] = {
                complete: release.complete === true,
                manifest: release.manifest && typeof release.manifest === 'object' ? release.manifest : null,
                public: release.public && typeof release.public === 'object' ? release.public : null
            };
        });
        if (meta.activeReleaseId && !meta.releases[meta.activeReleaseId]) meta.activeReleaseId = '';
        return meta;
    }

    async function readMeta() {
        if (!hasCacheApi()) return null;
        try {
            var cache = await caches.open(metaCacheName());
            var response = await cache.match(metaKey());
            if (!response) return null;
            return normalizeMeta(await response.json());
        } catch (error) {
            return null;
        }
    }

    async function writeMeta(meta) {
        if (!hasCacheApi()) return;
        var cache = await caches.open(metaCacheName());
        await cache.put(metaKey(), new Response(JSON.stringify(meta), {
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
        }));
    }

    function emptyMeta() {
        return { version: LOCAL_RESOURCE_META_VERSION, activeReleaseId: '', releases: Object.create(null) };
    }

    function applyMeta(meta) {
        releases = Object.create(null);
        var active = '';
        if (meta && typeof meta === 'object') {
            active = releaseIdOf(meta.activeReleaseId);
            var source = meta.releases || {};
            Object.keys(source).forEach(function(key) {
                var releaseId = releaseIdOf(key);
                if (!releaseId) return;
                var release = source[key];
                if (!release || typeof release !== 'object') return;
                releases[releaseId] = {
                    complete: release.complete === true,
                    manifest: release.manifest || null,
                    public: release.public || null
                };
            });
        }
        if (active && !releases[active]) active = '';
        status.activeReleaseId = active;
    }

    function releaseState(releaseId) {
        var id = releaseIdOf(releaseId);
        return id && releases[id] ? releases[id] : null;
    }

    function publicEntriesFor(releaseId) {
        var release = releaseState(releaseId);
        return release && release.manifest && Array.isArray(release.manifest.public) ? release.manifest.public : null;
    }

    // 该页面读取公共资源时应使用的版本：优先本页实际加载的版本，退回活动版本。
    function bindingReleaseId() {
        if (status.loadedReleaseId && releaseState(status.loadedReleaseId)) return status.loadedReleaseId;
        return status.activeReleaseId;
    }

    function loadedManifestData() {
        var release = releaseState(bindingReleaseId());
        return release && release.manifest ? release.manifest : null;
    }

    function buildPublicDigestMap(data) {
        var map = Object.create(null);
        if (!data || !Array.isArray(data.public)) return map;
        data.public.forEach(function(entry) {
            if (!entry || !entry.path || typeof entry.sha256 !== 'string') return;
            var pathname = pathnameOf(resolvePublicUrl(entry.path));
            if (!pathname) return;
            map[pathname] = entry.sha256;
        });
        return map;
    }

    function verifyBuffer(buffer, contentType, entry) {
        if (!entry) return;
        if (entry.bytes != null && Number(buffer.byteLength) !== Number(entry.bytes)) throw new Error('资源大小不符：' + entry.path);
        if (entry.mime && contentType != null && !mimeMatches(entry.mime, contentType)) throw new Error('资源 MIME 不符：' + entry.path);
    }

    async function verifyHash(buffer, entry, hash) {
        if (!entry || !entry.sha256 || hash === false) return;
        var actual = await sha256Hex(buffer);
        if (actual !== entry.sha256) throw new Error('资源摘要不符：' + entry.path);
    }

    function abortRejection(signal) {
        return new Promise(function(resolve, reject) {
            if (!signal) return;
            if (signal.aborted) { reject(new Error('资源请求超时')); return; }
            signal.addEventListener('abort', function() { reject(new Error('资源请求超时')); });
        });
    }

    // 有界读取：真实流按预期大小上限分块读取，超出上限即截断并在出错时取消 reader；
    // 没有可读流时退回整体读取，由调用方按 holder.truncated 判断是否超出预期。
    async function readBoundedBuffer(response, limit, signal, holder) {
        var stream = response && response.body;
        if (stream && typeof stream.getReader === 'function') {
            var reader = stream.getReader();
            var onAbort = function() { try { reader.cancel(); } catch (error) { /* 已取消 */ } };
            if (signal && signal.addEventListener) signal.addEventListener('abort', onAbort);
            var chunks = [];
            var received = 0;
            var truncated = false;
            try {
                for (;;) {
                    if (signal && signal.aborted) throw new Error('资源请求超时');
                    var step = await reader.read();
                    if (step.done) break;
                    var value = step.value;
                    var chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
                    if (limit != null && received + chunk.byteLength > limit) { truncated = true; break; }
                    received += chunk.byteLength;
                    chunks.push(chunk);
                }
                if (signal && signal.aborted) throw new Error('资源请求超时');
            } catch (error) {
                try { await reader.cancel(); } catch (cancelError) { /* 已取消 */ }
                throw error;
            } finally {
                if (signal && signal.removeEventListener) signal.removeEventListener('abort', onAbort);
            }
            if (truncated) {
                if (holder) holder.truncated = true;
                try { await reader.cancel(); } catch (cancelError) { /* 已取消 */ }
            }
            var merged = new Uint8Array(received);
            var offset = 0;
            chunks.forEach(function(chunk) { merged.set(chunk, offset); offset += chunk.byteLength; });
            return merged.buffer;
        }
        var buffer = await response.arrayBuffer();
        if (holder && limit != null && buffer.byteLength > limit) holder.truncated = true;
        return buffer;
    }

    // 超时覆盖“请求 + 读体”全过程：定时器在读完 body 之后才清除；并校验最终地址与来源。
    async function fetchValidatedBuffer(url, options) {
        options = options || {};
        var request = absoluteUrl(url);
        var controller = typeof AbortController === 'function' ? new AbortController() : null;
        var signal = controller ? controller.signal : null;
        var timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : LOCAL_RESOURCE_FETCH_TIMEOUT_MS;
        var timer = controller ? setTimeout(function() { try { controller.abort(); } catch (error) { /* 已终止 */ } }, timeoutMs) : null;
        try {
            var init = { cache: options.cacheMode || 'no-store', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer' };
            if (signal) init.signal = signal;
            var response = await fetch(request, init);
            if (!response || !response.ok) throw new Error('资源请求失败：' + (response && response.status));
            if (response.redirected) throw new Error('资源发生了非预期重定向');
            var finalUrl = typeof response.url === 'string' ? response.url : '';
            if (finalUrl && finalUrl !== request) throw new Error('资源地址发生了非预期变化：' + finalUrl);
            var holder = { truncated: false };
            var body = readBoundedBuffer(response, options.maxBytes == null ? null : options.maxBytes, signal, holder);
            var buffer = signal ? await Promise.race([body, abortRejection(signal)]) : await body;
            return { buffer: buffer, contentType: response.headers ? response.headers.get('content-type') : null, truncated: holder.truncated };
        } finally {
            if (timer != null) clearTimeout(timer);
        }
    }

    function storedResponse(buffer, contentType) {
        return new Response(buffer, {
            headers: { 'Content-Type': contentType || 'application/octet-stream', 'Cache-Control': 'no-store' }
        });
    }

    async function fetchEntryBuffer(url, entry) {
        var limit = entry && Number.isInteger(entry.bytes) ? Number(entry.bytes) : null;
        // HTML 入口只能用纯文本传输副本：托管层可能给真正的 HTML 注入内容，副本才是 pinned 字节。
        var isHtmlCore = !!entry && entry.path === 'index.html' && mediaType(entry.mime) === 'text/html';
        var result = await fetchValidatedBuffer(isHtmlCore ? url + '.txt' : url, { maxBytes: limit });
        if (isHtmlCore) {
            if (mediaType(result.contentType) !== 'text/plain') throw new Error('入口传输副本类型不符：' + entry.path);
        } else if (entry && mediaType(entry.mime) !== 'text/html' && mediaType(result.contentType) === 'text/html') {
            throw new Error('资源返回了 HTML 挑战页：' + entry.path);
        }
        if (result.truncated) throw new Error('资源大小不符：' + (entry && entry.path || url));
        // 大小/摘要仍按原 HTML 条目核对；MIME 由上面的 text/plain 强校验负责。
        verifyBuffer(result.buffer, isHtmlCore ? null : result.contentType, entry);
        await verifyHash(result.buffer, entry);
        return result.buffer;
    }

    async function cachedVerified(cache, key, entry, options) {
        var response = await cache.match(key);
        if (!response) return null;
        try {
            var buffer = await response.arrayBuffer();
            verifyBuffer(buffer, response.headers.get('content-type'), entry);
            await verifyHash(buffer, entry, options && options.hash === false ? false : true);
            return { response: response, buffer: buffer };
        } catch (error) {
            await cache.delete(key);
            return null;
        }
    }

    // 只记录构建期固定的加载版本；绝不改写 window.__OT_RUNTIME__。
    function captureLoadedConfig() {
        status.loadedReleaseId = releaseIdOf(runtime().releaseId);
    }

    async function loadManifest(force) {
        if (manifestRequest && !force) return manifestRequest;
        manifestRequest = (async function() {
            var result = await fetchValidatedBuffer(manifestUrl(), { maxBytes: LOCAL_RESOURCE_MANIFEST_MAX_BYTES });
            if (result.truncated) throw new Error('离线清单大小超出上限');
            var data;
            try {
                data = JSON.parse(new TextDecoder().decode(new Uint8Array(result.buffer)));
            } catch (error) {
                throw new Error('离线清单格式无效');
            }
            return validateManifest(data);
        })();
        try {
            return await manifestRequest;
        } catch (error) {
            manifestRequest = null;
            throw error;
        }
    }

    async function commitRelease(releaseId, data) {
        var meta = (await readMeta()) || emptyMeta();
        meta.releases[releaseId] = { complete: true, manifest: data, public: buildPublicDigestMap(data) };
        // 已有活动版本保持不变，只有活动版本缺失时才登记新版本，避免暂存清单顶掉既有活动资源。
        if (!meta.activeReleaseId || !meta.releases[meta.activeReleaseId]) meta.activeReleaseId = releaseId;
        await writeMeta(meta);
        applyMeta(meta);
    }

    async function promoteActive(releaseId) {
        if (!releaseState(releaseId)) return;
        var meta = (await readMeta()) || emptyMeta();
        if (!meta.releases[releaseId]) return;
        meta.activeReleaseId = releaseId;
        await writeMeta(meta);
        applyMeta(meta);
    }

    async function stageCore(releaseId, data) {
        if (coreRequest) return coreRequest;
        coreRequest = (async function() {
            var core = (data && data.core) || [];
            var cache = await caches.open(coreCacheName(releaseId));
            status.core = { state: 'preparing', ready: 0, total: core.length, bytes: 0, bytesTotal: totalBytes(core) };
            emit();
            var ready = 0;
            var bytes = 0;
            for (var index = 0; index < core.length; index++) {
                var entry = core[index];
                var url = snapshotUrl(releaseId, entry.path);
                // 已缓存的文件必须重新核对实际字节，避免残缺或漂移的旧缓存被当作完整。
                var cached = await cachedVerified(cache, url, entry, { hash: true });
                var size;
                if (cached) {
                    size = cached.buffer.byteLength;
                } else {
                    var buffer = await fetchEntryBuffer(url, entry);
                    await cache.put(url, storedResponse(buffer, entry.mime || 'application/octet-stream'));
                    size = buffer.byteLength;
                }
                ready += 1;
                bytes += size;
                status.core.ready = ready;
                status.core.bytes = bytes;
                if (ready % 4 === 0 || ready === core.length) emit();
            }
            if (ready !== core.length) throw new Error('核心资源未全部完成');
            await commitRelease(releaseId, data);
            status.core.state = 'ready';
            emit();
            return true;
        })();
        try {
            return await coreRequest;
        } catch (error) {
            status.core.state = 'error';
            setError(error);
            emit();
            throw error;
        } finally {
            coreRequest = null;
        }
    }

    function releaseIsComplete(releaseId) {
        var release = releaseState(releaseId);
        return !!(release && release.complete);
    }

    async function estimateRoom(extraBytes) {
        try {
            if (!navigator.storage || !navigator.storage.estimate) return { ok: true };
            var estimate = await navigator.storage.estimate();
            var quota = Number(estimate.quota) || 0;
            var usage = Number(estimate.usage) || 0;
            if (!quota) return { ok: true };
            var reserve = Math.max(LOCAL_RESOURCE_QUOTA_RESERVE_BYTES, quota * LOCAL_RESOURCE_QUOTA_RESERVE_RATIO);
            return { ok: usage + extraBytes + reserve <= quota, quota: quota, usage: usage };
        } catch (error) {
            return { ok: true };
        }
    }

    // 用户主动准备资料时申请持久化存储；被拒绝或不支持都不阻止准备流程。
    function requestPersistentStorage() {
        try {
            if (!navigator.storage || typeof navigator.storage.persist !== 'function') return;
            Promise.resolve(navigator.storage.persist()).catch(function() { /* 拒绝不影响流程 */ });
        } catch (error) { /* 忽略 */ }
    }

    function notePreparedDigest(sha256) {
        if (!cacheStore || !sha256) return;
        cacheStore.add(String(sha256).toLowerCase());
    }

    // 公共资源按并发闸门顺序补齐；中断时保留已完成计数并标记暂停，下次只补缺失项。
    async function preparePublicWithConcurrency(entries) {
        var cache = await caches.open(publicCacheName());
        status.public.state = 'preparing';
        status.public.running = true;
        status.public.stopped = false;
        emit();
        var room = await estimateRoom(totalBytes(entries));
        if (!room.ok) {
            status.public.state = 'error';
            status.public.running = false;
            status.public.stopped = true;
            setError('可用空间不足，已暂停公共资料下载');
            emit();
            return false;
        }
        var queue = entries.slice();
        var cursor = 0;
        var failure = null;
        async function worker() {
            while (!failure && cursor < queue.length) {
                var entry = queue[cursor];
                cursor += 1;
                try {
                    var key = publicKey(entry.sha256);
                    var cached = await cachedVerified(cache, key, entry, { hash: true });
                    var size;
                    if (cached) {
                        size = Number(entry.bytes) || cached.buffer.byteLength;
                    } else {
                        var buffer = await fetchEntryBuffer(resolvePublicUrl(entry.path), entry);
                        await cache.put(key, storedResponse(buffer, entry.mime || 'application/octet-stream'));
                        size = buffer.byteLength;
                    }
                    notePreparedDigest(entry.sha256);
                    status.public.ready += 1;
                    status.public.bytes += size;
                    if (status.public.ready % 8 === 0) emit();
                } catch (error) {
                    failure = failure || error;
                }
            }
        }
        var workers = [];
        for (var index = 0; index < LOCAL_RESOURCE_PUBLIC_CONCURRENCY; index++) workers.push(worker());
        await Promise.all(workers);
        status.public.running = false;
        if (failure) {
            status.public.state = 'error';
            status.public.stopped = true;
            setError(failure);
            scheduleRetry();
            emit();
            return false;
        }
        status.public.state = status.public.ready >= status.public.total ? 'ready' : 'error';
        emit();
        return status.public.state === 'ready';
    }

    async function preparePublic() {
        if (publicRequest) return publicRequest;
        requestPersistentStorage();
        publicRequest = (async function() {
            var data = loadedManifestData() || (await loadManifest(true));
            var entries = (data && data.public) || [];
            status.public.total = entries.length;
            status.public.bytesTotal = totalBytes(entries);
            var cache = hasCacheApi() ? await caches.open(publicCacheName()) : null;
            var missing = [];
            var bytes = 0;
            for (var index = 0; index < entries.length; index++) {
                var entry = entries[index];
                var cached = cache ? await cachedVerified(cache, publicKey(entry.sha256), entry, { hash: true }) : null;
                if (cached) {
                    bytes += Number(entry.bytes) || cached.buffer.byteLength;
                    notePreparedDigest(entry.sha256);
                } else {
                    missing.push(entry);
                }
            }
            status.public.ready = entries.length - missing.length;
            status.public.bytes = bytes;
            if (!missing.length) {
                status.public.state = 'ready';
                status.public.stopped = false;
                emit();
                return true;
            }
            if (!cache) {
                status.public.state = 'error';
                setError('当前来源无法写入缓存');
                emit();
                return false;
            }
            try {
                var result = await preparePublicWithConcurrency(missing);
                if (result) { retryIndex = 0; setError(''); }
                return result;
            } catch (error) {
                status.public.state = 'error';
                status.public.running = false;
                status.public.stopped = true;
                setError(error);
                scheduleRetry();
                emit();
                return false;
            }
        })();
        try {
            return await publicRequest;
        } finally {
            publicRequest = null;
        }
    }

    function scheduleRetry() {
        if (retryTimer != null) return;
        if (retryIndex >= LOCAL_RESOURCE_RETRY_BACKOFF_MS.length) {
            // 有界退避结束：停止自动重试，等待用户手动恢复，避免离线时无限循环。
            status.public.stopped = true;
            status.public.running = false;
            emit();
            return;
        }
        var delay = LOCAL_RESOURCE_RETRY_BACKOFF_MS[retryIndex];
        retryIndex += 1;
        retryTimer = setTimeout(function() {
            retryTimer = null;
            preparePublic().catch(function() { /* 退避失败继续等待用户操作 */ });
        }, delay);
    }

    // 统计真实缓存内容：逐个核对缓存里的实际条目，而不是信任标记或内存集合。
    async function verifyPublicStatus(entries, hash) {
        var ready = 0;
        var bytes = 0;
        if (hasCacheApi()) {
            var cache = await caches.open(publicCacheName());
            for (var index = 0; index < entries.length; index++) {
                var entry = entries[index];
                var cached = await cachedVerified(cache, publicKey(entry.sha256), entry, { hash: hash === true });
                if (cached) {
                    ready += 1;
                    bytes += Number(entry.bytes) || cached.buffer.byteLength;
                }
            }
        }
        status.public.ready = ready;
        status.public.bytes = bytes;
        status.public.total = entries.length;
        status.public.bytesTotal = totalBytes(entries);
    }

    async function verifyCoreStatus(releaseId) {
        var release = releaseState(releaseId);
        var core = release && release.manifest && Array.isArray(release.manifest.core) ? release.manifest.core : [];
        status.core.total = core.length;
        status.core.bytesTotal = totalBytes(core);
        if (!releaseId || !core.length || !hasCacheApi()) {
            status.core.ready = 0;
            status.core.bytes = 0;
            status.core.state = status.core.state === 'preparing' ? 'preparing' : 'idle';
            return;
        }
        var cache = await caches.open(coreCacheName(releaseId));
        var ready = 0;
        var bytes = 0;
        for (var index = 0; index < core.length; index++) {
            var entry = core[index];
            var cached = await cachedVerified(cache, snapshotUrl(releaseId, entry.path), entry, { hash: true });
            if (cached) {
                ready += 1;
                bytes += Number(entry.bytes) || cached.buffer.byteLength;
            }
        }
        status.core.ready = ready;
        status.core.bytes = bytes;
        // 只有“版本登记为完整 + 每个文件都在且校验通过”才报告就绪；缺文件或校验失败绝不谎报就绪。
        status.core.state = (release.complete && ready === core.length) ? 'ready' : (ready > 0 || release.complete ? 'preparing' : 'idle');
    }

    async function refreshCacheStore() {
        if (!hasCacheApi()) return;
        try {
            var names = await caches.keys();
            var store = new Set();
            for (var index = 0; index < names.length; index++) {
                if (names[index] !== publicCacheName()) continue;
                var cache = await caches.open(names[index]);
                var requests = await cache.keys();
                requests.forEach(function(request) {
                    var match = /__ot-public__\/([0-9a-f]{64})$/i.exec(String((request && request.url) || request));
                    if (match) store.add(match[1].toLowerCase());
                });
            }
            cacheStore = store;
        } catch (error) { /* 缓存枚举失败视为未知 */ }
    }

    async function refreshStatus(options) {
        options = options || {};
        if (!supportsOffline()) {
            status.supported = false;
            status.offlineReopen = false;
            emit();
            return getStatus();
        }
        status.supported = true;
        status.offlineReopen = true;
        status.basePath = basePath();
        status.controlled = !!(navigator.serviceWorker && navigator.serviceWorker.controller);
        try {
            applyMeta(await readMeta());
            await verifyCoreStatus(status.activeReleaseId);
            await verifyPublicStatus(publicEntriesFor(bindingReleaseId()) || [], options.hashPublic !== false);
            await refreshCacheStore();
        } catch (error) {
            setError(error);
        }
        emit();
        return getStatus();
    }

    function registerClientRelease(releaseId) {
        try {
            var controller = navigator.serviceWorker && navigator.serviceWorker.controller;
            if (!controller || !releaseIdOf(releaseId)) return;
            controller.postMessage({ type: 'ot-register-release', releaseId: releaseId });
        } catch (error) { /* 注册失败只影响公共资源绑定的回退行为 */ }
    }

    function requestSwMessage(payload, timeoutMs) {
        return new Promise(function(resolve, reject) {
            var controller = navigator.serviceWorker && navigator.serviceWorker.controller;
            if (!controller) { reject(new Error('当前页面未受 Service Worker 控制')); return; }
            var channel = typeof MessageChannel === 'function' ? new MessageChannel() : null;
            var settled = false;
            var timer = setTimeout(function() {
                if (settled) return;
                settled = true;
                reject(new Error('与 Service Worker 通信超时'));
            }, Number(timeoutMs) > 0 ? Number(timeoutMs) : LOCAL_RESOURCE_FETCH_TIMEOUT_MS);
            if (channel) {
                channel.port1.onmessage = function(event) {
                    if (settled) return;
                    settled = true;
                    clearTimeout(timer);
                    resolve(event.data || { ok: false, reason: '未知响应' });
                };
            }
            try {
                controller.postMessage(payload, channel ? [channel.port2] : undefined);
            } catch (error) {
                if (!settled) { settled = true; clearTimeout(timer); reject(error); }
            }
        });
    }

    async function registerWorker() {
        if (!navigator.serviceWorker || !navigator.serviceWorker.register) return;
        try {
            var registration = await navigator.serviceWorker.register(swUrl(), { scope: basePath() });
            status.registered = true;
            status.controlled = !!navigator.serviceWorker.controller;
            if (navigator.serviceWorker.addEventListener) {
                navigator.serviceWorker.addEventListener('controllerchange', function() {
                    status.controlled = true;
                    registerClientRelease(bindingReleaseId());
                    emit();
                });
            }
            registerClientRelease(bindingReleaseId());
            if (registration && registration.update) {
                registration.update().catch(function() { /* 更新检查失败保持旧版本 */ });
            }
        } catch (error) {
            status.registered = false;
            setError(error);
        }
    }

    async function checkForUpdates() {
        if (!supportsOffline()) {
            await refreshStatus();
            return getStatus();
        }
        if (checkRequest) return checkRequest;
        checkRequest = (async function() {
            status.core.state = status.core.state === 'ready' ? 'ready' : 'checking';
            emit();
            var data = await loadManifest(true);
            status.lastCheckAt = Date.now();
            var ready = releaseIsComplete(data.releaseId);
            if (!ready) {
                await stageCore(data.releaseId, data);
                ready = releaseIsComplete(data.releaseId);
            }
            // 新版本只登记在自身 release 记录中；活动版本与本页运行版本都不因此改变。
            status.update = (ready && status.activeReleaseId && status.activeReleaseId !== data.releaseId)
                ? { available: true, releaseId: data.releaseId }
                : { available: false, releaseId: '' };
            await refreshStatus();
            retryIndex = 0;
            setError('');
            emit();
            return getStatus();
        })();
        try {
            return await checkRequest;
        } catch (error) {
            await refreshStatus();
            if (status.core.state !== 'ready') status.core.state = 'error';
            setError(error);
            emit();
            throw error;
        } finally {
            checkRequest = null;
        }
    }

    async function assertIdleClients() {
        var controller = navigator.serviceWorker && navigator.serviceWorker.controller;
        if (!controller) return true;
        try {
            var result = await requestSwMessage({ type: 'ot-assert-idle-clients' }, 5000);
            return !result || result.ok === true;
        } catch (error) {
            // 无法确认其它窗口状态时拒绝清理，避免删掉别人正在使用的缓存。
            return false;
        }
    }

    async function clearDownloads() {
        if (!hasCacheApi()) return false;
        if (!(await assertIdleClients())) {
            setError('其他标签页可能仍在使用缓存，暂不清理');
            emit();
            return false;
        }
        var keep = Object.create(null);
        if (releaseIdOf(status.activeReleaseId)) keep[status.activeReleaseId] = true;
        if (releaseIdOf(status.loadedReleaseId)) keep[status.loadedReleaseId] = true;
        var removed = 0;
        var prefix = coreCachePrefix();
        var names = await caches.keys();
        for (var index = 0; index < names.length; index++) {
            var name = names[index];
            if (name.indexOf(prefix) !== 0) continue;
            if (keep[name.slice(prefix.length)]) continue;
            if (await caches.delete(name)) removed += 1;
        }
        // 公共资料可重新下载：整体清掉公开缓存并同步内存集合。
        if (await caches.delete(publicCacheName())) removed += 1;
        cacheStore = new Set();
        status.public = { state: 'idle', ready: 0, total: 0, bytes: 0, bytesTotal: 0, running: false, stopped: false };
        retryIndex = 0;
        if (retryTimer != null) { clearTimeout(retryTimer); retryTimer = null; }
        var meta = await readMeta();
        if (meta) {
            Object.keys(meta.releases).forEach(function(releaseId) {
                if (!keep[releaseId]) delete meta.releases[releaseId];
            });
            await writeMeta(meta);
            applyMeta(meta);
        }
        await refreshStatus();
        return removed > 0;
    }

    // 用户在生成、草稿、待确认保存、设置改动或恢复过程中时不得强制重载页面。
    function conversationCommitPending() {
        try {
            if (typeof state === 'undefined' || !state || !state.conversations) return false;
            var ids = Object.keys(state.conversations);
            for (var index = 0; index < ids.length; index++) {
                var conv = state.conversations[ids[index]];
                if (conv && conv._messageCommitInProgress) return true;
            }
        } catch (error) { /* 读取失败按无待确认处理 */ }
        return false;
    }

    function pendingPersistRecords() {
        try {
            if (typeof _persistPendingRecords === 'undefined' || !Array.isArray(_persistPendingRecords)) return false;
            for (var index = 0; index < _persistPendingRecords.length; index++) {
                var record = _persistPendingRecords[index];
                if (record && record.status !== 'cancelled') return true;
            }
        } catch (error) { /* 读取失败按无待确认处理 */ }
        return false;
    }

    function hasUnsavedDraft() {
        try {
            var input = typeof dom !== 'undefined' && dom ? dom.messageInput : null;
            return !!(input && typeof input.value === 'string' && input.value.length > 0);
        } catch (error) {
            return false;
        }
    }

    function hasInlineMessageEdit() {
        try {
            if (typeof dom === 'undefined' || !dom || !dom.messagesContainer) return false;
            return !!dom.messagesContainer.querySelector('.msg-bubble textarea');
        } catch (error) {
            return false;
        }
    }

    function hasPendingUserDraft() {
        try {
            return typeof userDraftRequest !== 'undefined' && !!userDraftRequest;
        } catch (error) {
            return false;
        }
    }

    // 打开但未改动的设置不算草稿：只在表单值相对打开时的基线确有变化时阻止切换。
    function hasSettingsDraftChanges() {
        try {
            if (typeof settingsFormDraft === 'undefined' || !settingsFormDraft) return false;
            var baseline = typeof settingsFormBaseline !== 'undefined' ? settingsFormBaseline : null;
            if (!baseline) return true;
            var candidate = clone(settingsFormDraft);
            if (typeof readSettingsFormIntoState === 'function') readSettingsFormIntoState(candidate);
            if (JSON.stringify(candidate) !== JSON.stringify(baseline)) return true;
            if (typeof readSettingsPersonaCandidate === 'function' && readSettingsPersonaCandidate()) return true;
            if (typeof dom !== 'undefined' && dom && dom.imageGenerationToken &&
                typeof settingsImageTokenBaseline !== 'undefined' && dom.imageGenerationToken.value.trim() !== settingsImageTokenBaseline) return true;
            return false;
        } catch (error) {
            return true;
        }
    }

    function hasPendingWork() {
        if (typeof state !== 'undefined' && state && state.isGenerating) return true;
        if (pendingPersistRecords()) return true;
        if (conversationCommitPending()) return true;
        if (hasUnsavedDraft()) return true;
        if (hasInlineMessageEdit()) return true;
        if (hasPendingUserDraft()) return true;
        if (hasSettingsDraftChanges()) return true;
        if (typeof isBackupRestorePending === 'function' && isBackupRestorePending()) return true;
        if (typeof backupRestorePending !== 'undefined' && backupRestorePending) return true;
        if (typeof storageReplacementActive !== 'undefined' && storageReplacementActive > 0) return true;
        if (typeof cloudSyncActiveOperations !== 'undefined' && cloudSyncActiveOperations > 0) return true;
        return false;
    }

    async function applyUpdate() {
        if (!status.update.available || !status.update.releaseId) throw new Error('当前没有已就绪的更新');
        if (!supportsOffline()) throw new Error('当前来源不支持离线更新');
        if (hasPendingWork()) throw new Error('存在生成、草稿或待确认保存，暂不切换版本');
        var releaseId = status.update.releaseId;
        var result = await requestSwMessage({ type: 'ot-apply-update', releaseId: releaseId });
        if (!result || result.ok !== true) throw new Error((result && result.reason) || '切换版本被拒绝');
        // 异步确认后、重载前再检查一次，避免等待期间新出现的草稿或待确认写入被丢掉。
        if (hasPendingWork()) throw new Error('存在生成、草稿或待确认保存，暂不切换版本');
        status.activeReleaseId = releaseId;
        status.update = { available: false, releaseId: '' };
        emit();
        return true;
    }

    function resolvePublicUrl(url) {
        var value = String(url == null ? '' : url).trim();
        if (!value) return '';
        if (/^(https?:|data:|blob:)/i.test(value)) return value;
        var path = value.replace(/\\/g, '/').replace(/^\/+/, '');
        return absoluteUrl(basePath() + path);
    }

    function findPublicEntry(url) {
        var entries = publicEntriesFor(bindingReleaseId());
        if (!entries) return null;
        var target = resolvePublicUrl(url);
        for (var index = 0; index < entries.length; index++) {
            var entry = entries[index];
            if (entry && resolvePublicUrl(entry.path) === target) return entry;
        }
        return null;
    }

    function isPublicPrepared(url) {
        var entry = findPublicEntry(url);
        if (!entry || !entry.sha256 || !hasCacheApi()) return false;
        try {
            return !!(cacheStore && cacheStore.has(String(entry.sha256).toLowerCase()));
        } catch (error) {
            return false;
        }
    }

    // 只允许同源或内联（data:/blob:）地址作为未列入清单的公共来源，避免把任意外站当作公共资料抓取。
    function isWhitelistedPublicUrl(target) {
        try {
            var locationOrigin = window.location && (window.location.origin || new URL(window.location.href).origin);
            if (new URL(target).origin !== locationOrigin) return false;
            var catalogs = [typeof PUBLIC_CARDS !== 'undefined' ? PUBLIC_CARDS : [], typeof PUBLIC_SERIES !== 'undefined' ? PUBLIC_SERIES : [],
                typeof CONTRIBUTOR_CARDS !== 'undefined' ? CONTRIBUTOR_CARDS : [], typeof CONTRIBUTOR_SERIES !== 'undefined' ? CONTRIBUTOR_SERIES : []];
            return catalogs.some(function(items) {
                return items.some(function(item) {
                    return ['jsonUrl', 'previewImage', 'coverImage'].some(function(key) {
                        return !!item[key] && resolvePublicUrl(item[key]) === target;
                    });
                });
            });
        } catch (error) {
            return false;
        }
    }

    async function readPublic(url) {
        var target = resolvePublicUrl(url);
        if (!target) throw new Error('公共资源地址为空');
        var entry = findPublicEntry(target);
        if (!entry && !isWhitelistedPublicUrl(target)) throw new Error('公共资源不在离线白名单内：' + target);
        if (hasCacheApi() && entry && entry.sha256) {
            var cache = await caches.open(publicCacheName());
            var cached = await cachedVerified(cache, publicKey(entry.sha256), entry, { hash: true });
            if (cached) return new Response(cached.buffer, { headers: { 'Content-Type': entry.mime } });
        }
        if (!supportedContext()) throw new Error('当前环境无法读取公共资源');
        var result = await fetchValidatedBuffer(target, {
            cacheMode: 'default',
            maxBytes: entry && Number.isInteger(entry.bytes) ? Number(entry.bytes) : 32 * 1024 * 1024
        });
        if (entry && mediaType(entry.mime) !== 'text/html' && mediaType(result.contentType) === 'text/html') throw new Error('公共资源返回了 HTML 挑战页');
        verifyBuffer(result.buffer, result.contentType, entry);
        await verifyHash(result.buffer, entry);
        if (hasCacheApi() && entry && entry.sha256) {
            var cache2 = await caches.open(publicCacheName());
            try {
                await cache2.put(publicKey(entry.sha256), storedResponse(result.buffer, (entry && entry.mime) || result.contentType));
                notePreparedDigest(entry.sha256);
            } catch (error) { /* 写入失败不阻塞本次读取 */ }
        }
        return new Response(result.buffer, { headers: { 'Content-Type': (entry && entry.mime) || result.contentType || 'application/octet-stream' } });
    }

    function getStatus() {
        return clone({
            supported: status.supported,
            offlineReopen: status.offlineReopen,
            registered: status.registered,
            controlled: status.controlled,
            basePath: status.basePath,
            activeReleaseId: status.activeReleaseId,
            loadedReleaseId: status.loadedReleaseId,
            core: status.core,
            public: status.public,
            update: status.update,
            lastError: status.lastError,
            lastCheckAt: status.lastCheckAt
        });
    }

    function subscribe(listener) {
        if (typeof listener !== 'function') return function() {};
        listeners.push(listener);
        return function() {
            var index = listeners.indexOf(listener);
            if (index !== -1) listeners.splice(index, 1);
        };
    }

    function installBackgroundChecks() {
        if (!window.addEventListener) return;
        function check() {
            if (document.visibilityState === 'hidden') return;
            checkForUpdates().then(function() {
                if (status.public.ready < status.public.total) return preparePublic();
            }).catch(function() { /* 更新服务不可达不影响本地使用 */ });
        }
        window.addEventListener('online', function() { retryIndex = 0; check(); });
        window.addEventListener('focus', check);
        function poll() { check(); window.setTimeout(poll, 5 * 60 * 1000); }
        window.setTimeout(poll, 5 * 60 * 1000);
    }

    async function start() {
        if (started) return getStatus();
        started = true;
        captureLoadedConfig();
        status.basePath = basePath();
        if (!supportsOffline()) {
            status.supported = false;
            status.offlineReopen = false;
            emit();
            return getStatus();
        }
        status.supported = true;
        status.offlineReopen = true;
        emit();
        registerWorker().catch(function() { /* 注册失败保持在线可用 */ });
        applyMeta(await readMeta());
        await refreshStatus();
        registerClientRelease(bindingReleaseId());
        try {
            var data = await loadManifest(false);
            applyMeta(await readMeta());
            if (!releaseIsComplete(data.releaseId)) {
                await stageCore(data.releaseId, data);
            } else if (!status.activeReleaseId) {
                await promoteActive(data.releaseId);
            }
            // 让 Service Worker 按本页实际加载的版本解析公共资源。
            registerClientRelease(bindingReleaseId());
            status.update = (status.activeReleaseId && status.activeReleaseId !== data.releaseId && releaseIsComplete(data.releaseId))
                ? { available: true, releaseId: data.releaseId }
                : { available: false, releaseId: '' };
            await refreshStatus();
            window.setTimeout(function() { preparePublic().catch(function() { /* 后台准备失败不影响核心 */ }); }, 0);
        } catch (error) {
            setError(error);
            emit();
        }
        installBackgroundChecks();
        return getStatus();
    }

    return {
        start: start,
        checkForUpdates: checkForUpdates,
        preparePublic: preparePublic,
        refreshStatus: refreshStatus,
        clearDownloads: clearDownloads,
        applyUpdate: applyUpdate,
        readPublic: readPublic,
        resolvePublicUrl: resolvePublicUrl,
        isPublicPrepared: isPublicPrepared,
        getStatus: getStatus,
        subscribe: subscribe
    };
})();
