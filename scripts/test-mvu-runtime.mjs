import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = (name) => fs.readFileSync(new URL(`../src/app/${name}`, import.meta.url), 'utf8');
const copy = (value) => JSON.parse(JSON.stringify(value));
const patch = (operations) => `<JSONPatch>${JSON.stringify(operations)}</JSONPatch>`;
const delta = (value) => patch([{ op: 'delta', path: '/hp', value }]);
const envelope = (value) => ({ stat_data: { hp: value }, display_data: { hp: value }, schema: {}, initialized_lorebooks: {} });

function harness(messages = [{ id: 'main', role: 'assistant', content: delta(-2) }]) {
    let id = 0;
    const conv = { id: 'a', messages: copy(messages), summaries: [], updated: 1, character: { name: 'A', extensions: { mvu: { initvar: '{"hp":10}' } } } };
    const writes = [], notifications = [];
    const ctx = {
        console: { ...console, error() {}, warn() {} }, setTimeout, clearTimeout, TextEncoder,
        state: { conversations: { a: conv }, conversationOrder: ['a'], activeConvId: 'a', settings: { contextLength: 1 }, worldBooks: {}, characters: {} },
        makeId: () => `v-${++id}`, t: (key) => key,
        appStore: { notify: (keys) => notifications.push(keys) },
        getSafeSettingsForPersist: () => copy(ctx.state.settings),
        getCloudSyncPortableSettings: (value) => copy(value || {}),
        getConversationIdsWithMissingFallback: (order, conversations) => [...new Set([...(order || []), ...Object.keys(conversations || {})])].filter((key) => Object.hasOwn(conversations, key)),
        getValidConversationIdOrFallback: (active, order, conversations) => Object.hasOwn(conversations, active) ? active : (order || []).find((key) => Object.hasOwn(conversations, key)),
        renderMessagesOnly() {}, renderTokenBar() {}, scheduleCloudSyncUpload() {},
        saveMode: 'ok',
        StorageService: {
            _cloneForPersist: copy,
            async saveAll(snapshot) {
                writes.push(copy(snapshot));
                if (ctx.saveMode === 'fail') throw new Error('storage failure');
                if (ctx.saveMode === 'refused') return { refusedEmpty: true };
                if (ctx.saveMode === 'hold') {
                    ctx.durable = copy(snapshot);
                    await new Promise((resolve, reject) => { ctx.resolveSave = resolve; ctx.rejectSave = reject; });
                }
                ctx.durable = copy(snapshot);
            }
        }
    };
    vm.createContext(ctx);
    for (const file of ['conversation/19-conversation-order-helpers.js', 'conversation/32-message-identity.js', 'conversation/32-response-versions.js', 'state/35-persist-records.js', 'state/35-state-persistence.js', 'state/35-persist-snapshot-helpers.js', 'state/35-conversation-mutation-persistence.js', 'summary/41-summary-validity.js', 'mvu/40-mvu-data.js', 'mvu/40-mvu-parser.js', 'mvu/40-mvu-yaml-parser.js', 'mvu/40-mvu-update-blocks.js', 'mvu/40-mvu-patch-runtime.js', 'mvu/40-mvu-schema-defaults.js', 'mvu/40-mvu-initial-state.js', 'mvu/40-mvu-runtime.js', 'mvu/40-mvu-mutations.js']) {
        vm.runInContext(source(file), ctx, { filename: file });
    }
    ctx.normalizeConversationMessageIdentity(conv);
    ctx.ensureConversationMvu(conv);
    ctx.rememberCloudSyncConversationBaseline();
    return { ctx, conv, writes, notifications };
}

async function turn() { await new Promise((resolve) => setImmediate(resolve)); }

async function flush(ctx) {
    if (ctx._persistTimeout) { clearTimeout(ctx._persistTimeout); ctx._persistTimeout = null; }
    await ctx._persistWriteChain;
}

