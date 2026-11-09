import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, 'src/app', file), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
const sha256 = value => createHash('sha256').update(typeof value === 'string' ? value : Buffer.from(value)).digest('hex');

const context = {
    console,
    JSON, Object, Array, String, Number, Math, Date, Promise, Set, Map, Error,
    Uint8Array, TextEncoder, TextDecoder, URL, AbortController, setTimeout, clearTimeout,
    window: { sha256 },
    crypto: { getRandomValues: array => { for (let index = 0; index < array.length; index++) array[index] = index; return array; } },
    t: key => key,
    appStore: { notify() {} },
    failSave: false,
    lastSnapshot: null,
    persistState: async (_immediate, options) => {
        if (context.persistGate) {
            const gate = context.persistGate;
            context.persistGate = null;
            await gate;
        }
        if (context.failSave) throw new Error('synthetic quota');
        const snapshot = {
            settings: clone(context.state.settings),
            conversations: clone(context.state.conversations || {}),
            conversationOrder: clone(context.state.conversationOrder || []),
            activeConvId: context.state.activeConvId,
            worldBooks: {}, characters: {}, documents: {}
        };
        if (options && options.beforePersist) options.beforePersist();
        const transformed = options && options.transformSnapshot ? options.transformSnapshot(snapshot) : snapshot;
        if (options && options.onPersistSuccess) options.onPersistSuccess();
        context.lastSnapshot = clone(transformed);
    },
    getActiveConv: () => context.state.conversations[context.state.activeConvId] || null
};
vm.createContext(context);
for (const file of ['plugins/32-plugin-packages.js', 'plugins/40-plugin-isolation.js', 'plugins/50-plugin-runtime.js']) {
    vm.runInContext(read(file), context, { filename: file });
}

const v1Package = JSON.parse(fs.readFileSync(path.join(root, 'examples/plugins/conversation-stats-v1.json'), 'utf8'));
const v2Package = JSON.parse(fs.readFileSync(path.join(root, 'examples/plugins/conversation-stats-v2.json'), 'utf8'));
const v1 = context.normalizePluginPackage(v1Package).record;
const v2 = context.normalizePluginPackage(v2Package).record;
assert.equal(v1.id, 'conversation-stats');
assert.match(v1.digest, /^sha256:[0-9a-f]{64}$/);
assert.notEqual(v1.digest, v2.digest);
assert.equal(context.normalizePluginPackage(v1Package).record.digest, v1.digest, 'Digest must be deterministic.');
context.state = {
    settings: { plugins: [], pluginPrivateData: {}, pluginGrants: {} },
    conversations: {
        c1: {
            id: 'c1', title: 'D2', updated: 5,
            messages: [
                { id: 'u1', role: 'user', content: 'hello world' },
                { id: 'a1', role: 'assistant', content: 'saved assistant reply' },
                { id: 'a2', role: 'assistant', stage: 'second', content: 'hidden second stage' },
                { id: 's1', role: 'system', content: 'system prompt' }
            ]
        }
    },
    conversationOrder: ['c1'],
    activeConvId: 'c1'
};

// Package validation: reserved ids, unknown keys, capabilities, dependencies and limits.
for (const mutate of [
    pkg => { pkg.manifest.id = '__proto__'; },
    pkg => { pkg.manifest.id = 'constructor'; },
    pkg => { pkg.manifest.capabilities = ['network.fetch']; },
    pkg => { pkg.manifest.unknown = true; },
    pkg => { pkg.manifest.capabilities = ['network.rpc']; pkg.manifest.network = []; },
    pkg => { pkg.manifest.network = [{ origin: 'https://api.example.test/path', methods: ['GET'] }]; pkg.manifest.capabilities = ['network.rpc']; },
    pkg => { pkg.manifest.network = [{ origin: 'https://api.example.test', methods: ['TRACE'] }]; pkg.manifest.capabilities = ['network.rpc']; },
    pkg => { pkg.manifest.dependencies = [{ id: pkg.manifest.id, version: '1.0.0' }]; },
    pkg => { pkg.entry.code = 'x'.repeat(512 * 1024 + 1); },
    pkg => { pkg.resources = [{ path: '../bad', text: 'x' }]; },
    pkg => { pkg.resources = [{ path: 'a', text: 'x' }, { path: 'a', text: 'y' }]; },
    pkg => { pkg.extra = true; }
]) {
    const broken = clone(v1Package);
    mutate(broken);
    assert.throws(() => context.normalizePluginPackage(broken), /plugin_/);
}
const tampered = clone(v1Package);
tampered.digest = v1.digest;
tampered.entry.code += '\nself.pwned = true;';
assert.throws(() => context.normalizePluginPackage(tampered), /plugin_digest_mismatch/);
let textRead = false;
await assert.rejects(context.readPluginPackageFile({ size: 2 * 1024 * 1024 + 1, text: async () => { textRead = true; return ''; } }), /plugin_package_too_large/);
assert.equal(textRead, false, 'An over-limit file must be rejected before reading its text.');

// Prototype names cannot become private keys or grant keys.
assert.throws(() => context.pluginSanitizePrivateData(JSON.parse('{"__proto__":{"polluted":true}}')), /plugin_private/);
context.state.settings.pluginGrants = JSON.parse('{"__proto__":{"fingerprint":"sha256:' + '0'.repeat(64) + '"}}');
context.ensurePluginSettings(context.state.settings);
assert.equal(Object.hasOwn(context.state.settings.pluginGrants, '__proto__'), false);
assert.equal({}.polluted, undefined);

// Install stays stopped and unauthorized; private data and grants are independent.
await context.savePluginSettingsChange(candidate => { candidate.plugins.push(context.pluginInstalledRecordFromPackage(v1)); });
assert.equal(context.state.settings.plugins.length, 1);
assert.equal(context.state.settings.plugins[0].version, '1.0.0');
assert.deepEqual(clone(context.state.settings.pluginGrants), {});
assert.deepEqual(clone(context.state.settings.pluginPrivateData), {});
assert.equal(context.isPluginGranted(context.state.settings.plugins[0], null), false);
context.setPluginGrant(context.state.settings, context.state.settings.plugins[0], ['conversation.stats', 'events.conversation', 'storage.private', 'ui.panel']);
assert.equal(context.isPluginGranted(context.state.settings.plugins[0], context.getPluginGrant('conversation-stats', context.state.settings)), true);
assert.deepEqual(Array.from(context.pluginGrantMissing(context.state.settings.plugins[0], context.getPluginGrant('conversation-stats', context.state.settings))), []);

