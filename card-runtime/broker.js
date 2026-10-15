(function() {
    'use strict';
    var parentOrigins = new Set(window.CARD_BROKER_PARENT_ORIGINS || []), active = null;
    function stop() {
        if (!active) return;
        active.stopped = true; active.controllers.forEach(function(controller) { controller.abort(); });
        active.host.close(); if (active.child) active.child.close(); active.frame.remove(); active = null;
    }
    window.addEventListener('pagehide', stop);
    function checkNetwork(session, request) {
        if (session.stopped || !session.permissions['network.fetch']) throw new Error('NETWORK_PERMISSION_DENIED');
        if (!Array.isArray(request.args) || typeof request.args[0] !== 'string') throw new Error('INVALID_NETWORK_REQUEST');
        var url = new URL(request.args[0]), options = request.args[1] || {};
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !session.origins.has(url.origin)) throw new Error('NETWORK_ORIGIN_DENIED');
        var method = String(options.method || 'GET').toUpperCase();
        if (!session.methods.has(method)) throw new Error('NETWORK_METHOD_DENIED');
        var headers = {};
        Object.keys(options.headers || {}).forEach(function(name) {
            if (!['accept', 'content-type'].includes(name.toLowerCase()) || typeof options.headers[name] !== 'string' || options.headers[name].length > 1024) throw new Error('NETWORK_HEADER_DENIED');
            headers[name] = options.headers[name];
        });
        var body = options.body == null ? undefined : options.body;
        if (body !== undefined && typeof body !== 'string') throw new Error('NETWORK_BODY_INVALID');
        if (body !== undefined && ['GET', 'HEAD'].includes(method)) throw new Error('NETWORK_BODY_INVALID');
        var bytes = new TextEncoder().encode(body || '').length;
        if (bytes > 256 * 1024 || session.count >= 50 || session.bytes + bytes > 8 * 1024 * 1024) throw new Error('NETWORK_LIMIT_EXCEEDED');
        session.count++; session.bytes += bytes;
        return { url: url.href, options: { method: method, headers: headers, body: body } };
    }
    async function network(session, request) {
        var approved = checkNetwork(session, request), controller = new AbortController(), reader;
        session.controllers.add(controller);
        var timeout = setTimeout(function() { controller.abort(); }, 12000);
        try {
            var response = await fetch(approved.url, Object.assign(approved.options, { signal: controller.signal, credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer' }));
            if (!response.body) return { status: response.status, headers: {}, body: '' };
            reader = response.body.getReader(); var size = 0, chunks = [];
            while (true) {
                var part = await reader.read(); if (part.done) break;
                if (session.stopped) throw new Error('NETWORK_REVOKED');
                size += part.value.byteLength; session.bytes += part.value.byteLength;
                if (size > 1024 * 1024 || session.bytes > 8 * 1024 * 1024) throw new Error('NETWORK_LIMIT_EXCEEDED');
                chunks.push(part.value);
            }
            if (session.stopped) throw new Error('NETWORK_REVOKED');
            var bytes = new Uint8Array(size), offset = 0; chunks.forEach(function(chunk) { bytes.set(chunk, offset); offset += chunk.length; });
            var body = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
            return { status: response.status, headers: { 'content-type': response.headers.get('content-type') || '' }, body: body };
        } finally {
            clearTimeout(timeout); controller.abort(); session.controllers.delete(controller);
            if (reader) await reader.cancel().catch(function() {});
        }
    }
    window.addEventListener('message', function(event) {
        var data = event.data;
        if (active && event.source === active.frame.contentWindow && event.origin === 'null' && data && data.type === 'card-runtime-ready' && data.token === active.token && !active.child) {
            var session = active, channel = new MessageChannel(); session.child = channel.port1;
            channel.port1.onmessage = async function(message) {
                var request = message.data;
                if (request && request.type === 'card-runtime-ping') { if (!session.stopped) session.host.postMessage(request); return; }
                if (request && request.type === 'card-runtime-layout' && Number.isFinite(request.height) && request.height >= 0 && request.height <= 100000) { if (!session.stopped) session.host.postMessage(request); return; }
                if (!request || request.type !== 'card-runtime-rpc' || typeof request.id !== 'string' || !/^[a-z0-9-]{1,64}$/i.test(request.id)) return;
                if (request.method !== 'networkFetch') { if (!session.stopped) session.host.postMessage(request); return; }
                try {
                    if (JSON.stringify(request).length > 300000) throw new Error('NETWORK_LIMIT_EXCEEDED');
                    var result = await network(session, request);
                    if (!session.stopped) session.child.postMessage({ type: 'card-runtime-result', id: request.id, ok: true, result: result });
                } catch (error) { if (!session.stopped) session.child.postMessage({ type: 'card-runtime-result', id: request.id, ok: false, error: { code: 'NETWORK_FAILED', message: error.message } }); }
            };
            channel.port1.start();
            session.frame.contentWindow.postMessage({ type: 'card-runtime-connect', token: session.token, initial: session.initial }, '*', [channel.port2]);
            return;
        }
        if (event.source !== parent || !parentOrigins.has(event.origin) || !data || !/^[a-f0-9]{48}$/.test(String(data.token))) return;
        if (data.type === 'card-broker-probe') { parent.postMessage({ type: 'card-broker-ready', token: data.token }, event.origin); return; }
        if (data.type !== 'card-broker-start' || !event.ports[0] || typeof data.document !== 'string' || data.document.length > 14 * 1024 * 1024) return;
        var origins = data.network && data.network.origins, methods = data.network && data.network.methods || ['GET'];
        if (!Array.isArray(origins) || origins.length > 16 || !Array.isArray(methods) || methods.some(function(method) { return !['GET','POST','PUT','PATCH','DELETE','HEAD'].includes(method); })) return;
        try { origins = origins.map(function(origin) { var url = new URL(origin); if (!['http:','https:'].includes(url.protocol) || url.origin !== origin || url.username || url.password) throw new Error(); return origin; }); } catch (_) { return; }
        stop();
        var frame = document.createElement('iframe'); frame.setAttribute('sandbox', 'allow-scripts'); frame.referrerPolicy = 'no-referrer'; frame.title = '隔离卡片前端';
        var session = active = { token: data.token, host: event.ports[0], child: null, frame: frame, initial: data.initial, permissions: data.permissions || {}, origins: new Set(origins), methods: new Set(methods), controllers: new Set(), bytes: 0, count: 0, stopped: false };
        session.host.onmessage = function(message) { if (!session.stopped && session.child) session.child.postMessage(message.data); }; session.host.start();
        var loaded = false; frame.addEventListener('load', function() { if (loaded) stop(); loaded = true; });
        frame.srcdoc = data.document; document.body.appendChild(frame);
    });
})();