function lifecycle(messages = []) {
    const h = harness(messages), { ctx, conv } = h, events = [], alerts = [];
    function element(value = '') {
        const classes = new Set();
        return { value, textContent: '', className: '', listeners: {}, classList: {
            add: (name) => classes.add(name), remove: (name) => classes.delete(name),
            contains: (name) => classes.has(name), toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name)
        }, addEventListener(type, callback) { this.listeners[type] = callback; } };
    }
    ctx.dom = Object.fromEntries(['importCloseBtn', 'importBackdrop', 'importFileInput', 'importModal', 'importStatus', 'messagesContainer', 'charEditorModal',
        'charEditName', 'charEditTags', 'charEditDescription', 'charEditPersonality', 'charEditScenario', 'charEditFirstMes', 'charEditMesExample', 'charEditSystemPrompt', 'charEditPostHistory', 'charEditCreatorNotes'].map((key) => [key, element()]));
    ctx.currentCharacterName = 'A';
    ctx.currentView = 'library';
    conv.title = 'New Chat';
    ctx.state.settings.userName = 'User';
    ctx.alert = (message) => alerts.push(message);
    ctx.saveCurrentConversation = () => {};
    ctx.requestRender = () => events.push('render');
    ctx.renderTokenBar = () => events.push('tokens');
    ctx.renderAll = () => events.push('all');
    ctx.renderLibraryGrids = () => events.push('library');
    ctx.renderCharacterUI = () => events.push('character');
    ctx.renderMessagesOnly = () => events.push('messages');
    ctx.renderConversationListOnly = () => events.push('conversations');
    ctx.isMobile = () => false;
    ctx.switchView = (view) => { ctx.currentView = view; events.push('view'); };
    ctx.getCharacterGreetings = (character) => character ? [character.first_mes] : [];
    ctx.setTimeout = (fn, delay) => { const timer = setTimeout(fn, delay); timer.unref(); return timer; };
    ctx.console.log = () => {};
    for (const file of ['conversation/32-conversation-model.js', 'conversation/32-group-chat-members.js', 'mvu/40-mvu-template-expressions.js', 'mvu/40-mvu-template-parser.js', 'mvu/40-mvu-template.js', 'prompt/40-sillytavern-macro-runtime.js', 'prompt/40-character-prompt-helpers.js',
        'character/40-character-card-import.js', 'character/40-character-book-import.js', 'worldbook/41-world-info-constants.js', 'worldbook/41-world-info-position.js', 'worldbook/41-world-info-extension-fields.js', 'worldbook/41-world-info-normalizer.js',
        'worldbook/42-worldbook-import-format.js', 'conversation/59-new-chat-first-message.js', 'conversation/59-new-chat-single.js', 'conversation/59-new-chat-group.js', 'conversation/59-new-chat-worldinfo.js', 'conversation/59-new-chat-finalize.js', 'conversation/59-new-chat-workflow.js',
        'transfer/63-backup-restore-runtime.js', 'character/65-character-editor-helpers.js', 'character/65-character-editor-ui.js', 'character/66-character-import-conversation.js', 'character/66-character-import-status-ui.js', 'character/66-character-import-events.js', 'bootstrap/72-app-init-ui.js']) {
        vm.runInContext(source(file), ctx, { filename: file });
    }
    ctx.bindCharacterImportModalEvents();
    function editor(name = 'Editor', greeting = '<initvar>{"hp":33}</initvar>HP={{getvar::hp}}') {
        ctx.dom.charEditName.value = name;
        ctx.dom.charEditFirstMes.value = greeting;
        ctx.dom.charEditorModal.classList.remove('hidden');
    }
    const card = { spec: 'chara_card_v3', data: { name: 'Imported', first_mes: '<initvar>{"hp":25}</initvar>Hi {{char}} {{user}} HP={{getvar::hp}}',
        extensions: { mvu: { initvar: '{"hp":20}' }, unknown: { retained: true } }, character_book: { name: 'Init', entries: [{ id: 0, comment: '[InitVar]', enabled: false, keys: [], content: '{"hp":15,"lore":true}' }] } } };
    async function importCard(value = card) {
        ctx.readCharacterImportFile = async () => ({ json: copy(value) });
        ctx.dom.importModal.classList.remove('hidden');
        return ctx.dom.importFileInput.listeners.change({ target: { files: [{}] } });
    }
    return { ...h, events, alerts, editor, importCard, card };
}

function hp(ctx, conv, message = null) { return ctx.getMvuDataForMessage(conv, message).stat_data.hp; }

