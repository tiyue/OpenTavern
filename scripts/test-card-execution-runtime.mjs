import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto, createHash } from 'node:crypto';
import { MessageChannel } from 'node:worker_threads';

const source = name => fs.readFileSync(new URL(`../src/app/${name}`, import.meta.url), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
const digest = async text => createHash('sha256').update(String(text)).digest('hex');
const files = ['conversation/32-message-identity.js', 'mvu/40-mvu-data.js', 'mvu/40-mvu-parser.js', 'mvu/40-mvu-yaml-parser.js', 'mvu/40-mvu-update-blocks.js', 'mvu/40-mvu-patch-runtime.js', 'mvu/40-mvu-schema-defaults.js', 'prompt/40-sillytavern-macro-runtime.js', 'card-runtime/61-card-runtime-model.js', 'card-runtime/61-card-runtime-bridge.js', 'card-runtime/61-card-runtime-child.js', 'card-runtime/61-card-runtime-frame.js', 'card-runtime/67-card-runtime-ui.js'];
let checks = 0;
function checked() { checks++; }
function rejects(promise, code) { return assert.rejects(promise, error => error.code === code).then(checked); }
function throws(action, code) { assert.throws(action, error => error.code === code); checked(); }

const vendorRecords = JSON.parse(fs.readFileSync(new URL('../assets/js/vendor/card-runtime-vendors.json', import.meta.url), 'utf8'));
const vendorContext = vm.createContext({});
vm.runInContext(source('card-runtime/61-card-runtime-vendors.js'), vendorContext);
assert.deepEqual(clone(vendorContext.CARD_RUNTIME_VENDORS), vendorRecords); checked();
for (const vendor of vendorRecords) {
    const bytes = fs.readFileSync(new URL('../' + vendor.path, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), vendor.sha256, 'Fixed vendor bytes: ' + vendor.name); checked();
}
const shaVendor = vendorRecords.find(vendor => vendor.name === 'js-sha256');
const integrity = 'sha256-' + Buffer.from(shaVendor.sha256, 'hex').toString('base64');
assert.ok(fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8').includes('integrity="' + integrity + '"')); checked();

function harness(permissions = {}, content = '<button onclick="void 0">Card</button><script>void 0</script>') {
    const msg = { id: 'card', role: 'assistant', stage: 'main', content, cot: 'PRIVATE-COT', selectedResponseVersionId: 'v1' };
    const character = { id: 'character-a', name: 'Alice', description: 'Public description', rawCard: { privateField: 'RAW-CARD' } };
    const conv = { id: 'a', character, messages: [{ id: 'system', role: 'system', content: 'PRIVATE-SYSTEM' }, { id: 'invalid', role: 'admin', content: 'PRIVATE-INVALID' }, { id: 'user', role: 'user', content: 'hello', cot: 'PRIVATE-COT' }, msg, { id: 'second', role: 'assistant', stage: 'second', content: 'PRIVATE-SECOND' }], stLocalVars: { secret: 'PRIVATE-LOCAL' } };
    const listeners = new Map(), notices = [];
    const ctx = { console, crypto: webcrypto, TextEncoder, Event, AbortController, URL, Blob, Response, MessageChannel, setTimeout, clearTimeout, setInterval, clearInterval,
        state: { conversations: { a: conv }, activeConvId: 'a', settings: { uiTheme: 'new-dark', userName: 'PRIVATE-USER', userDescription: 'PRIVATE-PERSONA', sillyTavernPreset: { prompts: [{ identifier: 'main', content: 'PRIVATE-PRESET' }] } } },
        userDraftEditSequence: 0, cancelledDrafts: 0,
        dom: { messageInput: { value: 'draft', disabled: false, dispatchEvent() { ctx.userDraftEditSequence++; } } },
        window: { innerHeight: 800, addEventListener(name, callback) { listeners.set(name, callback); } },
        location: { origin: 'http://localhost:8765' },
        appStore: { subscribe(callback) { notices.push(callback); } },
        escapeHtml: text => String(text).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]),
        renderStaticMessage: text => `<pre>${ctx.escapeHtml(text)}</pre>`,
        getActiveConv: () => ctx.state.conversations[ctx.state.activeConvId],
        getMessageSpeakerCharacter: (_message, target) => target.character,
        cancelUserDraft: () => ctx.cancelledDrafts++,
        sendMessage() {},
        cardRuntimeDigest: digest,
        prepareCardRuntimeExecution: async (text, level) => ({ level, scripts: [], modules: [], entrySource: text, digest: await digest(text) })
    };
    let data = { stat_data: { hp: 10, secret: 'PRIVATE-MVU' }, display_data: {}, schema: {}, initialized_lorebooks: {} };
    let actualStamp = JSON.stringify({ initial: data, manual: null });
    let held = null, saved = 0, fail = false;
    ctx.getMvuDataForMessage = () => clone(data);
    ctx.getMvuContextStamp = () => actualStamp;
    ctx.replaceMvuDataForMessage = async (_conv, _msg, value, options) => {
        options.validate();
        if (held) await held.promise;
        options.validate();
        if (fail) throw new Error('storage failure');
        if (options.expectedStamp !== actualStamp) throw Object.assign(new Error('stale'), { code: 'STALE_BASELINE' });
        const normalized = ctx.validateMvuData(value);
        if (!normalized.valid) throw Object.assign(new Error('invalid variables'), { code: 'INVALID_DATA' });
        data = clone(normalized.data); actualStamp = JSON.stringify({ initial: data, manual: { saved: ++saved } });
        notices.forEach(callback => callback(['conversations']));
        return true;
    };
    vm.createContext(ctx);
    for (const file of files) vm.runInContext(source(file), ctx, { filename: file });
    const entry = ctx.createCardRuntimeEntry(msg.content, { conv, msg, character });
    const grant = { key: 'grant', digest: 'a'.repeat(64), sourceDigest: 'b'.repeat(64), abi: ctx.CARD_RUNTIME_ABI, cardKey: entry.cardKey, characterStamp: entry.characterStamp, source: entry.source, level: 'L0', plan: { entrySource: msg.content, scripts: [], modules: [] }, network: {}, permissions: { 'message.current.read': true, ...permissions } };
    ctx.activateCardRuntimeGrant(entry, grant);
    function instance(token = entry.token) {
        const frame = { isConnected: true, style: {}, remove() { this.isConnected = false; } };
        const row = { token, entry, grant, frame, stopped: false, requestIds: new Set(), requestTimes: [], subscriptions: new Map(), inputRevision: ctx.userDraftEditSequence, inputValue: ctx.dom.messageInput.value, lastContact: 0 };
        ctx.cardRuntimeInstances.set(token, row); ctx.cardRuntimeVariableStamp(row); return row;
    }
    const row = instance(); let sequence = 0;
    const rpc = (method, args = [], extra = {}, target = row) => ctx.dispatchCardRuntimeRpc(target, { type: 'card-runtime-rpc', id: `request-${++sequence}`, method, args, baseline: target.variableStamp, ...extra });
    return { ctx, entry, grant, row, conv, msg, character, listeners, rpc, instance, notices,
        data: () => clone(data), saved: () => saved, actualStamp: () => actualStamp,
        changeData(value) { data = value; actualStamp = JSON.stringify(value); },
        failSave(value) { fail = value; },
        hold() { let release; const promise = new Promise(resolve => { release = resolve; }); held = { promise }; return () => { held = null; release(); }; }
    };
}

