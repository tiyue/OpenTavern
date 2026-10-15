import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { MessageChannel } from 'node:worker_threads';

const brokerSource = fs.readFileSync(new URL('../card-runtime/broker.js', import.meta.url), 'utf8');
const parentOrigin = 'http://host.test:3030';
const networkOrigin = 'http://network.test:8080';
const token = 'a'.repeat(48);
const otherToken = 'b'.repeat(48);
const MiB = 1024 * 1024;
let checks = 0;

const turn = () => new Promise(resolve => setImmediate(resolve));
const quiet = () => new Promise(resolve => setTimeout(resolve, 20));
const checked = () => { checks++; };

function inbox(port) {
    const messages = [], waiters = new Set();
    port.on('message', data => {
        messages.push(data);
        for (const waiter of waiters) {
            if (waiter.match(data)) { waiters.delete(waiter); clearTimeout(waiter.timer); waiter.resolve(data); }
        }
    });
    port.start();
    return {
        messages,
        next(match, label = 'message') {
            const existing = messages.find(match);
            if (existing) return Promise.resolve(existing);
            return new Promise((resolve, reject) => {
                const waiter = { match, resolve, timer: setTimeout(() => {
                    waiters.delete(waiter); reject(new Error(`Timed out waiting for broker ${label}.`));
                }, 1500) };
                waiters.add(waiter);
            });
        }
    };
}

function response(body = 'ok', status = 200) {
    return new Response(body, { status, headers: { 'content-type': 'text/plain; charset=utf-8', 'set-cookie': 'SECRET=1', 'x-private': 'hidden' } });
}