// Initial sources use disabled InitVar lore, raw-card data and selected/fallback greetings without modifying them.
{
    const { ctx, conv } = harness([]);
    const entry = { comment: '[InitVar]', disable: true, enabled: false, content: '{"hp":10,"world":true}' };
    ctx.state.worldBooks.w = { name: 'W', entries: { e: entry } };
    conv.worldBookIds = ['w'];
    conv.character = { name: 'A', extensions: { mvu: { initvar: 'hp: 12\nextension: true' } }, first_mes: '<initvar>{"hp":15,"greeting":true}</initvar>', character_book: { entries: [entry] } };
    const before = copy(conv), beforeBooks = copy(ctx.state.worldBooks);
    const initial = ctx.buildMvuInitialData(conv);
    assert.deepEqual(copy(initial.data.stat_data), { hp: 15, world: true, extension: true, greeting: true });
    assert.equal(initial.sources.filter((item) => item.kind === 'worldbook').length, 1, 'Embedded copies of the same InitVar are deduplicated.');
    assert.deepEqual(copy(conv), before);
    assert.deepEqual(ctx.state.worldBooks, beforeBooks);
    conv.character.rawCard = { data: { extensions: { mvu: { initvar: '{"raw":true}' } }, character_book: { entries: [{ comment: '[InitVar]', content: '{"rawBook":true}' }] } } };
    const rawInitial = ctx.buildMvuInitialData(conv);
    assert.equal(rawInitial.data.stat_data.raw, true);
    assert.equal(rawInitial.data.stat_data.rawBook, true);
    conv.character.first_mes = 'No initial values';
    conv.character.alternate_greetings = ['<initvar>{"hp":20}</initvar>', '<initvar>{"hp":30}</initvar>'];
    assert.equal(ctx.buildMvuInitialData(conv).data.stat_data.hp, 20);
    assert.equal(ctx.buildMvuInitialData(conv, { greetingText: '<initvar>{"hp":25}</initvar>' }).data.stat_data.hp, 25);
}

// Schema text is parsed as data; it never runs, and defaults only fill a completely empty stat_data.
{
    const { ctx, conv } = harness([]);
    conv.character = { name: 'A', extensions: { tavern_helper: { scripts: [
        { id: 'off', enabled: false, content: 'const s=z.object({hp:z.number().default(90)});' },
        { id: 'schema', content: 'const s=z.object({hp:z.number().default(7)}); globalThis.executed = true;' }
    ] } } };
    const result = ctx.buildMvuInitialData(conv);
    assert.equal(result.data.stat_data.hp, 7);
    assert.equal(ctx.executed, undefined);
    conv.character.extensions.mvu = { initvar: '{"present":true}' };
    assert.equal(Object.hasOwn(ctx.buildMvuInitialData(conv).data.stat_data, 'hp'), false);
}

// Replay follows the full selected history; user, second-stage and interrupted content never update it.
{
    const { ctx, conv } = harness([
        { id: 'u', role: 'user', content: delta(-100) },
        { id: 'a1', role: 'assistant', content: delta(-2) },
        { id: 's', role: 'assistant', stage: 'second', parentId: 'a1', content: delta(-100) },
        { id: 'a2', role: 'assistant', content: delta(-3) },
        { id: 'partial', role: 'assistant', interrupted: true, content: delta(-100) }
    ]);
    conv.stLocalVars = { hp: 'macro-only' };
    conv.summaries = [{ text: 'ignored by MVU', coveredStart: 0, coveredEnd: 4 }];
    const before = copy(conv);
    assert.equal(hp(ctx, conv, 'a1'), 8);
    assert.equal(hp(ctx, conv, 's'), 8);
    assert.equal(hp(ctx, conv), 5);
    assert.equal(conv.stLocalVars.hp, 'macro-only');
    const returned = ctx.getMvuDataForMessage(conv, 'a1');
    returned.stat_data.hp = 999;
    assert.equal(hp(ctx, conv, 'a1'), 8);
    assert.deepEqual(copy(conv), before, 'Queries and WeakMap caches are not writes to history or MVU sources.');
    ctx.clearMvuRuntimeCache(conv);
    assert.equal(hp(ctx, conv), 5);
    const candidate = { ...conv, messages: conv.messages.slice() };
    const beforeMessages = copy(conv.messages);
    ctx.refreshMvuCandidate(candidate);
    assert.equal(candidate.messages[1], conv.messages[1]);
    assert.deepEqual(conv.messages, beforeMessages);
    candidate.mvu.current.stat_data.hp = 500;
    assert.equal(hp(ctx, conv), 5);
}