// A failed save keeps the previous settings and exposes a retryable draft only for management saves.
const beforeFailure = JSON.stringify(context.state.settings);
context.failSave = true;
await assert.rejects(context.savePluginSettingsChange(candidate => { candidate.pluginPrivateData['conversation-stats'] = { marker: 1 }; }), /synthetic quota/);
assert.equal(JSON.stringify(context.state.settings), beforeFailure);
assert.ok(context.failedPluginDraft);
context.failSave = false;
await context.retryPluginSettingsChange();
assert.equal(context.state.settings.pluginPrivateData['conversation-stats'].marker, 1);
assert.equal(context.failedPluginDraft, null);
let releaseGate;
context.persistGate = new Promise(resolve => { releaseGate = resolve; });
const conflictingSave = context.savePluginSettingsChange(candidate => { candidate.pluginPrivateData['conversation-stats'] = { stale: true }; });
await new Promise(resolve => setTimeout(resolve, 0));
context.state.settings.pluginPrivateData['conversation-stats'] = { concurrent: true };
releaseGate();
await assert.rejects(conflictingSave, /plugin_settings_changed/);
assert.deepEqual(clone(context.state.settings.pluginPrivateData['conversation-stats']), { concurrent: true }, 'A concurrent successful change must not be overwritten.');
context.failedPluginDraft = null;
context.state.settings.pluginPrivateData['conversation-stats'] = { marker: 1 };

// Candidate update: v2 is a real different package; version/digest changes require new approval.
const diff = context.pluginDiffSummary(v1, v2);
assert.ok(diff.some(line => line.includes('plugin_diff_version')));
assert.ok(diff.some(line => line.includes('plugin_diff_digest')));
const staleGrant = {
    fingerprint: 'sha256:' + '0'.repeat(64), version: '1.0.0', digest: v1.digest,
    capabilities: ['conversation.stats'], network: [], grantedAt: 1
};
assert.equal(context.isPluginGranted(context.pluginInstalledRecordFromPackage(v1), staleGrant), false);

function syntheticPackage(id, version, dependencies, capabilities) {
    return {
        type: 'opentavern-plugin', formatVersion: 1,
        manifest: {
            id, name: id, version, schemaVersion: 1, source: 'synthetic/' + id,
            description: '', capabilities: capabilities || ['ui.panel'],
            dependencies: dependencies || [], network: []
        },
        entry: { code: 'self.OpenTavernPlugin.ready();' },
        resources: []
    };
}
const depA = context.normalizePluginPackage(syntheticPackage('plugin-a', '1.0.0', [{ id: 'plugin-b', version: '1.0.0' }])).record;
const depB = context.normalizePluginPackage(syntheticPackage('plugin-b', '1.0.0', [{ id: 'plugin-a', version: '1.0.0' }])).record;
assert.throws(() => context.validatePluginSettings({
    plugins: [context.pluginInstalledRecordFromPackage(depA), context.pluginInstalledRecordFromPackage(depB)],
    pluginPrivateData: {}, pluginGrants: {}
}), /plugin_dependency_cycle/);
const missingRecord = context.pluginInstalledRecordFromPackage(context.normalizePluginPackage(syntheticPackage('plugin-c', '1.0.0', [{ id: 'missing', version: '2.0.0' }])).record);
assert.deepEqual(Array.from(context.pluginDependencyIssues(missingRecord, [missingRecord])).map(issue => issue.code), ['missing']);
const versionRecord = context.pluginInstalledRecordFromPackage(context.normalizePluginPackage(syntheticPackage('plugin-version', '1.0.0', [{ id: 'plugin-root', version: '2.0.0' }])).record);
const rootRecord = context.pluginInstalledRecordFromPackage(context.normalizePluginPackage(syntheticPackage('plugin-root', '1.0.0')).record);
assert.deepEqual(Array.from(context.pluginDependencyIssues(versionRecord, [versionRecord, rootRecord])).map(issue => issue.code), ['version']);
assert.deepEqual(Array.from(context.pluginDependents([versionRecord, rootRecord], 'plugin-root')).map(record => record.id), ['plugin-version']);
const duplicateRecord = context.pluginInstalledRecordFromPackage(v1);
assert.throws(() => context.validatePluginSettings({ plugins: [duplicateRecord, duplicateRecord], pluginPrivateData: {}, pluginGrants: {} }), /plugin_invalid/);

// Stats input is bounded, excludes second-stage/system messages, and cannot select another conversation.
const stats = context.buildPluginConversationStats(context.state.conversations.c1);
assert.equal(stats.available, true);
assert.equal(stats.messages.length, 2);
assert.equal(stats.messages[0].role, 'user');
assert.equal(stats.messages[0].characters, 10);
assert.equal(stats.messages[1].characters, 19);

// Execute the real example plugin code against a mock SDK; output follows package code, not the host.
async function runExample(entryCode) {
    const rendered = [], saved = [];
    const api = {
        probe: false,
        stats: { get: async () => stats },
        storage: { set: async (key, value) => { saved.push({ key, value }); return true; } },
        ui: { render: async view => { rendered.push(view); return true; } },
        resources: { get: () => null },
        on: () => {},
        ready: () => {}
    };
    const sandbox = { self: { OpenTavernPlugin: api }, Promise, JSON, Number };
    vm.createContext(sandbox);
    vm.runInContext(entryCode, sandbox, { filename: 'example-plugin.js' });
    await new Promise(resolve => setTimeout(resolve, 20));
    return { rendered, saved };
}
const v1Run = await runExample(v1.entry.code);
assert.equal(v1Run.saved.length, 1);
assert.equal(v1Run.saved[0].value.messages, 2);
assert.equal(v1Run.saved[0].value.characters, 29);
assert.ok(v1Run.rendered[0].text.includes('Messages: 2'), 'v1 output must come from the real package code.');
const v2Run = await runExample(v2.entry.code);
assert.equal(v2Run.saved[0].value.version, 'v2');
assert.ok(v2Run.rendered[0].text.includes('v2 · messages 2'), 'v2 output must follow the updated package code.');
const probeSandbox = {
    self: { OpenTavernPlugin: { probe: true, ready: detail => { probeSandbox.readyDetail = detail; } } },
    Promise, JSON, Number
};
vm.createContext(probeSandbox);
vm.runInContext(v1.entry.code, probeSandbox, { filename: 'example-plugin-probe.js' });
assert.deepEqual(clone(probeSandbox.readyDetail), { probe: true });

