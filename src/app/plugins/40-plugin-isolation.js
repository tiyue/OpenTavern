/**
 * 新手导读（文件：40-plugin-isolation.js）
 *
 * 负责什么：构造通用插件的隔离文档、可信 iframe 引导和 DedicatedWorker SDK。
 * 在程序中的位置：插件源码只通过受检消息传给 sandbox iframe，再由 it 创建 Blob Worker；
 * 插件文本永远不拼进 srcdoc 或宿主 DOM。运行时状态与 RPC 在 50-plugin-runtime.js。
 * 从哪里开始看：`buildPluginIsolationDocument(token)`、`pluginWorkerSdkSource(config)`。
 * 修改时注意：srcdoc 只能包含本文件的受信引导；CSP 必须保持 connect-src 'none'、
 * script-src nonce + blob、worker-src blob，不得为插件增加宿主 DOM 或同源窗口。
 */
// ==================== Plugin Isolation ====================
var PLUGIN_ISOLATION_ABI = 1;

function pluginRandomToken() {
    var bytes = new Uint8Array(24);
    if (typeof crypto !== 'undefined' && crypto && typeof crypto.getRandomValues === 'function') {
        crypto.getRandomValues(bytes);
    } else {
        for (var index = 0; index < bytes.length; index++) bytes[index] = Math.floor(Math.random() * 256);
    }
    return Array.from(bytes).map(function(value) { return ('0' + value.toString(16)).slice(-2); }).join('');
}

function pluginIsolationPolicy(nonce) {
    return "default-src 'none'; script-src 'nonce-" + nonce + "' blob:; worker-src blob:; " +
        "connect-src 'none'; img-src 'none'; style-src 'none'; font-src 'none'; media-src 'none'; " +
        "object-src 'none'; frame-src 'none'; child-src 'none'; base-uri 'none'; form-action 'none'";
}