// Cache/source stamps include versions, manual values and interruption, while M1 revisions remain unchanged.
{
    const { ctx, conv } = harness();
    const message = conv.messages[0], revision = ctx.getMessageRevision(message);
    const sources = ctx.captureMvuSources(conv);
    message.mvuManualData = envelope(30);
    message.mvuManualVersionId = `base:${message.id}`;
    assert.equal(ctx.getMessageRevision(message), revision);
    assert.equal(ctx.validateMvuSources(conv, sources), false);
    assert.equal(hp(ctx, conv), 30);
    message.mvuManualVersionId = 'unconfirmed';
    assert.equal(hp(ctx, conv), 8);
    assert.ok(ctx.getMvuDiagnostics(conv).some((item) => item.code === 'mvu-manual-version'));
    ctx.clearMvuManualOverride(message);
    message.interrupted = true;
    assert.equal(hp(ctx, conv), 10);
}

// Base overrides migrate only when capturing the same body; distinct bodies do not inherit them.
{
    const { ctx, conv } = harness();
    const message = conv.messages[0];
    message.mvuManualData = envelope(30);
    message.mvuManualVersionId = `base:${message.id}`;
    const version = ctx.captureResponseVersion(conv, message);
    ctx.bindMvuResponseVersion(conv, message, version);
    assert.equal(version.message.mvuManualVersionId, version.id);
    assert.equal(message.mvuManualVersionId, `base:${message.id}`);
    const changed = { id: 'new', message: { ...copy(message), content: delta(-4) }, secondMessages: [] };
    ctx.bindMvuResponseVersion(conv, message, changed);
    assert.equal(Object.hasOwn(changed.message, 'mvuManualData'), false);
    assert.equal(Object.hasOwn(message, 'mvuManualData'), true);
}

// Opening versions carry independent initial baselines; switching back cannot retain a later opening's fields.
{
    const { ctx, conv } = harness([{ id: 'g', role: 'assistant', content: '<initvar>{"a":1}</initvar>' }]);
    conv.character.extensions.mvu.initvar = '{}';
    ctx.ensureConversationMvu(conv, { rebuildInitial: true });
    const original = conv.messages[0];
    const a = ctx.captureResponseVersion(conv, original);
    ctx.bindMvuResponseVersion(conv, original, a);
    const b = { id: 'opening-b', message: { id: 'g', role: 'assistant', content: '<initvar>{"b":2}</initvar>' }, secondMessages: [] };
    ctx.prepareMvuGreetingCandidate(conv, b);
    const candidate = { ...conv, messages: [{ ...copy(b.message), selectedResponseVersionId: b.id, responseVersions: [a, b] }] };
    ctx.refreshMvuCandidate(candidate);
    assert.deepEqual(copy(candidate.mvu.initial.stat_data), { b: 2 });
    assert.deepEqual(copy(conv.mvu.initial.stat_data), { a: 1 });
    const back = { ...candidate, messages: [{ ...copy(a.message), selectedResponseVersionId: a.id, responseVersions: [a, b] }] };
    ctx.refreshMvuCandidate(back);
    assert.deepEqual(copy(back.mvu.current.stat_data), { a: 1 });
    ctx.commitMvuCandidate(conv, back);
    assert.deepEqual(copy(conv.mvu.initial.stat_data), { a: 1 });
}

// Invalid operation blocks and manual data retain confirmed state and never pollute prototypes.
{
    const { ctx, conv } = harness([{ id: 'm', role: 'assistant', content: patch([{ op: 'replace', path: '/hp', value: 3 }, { op: 'remove', path: '/missing' }]) }]);
    assert.equal(hp(ctx, conv), 10);
    assert.ok(ctx.getMvuDiagnostics(conv).length);
    const before = copy(conv);
    for (const invalid of [JSON.parse('{"stat_data":{"__proto__":{"bad":1}}}'), { stat_data: { hp: Infinity } }, { stat_data: { hp: '中'.repeat(400000) } }]) {
        await assert.rejects(ctx.replaceMvuDataForMessage(conv, 'm', invalid));
    }
    assert.deepEqual(copy(conv), before);
    assert.equal({}.bad, undefined);
}