// Runtime RPC identity, permissions, private namespaces and probe denials.
const installed = context.state.settings.plugins[0];
const instance = {
    pluginId: 'conversation-stats',
    instanceId: 'instance-1',
    probe: false,
    stopped: false,
    epoch: context.pluginRuntimeEpoch('conversation-stats'),
    record: installed,
    fingerprint: context.pluginFingerprint(installed),
    subscriptions: new Set(),
    callIds: new Set(),
    rpcTimes: [],
    inflight: new Set(),
    aborters: new Set(),
    status: 'running',
    port: { postMessage() {} },
    frame: { remove() {} }
};
context.pluginRuntimeInstances.set('conversation-stats', instance);
const rpcStats = await context.pluginRuntimeHandleRpc(instance, 'stats.get', []);
assert.equal(rpcStats.conversationId, 'c1');
await assert.rejects(context.pluginRuntimeHandleRpc(instance, 'stats.get', ['other']), /conversation id/);
await context.pluginRuntimeHandleRpc(instance, 'storage.set', ['marker', { count: 2 }]);
assert.deepEqual(clone(context.state.settings.pluginPrivateData['conversation-stats'].marker), { count: 2 });
assert.deepEqual(clone(await context.pluginRuntimeHandleRpc(instance, 'storage.get', ['marker'])), { count: 2 });
assert.deepEqual(clone(await context.pluginRuntimeHandleRpc(instance, 'storage.keys', [])), ['marker']);
await context.pluginRuntimeHandleRpc(instance, 'storage.remove', ['marker']);
assert.equal(await context.pluginRuntimeHandleRpc(instance, 'storage.get', ['marker']), null);
context.failSave = true;
await assert.rejects(context.pluginRuntimeHandleRpc(instance, 'storage.set', ['rejected', 1]), /synthetic quota/);
context.failSave = false;
assert.equal(await context.pluginRuntimeHandleRpc(instance, 'storage.get', ['rejected']), null, 'A rejected private save must not be reported as success.');
const probeInstance = Object.assign({}, instance, { probe: true, instanceId: 'probe-1' });
context.pluginRuntimeProbes.set('probe-1', probeInstance);
await assert.rejects(context.pluginRuntimeHandleRpc(probeInstance, 'storage.set', ['probe', 1]), /Probe mode/);
const beforeProbeDisplay = JSON.stringify(context.pluginRuntimeDisplayFor('conversation-stats'));
assert.equal(await context.pluginRuntimeHandleRpc(probeInstance, 'ui.render', [{ text: 'probe' }]), true);
assert.equal(JSON.stringify(context.pluginRuntimeDisplayFor('conversation-stats')), beforeProbeDisplay, 'Probe UI is discarded.');
assert.deepEqual(clone(await context.pluginRuntimeHandleRpc(probeInstance, 'stats.get', [])), clone(rpcStats));

// UI view limits keep plugin text as data and reject unsafe structure.
await context.pluginRuntimeHandleRpc(instance, 'ui.render', [{ title: 'Stats', text: '<img src=x onerror=alert(1)>', actions: [{ id: 'refresh', label: 'Refresh' }] }]);
assert.equal(context.pluginRuntimeDisplayFor('conversation-stats').text, '<img src=x onerror=alert(1)>');
await assert.rejects(context.pluginRuntimeHandleRpc(instance, 'ui.render', [{ title: 'x', text: 'y', extra: true }]), /Invalid plugin view/);
await assert.rejects(context.pluginRuntimeHandleRpc(instance, 'ui.render', [{ text: 'y', actions: [{ id: 'a', label: 'x'.repeat(41) }] }]), /action is invalid/);
assert.equal(context.pluginRuntimeTriggerAction('conversation-stats', 'refresh'), true);
assert.throws(() => context.pluginRuntimeTriggerAction('conversation-stats', 'missing'), /plugin_action_stale/);

// Two plugins cannot share a private namespace.
const otherRecord = context.pluginInstalledRecordFromPackage(context.normalizePluginPackage(syntheticPackage('other-plugin', '1.0.0')).record);
await context.savePluginSettingsChange(candidate => {
    candidate.plugins.push(otherRecord);
    candidate.pluginPrivateData['other-plugin'] = { marker: 'other' };
    candidate.pluginPrivateData['conversation-stats'] = { marker: 'stats' };
});
assert.equal(context.state.settings.pluginPrivateData['other-plugin'].marker, 'other');
assert.equal(context.state.settings.pluginPrivateData['conversation-stats'].marker, 'stats');