// Structured-clone cycles, hostile keys, large trees and non-JSON numbers cannot stall the host.
{
    const { ctx } = harness();
    const cycle = {}; cycle.self = cycle;
    throws(() => ctx.cardRuntimeJson(cycle), 'INVALID_DATA');
    throws(() => ctx.cardRuntimeJson(JSON.parse('{"__proto__":{}}')), 'INVALID_DATA');
    throws(() => ctx.cardRuntimeJson({ number: Infinity }), 'INVALID_DATA');
    throws(() => ctx.cardRuntimeJson(new Map([['x', 1]])), 'INVALID_DATA');
    throws(() => ctx.cardRuntimeJson({ get x() { throw new Error('getter executed'); } }), 'INVALID_DATA');
    throws(() => ctx.cardRuntimeJson(Array(40001).fill(1)), 'LIMIT_EXCEEDED');
    let deep = {}; for (let i = 0; i < 35; i++) deep = { nested: deep };
    throws(() => ctx.cardRuntimeJson(deep), 'INVALID_DATA');
    const shared = { n: 1 }; assert.deepEqual(clone(ctx.cardRuntimeJson([shared, shared])), [{ n: 1 }, { n: 1 }]); checked();
}

// Markdown examples stay examples; only real HTML or a sole HTML fence exposes runtime controls.
{
    const { ctx, conv, msg, character, entry } = harness();
    for (const example of ['Text\n```html\n<img onerror="alert(1)">\n```', 'Example `<script>alert(1)</script>`.', '```js\nwindow.x = 1;\n```', 'Example\n~~~html\n<script>void 0</script>\n~~~', 'Example\n```html\n<script>void 0</script>']) { assert.equal(ctx.extractCardRuntimeSource(example), null); checked(); }
    assert.equal(ctx.extractCardRuntimeSource('```html\n<script>void 0</script>\n```'), '<script>void 0</script>'); checked();
    assert.ok(ctx.extractCardRuntimeSource('<img src=x onerror=alert(1)>')); checked();
    assert.equal(ctx.createCardRuntimeEntry(msg.content, { conv, msg, character }), entry); checked();
    assert.ok(ctx.renderCardRuntimeContent(msg.content, { conv, msg, character }).includes('data-action="card-runtime-run"')); checked();
    assert.equal(ctx.cardRuntimeInstances.size, 1); checked();
    const newer = { ...entry, token: 'new', source: 'different' };
    assert.equal(ctx.findCardRuntimeGrant(newer), null); checked();
}