// Actual persistState/Mutation queue: no manual state or events publish until the storage ACK.
{
    const { ctx, conv, notifications } = harness();
    ctx.saveMode = 'hold';
    const stamp = ctx.getMvuContextStamp(conv);
    let checks = 0;
    const saving = ctx.replaceMvuDataForMessage(conv, 'main', envelope(40), { expectedStamp: stamp, validate: () => { checks++; return true; } });
    await turn();
    assert.equal(hp(ctx, conv), 8);
    assert.equal(Object.hasOwn(conv.messages[0], 'mvuManualData'), false);
    assert.equal(notifications.length, 0);
    assert.equal(ctx.durable.conversations.a.messages[0].mvuManualData.stat_data.hp, 40);
    await assert.rejects(ctx.replaceMvuDataForMessage(conv, 'main', envelope(50)), /正在保存/);
    ctx.state.conversations.b = { id: 'b', messages: [{ id: 'bu', role: 'user', content: 'other chat' }], summaries: [] };
    ctx.state.conversationOrder.push('b');
    const laterSave = ctx.persistState(true);
    ctx.saveMode = 'ok';
    ctx.resolveSave();
    const saved = await saving;
    await laterSave;
    assert.equal(saved.stat_data.hp, 40);
    assert.equal(hp(ctx, conv), 40);
    assert.ok(checks >= 3);
    assert.equal(ctx.durable.conversations.a.messages[0].mvuManualData.stat_data.hp, 40);
    assert.equal(ctx.durable.conversations.b.messages[0].content, 'other chat');
    assert.equal(notifications.length, 1);
    await flush(ctx);
}

for (const mode of ['fail', 'refused']) {
    const { ctx, conv, notifications } = harness();
    const before = copy(conv);
    ctx.saveMode = mode;
    await assert.rejects(ctx.replaceMvuDataForMessage(conv, 'main', envelope(40)));
    assert.deepEqual(copy(conv), before);
    assert.equal(hp(ctx, conv), 8);
    assert.equal(notifications.length, 0);
    assert.equal(conv._messageCommitInProgress, undefined);
    await flush(ctx);
}

// A storage result can already be durable before source changes or revocation reject its ACK.
for (const change of ['revoked', 'body', 'version', 'initial', 'removed', 'replaced']) {
    const { ctx, conv, notifications } = harness();
    let permitted = true;
    ctx.saveMode = 'hold';
    const saving = ctx.replaceMvuDataForMessage(conv, 'main', envelope(40), { expectedStamp: ctx.getMvuContextStamp(conv), validate: () => permitted });
    const rejected = assert.rejects(saving);
    await turn();
    ctx.state.conversations.b = { id: 'b', messages: [{ id: 'bu', role: 'user', content: 'new chat' }], summaries: [] };
    ctx.state.conversationOrder.push('b');
    if (change === 'revoked') permitted = false;
    if (change === 'body') conv.messages[0].content = delta(-1);
    if (change === 'version') conv.messages[0].selectedResponseVersionId = 'other';
    if (change === 'initial') conv.mvu.initial.stat_data.hp = 20;
    if (change === 'removed') { delete ctx.state.conversations.a; ctx.state.conversationOrder = ['b']; ctx.state.activeConvId = 'b'; }
    if (change === 'replaced') ctx.state.conversations.a = { ...copy(conv), updated: 999 };
    const laterSave = ctx.persistState(true);
    ctx.saveMode = 'ok';
    ctx.resolveSave();
    await rejected;
    await laterSave;
    assert.equal(notifications.length, 0);
    assert.equal(Object.hasOwn(conv.messages[0], 'mvuManualData'), false);
    assert.equal(ctx.durable.conversations.b.messages[0].content, 'new chat');
    if (change === 'removed') assert.equal(Object.hasOwn(ctx.durable.conversations, 'a'), false);
    else assert.equal(Object.hasOwn(ctx.durable.conversations.a.messages[0], 'mvuManualData'), false);
    await flush(ctx);
}