// Network RPC is separately granted per origin and method, with credentials omitted and redirects refused.
const networkPackage = context.normalizePluginPackage({
    type: 'opentavern-plugin', formatVersion: 1,
    manifest: {
        id: 'network-probe', name: 'network probe', version: '1.0.0', schemaVersion: 1,
        source: 'synthetic/network-probe', description: '',
        capabilities: ['network.rpc'], dependencies: [],
        network: [{ origin: 'https://api.example.test', methods: ['GET', 'POST'] }]
    },
    entry: { code: 'self.OpenTavernPlugin.ready();' },
    resources: []
}).record;
await context.savePluginSettingsChange(candidate => { candidate.plugins.push(context.pluginInstalledRecordFromPackage(networkPackage)); });
const networkInstalled = context.getInstalledPluginById('network-probe');
context.setPluginGrant(context.state.settings, networkInstalled, ['network.rpc']);
const networkInstance = {
    pluginId: 'network-probe', instanceId: 'network-1', probe: false, stopped: false,
    epoch: context.pluginRuntimeEpoch('network-probe'), record: networkInstalled,
    fingerprint: context.pluginFingerprint(networkInstalled), subscriptions: new Set(),
    callIds: new Set(), rpcTimes: [], inflight: new Set(), aborters: new Set(),
    port: { postMessage() {} }, frame: { remove() {} }
};
context.pluginRuntimeInstances.set('network-probe', networkInstance);
let captured = null;
context.fetch = async (url, options) => {
    captured = { url, options };
    return {
        ok: true, status: 200, statusText: 'OK',
        headers: { get: name => name === 'content-type' ? 'application/json' : null },
        body: { getReader: () => { let sent = false; return { read: async () => sent ? { done: true } : (sent = true, { done: false, value: new TextEncoder().encode('{"ok":true}') }), cancel: async () => {} }; } }
    };
};
const networkResult = await context.pluginRuntimeNetworkRequest(networkInstance, {
    url: 'https://api.example.test/data', method: 'GET',
    headers: { accept: 'application/json' }
});
assert.equal(networkResult.body, '{"ok":true}');
assert.equal(captured.options.credentials, 'omit');
assert.equal(captured.options.redirect, 'error');
assert.equal(captured.options.mode, 'cors');
await assert.rejects(context.pluginRuntimeNetworkRequest(networkInstance, { url: 'https://other.example.test/data', method: 'GET' }), /not authorized/);
await assert.rejects(context.pluginRuntimeNetworkRequest(networkInstance, { url: 'https://api.example.test/data', method: 'DELETE' }), /not authorized/);
await assert.rejects(context.pluginRuntimeNetworkRequest(networkInstance, { url: 'https://api.example.test/data', method: 'GET', headers: { authorization: 'secret' } }), /Header is not allowed/);
await assert.rejects(context.pluginRuntimeNetworkRequest(networkInstance, { url: 'https://api.example.test/data', method: 'POST', body: 'x'.repeat(64 * 1024 + 1) }), /body exceeds/);
context.fetch = async () => { throw new TypeError('Failed to fetch'); };
await assert.rejects(context.pluginRuntimeNetworkRequest(networkInstance, { url: 'https://api.example.test/data', method: 'GET' }), /Failed to fetch/);
context.fetch = async () => ({
    ok: true, status: 200, statusText: 'OK', headers: { get: () => null },
    body: { getReader: () => ({ read: async () => ({ done: false, value: new Uint8Array(256 * 1024 + 1) }), cancel: async () => {} }) }
});
await assert.rejects(context.pluginRuntimeNetworkRequest(networkInstance, { url: 'https://api.example.test/data', method: 'GET' }), /response exceeds/);
context.fetch = async () => ({ ok: true, status: 200, statusText: 'OK', headers: { get: () => null }, body: null });
await assert.rejects(context.pluginRuntimeNetworkRequest(networkInstance, { url: 'https://api.example.test/data', method: 'GET' }), /cannot be read within the allowed size/);
context.fetch = async () => ({ ok: true, status: 204, statusText: 'No Content', headers: { get: () => null }, body: null });
const emptyNetworkResult = await context.pluginRuntimeNetworkRequest(networkInstance, { url: 'https://api.example.test/data', method: 'GET' });
assert.equal(emptyNetworkResult.body, '');

// Isolation document contains only trusted bootstrap text, while the worker SDK keeps plugin bytes out of srcdoc.
const isolationDocument = context.buildPluginIsolationDocument('a'.repeat(48));
assert.match(isolationDocument, /connect-src 'none'/);
assert.match(isolationDocument, /worker-src blob:/);
assert.match(isolationDocument, /script-src 'nonce-[0-9a-f]+' blob:/);
assert.equal((isolationDocument.match(/<script/g) || []).length, 1);
const sdkSource = context.pluginWorkerSdkSource({
    abi: 1, instanceId: 'b'.repeat(48), pluginId: 'conversation-stats', version: '1.0.0',
    digest: v1.digest, capabilities: ['ui.panel'], resources: [{ path: 'x', text: '</script><script>bad()</script>' }], probe: false
});
assert.ok(sdkSource.includes('function pluginWorkerSdk'));
assert.equal(isolationDocument.includes('bad()'), false, 'Plugin bytes must not be interpolated into srcdoc.');
assert.throws(() => context.buildPluginIsolationDocument('not-a-token'), /plugin_isolation_invalid/);

// The trusted SDK responds to heartbeat/probe checks and bounds worker children.
const sdkMessages = [];
let sdkListener = null, terminatedChildren = 0;
const sdkSelf = {
    postMessage(message) { sdkMessages.push(clone(message)); },
    addEventListener(type, listener) { if (type === 'message') sdkListener = listener; },
    Worker: function NativeWorker() { this.terminate = () => { terminatedChildren++; }; }
};
const sdkSandbox = {
    self: sdkSelf, Promise, JSON, Map, Object, Array, String, Number, Error, setTimeout, clearTimeout, console
};
vm.createContext(sdkSandbox);
vm.runInContext(sdkSource, sdkSandbox, { filename: 'plugin-sdk.js' });
const sdkApi = sdkSelf.OpenTavernPlugin;
assert.equal(sdkMessages[0].type, 'plugin-loaded');
sdkApi.on('current-conversation-changed', value => { sdkSandbox.lastEvent = value; });
sdkApi.ready();
assert.ok(sdkMessages.some(message => message.type === 'plugin-ready'));
sdkListener({ data: { type: 'plugin-ping' } });
assert.ok(sdkMessages.some(message => message.type === 'plugin-pong'));
sdkListener({ data: { type: 'plugin-probe-check' } });
assert.ok(sdkMessages.some(message => message.type === 'plugin-probe-ack'));
const statsPromise = sdkApi.stats.get();
const statsRequest = sdkMessages.filter(message => message.type === 'plugin-rpc').at(-1);
sdkListener({ data: { type: 'plugin-rpc-result', id: statsRequest.id, ok: true, result: { available: true } } });
assert.deepEqual(clone(await statsPromise), { available: true });
sdkListener({ data: { type: 'plugin-event', event: 'current-conversation-changed', detail: { conversationId: 'c1' } } });
assert.deepEqual(clone(sdkSandbox.lastEvent), { conversationId: 'c1' });
const child = new sdkSelf.Worker('blob:synthetic');
sdkListener({ data: { type: 'plugin-stop' } });
assert.equal(terminatedChildren, 1, 'Stopping the SDK terminates tracked nested workers.');