// Static display derives from the message, while entry and authorization source bytes stay untouched.
{
    const raw = '<dream_plot>\n<dream_body>\n<script>const marker = "<dream_body>literal</dream_body>";</script>\n正文\n</dream_body>\n</dream_plot>';
    const h = harness({}, raw);
    assert.equal(h.entry.original, raw); checked();
    assert.equal(h.entry.source, raw); checked();
    let authorizationInput = null;
    h.ctx.prepareCardRuntimeExecution = async text => { authorizationInput = text; return { level: 'L0', entrySource: text, scripts: [], modules: [] }; };
    const prepared = await h.ctx.prepareCardRuntimeGrant(h.entry, { level: 'L0', permissions: { 'chat.read': true }, network: {} }, new AbortController().signal);
    assert.equal(authorizationInput, raw); checked();
    assert.equal(prepared.source, raw); checked();
    assert.equal(prepared.plan.entrySource, raw); checked();
    assert.equal(prepared.permissions['chat.read'], true); checked();
    assert.equal(prepared.permissions['input.write'], false); checked();
    assert.equal(h.ctx.findCardRuntimeGrant(h.entry), h.grant); checked();
    h.ctx.cardRuntimeGrants.clear();
    assert.equal(h.ctx.findCardRuntimeGrant(h.entry), null); checked();
    h.ctx.activateCardRuntimeGrant(h.entry, prepared);
    assert.equal(h.ctx.findCardRuntimeGrant(h.entry), prepared); checked();
    h.msg.content += '\n<script>changed</script>';
    throws(() => h.ctx.activateCardRuntimeGrant(h.entry, prepared), 'STALE_TARGET');
    assert.equal(h.entry.original, raw); checked();
}