// Writes to selected versions update their stored body record in the same acknowledged candidate.
{
    const { ctx, conv } = harness();
    const version = ctx.captureResponseVersion(conv, conv.messages[0]);
    ctx.bindMvuResponseVersion(conv, conv.messages[0], version);
    conv.messages[0].responseVersions = [version];
    conv.messages[0].selectedResponseVersionId = version.id;
    await ctx.replaceMvuDataForMessage(conv, 'main', envelope(60));
    assert.equal(conv.messages[0].mvuManualVersionId, version.id);
    assert.equal(conv.messages[0].responseVersions[0].message.mvuManualVersionId, version.id);
    assert.equal(conv.messages[0].responseVersions[0].message.mvuManualData.stat_data.hp, 60);
    assert.equal(ctx.mvuResponseVersionMatches(conv.messages[0], conv.messages[0].responseVersions[0]), true);
    const restored = copy(conv);
    restored.id = 'restored-copy';
    ctx.ensureConversationMvu(restored);
    assert.equal(hp(ctx, restored), 60);
    assert.equal(Object.keys(restored).some((key) => /cache|diagnostic/i.test(key)), false);
    await flush(ctx);
}

// More than one checkpoint still produces the same state after clearing the bounded cache.
{
    const { ctx, conv } = harness(Array.from({ length: 240 }, (_, index) => ({ id: `m${index}`, role: 'assistant', content: delta(1) })));
    assert.equal(hp(ctx, conv, 'm120'), 131);
    assert.equal(hp(ctx, conv), 250);
    ctx.clearMvuRuntimeCache(conv);
    assert.equal(hp(ctx, conv, 'm120'), 131);
    assert.equal(hp(ctx, conv), 250);
}

// New chats publish their opening, MVU, active id and view only after ACK; later queued chats survive.
{
    const { ctx, conv, events, alerts } = lifecycle();
    const before = copy(conv);
    ctx.saveMode = 'hold';
    const saving = ctx.newConversation({ name: 'B', first_mes: '<initvar>{"hp":22}</initvar>HP={{getvar::hp}}' + delta(-3), extensions: { mvu: { initvar: '{"hp":20}' } } });
    await turn();
    assert.deepEqual(copy(conv), before);
    assert.equal(ctx.state.activeConvId, 'a');
    assert.deepEqual(Object.keys(ctx.state.conversations), ['a']);
    assert.equal(ctx.currentCharacterName, 'A');
    assert.equal(events.length, 0);
    assert.equal(ctx.storageReplacementActive, 1);
    assert.throws(() => ctx.beginStorageReplacement(), /正在进行/);
    assert.equal(await ctx.newConversation({ name: 'C' }), null, 'A second creation cannot enter a competing storage replacement.');
    const createdId = ctx.durable.activeConvId;
    assert.ok(ctx.durable.conversations[createdId].messages[0].content.includes('HP=22'));
    ctx.state.conversations.z = { id: 'z', messages: [], summaries: [] };
    ctx.state.conversationOrder.push('z');
    const later = ctx.persistState(true);
    ctx.saveMode = 'ok'; ctx.resolveSave();
    const created = await saving;
    await later;
    assert.equal(created.id, createdId);
    assert.equal(ctx.state.activeConvId, createdId);
    assert.equal(hp(ctx, created), 19);
    assert.equal(ctx.durable.conversations[createdId].mvu.current.stat_data.hp, 19);
    assert.ok(Object.hasOwn(ctx.durable.conversations, 'z'));
    assert.ok(events.includes('view'));
    assert.equal(alerts.length, 1);
    assert.equal(ctx.storageReplacementActive, 0);
    await flush(ctx);
}

for (const mode of ['fail', 'refused']) {
    const { ctx, conv, events } = lifecycle();
    const before = copy(ctx.state);
    ctx.saveMode = mode;
    assert.equal(await ctx.newConversation({ name: 'B', first_mes: '<initvar>{"hp":22}</initvar>' }), null);
    assert.deepEqual(copy(ctx.state), before);
    assert.equal(hp(ctx, conv), 10);
    assert.equal(events.length, 0);
    assert.equal(ctx.storageReplacementActive, 0);
    await flush(ctx);
}