function buildPluginIsolationDocument(token) {
    if (typeof token !== 'string' || !/^[0-9a-f]{32,64}$/.test(token)) throw new Error(t('plugin_isolation_invalid'));
    var nonce = pluginRandomToken();
    var config = {
        token: token,
        abi: PLUGIN_ISOLATION_ABI,
        instanceId: '',
        maxMessageBytes: PLUGIN_MAX_RPC_BYTES,
        maxEntryBytes: PLUGIN_MAX_ENTRY_BYTES,
        startupMs: PLUGIN_STARTUP_TIMEOUT_MS,
        heartbeatMs: PLUGIN_HEARTBEAT_MS,
        staleMs: PLUGIN_STALE_MS
    };
    var serialized = JSON.stringify(config)
        .replace(/</g, '\\u003c')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');
    var policy = pluginIsolationPolicy(nonce).replace(/"/g, '&quot;');
    // 这里只有受信引导；插件源码绝不会进入 srcdoc。
    return '<!doctype html><html><head><meta charset="utf-8">' +
        '<meta name="viewport" content="width=device-width,initial-scale=1">' +
        '<meta http-equiv="Content-Security-Policy" content="' + policy + '">' +
        '</head><body><script nonce="' + nonce + '">(' +
        pluginIsolationChildBootstrap.toString() + ')(' + serialized + ');</script></body></html>';
}

// 该函数会被 toString() 后放入沙箱 iframe；它只做受信引导，不执行插件源码。
function pluginIsolationChildBootstrap(config) {
    'use strict';
    var port = null, worker = null, blobUrl = null, stopped = false, connected = false;
    var lastPong = Date.now(), heartbeat = null, startup = null;

    function copy(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function post(message) {
        if (!port) return;
        try { port.postMessage(message); } catch (error) {}
    }

    function notifyHost(message) {
        try { parent.postMessage({ type: 'plugin-isolation-error', token: config.token, message: String(message || '').slice(0, 500) }, '*'); } catch (error) {}
    }

    function stop(reason) {
        if (stopped) return;
        stopped = true;
        clearInterval(heartbeat);
        clearTimeout(startup);
        try { if (worker) worker.terminate(); } catch (error) {}
        worker = null;
        if (blobUrl) {
            try { URL.revokeObjectURL(blobUrl); } catch (error) {}
            blobUrl = null;
        }
        if (port) {
            try { port.postMessage({ type: 'plugin-isolation-stopped', reason: String(reason || '').slice(0, 200) }); } catch (error) {}
            try { port.close(); } catch (error) {}
            port = null;
        }
        window.removeEventListener('message', connect);
        window.removeEventListener('pagehide', onPageHide);
    }

    function onPageHide() { stop('pagehide'); }

    function fail(message) {
        post({ type: 'plugin-fail', message: String(message || 'Plugin worker failed').slice(0, 500) });
        notifyHost(message);
        stop(message);
    }

    function relay(value) {
        if (!value || typeof value !== 'object' || stopped) return;
        var parsed;
        try { parsed = copy(value); } catch (error) { return; }
        var size = 0;
        try { size = JSON.stringify(parsed).length; } catch (error) { return; }
        if (!size || size > config.maxMessageBytes) {
            fail('Plugin message exceeds the allowed size');
            return;
        }
        var allowed = ['plugin-loaded', 'plugin-ready', 'plugin-fail', 'plugin-subscribe', 'plugin-unsubscribe', 'plugin-rpc', 'plugin-pong', 'plugin-probe-ack'];
        if (allowed.indexOf(parsed.type) < 0) return;
        parsed.instanceId = config.instanceId;
        if (parsed.type === 'plugin-pong') { lastPong = Date.now(); return; }
        if (parsed.type === 'plugin-fail') { post(parsed); stop('plugin reported a failure'); return; }
        if (parsed.type === 'plugin-rpc') {
            if (typeof parsed.id !== 'string' || !parsed.id || parsed.id.length > 80 ||
                typeof parsed.method !== 'string' || !parsed.method || parsed.method.length > 64 ||
                (parsed.args !== undefined && !Array.isArray(parsed.args))) return;
        }
        if (parsed.type === 'plugin-subscribe' || parsed.type === 'plugin-unsubscribe') {
            if (typeof parsed.event !== 'string' || parsed.event.length > 64) return;
        }
        if (parsed.type === 'plugin-ready') {
            lastPong = Date.now();
            clearTimeout(startup);
            startup = null;
        }
        post(parsed);
    }

    function start(payload) {
        if (!payload || typeof payload.type !== 'string' || payload.type !== 'plugin-isolation-start' ||
            payload.token !== config.token || typeof payload.sdk !== 'string' || typeof payload.entry !== 'string') {
            fail('Invalid plugin start message');
            return;
        }
        if (typeof payload.instanceId === 'string' && /^[0-9a-f]{32,64}$/.test(payload.instanceId)) config.instanceId = payload.instanceId;
        var entryBytes = new TextEncoder().encode(payload.entry).length;
        if (!entryBytes || entryBytes > config.maxEntryBytes) {
            fail('Plugin entry exceeds the allowed size');
            return;
        }
        try {
            // SDK 与插件源码在 Blob Worker 内组装；srcdoc 不解析任何插件文本。
            blobUrl = URL.createObjectURL(new Blob([payload.sdk, '\n;\n', payload.entry], { type: 'text/javascript' }));
            worker = new Worker(blobUrl);
            lastPong = Date.now();
            worker.onmessage = function(message) { relay(message.data); };
            worker.onerror = function(event) {
                if (event && event.preventDefault) event.preventDefault();
                fail('Plugin worker error: ' + String(event && event.message || 'unknown'));
            };
            worker.onmessageerror = function() { fail('Plugin worker message could not be read'); };
            heartbeat = setInterval(function() {
                if (stopped || !worker) return;
                if (Date.now() - lastPong > config.staleMs) {
                    fail('Plugin execution timed out');
                    return;
                }
                try { worker.postMessage({ type: 'plugin-ping' }); } catch (error) { fail('Plugin worker is unavailable'); }
            }, config.heartbeatMs);
            startup = setTimeout(function() {
                if (stopped) return;
                fail('Plugin did not complete its startup handshake');
            }, config.startupMs);
        } catch (error) {
            fail(error && error.message || 'Plugin worker could not start');
        }
    }

    function connect(event) {
        var data = event.data;
        if (event.source !== parent || !data || data.type !== 'plugin-isolation-start' ||
            data.token !== config.token || !event.ports || !event.ports[0] || connected) return;
        connected = true;
        port = event.ports[0];
        port.onmessage = function(message) {
            var value = message.data;
            if (!value || typeof value !== 'object') return;
            if (value.type === 'plugin-host-stop') { stop(value.reason || 'host stop'); return; }
            if (value.type === 'plugin-host-event' || value.type === 'plugin-host-rpc-result' || value.type === 'plugin-host-probe-check') {
                if (!worker) return;
                try {
                    // 宿主端口用 plugin-host-* 命名；Worker SDK 只订阅 Worker 侧契约，
                    // 这里必须显式改名，不能把宿主消息原样转给 SDK。
                    var forward;
                    if (value.type === 'plugin-host-rpc-result') {
                        forward = { type: 'plugin-rpc-result', id: value.id, ok: value.ok, result: value.result, error: value.error };
                    } else if (value.type === 'plugin-host-event') {
                        forward = { type: 'plugin-event', event: value.event, detail: value.detail };
                    } else {
                        forward = { type: 'plugin-probe-check' };
                    }
                    worker.postMessage(forward);
                } catch (error) { fail('Plugin worker is unavailable'); }
            }
        };
        port.start();
        window.removeEventListener('message', connect);
        start(data);
    }

    window.addEventListener('message', connect);
    window.addEventListener('pagehide', onPageHide);
    try { parent.postMessage({ type: 'plugin-isolation-ready', token: config.token }, '*'); } catch (error) {}
}

// 该函数会被 toString() 后放入 Blob Worker；插件 entry 代码在其后执行。
function pluginWorkerSdk(config) {
    'use strict';
    var pending = new Map(), sequence = 0, handlers = new Map(), readySent = false, stopped = false;
    var resources = Object.create(null);
    var nativeWorker = self.Worker, childWorkers = [];
    (config.resources || []).forEach(function(resource) {
        if (resource && typeof resource.path === 'string' && typeof resource.text === 'string') resources[resource.path] = resource.text;
    });
    if (typeof nativeWorker === 'function') {
        var trackedWorker = function TrackedWorker(url, options) {
            var child = new nativeWorker(url, options);
            childWorkers.push(child);
            return child;
        };
        trackedWorker.prototype = nativeWorker.prototype;
        try { Object.defineProperty(self, 'Worker', { value: trackedWorker, writable: false, configurable: false }); } catch (error) {}
    }
    function copy(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
    function send(message) { if (!stopped) self.postMessage(message); }
    function terminateChildren() {
        childWorkers.forEach(function(child) { try { child.terminate(); } catch (error) {} });
        childWorkers = [];
    }
    function failure(data) {
        var error = new Error(data && data.message || 'Plugin request failed');
        error.code = data && data.code || 'PLUGIN_ERROR';
        return error;
    }
    function rpc(method, args, timeout) {
        return new Promise(function(resolve, reject) {
            if (stopped) { reject(new Error('Plugin stopped')); return; }
            var id = 'rpc-' + (++sequence);
            var timer = setTimeout(function() {
                pending.delete(id);
                reject(new Error('Plugin request timed out'));
            }, timeout || 15000);
            pending.set(id, { resolve: resolve, reject: reject, timer: timer });
            try { send({ type: 'plugin-rpc', id: id, method: method, args: copy(args || []) }); }
            catch (error) { clearTimeout(timer); pending.delete(id); reject(error); }
        });
    }
    function storageKey(key) {
        if (typeof key !== 'string' || !/^[a-z][a-z0-9._-]{0,63}$/.test(key)) throw new Error('Invalid plugin storage key');
        return key;
    }
    function on(name, handler) {
        if (typeof name !== 'string' || !/^[a-z][a-z0-9.-]{0,63}$/.test(name)) throw new Error('Invalid plugin event name');
        if (typeof handler !== 'function') throw new Error('Plugin event handler must be a function');
        var list = handlers.get(name) || [];
        if (!list.length) send({ type: 'plugin-subscribe', event: name });
        list.push(handler);
        handlers.set(name, list);
        return function off() {
            var current = (handlers.get(name) || []).filter(function(item) { return item !== handler; });
            if (current.length) handlers.set(name, current);
            else { handlers.delete(name); send({ type: 'plugin-unsubscribe', event: name }); }
        };
    }
    var api = {
        abi: config.abi || 1,
        pluginId: config.pluginId,
        version: config.version,
        digest: config.digest,
        probe: config.probe === true,
        capabilities: (config.capabilities || []).slice(),
        ready: function(detail) {
            if (readySent) return;
            readySent = true;
            send({ type: 'plugin-ready', detail: detail === undefined ? null : copy(detail) });
        },
        fail: function(message) { send({ type: 'plugin-fail', message: String(message == null ? 'failed' : message).slice(0, 500) }); },
        on: on,
        stats: { get: function() { return rpc('stats.get', []); } },
        storage: {
            get: function(key) { return rpc('storage.get', [storageKey(key)]); },
            set: function(key, value) { return rpc('storage.set', [storageKey(key), copy(value)]); },
            remove: function(key) { return rpc('storage.remove', [storageKey(key)]); },
            keys: function() { return rpc('storage.keys', []); }
        },
        network: { request: function(request) { return rpc('network.request', [copy(request || {})], 30000); } },
        ui: {
            render: function(view) { return rpc('ui.render', [copy(view || {})]); },
            clear: function() { return rpc('ui.clear', []); }
        },
        resources: {
            get: function(path) { return typeof path === 'string' && Object.prototype.hasOwnProperty.call(resources, path) ? resources[path] : null; },
            list: function() { return Object.keys(resources); }
        }
    };
    self.OpenTavernPlugin = api;
    self.addEventListener('message', function(event) {
        var data = event.data;
        if (!data || typeof data !== 'object') return;
        if (data.type === 'plugin-rpc-result') {
            var item = pending.get(data.id);
            if (!item) return;
            pending.delete(data.id);
            clearTimeout(item.timer);
            if (data.ok) { try { item.resolve(copy(data.result)); } catch (error) { item.reject(error); } }
            else item.reject(failure(data.error));
            return;
        }
        if (data.type === 'plugin-event') {
            (handlers.get(data.event) || []).slice().forEach(function(handler) {
                try { handler(copy(data.detail)); } catch (error) {}
            });
            return;
        }
        if (data.type === 'plugin-ping') { send({ type: 'plugin-pong' }); return; }
        if (data.type === 'plugin-probe-check') { send({ type: 'plugin-probe-ack' }); return; }
        if (data.type === 'plugin-stop') {
            stopped = true;
            pending.forEach(function(item) { clearTimeout(item.timer); item.reject(new Error('Plugin stopped')); });
            pending.clear();
            handlers.clear();
            terminateChildren();
        }
    });
    send({ type: 'plugin-loaded', abi: config.abi || 1 });
}

function pluginWorkerSdkSource(config) {
    var serialized = JSON.stringify(config || {})
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');
    return '(' + pluginWorkerSdk.toString() + ')(' + serialized + ');';
}