// The optional prepared display only supplies static derived HTML; it cannot alter entry source bytes.
{
    const raw = '<script>window.onlyIsolatedFixture=1</script>\n原始卡片正文。';
    const h = harness({}, raw);
    const before = h.ctx.cardRuntimeEntries.get(h.entry.token);
    const preparedDisplay = { display: { html: '<p>prepared-static-only</p>' } };
    const html = h.ctx.renderCardRuntimeContent(raw, { conv: h.conv, msg: h.msg, character: h.character }, preparedDisplay);
    const after = h.ctx.cardRuntimeEntries.get(h.entry.token);
    assert.ok(html.includes('<p>prepared-static-only</p>')); checked();
    assert.equal(after, before); checked();
    assert.equal(after.original, raw); checked();
    assert.equal(after.source, raw); checked();
}

// Authorization needs exact sources, dependency bytes and a still-current target.
{
    const { ctx, entry, msg } = harness();
    const signal = new AbortController().signal;
    const choice = { level: 'L0', permissions: {}, network: {} };
    const prepared = await ctx.prepareCardRuntimeGrant(entry, choice, signal);
    assert.match(prepared.digest, /^[a-f0-9]{64}$/); assert.equal(prepared.permissions['input.write'], false); checked();
    ctx.prepareCardRuntimeExecution = async text => ({ level: 'L0', entrySource: text, scripts: [{ name: 'bad', source: 'changed', sha256: '0'.repeat(64), type: 'classic' }], modules: [] });
    await rejects(ctx.prepareCardRuntimeGrant(entry, choice, signal), 'DIGEST_MISMATCH');
    ctx.prepareCardRuntimeExecution = async text => ({ level: 'L0', entrySource: text, scripts: [], modules: [{ source: 'changed', sha256: '0'.repeat(64) }] });
    await rejects(ctx.prepareCardRuntimeGrant(entry, choice, signal), 'DIGEST_MISMATCH');
    msg.selectedResponseVersionId = 'v2';
    throws(() => ctx.activateCardRuntimeGrant(entry, prepared), 'STALE_TARGET');
}
{
    const { ctx, entry, grant, row } = harness();
    const replacement = { ...grant, key: 'replacement', level: 'L1' };
    ctx.activateCardRuntimeGrant(entry, replacement);
    assert.equal(ctx.findCardRuntimeGrant(entry), replacement); assert.equal(row.stopped, true); checked();
    ctx.CARD_RUNTIME_ABI = 'new-abi'; assert.equal(ctx.findCardRuntimeGrant(entry), null); checked();
}

// Every host method is explicit and capability gated; chat projections exclude protected fields.
{
    const h = harness({ 'chat.read': true, 'character.read': true });
    await rejects(h.rpc('networkFetch', ['http://example.com']), 'UNSUPPORTED_METHOD');
    await rejects(h.rpc('setInputText', ['changed']), 'PERMISSION_DENIED');
    const messages = await h.rpc('getChatMessages');
    assert.deepEqual(clone(messages.map(row => row.id)), ['user', 'card']);
    assert.ok(!JSON.stringify(messages).includes('PRIVATE')); checked();
    const character = await h.rpc('getCharacter'); assert.ok(!JSON.stringify(character).includes('RAW-CARD')); checked();
    const request = { id: 'same', method: 'getCurrentMessageId', args: [] };
    await h.ctx.dispatchCardRuntimeRpc(h.row, request);
    await rejects(h.ctx.dispatchCardRuntimeRpc(h.row, request), 'DUPLICATE_REQUEST');
    h.ctx.state.activeConvId = 'missing'; await rejects(h.rpc('getCurrentMessageId'), 'STALE_TARGET');
}