// Late messages and duplicate/rate-limited calls are rejected after disable.
const messagePort = { messages: [], postMessage(message) { this.messages.push(message); }, close() {} };
instance.port = messagePort;
instance.callIds = new Set();
await context.pluginRuntimeHandleMessage(instance, { type: 'plugin-rpc', instanceId: instance.instanceId, id: 'huge', method: 'stats.get', args: ['x'.repeat(70000)] });
assert.ok(messagePort.messages.some(message => message.error && message.error.code === 'REQUEST_TOO_LARGE'));
await context.pluginRuntimeHandleMessage(instance, { type: 'plugin-rpc', instanceId: instance.instanceId, id: 'same', method: 'stats.get', args: [] });
await context.pluginRuntimeHandleMessage(instance, { type: 'plugin-rpc', instanceId: instance.instanceId, id: 'same', method: 'stats.get', args: [] });
assert.ok(messagePort.messages.some(message => message.error && message.error.code === 'DUPLICATE_CALL'));
instance.rpcTimes = Array.from({ length: 60 }, () => Date.now());
await context.pluginRuntimeHandleMessage(instance, { type: 'plugin-rpc', instanceId: instance.instanceId, id: 'rate', method: 'stats.get', args: [] });
assert.ok(messagePort.messages.some(message => message.error && message.error.code === 'RATE_LIMITED'));
let abortedOnStop = 0;
instance.aborters.add({ abort() { abortedOnStop++; } });
context.stopPluginInstance('conversation-stats', 'test stop');
assert.equal(abortedOnStop, 1, 'Stopping an instance aborts in-flight host RPC reads.');
const stoppedEpoch = context.pluginRuntimeEpoch('conversation-stats');
assert.ok(stoppedEpoch > instance.epoch);
await context.pluginRuntimeHandleMessage(instance, { type: 'plugin-rpc', instanceId: instance.instanceId, id: 'late', method: 'stats.get', args: [] });
assert.equal(messagePort.messages.some(message => message.id === 'late'), false, 'Late calls after stop must be ignored.');
await assert.rejects(context.pluginRuntimeHandleRpc(instance, 'stats.get', []), /plugin_session_stale/);

// 真实 iframe 引导 + Blob Worker SDK：宿主 plugin-host-* 必须被翻译成 Worker SDK
// 订阅的 plugin-rpc-result/plugin-event，不能只用 mock api 绕过消息契约。
async function waitForValue(check, message, timeout = 4000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        const value = check();
        if (value) return value;
        await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw new Error('Timed out waiting for ' + message);
}

async function runRealSdkBridge(entryCode) {
    const bridgeRecord = context.getInstalledPluginById('conversation-stats');
    const bridgeInstance = {
        pluginId: bridgeRecord.id,
        token: 'b'.repeat(48),
        instanceId: 'c'.repeat(48),
        record: bridgeRecord,
        fingerprint: context.pluginFingerprint(bridgeRecord),
        probe: false,
        status: 'starting',
        stopped: false,
        frame: { remove() {} },
        port: null,
        queue: [],
        queueBytes: 0,
        draining: false,
        messageTimes: [],
        subscriptions: new Set(),
        callIds: new Set(),
        callIdSequence: 0,
        rpcTimes: [],
        inflight: new Set(),
        aborters: new Set(),
        epoch: context.pluginRuntimeEpoch(bridgeRecord.id),
        startupTimer: null,
        probeTimer: null,
        readyResolve: null,
        readyReject: null
    };
    context.pluginRuntimeInstances.set(bridgeRecord.id, bridgeInstance);
    const documentText = context.buildPluginIsolationDocument(bridgeInstance.token);
    const serialized = documentText.slice(documentText.lastIndexOf(')({') + 2, documentText.lastIndexOf(');</script>'));
    const childWindow = {
        listeners: Object.create(null),
        addEventListener(type, listener) { (this.listeners[type] || (this.listeners[type] = [])).push(listener); },
        removeEventListener(type, listener) {
            this.listeners[type] = (this.listeners[type] || []).filter(item => item !== listener);
        },
        dispatch(type, event) { (this.listeners[type] || []).slice().forEach(listener => listener(event)); }
    };
    const childParent = { messages: [], postMessage(message) { this.messages.push(message); } };
    const blobs = new Map();
    let blobSequence = 0;
    class BridgeBlob {
        constructor(parts) { this.parts = parts; }
        text() { return Promise.resolve(this.parts.join('')); }
    }
    class BridgeWorker {
        constructor(url) {
            this.onmessage = null;
            this.terminated = false;
            this.listener = null;
            this.queue = [];
            this.timers = new Set();
            this.blob = blobs.get(url);
            this.ready = Promise.resolve(this.blob && this.blob.text()).then(source => {
                if (this.terminated) return;
                const worker = this;
                const workerSelf = {
                    postMessage(message) { worker.deliverToParent(message); },
                    addEventListener(type, listener) { if (type === 'message') worker.listener = listener; },
                    Worker: function BridgeNestedWorker() { this.terminate = function() {}; }
                };
                const workerSandbox = {
                    self: workerSelf, Promise, JSON, Map, Object, Array, String, Number, Error,
                    setTimeout(fn, ms) { const id = setTimeout(fn, ms); worker.timers.add(id); return id; },
                    clearTimeout(id) { worker.timers.delete(id); clearTimeout(id); },
                    console
                };
                vm.createContext(workerSandbox);
                vm.runInContext(source, workerSandbox, { filename: 'plugin-worker.js' });
                this.queue.forEach(message => this.deliverToWorker(message));
                this.queue = [];
            });
        }
        deliverToParent(message) {
            const worker = this;
            setTimeout(function() {
                if (worker.terminated || !worker.onmessage) return;
                worker.onmessage({ data: clone(message) });
            }, 0);
        }
        deliverToWorker(message) {
            const worker = this;
            setTimeout(function() {
                if (worker.terminated || !worker.listener) return;
                worker.listener({ data: clone(message) });
            }, 0);
        }
        postMessage(message) {
            if (this.terminated) return;
            if (!this.listener) this.queue.push(message);
            else this.deliverToWorker(message);
        }
        terminate() {
            this.terminated = true;
            this.timers.forEach(id => clearTimeout(id));
            this.timers.clear();
        }
    }
    const childSandbox = {
        console, JSON, Object, Array, String, Number, Math, Date, Promise, Error, Uint8Array,
        TextEncoder, TextDecoder, setTimeout, clearTimeout, setInterval, clearInterval,
        window: childWindow,
        parent: childParent,
        Blob: BridgeBlob,
        Worker: BridgeWorker,
        URL: {
            createObjectURL(blob) {
                const url = 'blob:bridge-' + (++blobSequence);
                blobs.set(url, blob);
                return url;
            },
            revokeObjectURL() {}
        }
    };
    vm.createContext(childSandbox);
    vm.runInContext('(' + context.pluginIsolationChildBootstrap.toString() + ')(' + serialized + ');', childSandbox, { filename: 'plugin-isolation-child.js' });
    const createPort = () => ({
        onmessage: null,
        start() {},
        close() {},
        postMessage(message) {
            const port = this;
            const other = port === hostPort ? childPort : hostPort;
            setTimeout(function() {
                if (other && other.onmessage) other.onmessage({ data: clone(message) });
            }, 0);
        }
    });
    const hostPort = createPort();
    const childPort = createPort();
    bridgeInstance.port = hostPort;
    hostPort.onmessage = event => context.pluginRuntimeEnqueue(bridgeInstance, event.data);
    const sdkConfig = {
        abi: 1,
        instanceId: bridgeInstance.instanceId,
        pluginId: bridgeRecord.id,
        version: bridgeRecord.version,
        digest: bridgeRecord.digest,
        capabilities: bridgeRecord.capabilities,
        resources: bridgeRecord.resources,
        probe: false
    };
    childWindow.dispatch('message', {
        source: childParent,
        data: {
            type: 'plugin-isolation-start',
            token: bridgeInstance.token,
            instanceId: bridgeInstance.instanceId,
            sdk: context.pluginWorkerSdkSource(sdkConfig),
            entry: entryCode
        },
        ports: [childPort]
    });
    await waitForValue(() => context.pluginRuntimeDisplayFor(bridgeRecord.id), 'real SDK ui.render');
    await waitForValue(() => {
        const data = context.state.settings.pluginPrivateData[bridgeRecord.id];
        return data && data.stats && data.stats.messages === 2;
    }, 'real SDK private ACK');
    return { instance: bridgeInstance, childWindow, hostPort, childPort };
}