function harness() {
    const listeners = new Map(), frames = [], parentReplies = [], channels = [], timers = new Map(), fetches = [];
    const parent = { postMessage(data, origin) { parentReplies.push({ data, origin }); } };
    function channel() { const value = new MessageChannel(); channels.push(value); return value; }
    function element() {
        const events = new Map(), connect = [];
        const frame = {
            attributes: {}, removed: false, events, connect,
            setAttribute(name, value) { this.attributes[name] = value; },
            addEventListener(name, listener) { events.set(name, listener); },
            remove() { this.removed = true; },
            contentWindow: { postMessage(data, origin, ports) { connect.push({ data, origin, ports }); } }
        };
        return frame;
    }
    let fetchImplementation = () => response();
    const ctx = {
        URL, TextEncoder, TextDecoder, Uint8Array, AbortController,
        MessageChannel: function() { return channel(); },
        parent,
        window: {
            CARD_BROKER_PARENT_ORIGINS: [parentOrigin],
            addEventListener(name, listener) { listeners.set(name, listener); }
        },
        document: { createElement(name) { assert.equal(name, 'iframe'); return element(); }, body: { appendChild(frame) { frames.push(frame); } } },
        setTimeout(callback, delay) {
            const timer = setTimeout(() => { timers.delete(timer); callback(); }, delay);
            timer.unref(); timers.set(timer, { callback, delay }); return timer;
        },
        clearTimeout(timer) { clearTimeout(timer); timers.delete(timer); },
        fetch(url, options) {
            const record = { url, options };
            fetches.push(record);
            return Promise.resolve().then(() => fetchImplementation(record));
        }
    };
    vm.runInNewContext(brokerSource, ctx, { filename: 'card-runtime/broker.js' });
    const dispatch = (data, options = {}) => listeners.get('message')({ data, source: options.source === undefined ? parent : options.source,
        origin: options.origin === undefined ? parentOrigin : options.origin, ports: options.ports || [] });
    function start(options = {}) {
        const host = channel(), hostMessages = inbox(host.port1);
        const before = frames.length;
        dispatch({ type: 'card-broker-start', token, document: '<p>Broker test</p>', initial: { message: { id: 'm' } },
            permissions: { 'network.fetch': true }, network: { origins: [networkOrigin], methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'] }, ...options.data },
        { ports: [host.port2], ...options.event });
        if (frames.length === before) return null;
        const frame = frames.at(-1);
        return { frame, host: host.port1, hostMessages, token: options.data?.token || token };
    }
    function ready(session, options = {}) {
        const before = session.frame.connect.length;
        dispatch({ type: 'card-runtime-ready', token: session.token, ...options.data }, {
            source: session.frame.contentWindow, origin: 'null', ...options.event
        });
        if (session.frame.connect.length === before) return null;
        const connect = session.frame.connect.at(-1);
        session.child = connect.ports[0]; session.childMessages = inbox(session.child); session.connect = connect;
        return session;
    }
    function connected(options) { const session = start(options); assert.ok(session); assert.ok(ready(session)); return session; }
    let sequence = 0;
    function send(session, method = 'networkFetch', args = [`${networkOrigin}/resource`], extra = {}) {
        const request = { type: 'card-runtime-rpc', id: `request-${++sequence}`, method, args, ...extra };
        session.child.postMessage(request);
        return request;
    }
    async function rpc(session, method, args, extra) {
        const request = send(session, method, args, extra);
        return session.childMessages.next(data => data.type === 'card-runtime-result' && data.id === request.id, request.id);
    }
    function pendingBody() {
        let controller;
        const stream = new ReadableStream({ start(value) { controller = value; } });
        fetchImplementation = record => {
            record.options.signal.addEventListener('abort', () => {
                try { controller.error(new DOMException('Aborted', 'AbortError')); } catch (_) {}
            }, { once: true });
            return response(stream);
        };
        return { stream, enqueue: value => controller.enqueue(value), close: () => controller.close() };
    }
    async function drain() { for (let i = 0; i < 4; i++) await turn(); }
    async function cleanup() {
        listeners.get('pagehide')();
        await drain();
        for (const [timer] of timers) clearTimeout(timer);
        timers.clear();
        for (const value of channels) { value.port1.close(); value.port2.close(); }
    }
    return { dispatch, parent, frames, parentReplies, fetches, timers, start, ready, connected, send, rpc, pendingBody, drain, cleanup,
        fetch: value => { fetchImplementation = value; },
        pagehide: () => listeners.get('pagehide')(),
        expire() {
            assert.equal(timers.size, 1);
            const [timer, entry] = [...timers][0];
            assert.equal(entry.delay, 12000, 'The request deadline covers body reads.');
            clearTimeout(timer); timers.delete(timer); entry.callback();
        }
    };
}

async function test(name, run) {
    const h = harness();
    try { await run(h); checked(); }
    catch (error) { error.message = `${name}: ${error.message}`; throw error; }
    finally { await h.cleanup(); }
}

async function denied(h, session, args, message) {
    const before = h.fetches.length, result = await h.rpc(session, 'networkFetch', args);
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'NETWORK_FAILED');
    assert.equal(result.error.message, message);
    assert.equal(h.fetches.length, before, 'Denied requests never reach fetch.');
    checked();
    return result;
}

await test('Parent source, exact origin and token probe', async h => {
    const probe = { type: 'card-broker-probe', token };
    for (const event of [{ source: {} }, { origin: 'http://host.test:3031' }, { origin: 'https://host.test:3030' }, { origin: 'null' }]) h.dispatch(probe, event);
    for (const invalid of ['', 'a'.repeat(47), 'A'.repeat(48), 'g'.repeat(48), `${token}x`]) h.dispatch({ ...probe, token: invalid });
    assert.equal(h.parentReplies.length, 0);
    h.dispatch(probe);
    assert.deepEqual(h.parentReplies.map(row => ({ ...row, data: { ...row.data } })), [{ data: { type: 'card-broker-ready', token }, origin: parentOrigin }]);
    h.dispatch({ ...probe, token: otherToken });
    assert.equal(h.parentReplies[1].data.token, otherToken, 'Probe replies echo the approved parent token without starting a session.');
    assert.equal(h.frames.length, 0);
});

await test('Start rejects hostile source and malformed policy', async h => {
    for (const event of [{ source: {} }, { origin: 'http://host.test:3031' }]) assert.equal(h.start({ event }), null);
    for (const data of [
        { token: 'invalid' }, { document: {} }, { document: 'x'.repeat(14 * MiB + 1) },
        { network: { origins: ['http://user:password@network.test:8080'] } },
        { network: { origins: [`${networkOrigin}/path`] } }, { network: { origins: ['file:///local'] } },
        { network: { origins: ['data:text/plain,no'] } }, { network: { origins: Array(17).fill(networkOrigin) } },
        { network: { origins: [networkOrigin], methods: ['OPTIONS'] } }, { network: { origins: [networkOrigin], methods: ['get'] } },
        { network: { origins: [networkOrigin], methods: 'GET' } }
    ]) assert.equal(h.start({ data }), null);
    assert.equal(h.start({ event: { ports: [] } }), null);
    assert.equal(h.frames.length, 0);
});

await test('Opaque child handshake binds frame, token and null origin once', async h => {
    const session = h.start();
    assert.ok(session);
    for (const options of [{ event: { source: {} } }, { event: { origin: parentOrigin } }, { event: { origin: 'http://broker.test:3031' } }, { data: { token: otherToken } }]) assert.equal(h.ready(session, options), null);
    assert.ok(h.ready(session));
    assert.equal(session.frame.attributes.sandbox, 'allow-scripts');
    assert.equal(session.frame.referrerPolicy, 'no-referrer');
    assert.equal(session.connect.origin, '*');
    assert.equal(session.connect.data.type, 'card-runtime-connect');
    assert.equal(session.connect.data.token, token);
    assert.equal(session.connect.data.initial.message.id, 'm');
    assert.equal(h.ready(session), null);
    const second = h.start({ data: { token: otherToken } });
    assert.equal(session.frame.removed, true);
    assert.equal(h.ready(session), null, 'An old frame and token cannot connect to its replacement.');
    assert.ok(h.ready(second));
});

await test('Non-network RPC and host replies use actual MessagePorts', async h => {
    const session = h.connected();
    const request = h.send(session, 'unsupportedMethod', ['argument']);
    assert.deepEqual(await session.hostMessages.next(data => data.id === request.id), request);
    session.host.postMessage({ type: 'card-runtime-result', id: request.id, ok: false, error: { code: 'UNSUPPORTED_METHOD', message: 'Not implemented' } });
    const reply = await session.childMessages.next(data => data.id === request.id);
    assert.equal(reply.error.code, 'UNSUPPORTED_METHOD');
    session.child.postMessage({ type: 'card-runtime-ping', token });
    assert.equal((await session.hostMessages.next(data => data.type === 'card-runtime-ping')).token, token);
    const before = session.hostMessages.messages.length;
    for (const invalid of ['bad id', 'x'.repeat(65), '', 3]) session.child.postMessage({ type: 'card-runtime-rpc', id: invalid, method: 'networkFetch', args: [`${networkOrigin}/resource`] });
    await quiet();
    assert.equal(session.hostMessages.messages.length, before);
    assert.equal(h.fetches.length, 0);
});

await test('Network capability denies missing or false permission', async h => {
    for (const permissions of [{}, { 'network.fetch': false }]) {
        const session = h.connected({ data: { permissions } });
        await denied(h, session, [`${networkOrigin}/resource`], 'NETWORK_PERMISSION_DENIED');
    }
});

await test('Exact HTTP/HTTPS origin, method and URL restrictions', async h => {
    const session = h.connected({ data: { network: { origins: [networkOrigin, 'https://network.test:9443'], methods: ['GET', 'POST'] } } });
    for (const url of ['http://network.test:8081/resource', 'https://network.test:8080/resource', 'http://network.test.evil:8080/resource',
        `http://user:password@network.test:8080/resource`, `http://user@network.test:8080/resource`, 'file:///local', 'data:text/plain,no', 'javascript:void(0)']) {
        await denied(h, session, [url], 'NETWORK_ORIGIN_DENIED');
    }
    await denied(h, session, [`${networkOrigin}/resource`, { method: 'DELETE' }], 'NETWORK_METHOD_DENIED');
    await denied(h, session, [`${networkOrigin}/resource`, { method: 'OPTIONS' }], 'NETWORK_METHOD_DENIED');
    await denied(h, session, [], 'INVALID_NETWORK_REQUEST');
    await denied(h, session, [42], 'INVALID_NETWORK_REQUEST');
    assert.equal((await h.rpc(session, 'networkFetch', [`${networkOrigin}/resource`, { method: 'post', body: 'body' }])).ok, true);
    assert.equal((await h.rpc(session, 'networkFetch', ['https://network.test:9443/resource'])).ok, true);
    assert.equal(h.fetches.at(-2).options.method, 'POST');
});

await test('Headers, body type, byte and request envelopes are bounded', async h => {
    const session = h.connected();
    for (const name of ['Authorization', 'Cookie', 'Host', 'Origin', 'Referer', 'Proxy-Authorization', 'X-Api-Key']) {
        await denied(h, session, [`${networkOrigin}/resource`, { headers: { [name]: 'secret' } }], 'NETWORK_HEADER_DENIED');
    }
    await denied(h, session, [`${networkOrigin}/resource`, { headers: { Accept: 3 } }], 'NETWORK_HEADER_DENIED');
    await denied(h, session, [`${networkOrigin}/resource`, { headers: { Accept: 'x'.repeat(1025) } }], 'NETWORK_HEADER_DENIED');
    for (const body of [{ a: 1 }, new Uint8Array([1]), 123]) await denied(h, session, [`${networkOrigin}/resource`, { method: 'POST', body }], 'NETWORK_BODY_INVALID');
    for (const method of ['GET', 'HEAD']) await denied(h, session, [`${networkOrigin}/resource`, { method, body: '' }], 'NETWORK_BODY_INVALID');
    await denied(h, session, [`${networkOrigin}/resource`, { method: 'POST', body: '€'.repeat(Math.ceil(256 * 1024 / 3)) }], 'NETWORK_LIMIT_EXCEEDED');
    const before = h.fetches.length;
    const tooLarge = await h.rpc(session, 'networkFetch', [`${networkOrigin}/resource`], { padding: 'x'.repeat(300001) });
    assert.equal(tooLarge.ok, false); assert.equal(tooLarge.error.message, 'NETWORK_LIMIT_EXCEEDED'); assert.equal(h.fetches.length, before);
    const valid = await h.rpc(session, 'networkFetch', [`${networkOrigin}/resource`, { method: 'POST', headers: { Accept: 'x'.repeat(1024), 'Content-Type': 'text/plain' }, body: 'ä'.repeat(128 * 1024) }]);
    assert.equal(valid.ok, true, 'Exactly 256 KiB of UTF-8 body data is accepted.');
});

await test('Fetch strips caller credentials, redirect, referrer and response secrets', async h => {
    const session = h.connected();
    h.fetch(() => response('answer', 201));
    const result = await h.rpc(session, 'networkFetch', [`${networkOrigin}/path?q=value`, { method: 'POST', headers: { accept: 'text/plain' }, body: 'request',
        credentials: 'include', redirect: 'follow', referrer: `${parentOrigin}/secret`, referrerPolicy: 'unsafe-url', mode: 'no-cors', signal: 'untrusted' }]);
    assert.equal(result.ok, true);
    assert.deepEqual(result.result, { status: 201, headers: { 'content-type': 'text/plain; charset=utf-8' }, body: 'answer' });
    const { options } = h.fetches[0];
    assert.equal(options.credentials, 'omit'); assert.equal(options.redirect, 'error'); assert.equal(options.referrerPolicy, 'no-referrer');
    assert.equal(Object.hasOwn(options, 'referrer'), false); assert.equal(Object.hasOwn(options, 'mode'), false);
    assert.ok(options.signal instanceof AbortSignal); assert.equal(options.signal.aborted, true, 'Completed controllers are released.');
    assert.equal(h.fetches[0].url, `${networkOrigin}/path?q=value`);
    assert.equal(session.hostMessages.messages.length, 0, 'Network bodies and failures are handled by the broker rather than the host RPC port.');
});

await test('Request quota allows 50 and denies 51 without fetch', async h => {
    const session = h.connected(); h.fetch(() => response('', 200));
    for (let i = 0; i < 50; i++) assert.equal((await h.rpc(session, 'networkFetch', [`${networkOrigin}/request-${i}`])).ok, true);
    assert.equal(h.fetches.length, 50);
    await denied(h, session, [`${networkOrigin}/request-51`], 'NETWORK_LIMIT_EXCEEDED');
});

await test('Response streams accept exactly 1 MiB and reject crossing chunks', async h => {
    const session = h.connected();
    h.fetch(() => response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(MiB).fill(65)); controller.close(); } })));
    const exact = await h.rpc(session, 'networkFetch', [`${networkOrigin}/exact`]);
    assert.equal(exact.ok, true); assert.equal(exact.result.body.length, MiB);
    let cancelled = false;
    h.fetch(() => response(new ReadableStream({
        start(controller) { controller.enqueue(new Uint8Array(MiB).fill(65)); controller.enqueue(new Uint8Array([66])); },
        cancel() { cancelled = true; }
    })));
    const over = await h.rpc(session, 'networkFetch', [`${networkOrigin}/over`]);
    assert.equal(over.ok, false); assert.equal(over.error.message, 'NETWORK_LIMIT_EXCEEDED');
    assert.equal(cancelled, true, 'The over-limit response reader is cancelled.');
    assert.equal(h.fetches.at(-1).options.signal.aborted, true);
});