// Import builds the character, embedded lore and opening together without registering any candidate early.
for (const populated of [false, true]) {
    const { ctx, conv, importCard, events } = lifecycle(populated ? [{ id: 'u', role: 'user', content: 'keep me' }] : []);
    const before = copy(ctx.state);
    ctx.saveMode = 'hold';
    const saving = importCard();
    await turn();
    assert.deepEqual(copy(ctx.state), before);
    assert.equal(events.length, 0);
    assert.equal(ctx.dom.importModal.classList.contains('hidden'), false);
    const importedId = ctx.durable.activeConvId;
    const linked = ctx.durable.conversations[importedId].worldBookIds[0];
    assert.ok(ctx.durable.worldBooks[linked]);
    ctx.saveMode = 'ok'; ctx.resolveSave();
    await saving;
    const imported = ctx.state.conversations[importedId];
    assert.equal(hp(ctx, imported), 25);
    assert.equal(imported.mvu.current.stat_data.lore, true);
    assert.ok(imported.messages[0].content.includes('HP=25'));
    assert.ok(Object.hasOwn(ctx.state.worldBooks, linked));
    assert.notEqual(ctx.state.characters.imported, imported.character);
    assert.equal(imported.character.extensions.unknown.retained, true);
    if (populated) assert.equal(ctx.state.conversations.a, conv);
    else assert.notEqual(ctx.state.conversations.a, conv);
    assert.equal(ctx.dom.importModal.classList.contains('hidden'), true);
    assert.ok(events.includes('all'));
    await flush(ctx);
}

for (const mode of ['fail', 'refused']) {
    const { ctx, importCard, events } = lifecycle();
    const before = copy(ctx.state);
    ctx.saveMode = mode;
    await importCard();
    assert.deepEqual(copy(ctx.state), before);
    assert.equal(events.length, 0);
    assert.equal(ctx.dom.importModal.classList.contains('hidden'), false);
    assert.ok(ctx.dom.importStatus.textContent.includes('import_error'));
    assert.equal(ctx.storageReplacementActive, 0);
    await flush(ctx);
}

// The editor owns copies of extension bags and greetings until ACK; existing version baselines survive edits.
for (const seed of [true, false]) {
    const { ctx, conv, editor, events } = lifecycle(seed ? [] : [{ id: 'main', role: 'assistant', content: delta(-2) }]);
    conv.character.name = seed ? 'Unnamed' : 'Existing';
    conv.character.extensions.depth = 1;
    ctx.readDepthPromptEditor = (character) => { character.extensions.depth = 3; };
    editor();
    const before = copy(ctx.state);
    ctx.saveMode = 'hold';
    const saving = ctx.saveCharacterEdits();
    await turn();
    assert.deepEqual(copy(ctx.state), before);
    assert.equal(events.length, 0);
    assert.equal(ctx.dom.charEditorModal.classList.contains('hidden'), false);
    ctx.saveMode = 'ok'; ctx.resolveSave();
    assert.equal(await saving, true);
    const edited = ctx.getActiveConv();
    assert.equal(edited.character.extensions.depth, 3);
    assert.equal(conv.character.extensions.depth, 1);
    assert.equal(hp(ctx, edited), seed ? 33 : 8);
    assert.equal(edited.mvu.initial.stat_data.hp, seed ? 33 : 10);
    assert.equal(ctx.dom.charEditorModal.classList.contains('hidden'), true);
    assert.equal(ctx.state.characters.editor.name, 'Editor');
    assert.ok(events.includes('messages'));
    await flush(ctx);
}

{
    const { ctx, conv, editor, events } = lifecycle();
    conv.character.name = 'Unnamed';
    ctx.readDepthPromptEditor = (character) => { character.extensions.depth = 3; };
    editor();
    const before = copy(ctx.state);
    ctx.saveMode = 'fail';
    assert.equal(await ctx.saveCharacterEdits(), false);
    assert.deepEqual(copy(ctx.state), before);
    assert.equal(events.length, 0);
    assert.equal(ctx.dom.charEditorModal.classList.contains('hidden'), false);
    await flush(ctx);
}