const bridge = await runRealSdkBridge(v1.entry.code);
assert.ok(context.pluginRuntimeDisplayFor('conversation-stats').text.includes('Messages: 2'), 'Host RPC results must reach the real Worker SDK.');
assert.equal(context.state.settings.pluginPrivateData['conversation-stats'].stats.messages, 2);
context.state.conversations.c1.messages.push({ id: 'u2', role: 'user', content: 'event route' });
context.pluginRuntimeEmit('conversation-saved', { conversationId: 'c1', reason: 'messages' });
await waitForValue(() => {
    const view = context.pluginRuntimeDisplayFor('conversation-stats');
    return view && view.text.includes('Messages: 3');
}, 'real SDK plugin-event refresh');
assert.equal(context.state.settings.pluginPrivateData['conversation-stats'].stats.messages, 3);
const beforeActionDisplay = context.pluginRuntimeDisplayFor('conversation-stats').updatedAt;
assert.equal(context.pluginRuntimeTriggerAction('conversation-stats', 'refresh'), true);
await waitForValue(() => {
    const view = context.pluginRuntimeDisplayFor('conversation-stats');
    return view && view.updatedAt > beforeActionDisplay && view.text.includes('Messages: 3');
}, 'real SDK action refresh');
context.pluginRuntimeDisposeInstance(bridge.instance);
context.pluginRuntimeInstances.delete('conversation-stats');
bridge.childWindow.dispatch('pagehide', {});

// 事务边界：真实 persistState 的“先写后 ACK”和 pending 快照语义。
function createTransactionalHarness() {
    const c = {
        console, JSON, Object, Array, String, Number, Math, Date, Promise, Set, Map, Error,
        Uint8Array, TextEncoder, TextDecoder, URL, AbortController, setTimeout, clearTimeout,
        window: { sha256 }, crypto: { getRandomValues: array => { for (let index = 0; index < array.length; index++) array[index] = index; return array; } },
        t: key => key,
        appStore: { notify() {} },
        refreshPluginManager() {},
        hydratePluginSettings() {},
        state: {
            settings: { plugins: [], pluginPrivateData: {}, pluginGrants: {} },
            conversations: { c1: { id: 'c1', title: 'tx', updated: 1, messages: [{ id: 'u1', role: 'user', content: 'saved text' }] } },
            conversationOrder: ['c1'],
            activeConvId: 'c1'
        },
        generation: 0,
        pendingRecords: [],
        persistQueue: Promise.resolve(),
        holdSave: false,
        saving: false,
        disk: null
    };
    c.getActiveConv = () => c.state.conversations[c.state.activeConvId] || null;
    c.capture = () => ({
        settings: clone(c.state.settings),
        conversations: clone(c.state.conversations),
        conversationOrder: clone(c.state.conversationOrder),
        activeConvId: c.state.activeConvId
    });
    c.persistState = function(_immediate, options) {
        options = options || {};
        const record = {
            generation: ++c.generation,
            snapshot: options.transformSnapshot ? options.transformSnapshot(c.capture()) : c.capture()
        };
        c.pendingRecords.push(record);
        const run = async () => {
            let wrote = false;
            try {
                if (typeof options.beforePersist === 'function') options.beforePersist();
                if (c.holdSave) {
                    c.holdSave = false;
                    c.saving = true;
                    await new Promise(resolve => { c.releaseSave = resolve; });
                    c.saving = false;
                }
                if (c.failSave) throw new Error('synthetic quota');
                wrote = true;
                if (typeof options.onPersistSuccess === 'function') options.onPersistSuccess();
                c.pendingRecords.forEach(pending => {
                    if (pending.generation > record.generation && typeof options.commitPendingSnapshot === 'function') {
                        options.commitPendingSnapshot(pending.snapshot);
                    }
                });
                c.disk = clone(record.snapshot);
            } catch (error) {
                // 与真实 persistState 一致：写入已完成但成功提交检查失败时，用当前 live 状态纠正旧写。
                if (wrote && options.throwOnError && typeof options.beforePersist === 'function') c.disk = c.capture();
                if (options.throwOnError) throw error;
            } finally {
                c.pendingRecords = c.pendingRecords.filter(item => item !== record);
            }
        };
        const operation = c.persistQueue.then(run, run);
        c.persistQueue = operation.catch(() => {});
        return operation;
    };
    vm.createContext(c);
    for (const file of ['plugins/32-plugin-packages.js', 'plugins/40-plugin-isolation.js', 'plugins/50-plugin-runtime.js', 'plugins/68-plugins-ui.js']) {
        vm.runInContext(read(file), c, { filename: file });
    }
    return c;
}