await test('Response total allows 8 MiB and blocks further response bytes', async h => {
    const session = h.connected(); h.fetch(() => response('a'.repeat(MiB)));
    for (let i = 0; i < 8; i++) assert.equal((await h.rpc(session, 'networkFetch', [`${networkOrigin}/chunk-${i}`])).ok, true);
    h.fetch(() => response('b'));
    const exceeded = await h.rpc(session, 'networkFetch', [`${networkOrigin}/extra`]);
    assert.equal(exceeded.ok, false); assert.equal(exceeded.error.message, 'NETWORK_LIMIT_EXCEEDED');
    assert.equal(h.fetches.length, 9);
    await denied(h, session, [`${networkOrigin}/after-limit`], 'NETWORK_LIMIT_EXCEEDED');
});

await test('Request and response bytes share the same 8 MiB quota', async h => {
    const session = h.connected(); h.fetch(() => response('', 200));
    for (let i = 0; i < 31; i++) assert.equal((await h.rpc(session, 'networkFetch', [`${networkOrigin}/body-${i}`, { method: 'POST', body: 'a'.repeat(256 * 1024) }])).ok, true);
    h.fetch(() => response('a'.repeat(256 * 1024)));
    assert.equal((await h.rpc(session, 'networkFetch', [`${networkOrigin}/response-last`])).ok, true);
    await denied(h, session, [`${networkOrigin}/body-last`, { method: 'POST', body: 'a' }], 'NETWORK_LIMIT_EXCEEDED');
    assert.equal(h.fetches.length, 32);
});