// The UI accepts distinct HTTP broker origins, canonicalizes scopes, and rejects invalid grants.
{
    const { ctx } = harness();
    const fields = { '[data-runtime-level]': { value: 'L3' }, '[data-runtime-broker]': { value: 'http://localhost:8766/card-broker.html' }, '[data-runtime-origins]': { value: 'https://EXAMPLE.com\nhttps://example.com/' } };
    const permission = { checked: true, getAttribute: () => 'network.fetch' };
    const dialog = { querySelector: selector => fields[selector], querySelectorAll: selector => selector === '[data-runtime-permission]' ? [permission] : [{ value: 'GET' }] };
    const selection = ctx.cardRuntimeSelection(dialog);
    assert.deepEqual(clone(selection.network.origins), ['https://example.com']); assert.deepEqual(clone(selection.network.methods), ['GET']); checked();
    fields['[data-runtime-broker]'].value = 'http://localhost:8765/broker'; throws(() => ctx.cardRuntimeSelection(dialog), 'INVALID_NETWORK');
    fields['[data-runtime-broker]'].value = 'http://user:password@localhost:8766/broker'; throws(() => ctx.cardRuntimeSelection(dialog), 'INVALID_NETWORK');
    fields['[data-runtime-broker]'].value = 'http://localhost:8766/broker'; fields['[data-runtime-origins]'].value = 'https://example.com/private'; throws(() => ctx.cardRuntimeSelection(dialog), 'INVALID_NETWORK');
    fields['[data-runtime-origins]'].value = 'https://example.com'; permission.checked = false; throws(() => ctx.cardRuntimeSelection(dialog), 'PERMISSION_DENIED');
    fields['[data-runtime-level]'].value = 'L0'; permission.checked = true; assert.equal(ctx.cardRuntimeSelection(dialog).permissions['network.fetch'], false); checked();
    fields['[data-runtime-level]'].value = 'L4'; throws(() => ctx.cardRuntimeSelection(dialog), 'INVALID_LEVEL');
}

// Palette follows resolved body classes even when the stored preference says system.
{
    const { ctx, row } = harness();
    const classes = new Set(['theme-new-light']); ctx.document = { body: { classList: { contains: name => classes.has(name) } } }; ctx.state.settings.uiTheme = 'system';
    assert.equal(ctx.cardRuntimePalette().colorScheme, 'light'); checked();
    classes.clear(); classes.add('theme-new-dark'); assert.equal(ctx.cardRuntimePalette().colorScheme, 'dark'); checked();
    row.contentHeight = 5000; ctx.updateCardRuntimeFrameHeight(row); assert.equal(row.frame.style.height, '480px'); checked();
    ctx.window.innerHeight = 500; ctx.updateCardRuntimeFrameHeight(row); assert.equal(row.frame.style.height, '300px'); checked();
    row.contentHeight = 20; ctx.updateCardRuntimeFrameHeight(row); assert.equal(row.frame.style.height, '120px'); checked();
}

// MVU baselines sent to write-only cards are opaque; an ACK rotates the token, never exposing state.
{
    const h = harness({ 'variables.write.current': true });
    const initial = h.ctx.cardRuntimeInitialData(h.row);
    assert.equal(initial.variables, null); assert.match(initial.stamp, /^[a-f0-9]{48}$/); assert.notEqual(initial.stamp, h.actualStamp()); checked();
    const old = initial.stamp;
    const result = await h.rpc('replaceMvuData', [h.data()]);
    assert.equal(result.data, null); assert.notEqual(result.stamp, old); assert.ok(!JSON.stringify(result).includes('PRIVATE')); checked();
    await rejects(h.rpc('replaceMvuData', [h.data()], { baseline: old }), 'STALE_BASELINE');
    await rejects(h.rpc('getVariables'), 'PERMISSION_DENIED');
}