function transactionalPluginPackage(id, version) {
    return {
        type: 'opentavern-plugin', formatVersion: 1,
        manifest: {
            id, name: id, version, schemaVersion: 1, source: 'synthetic/' + id, description: '',
            capabilities: ['conversation.stats', 'storage.private'], dependencies: [], network: []
        },
        entry: { code: 'self.OpenTavernPlugin.ready();' }, resources: []
    };
}

async function installTransactionalPlugin(c, raw) {
    const record = c.normalizePluginPackage(raw).record;
    await c.pluginApplyInstall(record);
    const installedRecord = c.getInstalledPluginById(record.id);
    c.setPluginGrant(c.state.settings, installedRecord, installedRecord.capabilities);
    return installedRecord;
}

function transactionalInstance(c, record) {
    const instance = {
        pluginId: record.id,
        token: 'd'.repeat(48),
        instanceId: 'e'.repeat(48),
        record,
        fingerprint: c.pluginFingerprint(record),
        probe: false,
        status: 'running',
        stopped: false,
        frame: { remove() {} },
        port: { postMessage() {}, close() {} },
        queue: [],
        queueBytes: 0,
        draining: false,
        messageTimes: [],
        subscriptions: new Set(),
        callIds: new Set(),
        callIdSequence: 0,
        rpcTimes: [],
        inflight: new Set(),
        aborters: new Set(),
        epoch: c.pluginRuntimeEpoch(record.id),
        startupTimer: null,
        probeTimer: null,
        readyResolve: null,
        readyReject: null
    };
    c.pluginRuntimeInstances.set(record.id, instance);
    return instance;
}

// ACK 期间停止：live 不提交，已 durable 的旧写被纠正。
{
    const c = createTransactionalHarness();
    const record = await installTransactionalPlugin(c, transactionalPluginPackage('tx-plugin', '1.0.0'));
    const instance = transactionalInstance(c, record);
    c.holdSave = true;
    const write = c.pluginRuntimeHandleRpc(instance, 'storage.set', ['late', 'MUST_NOT_RESURRECT']);
    const observed = write.then(() => ({ ok: true }), error => ({ ok: false, message: error.message }));
    await waitForValue(() => c.saving, 'held plugin ACK');
    c.stopPluginInstance(record.id, 'disabled while ACK held');
    c.releaseSave();
    const result = await observed;
    assert.equal(result.ok, false);
    assert.equal(c.state.settings.pluginPrivateData[record.id] && c.state.settings.pluginPrivateData[record.id].late, undefined, 'A stopped instance must not commit its stale private write.');
    assert.equal(c.disk && c.disk.settings.pluginPrivateData[record.id] && c.disk.settings.pluginPrivateData[record.id].late, undefined, 'The durable stale write must be corrected.');
}

// 成功 ACK 后的普通 pending 快照：本事务命名空间传播，其他插件的新数据不被覆盖。
{
    const c = createTransactionalHarness();
    const record = await installTransactionalPlugin(c, transactionalPluginPackage('tx-plugin', '1.0.0'));
    const instance = transactionalInstance(c, record);
    c.holdSave = true;
    const write = c.pluginRuntimeHandleRpc(instance, 'storage.set', ['late', 'PRIVATE_ACK_MUST_SURVIVE']);
    await waitForValue(() => c.saving, 'held plugin ACK');
    const plain = c.persistState(true, { throwOnError: true });
    await waitForValue(() => c.generation >= 2, 'ordinary pending snapshot');
    const pending = c.pendingRecords.find(item => item.generation === c.generation);
    pending.snapshot.settings.pluginPrivateData['other-plugin'] = { fresh: true };
    c.releaseSave();
    await write;
    await plain;
    assert.equal(c.state.settings.pluginPrivateData[record.id].late, 'PRIVATE_ACK_MUST_SURVIVE');
    assert.equal(c.disk.settings.pluginPrivateData[record.id].late, 'PRIVATE_ACK_MUST_SURVIVE', 'A later ordinary pending snapshot must retain acknowledged plugin data.');
    assert.deepEqual(clone(c.disk.settings.pluginPrivateData['other-plugin']), { fresh: true }, 'Another plugin namespace in the pending snapshot must not be overwritten.');
}

// ACK 期间卸载：旧写不得复活已清除的插件命名空间。
{
    const c = createTransactionalHarness();
    const record = await installTransactionalPlugin(c, transactionalPluginPackage('tx-plugin', '1.0.0'));
    const instance = transactionalInstance(c, record);
    c.holdSave = true;
    const write = c.pluginRuntimeHandleRpc(instance, 'storage.set', ['late', 'UNINSTALL_MUST_CLEAR']);
    const observed = write.then(() => ({ ok: true }), error => ({ ok: false, message: error.message }));
    await waitForValue(() => c.saving, 'held plugin ACK');
    const uninstall = c.pluginUninstall(record);
    c.releaseSave();
    assert.equal((await observed).ok, false);
    await uninstall;
    assert.equal(c.state.settings.plugins.length, 0);
    assert.equal(c.state.settings.pluginPrivateData[record.id], undefined, 'Uninstall must not resurrect the namespace.');
    assert.equal(c.disk.settings.pluginPrivateData[record.id], undefined);
}