// Startup migration stays invisible until its actual message-write ACK, with character-source rejection.
for (const mode of ['ok', 'fail', 'character-changed']) {
    const { ctx, conv, events } = lifecycle();
    conv.character.first_mes = '<initvar>{"hp":44}</initvar>HP={{getvar::hp}}';
    const before = copy(conv);
    ctx.saveMode = 'hold';
    const saving = ctx.migrateActiveConversationFirstMessage();
    await turn();
    assert.deepEqual(copy(conv), before);
    assert.equal(events.length, 0);
    if (mode === 'character-changed') conv.character.first_mes = 'changed while waiting';
    ctx.saveMode = 'ok';
    if (mode === 'fail') ctx.rejectSave(new Error('startup failure'));
    else ctx.resolveSave();
    assert.equal(await saving, mode === 'ok');
    if (mode === 'ok') {
        assert.ok(conv.messages[0].content.includes('HP=44'));
        assert.equal(hp(ctx, conv), 44);
        assert.ok(events.includes('all'));
    } else {
        assert.equal(conv.messages.length, 0);
        assert.equal(events.length, 0);
        if (mode === 'character-changed') assert.equal(ctx.durable.conversations.a.character.first_mes, 'changed while waiting');
    }
    assert.equal(conv._messageCommitInProgress, undefined);
    await flush(ctx);
}

// A late import ACK cannot replace a changed active chat, library record, root or newly occupied book id.
for (const change of ['source', 'active', 'library', 'root', 'book-id']) {
    const { ctx, conv, importCard, events } = lifecycle();
    ctx.saveMode = 'hold';
    const saving = importCard();
    await turn();
    const bookId = ctx.durable.conversations.a.worldBookIds[0];
    ctx.state.conversations.z = { id: 'z', messages: [], summaries: [] };
    ctx.state.conversationOrder.push('z');
    if (change === 'source') conv.messages.push({ id: 'u', role: 'user', content: 'arrived while waiting' });
    if (change === 'active') ctx.state.activeConvId = 'z';
    if (change === 'library') ctx.state.characters.imported = { name: 'keep library' };
    if (change === 'root') ctx.state.conversations = copy(ctx.state.conversations);
    if (change === 'book-id') ctx.state.worldBooks[bookId] = { id: bookId, name: 'keep book', entries: {} };
    const current = copy(ctx.state);
    const later = ctx.persistState(true);
    ctx.saveMode = 'ok'; ctx.resolveSave();
    await saving; await later;
    assert.deepEqual(copy(ctx.state), current);
    assert.equal(events.length, 0);
    assert.equal(ctx.dom.importModal.classList.contains('hidden'), false);
    assert.ok(Object.hasOwn(ctx.durable.conversations, 'z'));
    assert.equal(ctx.durable.conversations.a.character.name, 'A');
    if (change === 'library') assert.equal(ctx.durable.characters.imported.name, 'keep library');
    if (change === 'book-id') assert.equal(ctx.durable.worldBooks[bookId].name, 'keep book');
    assert.equal(conv._messageCommitInProgress, undefined);
    assert.equal(ctx.storageReplacementActive, 0);
    await flush(ctx);
}

// External names become own map entries rather than prototype setters; no backup/cloud race bypasses the lock.
{
    const { ctx, importCard, card } = lifecycle();
    card.data.name = '__proto__';
    await importCard(card);
    assert.equal(Object.hasOwn(ctx.state.characters, '__proto__'), true);
    assert.equal(Object.getPrototypeOf(ctx.state.characters).name, undefined);
    assert.equal(ctx.getActiveConv().character.name, '__proto__');
    await flush(ctx);
}
for (const guard of ['backup', 'cloud']) {
    const { ctx, events } = lifecycle();
    if (guard === 'backup') ctx.backupRestorePending = true;
    else ctx.cloudSyncActiveOperations = 1;
    const before = copy(ctx.state);
    assert.equal(await ctx.newConversation({ name: 'B', first_mes: 'hi' }), null);
    assert.deepEqual(copy(ctx.state), before);
    assert.equal(events.length, 0);
    assert.equal(ctx.storageReplacementActive, 0);
    await flush(ctx);
}

console.log('MVU runtime tests passed: initial sources, pure replay, version/manual binding, bounded cache, real ACK queues and reliable new/import/editor/startup lifecycle races.');