await test('Transport, body and UTF-8 errors return actual network RPC failures', async h => {
    const session = h.connected();
    for (const [fetcher, expected] of [
        [() => { throw new Error('controlled transport failure'); }, /controlled transport failure/],
        [() => { throw new TypeError('controlled redirect rejected'); }, /controlled redirect rejected/],
        [() => response(new ReadableStream({ start(controller) { controller.error(new Error('controlled body failure')); } })), /controlled body failure/],
        [() => response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([0xff])); controller.close(); } })), /encoded data|UTF-8/i]
    ]) {
        h.fetch(fetcher);
        const reply = await h.rpc(session, 'networkFetch', [`${networkOrigin}/failure`]);
        assert.equal(reply.ok, false); assert.equal(reply.error.code, 'NETWORK_FAILED'); assert.match(reply.error.message, expected);
        assert.equal(h.fetches.at(-1).options.signal.aborted, true);
        checked();
    }
    h.fetch(() => response(null, 204));
    assert.deepEqual((await h.rpc(session, 'networkFetch', [`${networkOrigin}/empty`])).result, { status: 204, headers: {}, body: '' });
    assert.equal(h.timers.size, 0);
});

for (const cancel of ['pagehide', 'replacement', 'navigation']) {
    await test(`Pending body cancelled by ${cancel}`, async h => {
        const session = h.connected();
        session.frame.events.get('load')();
        h.pendingBody();
        h.send(session);
        await h.drain();
        assert.equal(h.fetches.length, 1); assert.equal(h.fetches[0].options.signal.aborted, false);
        assert.equal(session.childMessages.messages.length, 0);
        let replacement;
        if (cancel === 'pagehide') h.pagehide();
        if (cancel === 'replacement') replacement = h.connected({ data: { token: otherToken } });
        if (cancel === 'navigation') session.frame.events.get('load')();
        assert.equal(h.fetches[0].options.signal.aborted, true);
        assert.equal(session.frame.removed, true);
        await h.drain(); await quiet();
        assert.equal(session.childMessages.messages.length, 0, 'A cancelled pending body never sends success or error to the revoked child.');
        assert.equal(h.timers.size, 0);
        if (replacement) {
            h.fetch(() => response('replacement works'));
            assert.equal((await h.rpc(replacement, 'networkFetch', [`${networkOrigin}/fresh`])).result.body, 'replacement works');
        }
    });
}