// 更新/重新授权后，停用实例的迟到写入不能复活旧命名空间或沿用旧授权。
{
    const c = createTransactionalHarness();
    const old = await installTransactionalPlugin(c, transactionalPluginPackage('tx-plugin', '1.0.0'));
    const instance = transactionalInstance(c, old);
    c.beginPluginProbe = async () => ({ stop() {} });
    await c.pluginApplyUpdate(old, c.normalizePluginPackage(transactionalPluginPackage('tx-plugin', '2.0.0')).record);
    assert.equal(c.getInstalledPluginById('tx-plugin').version, '2.0.0');
    assert.equal(c.getPluginGrant('tx-plugin'), null);
    await assert.rejects(c.pluginRuntimeHandleRpc(instance, 'storage.set', ['late', 'UPDATE_MUST_WIN']), /plugin_session_stale/);
    assert.equal(c.state.settings.pluginPrivateData['tx-plugin'] && c.state.settings.pluginPrivateData['tx-plugin'].late, undefined);

    const regrantContext = createTransactionalHarness();
    const regrantRecord = await installTransactionalPlugin(regrantContext, transactionalPluginPackage('tx-plugin', '1.0.0'));
    const regrantInstance = transactionalInstance(regrantContext, regrantRecord);
    await regrantContext.pluginGrantCapabilities(regrantRecord, ['conversation.stats']);
    await assert.rejects(regrantContext.pluginRuntimeHandleRpc(regrantInstance, 'storage.set', ['late', 'REGRANT_MUST_WIN']), /plugin_session_stale/);
    assert.equal(regrantContext.state.settings.pluginPrivateData['tx-plugin'] && regrantContext.state.settings.pluginPrivateData['tx-plugin'].late, undefined);
}

// 过时授权对话框不能授权同 ID 的新版本，即使能力相同。
{
    const c = createTransactionalHarness();
    const old = await installTransactionalPlugin(c, transactionalPluginPackage('tx-plugin', '1.0.0'));
    const next = c.pluginInstalledRecordFromPackage(c.normalizePluginPackage(transactionalPluginPackage('tx-plugin', '2.0.0')).record);
    c.state.settings.plugins = [next];
    c.state.settings.pluginGrants = {};
    await assert.rejects(c.pluginGrantCapabilities(old, old.capabilities), /plugin_settings_changed/);
    assert.equal(c.getPluginGrant('tx-plugin'), null, 'Approval for the old preview cannot authorize a different version.');
}

// 入口队列在异步执行前就有界：洪泛、非 JSON 与超限消息不会无限堆积。
{
    const c = createTransactionalHarness();
    const record = await installTransactionalPlugin(c, transactionalPluginPackage('queue-plugin', '1.0.0'));
    const instance = transactionalInstance(c, record);
    for (let index = 0; index < c.PLUGIN_MAX_QUEUED_MESSAGES + 20; index++) {
        c.pluginRuntimeEnqueue(instance, { type: 'plugin-rpc', instanceId: instance.instanceId, id: 'rpc-' + (index + 1), method: 'stats.get', args: [] });
    }
    assert.equal(instance.stopped, true, 'Queue overflow must stop the instance.');
    assert.equal(instance.queue.length, 0);
    assert.equal(c.pluginRuntimeStatusFor('queue-plugin'), 'failed');

    const cyclic = createTransactionalHarness();
    const cyclicRecord = await installTransactionalPlugin(cyclic, transactionalPluginPackage('cyclic-plugin', '1.0.0'));
    const cyclicInstance = transactionalInstance(cyclic, cyclicRecord);
    const message = { type: 'plugin-rpc', instanceId: cyclicInstance.instanceId, id: 'rpc-1', method: 'stats.get', args: [] };
    message.self = message;
    cyclic.pluginRuntimeEnqueue(cyclicInstance, message);
    assert.equal(cyclicInstance.stopped, true, 'Non-serializable input must fail finitely.');

    const malformed = createTransactionalHarness();
    const malformedRecord = await installTransactionalPlugin(malformed, transactionalPluginPackage('malformed-plugin', '1.0.0'));
    const malformedInstance = transactionalInstance(malformed, malformedRecord);
    malformed.pluginRuntimeEnqueue(malformedInstance, 'not-a-plugin-message');
    assert.equal(malformedInstance.stopped, true, 'Non-object input must fail finitely.');

    const oversized = createTransactionalHarness();
    const oversizedRecord = await installTransactionalPlugin(oversized, transactionalPluginPackage('oversized-plugin', '1.0.0'));
    const oversizedInstance = transactionalInstance(oversized, oversizedRecord);
    oversized.pluginRuntimeEnqueue(oversizedInstance, { type: 'plugin-rpc', instanceId: oversizedInstance.instanceId, id: 'rpc-1', method: 'stats.get', args: ['x'.repeat(70000)] });
    assert.equal(oversizedInstance.stopped, true, 'Oversized input must be rejected before execution.');
}

// 旧调用 ID 不会因窗口清理而重放；非 SDK ID 的窗口满后拒绝新 ID。
{
    const c = createTransactionalHarness();
    const record = await installTransactionalPlugin(c, transactionalPluginPackage('id-plugin', '1.0.0'));
    const instance = transactionalInstance(c, record);
    const messages = [];
    instance.port = { postMessage(message) { messages.push(message); }, close() {} };
    for (let index = 1; index <= 600; index++) {
        await c.pluginRuntimeHandleMessage(instance, { type: 'plugin-rpc', instanceId: instance.instanceId, id: 'rpc-' + index, method: 'stats.get', args: [] });
    }
    await c.pluginRuntimeHandleMessage(instance, { type: 'plugin-rpc', instanceId: instance.instanceId, id: 'rpc-1', method: 'stats.get', args: [] });
    assert.ok(messages.some(message => message.id === 'rpc-1' && message.ok === false && message.error.code === 'DUPLICATE_CALL'), 'An old SDK call id must not run a second time.');
    instance.callIds = new Set(Array.from({ length: c.PLUGIN_MAX_CALL_IDS }, (_, index) => 'custom-' + index));
    await c.pluginRuntimeHandleMessage(instance, { type: 'plugin-rpc', instanceId: instance.instanceId, id: 'custom-new', method: 'stats.get', args: [] });
    assert.ok(messages.some(message => message.id === 'custom-new' && message.error && message.error.code === 'CALL_ID_LIMIT'));
}

console.log('Stage D2 runtime checks passed: package validation, safe digests, grants, dependency cycles, bounded stats, real example code, private namespaces, UI limits, network policy, real iframe/Worker SDK RPC/event routes, ACK/pending transactions, stale approvals, bounded queue and call-id replay rejection.');