// Competing writers and in-flight writes cannot win after a target change or revoke.
{
    const h = harness({ 'variables.read': true, 'variables.write.current': true });
    const other = h.instance('other-token');
    await h.rpc('replaceMvuData', [h.data()]);
    h.ctx.cardRuntimeVariableStamp(other);
    await rejects(h.rpc('replaceMvuData', [h.data()], {}, other), 'WRITER_BUSY');
    const release = h.hold();
    const pending = h.rpc('replaceMvuData', [{ ...h.data(), stat_data: { hp: 9 } }]);
    await rejects(h.rpc('replaceMvuData', [h.data()]), 'WRITER_BUSY');
    h.ctx.stopCardRuntimeInstance(h.row, 'revoke', true); release();
    await rejects(pending, 'STALE_TARGET'); assert.equal(h.saved(), 1); checked();
}
for (const change of ['switch', 'version', 'content', 'replace-conversation']) {
    const h = harness({ 'variables.write.current': true }); const release = h.hold();
    const pending = h.rpc('replaceMvuData', [h.data()]);
    if (change === 'switch') h.ctx.state.activeConvId = 'elsewhere';
    if (change === 'version') h.msg.selectedResponseVersionId = 'v2';
    if (change === 'content') h.msg.content += 'changed';
    if (change === 'replace-conversation') h.ctx.state.conversations.a = clone(h.conv);
    release(); await rejects(pending, 'STALE_TARGET'); assert.equal(h.saved(), 0); checked();
}
{
    const h = harness({ 'variables.write.current': true });
    const baseline = h.row.variableStamp; h.failSave(true);
    await assert.rejects(h.rpc('replaceMvuData', [h.data()]), /storage failure/); checked();
    assert.equal(h.saved(), 0); assert.equal(h.row.variableStamp, baseline); checked();
}

// JSON Patch uses the real declarative core and rejects the entire block on any diagnostic.
{
    const h = harness({ 'variables.read': true, 'variables.write.current': true });
    const result = await h.rpc('patchMvuData', [[{ op: 'replace', path: '/hp', value: 8 }]]);
    assert.equal(result.data.stat_data.hp, 8); checked();
    await rejects(h.rpc('patchMvuData', [[{ op: 'replace', path: '/hp', value: 7 }, { op: 'unknown', path: '/hp', value: 0 }]]), 'INVALID_PATCH');
    assert.equal(h.data().stat_data.hp, 8); checked();
    await rejects(h.rpc('getVariables', [{ type: 'message', message_id: 'user' }]), 'INVALID_TARGET');
}

// Composer revisions reject edit-and-restore, respect generation, and bound final appended size.
{
    const h = harness({ 'input.write': true, 'generate.trigger': true });
    await h.rpc('setInputText', ['card text']); assert.equal(h.ctx.cancelledDrafts, 1); checked();
    h.ctx.userDraftEditSequence += 2; h.ctx.dom.messageInput.value = 'card text';
    await rejects(h.rpc('appendInputText', ['lost']), 'INPUT_CHANGED');
    await rejects(h.rpc('triggerGeneration'), 'INPUT_BUSY');
    h.row.inputRevision = h.ctx.userDraftEditSequence; h.ctx.state.isGenerating = true;
    await rejects(h.rpc('setInputText', ['lost']), 'INPUT_BUSY');
    h.ctx.state.isGenerating = false; h.ctx.dom.messageInput.value = 'x'.repeat(65536); h.row.inputValue = h.ctx.dom.messageInput.value;
    await rejects(h.rpc('appendInputText', ['x']), 'LIMIT_EXCEEDED');
    h.ctx.dom.messageInput.value = h.row.inputValue = 'send'; h.ctx.sendMessage = () => {};
    await rejects(h.rpc('triggerGeneration'), 'SEND_REJECTED');
}

// Macro evaluation is read-only, message-bound and cannot reveal global presets or persona.
{
    const h = harness({ 'macros.substitute': true, 'variables.read': true });
    const before = h.data();
    assert.equal(await h.rpc('substituteMacros', ['{{getvar::hp}} {{persona}} {{user}}']), '10  User'); checked();
    await rejects(h.rpc('substituteMacros', ['{{setvar::secret::changed}}']), 'UNSUPPORTED_MACRO');
    await rejects(h.rpc('substituteMacros', ['{{charprompt}}']), 'UNSUPPORTED_MACRO');
    await rejects(h.rpc('substituteMacros', ['{{{{pick::charprompt}}}}']), 'UNSUPPORTED_MACRO');
    assert.deepEqual(h.data(), before); assert.equal(h.conv.stLocalVars.secret, 'PRIVATE-LOCAL'); checked();
}