await test('Response body deadline aborts pending read and replies with failure', async h => {
    const session = h.connected(); h.pendingBody();
    const saving = h.rpc(session);
    await h.drain();
    assert.equal(h.fetches[0].options.signal.aborted, false);
    h.expire();
    const reply = await saving;
    assert.equal(reply.ok, false); assert.equal(reply.error.code, 'NETWORK_FAILED'); assert.match(reply.error.message, /Abort/i);
    assert.equal(h.fetches[0].options.signal.aborted, true);
    assert.equal(h.timers.size, 0);
});

await test('Pending fetch is aborted before headers on pagehide', async h => {
    const session = h.connected();
    h.fetch(record => new Promise((_resolve, reject) => record.options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })));
    h.send(session); await h.drain();
    h.pagehide(); await h.drain(); await quiet();
    assert.equal(h.fetches[0].options.signal.aborted, true);
    assert.equal(session.childMessages.messages.length, 0);
    assert.equal(h.timers.size, 0);
});

await test('Late fulfilled fetch cannot escape revocation or poison its replacement', async h => {
    const session = h.connected();
    let finish;
    h.fetch(() => new Promise(resolve => { finish = resolve; }));
    h.send(session); await h.drain();
    const fresh = h.connected({ data: { token: otherToken } });
    assert.equal(h.fetches[0].options.signal.aborted, true);
    finish(response('late response'));
    await h.drain(); await quiet();
    assert.equal(session.childMessages.messages.length, 0);
    assert.equal(fresh.childMessages.messages.length, 0);
    assert.equal(h.timers.size, 0);
    h.fetch(() => response('fresh response'));
    const reply = await h.rpc(fresh, 'networkFetch', [`${networkOrigin}/fresh`]);
    assert.equal(reply.ok, true); assert.equal(reply.result.body, 'fresh response');
});

console.log(`Card broker tests passed (${checks} checks): real MessagePorts, source/token handshakes, network policy/quotas, pending body cancellation and late revocation.`);