// The actual child bootstrap and actual host RPC talk over a real MessageChannel.
{
    const h = harness({ 'variables.read': true, 'variables.write.current': true, 'events.subscribe': true, 'events.emit.local': true });
    const channel = new MessageChannel(); h.ctx.connectCardRuntimePort(h.row, channel.port1);
    const listeners = new Map(), created = [], ready = [], parent = { postMessage(message) { ready.push(message); } };
    const styles = new Map();
    const child = { console, parent, TextEncoder, URL, Blob, Response, setTimeout, clearTimeout, setInterval, clearInterval,
        document: { documentElement: { clientHeight: 120, style: { setProperty(key, value) { styles.set(key, value); } } }, body: { offsetHeight: 88, scrollHeight: 88, getBoundingClientRect: () => ({ height: 88 }) }, addEventListener() {}, createElement() { return {}; }, head: { appendChild(element) { created.push(element); } } },
        addEventListener(name, callback) { listeners.set(name, callback); }, removeEventListener(name) { listeners.delete(name); } };
    child.window = child; vm.createContext(child);
    const config = { token: h.row.token, abi: h.ctx.CARD_RUNTIME_ABI, level: 'L2', permissions: h.grant.permissions, initial: h.ctx.cardRuntimeInitialData(h.row), modules: [{ id: 'card-runtime:module-7', source: 'export const a=1;' }] };
    vm.runInContext(`(${h.ctx.cardRuntimeChildBootstrap.toString()})(${JSON.stringify(config)})`, child);
    assert.equal(ready[0].type, 'card-runtime-ready'); assert.equal(ready[0].token, h.row.token); checked();
    assert.ok(JSON.parse(created[0].textContent).imports['card-runtime:module-7'].startsWith('blob:')); checked();
    listeners.get('message')({ source: {}, data: { type: 'card-runtime-connect', token: h.row.token }, ports: [channel.port2] });
    assert.ok(listeners.has('message')); checked();
    listeners.get('message')({ source: parent, data: { type: 'card-runtime-connect', token: 'wrong' }, ports: [channel.port2] });
    assert.ok(listeners.has('message')); checked();
    listeners.get('message')({ source: parent, data: { type: 'card-runtime-connect', token: h.row.token }, ports: [channel.port2] });
    try {
        assert.equal(child.getvar('hp'), 10); checked();
        await child.updateVariablesWith(draft => { draft.stat_data.hp = 6; });
        assert.equal(h.data().stat_data.hp, 6); assert.equal(child.getvar('hp'), 6); checked();
        await rejects(child.OpenTavernFrontend.call('unimplemented', []), 'UNSUPPORTED_METHOD');
        let detail = null; await child.eventOn('card.clicked', value => { detail = value; }); await child.eventEmit('card.clicked', { count: 1 });
        assert.deepEqual(clone(detail), { count: 1 }); checked();
        channel.port1.postMessage({ type: 'card-runtime-theme', palette: { theme: 'new-light', colorScheme: 'light', foreground: '#302b27', background: '#fffdfa' } });
        await new Promise(resolve => setTimeout(resolve, 70));
        assert.equal(styles.get('--card-runtime-scheme'), 'light'); assert.equal(h.row.frame.style.height, '120px'); checked();
        const lastContact = h.row.lastContact; await channel.port1.onmessage({ data: { type: 'card-runtime-ping' } });
        assert.ok(h.row.lastContact >= lastContact); checked();
    } finally {
        listeners.get('pagehide')(); channel.port1.close(); channel.port2.close();
    }
}

console.log(`Card execution runtime: ${checks} checks passed (VM + real MessageChannel; iframe/browser coverage is separate).`);
