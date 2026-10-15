import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { Worker as NodeWorker } from 'node:worker_threads';

const source = name => fs.readFileSync(new URL('../src/app/' + name, import.meta.url), 'utf8');
const copy = value => JSON.parse(JSON.stringify(value));
const workerSource = fs.readFileSync(new URL('../assets/js/regex-worker.js', import.meta.url), 'utf8');
class BrowserWorker {
    constructor() {
        this.worker = new NodeWorker(`const { parentPort } = require('node:worker_threads'); const self = { postMessage: data => parentPort.postMessage(data) }; ${workerSource}; parentPort.on('message', data => self.onmessage({ data }));`, { eval: true });
        this.worker.on('message', data => this.onmessage?.({ data }));
        this.worker.on('error', error => this.onerror?.(error));
    }
    postMessage(data) { this.worker.postMessage(data); }
    terminate() { this.worker.terminate(); }
}
let id = 0, captured;
const conv = { id: 'test', character: { name: 'Alice', extensions: { keep: true } }, messages: [{ role: 'user', content: 'hello' }, { role: 'assistant', content: 'world' }], summaries: [], worldBookIds: [] };
const context = { console, setTimeout, clearTimeout, URL, AbortController, Worker: BrowserWorker, document: { baseURI: 'http://local.test/' }, DEFAULT_TWO_STAGE_PROMPT: 'options',
    state: { settings: {}, conversations: { test: conv }, conversationOrder: ['test'], activeConvId: 'test', worldBooks: {}, characters: {} },
    makeId: () => 'id-' + ++id, getActiveConv: () => conv, t: key => key,
    persistState() {}, renderSillyTavernPresetSettings() {}, renderTokenBar() {}, appStore: { notify() {} },
    fetch: async (url, options) => { captured = JSON.parse(options.body); return { ok: true, json: async () => ({ choices: [] }) }; }
};
// 复用单个健康 Worker 后，正常任务不再终止实例：测试主体用 finally 显式清理，避免 Node 事件循环被真实 worker_threads 挂住。
try {
vm.createContext(context);
const manifest = JSON.parse(fs.readFileSync(new URL('../src/app/manifest.json', import.meta.url), 'utf8'));
const files = manifest.filter(name => /^32-/.test(name.split("/").pop()) || /^41-/.test(name.split("/").pop()) || /^42-/.test(name.split("/").pop()) || /^44-/.test(name.split("/").pop()) || /^62-sillytavern-preset-(?:model|normalizer|prompt-normalizer|order|placement|runtime)/.test(name.split("/").pop()));
for (const file of ['state/30-state-default-settings.js', 'api/31-api-endpoint-normalizer.js', 'api/31-api-ollama-compat.js', ...manifest.filter(name => /^mvu\/40-/.test(name)), 'prompt/40-sillytavern-macro-runtime.js', 'prompt/40-character-prompt-helpers.js', 'prompt/40-character-regex-runtime.js', 'prompt/40-regex-worker-runtime.js', ...files, 'presets/62-preset-library.js', 'generation/50-generation-cot-utils.js', 'generation/50-generation-usage.js', 'generation/50-generation-api-request.js', 'generation/50-generation-stream-state.js', 'generation/50-generation-transport-module.js', 'generation/50-generation-response-stream.js', 'generation/50-request-diagnostics.js', 'summary/53-summary-default-prompts.js', 'summary/53-summary-prompt-limits.js', 'summary/53-summary-prompt-builder.js', 'summary/53-summary-api-client.js', 'sync/19-cloud-sync-settings-policy.js']) {
    vm.runInContext(source(file), context, { filename: file });
}
context.state.settings = context.defaultSettings();
const legacy = { name: 'old', prompts: [{ id: 'p', identifier: 'p', name: 'P', content: 'preset', role: 'system', enabled: true, order: 0, extension: { kept: 1 } }], promptOrder: [{ identifier: 'p', enabled: false }], regexScripts: [], metadata: { kept: 2 } };
context.state.settings.sillyTavernPreset = copy(legacy);
const library = context.ensurePresetLibrary();
assert.equal(library.length, 1);
assert.equal(library[0].metadata.kept, 2);
assert.equal(context.ensurePresetLibrary()[0].id, library[0].id, 'Legacy migration must be idempotent.');
context.ensureSillyTavernPresetSettings();
assert.equal(library[0].prompts[0].extension.kept, 1);
assert.equal(context.buildSillyTavernPresetMessageBuckets('Alice', 'User').beforeHistory.length, 0, 'A disabled order item must not return through fallback.');
context.addLibraryPreset({ ...context.defaultSillyTavernPreset(), name: 'second', prompts: [{ id: 'q', name: 'Q', content: 'selected', role: 'system', position: 'before_history', depth: 0 }] });
assert.equal(context.state.settings.sillyTavernPreset.name, 'second');
context.removeLibraryPreset(context.state.settings.activePresetId);
assert.equal(context.state.settings.sillyTavernPreset.name, 'old');
const orderedPreset = { prompts: [{ id: 'a', name: 'A', role: 'system', content: 'A' }, { id: 'b', name: 'B', role: 'system', content: 'B' }], promptOrder: [{ identifier: 'a', enabled: true, kept: 1, order: 0 }, { identifier: 'chat_history', kept: 2, order: 1 }, { identifier: 'b', enabled: false, kept: 3, order: 2 }], regexScripts: [], id: 'ordered' };
context.moveLibraryPrompt(orderedPreset, orderedPreset.prompts[1], -1);
assert.deepEqual(copy(orderedPreset.promptOrder.map(item => [item.identifier, item.kept, item.enabled])), [['b', 3, false], ['chat_history', 2, null], ['a', 1, true]]);
const importedLibrary = context.importPresetLibraryData({ type: 'opentavern-preset-library', activePresetId: 'ordered', presets: [context.defaultSillyTavernPreset(), orderedPreset] });
assert.equal(importedLibrary.activePresetId, importedLibrary[1].id, 'Whole-library import must preserve selection through ID remapping.');
context.addLibraryPreset(context.normalizeSillyTavernPreset({ name: 'roundtrip', temperature: 0.7, extensions: { custom: true }, prompts: [{ identifier: 'rt', name: 'RT', content: 'content', metadata: { kept: 4 } }] }));
vm.runInContext(source('presets/62-sillytavern-preset-export-ui.js'), context);
let exportedPreset;
context.downloadJsonFile = data => { exportedPreset = copy(data); };
context.exportSillyTavernPreset();
assert.equal(exportedPreset.temperature, 0.7);
assert.equal(exportedPreset.extensions.custom, true);
assert.equal(exportedPreset.prompts[0].metadata.kept, 4);
context.removeLibraryPreset(context.state.settings.activePresetId);

context.state.settings.systemPrompt = 'system';
context.normalizeConversation(conv);
const baseline = copy(context.buildMessagesForAPI(conv));
assert.deepEqual(copy(await context.buildMessagesForAPIAsync(conv)), baseline, 'Disabled M2 controls must preserve the default request messages.');
conv.stLocalVars = { previewCounter: 0 };
context.state.settings.systemPrompt = '{{incvar::previewCounter}}';
delete conv._wiCache;
const beforePreview = JSON.stringify(conv);
const preview = await context.buildMessagesForAPIAsync(conv, { preview: true });
assert.equal(preview[0].content, '1');
assert.equal(JSON.stringify(conv), beforePreview, 'Preview must not mutate macro variables, summaries, identity, or WI effects.');
await context.buildMessagesForAPIAsync(conv);
assert.equal(conv.stLocalVars.previewCounter, 1, 'One real build applies macros once.');

context.state.settings.systemPrompt = 'system';
context.state.settings.authorNote = { enabled: true, content: 'note', role: 'system', position: 'in_chat', depth: 0, interval: 2 };
conv.character.extensions.depth_prompt = { prompt: 'depth', depth: 0, role: 2, custom: true };
let messages = await context.buildMessagesForAPIAsync(conv);
assert.equal(messages.at(-2).content, 'note');
assert.equal(messages.at(-1).content, 'depth');
assert.equal(messages.at(-1).role, 'assistant');
conv.authorNoteOverride = { ...context.state.settings.authorNote, enabled: false };
messages = await context.buildMessagesForAPIAsync(conv);
assert.ok(!messages.some(message => message.content === 'note'));
delete conv.authorNoteOverride;
conv.messages.push({ role: 'user', content: 'odd interval' });
messages = await context.buildMessagesForAPIAsync(conv);
assert.ok(!messages.some(message => message.content === 'note'));
assert.throws(() => context.validateAuthorNote({ ...context.state.settings.authorNote, interval: 0 }), /间隔/);
assert.throws(() => context.validatePresetPrompt({ name: 'x', role: 'bad', position: 'in_chat', depth: 4 }), /角色/);

context.state.worldBooks.book = { entries: { a: { uid: 1, key: ['never'], content: 'constant', constant: false, disable: false }, b: { uid: 2, key: ['never'], content: 'disabled', disable: true } } };
conv.worldBookIds = ['book']; conv.worldBookMode = 'constant';
const originalBook = JSON.stringify(context.state.worldBooks.book);
const entries = context.collectWorldInfoActivationEntries(conv);
assert.equal(entries[0].constant, true);
assert.equal(JSON.stringify(context.state.worldBooks.book), originalBook, 'Overrides must not change shared books.');
const activation = context.getActivatedWorldInfo(conv);
assert.ok(activation.entries.some(entry => entry.content === 'constant'));
assert.ok(!activation.entries.some(entry => entry.content === 'disabled'));
const other = { ...conv, worldBookMode: 'off' };
assert.equal(context.collectWorldInfoActivationEntries(other).length, 0);
const cacheKey = context.buildWorldInfoActivationCacheKey(conv, { entries: { a: entries[0] } });
assert.notEqual(cacheKey, context.buildWorldInfoActivationCacheKey({ ...conv, worldBookMode: 'default' }, { entries: { a: entries[0] } }));
const scan = [];
context.appendWorldBookCharacterScanSources(scan, conv.character, { matchCharacterDepthPrompt: true });
assert.ok(scan[0].includes('depth'));

const raw = [{ role: 'system', content: 'A' }, { role: 'system', content: 'B' }, { role: 'user', content: 'C' }, { role: 'system', content: 'D' }, { role: 'assistant', content: 'E' }];
assert.deepEqual(copy(context.postProcessPromptMessages(raw, 'raw', '')), raw);
assert.deepEqual(copy(context.postProcessPromptMessages(raw, 'merge', '')), [{ role: 'system', content: 'A\n\nB' }, ...raw.slice(2)]);
assert.deepEqual(copy(context.postProcessPromptMessages(raw, 'system_to_user', '')), [{ role: 'system', content: 'A\n\nB' }, { role: 'user', content: 'C\n\nD' }, { role: 'assistant', content: 'E' }]);
assert.equal(context.postProcessPromptMessages(raw, 'user_last', '').at(-1).role, 'user');
assert.deepEqual(copy(context.postProcessPromptMessages(raw, 'auto', 'http://localhost:11434')), copy(context.normalizeMessagesForOllamaCompatibility(raw)));

const settings = context.state.settings;
let payload = context.buildChatCompletionPayload(settings, raw, {});
assert.ok(!Object.hasOwn(payload, 'reasoning_effort') && !Object.hasOwn(payload, 'thinking'));
settings.reasoningEffort = 'high'; settings.thinking = { type: 'disabled' };
payload = context.buildChatCompletionPayload(settings, raw, { stream: false });
assert.equal(payload.reasoning_effort, 'high'); assert.equal(payload.thinking.type, 'disabled');
settings.summaryTemperature = 0.6; settings.summaryReasoningEffort = 'low'; settings.summaryThinking = { type: 'enabled' };
await context.requestSummaryCompletion('https://example.test', 'secret', 'summary', raw, 128);
assert.equal(captured.temperature, 0.6); assert.equal(captured.reasoning_effort, 'low'); assert.equal(captured.thinking.type, 'enabled');
settings.summaryPromptMode = 'relaxed'; settings.summaryPrompt = 'custom';
assert.equal(context.buildSummaryPromptConfig(settings).prompt, 'custom');
settings.summaryPrompt = '';
assert.ok(context.buildSummaryPromptConfig(settings).prompt.includes('只整理对话'));
const diagnostic = context.captureRequestDiagnostic(payload, raw, { conversation: conv });
assert.deepEqual(copy(diagnostic.payload), copy(payload));
assert.ok(!JSON.stringify(diagnostic).includes('secret'));
assert.ok(!JSON.stringify(context.getCloudSyncPortableSettings(settings)).includes('recentRequestDiagnostics'));

const rule = (findRegex, replaceString) => ({ findRegex, replaceString, placement: [2], flags: 'g' });
settings.globalRegexEnabled = true; settings.globalRegexScripts = [rule('x', 'y')];
settings.sillyTavernPreset.regexScriptsEnabled = true; settings.sillyTavernPreset.regexScripts = [rule('y', 'z')];
const character = { name: 'Alice', regexScriptsEnabled: true, regexScriptsPromptEnabled: true, extensions: { regex_scripts: [rule('z', 'done')] } };
assert.equal(await context.applyRegexScriptsAsync('x', character, { sourcePlacement: 'AI_OUTPUT', processingPhase: 'prompt' }), 'done');
settings.globalRegexEnabled = false; settings.sillyTavernPreset.regexScriptsEnabled = false;
character.extensions.regex_scripts = [rule('/\\[(.*?)\\]/g', '$1')];
assert.equal(await context.applyRegexScriptsAsync('[value]', character, { sourcePlacement: 'AI_OUTPUT', processingPhase: 'display' }), 'value');
assert.throws(() => context.validateRegexScript({ ...rule('x', 'y'), flags: 'gz' }), /标志/);
assert.throws(() => context.validateRegexScript({ ...rule('(', 'y') }), /模式/);
assert.throws(() => context.validateRegexScript({ ...rule('x', 'y'), minDepth: 4, maxDepth: 2 }), /最小深度/);
assert.throws(() => context.importPresetLibraryData({ type: 'opentavern-preset-library', presets: [null] }), /预设格式/);
character.extensions.regex_scripts = [rule('(a+)+$', '')];
let ticks = 0;
const timer = setInterval(() => ticks++, 10);
try { await assert.rejects(context.applyRegexScriptsAsync('a'.repeat(5000) + '!', character, { sourcePlacement: 'AI_OUTPUT', processingPhase: 'prompt' }), /500ms/); }
finally { clearInterval(timer); }
assert.ok(ticks > 5, 'Catastrophic backtracking must leave the host event loop responsive.');
vm.runInContext(source('generation/50-generation-integrations.js'), context);
vm.runInContext(source('generation/52-generation-message-lifecycle.js'), context);

function deferred() {
    let resolve, reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}
async function waitFor(predicate, message) {
    for (let i = 0; i < 100 && !predicate(); i++) await new Promise(resolve => setTimeout(resolve, 0));
    assert.ok(predicate(), message);
}
function createPromptConversation(id, content, vars) {
    const target = { id, character: { name: 'Alice', extensions: {} }, messages: [{ role: 'user', content }], summaries: [], worldBookIds: [], stLocalVars: { ...vars } };
    context.state.conversations[id] = target;
    if (!context.state.conversationOrder.includes(id)) context.state.conversationOrder.push(id);
    return target;
}

const realFormatMessageAsync = context.formatMessageAsync;
const formatWaits = [];
const formatErrors = [];
context.formatMessageAsync = async (text, formatContext) => {
    const wait = formatWaits.find(item => !item.claimed && String(text).includes(item.marker));
    if (wait) {
        wait.claimed = true;
        wait.started.resolve();
        await wait.release.promise;
    }
    try {
        return await realFormatMessageAsync(text, formatContext);
    } catch (error) {
        formatErrors.push({ text: String(text), error });
        throw error;
    }
};
function pauseNextFormat(marker) {
    const started = deferred(), release = deferred();
    const wait = { marker, started, release, claimed: false };
    formatWaits.push(wait);
    return { started: started.promise, release: () => release.resolve(), claimed: () => wait.claimed };
}

let requestCount = 0;
let requestBodies = [];
let fetchMode = 'ok';
context.fetch = async (url, options) => {
    requestCount++;
    requestBodies.push(JSON.parse(options.body));
    if (fetchMode === 'abort') {
        return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
        }));
    }
    return { ok: true, json: async () => ({ choices: [{ message: { content: 'ok' } }] }) };
};
context.getActiveConv = () => context.state.conversations[context.state.activeConvId];
Object.assign(context.state.settings, {
    apiEndpoint: 'https://example.test/v1/chat/completions', apiKey: 'test-key', model: 'mock-model',
    streamEnabled: false, summaryEnabled: false, globalRegexEnabled: false,
    sillyTavernPreset: { ...context.state.settings.sillyTavernPreset, regexScriptsEnabled: false }
});

function runStream(target) {
    const events = { completed: 0, errors: 0, interrupted: 0, errorMessage: '' };
    let resolveTerminal, rejectTerminal;
    const terminal = new Promise((resolve, reject) => { resolveTerminal = resolve; rejectTerminal = reject; });
    const promise = context.streamChat(() => {}, (a, b, c, result) => {
        events.completed++;
        if (result && result.interrupted) events.interrupted++;
        resolveTerminal(events);
    }, error => {
        events.errors++;
        events.errorMessage = String(error && error.message || error);
        rejectTerminal(error);
    }, target);
    return { events, promise, terminal };
}

const cancelConv = createPromptConversation('cancel', 'UNIQUE_CANCEL_INPUT', { auditStopped: 'initial' });
context.state.activeConvId = cancelConv.id;
context.state.settings.systemPrompt = '{{setvar::auditStopped::from_cancelled_build}}';
const cancelWait = pauseNextFormat('UNIQUE_CANCEL_INPUT');
const cancelRun = runStream(cancelConv);
await cancelWait.started;
assert.ok(context.state._promptBuildPendingSequence, 'The cancelled build must expose its pending sequence.');
context.stopGeneration();
cancelConv.stLocalVars.auditStopped = 'user_change_after_stop';
cancelWait.release();
await cancelRun.promise;
assert.equal(requestCount, 0, 'Stop during prompt build must prevent the model request.');
assert.equal(cancelConv.stLocalVars.auditStopped, 'user_change_after_stop', 'A cancelled build must not overwrite a later variable change.');
assert.equal(cancelRun.events.interrupted, 1, 'Cancellation during prompt build keeps the interrupted callback semantics.');

const raceConv = createPromptConversation('race', 'UNIQUE_A_INPUT', { race: 'initial' });
context.state.activeConvId = raceConv.id;
context.state.settings.systemPrompt = '{{setvar::race::from_A}}';
const waitA = pauseNextFormat('UNIQUE_A_INPUT');
const runA = runStream(raceConv);
await waitA.started;
context.stopGeneration();
raceConv.messages[0].content = 'UNIQUE_B_INPUT';
context.state.settings.systemPrompt = '{{setvar::race::from_B}}';
const waitB = pauseNextFormat('UNIQUE_B_INPUT');
const runB = runStream(raceConv);
await waitB.started;
const pendingB = context.state._promptBuildPendingSequence;
waitA.release();
await runA.promise;
assert.equal(context.state._promptBuildPendingSequence, pendingB, 'A late build must not clear the new pending sequence.');
assert.equal(raceConv.stLocalVars.race, 'initial', 'A late build must not overwrite the newer build state.');
assert.equal(context.state.isGenerating, true, 'A late build must not release the new generation state.');
waitB.release();
await runB.terminal;
await runB.promise;
assert.equal(requestCount, 1, 'Only the current build may request the model.');
assert.equal(raceConv.stLocalVars.race, 'from_B');
assert.equal(runA.events.completed + runA.events.errors, 0, 'An obsolete build must not settle the new operation callbacks.');
assert.equal(runB.events.completed, 1);

const worldConv = createPromptConversation('world', 'WORLD_GATE', { worldVar: 'initial' });
context.state.activeConvId = worldConv.id;
context.state.worldBooks.book = { entries: {
    one: { uid: 1, key: ['never'], content: 'WB_ONE {{setvar::worldVar::from_build}}', constant: true, disable: false, position: 'before_char' },
    two: { uid: 2, key: ['never'], content: 'WB_TWO', constant: true, disable: false, position: 'before_char' }
} };
worldConv.worldBookIds = ['book'];
delete worldConv._wiCache;
context.state.settings.systemPrompt = 'system';
const worldOne = pauseNextFormat('WB_ONE');
const worldTwo = pauseNextFormat('WB_TWO');
const worldRun = runStream(worldConv);
await worldOne.started;
context.stopGeneration();
worldOne.release();
worldTwo.release();
await worldRun.promise;
assert.equal(requestCount, 1, 'A stopped multi-entry world-book build must not request the model.');
assert.equal(worldConv.stLocalVars.worldVar, 'initial', 'A stopped world-book build must not commit macro variables.');
assert.equal(worldTwo.claimed(), false, 'A stopped build must not advance to the next world-book format.');

const conflictConv = createPromptConversation('conflict', 'CONFLICT_GATE', { conflict: 'initial', stable: 'initial' });
context.state.activeConvId = conflictConv.id;
context.state.settings.systemPrompt = '{{setvar::conflict::from_build}}{{setvar::stable::from_build}}';
const conflictWait = pauseNextFormat('CONFLICT_GATE');
const beforeConflictRequests = requestCount;
const conflictRun = runStream(conflictConv);
await conflictWait.started;
conflictConv.stLocalVars.conflict = 'external_change';
conflictWait.release();
await conflictRun.promise;
assert.equal(conflictConv.stLocalVars.conflict, 'external_change', 'A legal external variable change must win over the old snapshot.');
assert.equal(conflictConv.stLocalVars.stable, 'initial', 'Macro changes are atomic: a conflict must not leave other candidate writes behind.');
assert.equal(requestCount, beforeConflictRequests + 1, 'A non-conflicting operation may still send its candidate prompt.');

for (const mode of ['delete', 'replace']) {
    const targetConv = createPromptConversation(mode, mode.toUpperCase() + '_GATE', { targetVar: 'initial' });
    context.state.activeConvId = targetConv.id;
    context.state.settings.systemPrompt = '{{setvar::targetVar::from_build}}';
    const targetWait = pauseNextFormat(mode.toUpperCase() + '_GATE');
    const targetRun = runStream(targetConv);
    await targetWait.started;
    if (mode === 'delete') delete context.state.conversations[targetConv.id];
    else context.state.conversations[targetConv.id] = { id: targetConv.id, messages: [], stLocalVars: {} };
    targetWait.release();
    await targetRun.promise;
    assert.equal(requestCount, beforeConflictRequests + 1, 'A deleted or replaced target must not request the model.');
    assert.equal(targetConv.stLocalVars.targetVar, 'initial', 'A deleted or replaced target must not receive a late macro commit.');
    assert.equal(context.state.conversations[targetConv.id] === targetConv, false, 'A late build must not revive or replace its old target.');
}

const originalConv = createPromptConversation('switch-original', 'SWITCH_GATE', { switchVar: 'initial' });
const otherConv = createPromptConversation('switch-other', 'other', { otherVar: 'initial' });
context.state.activeConvId = originalConv.id;
context.state.settings.systemPrompt = '{{setvar::switchVar::from_original}}';
const switchWait = pauseNextFormat('SWITCH_GATE');
const switchRun = runStream(undefined);
await switchWait.started;
context.state.activeConvId = otherConv.id;
switchWait.release();
await switchRun.promise;
assert.equal(originalConv.stLocalVars.switchVar, 'from_original', 'A prompt build remains bound to its original valid conversation.');
assert.equal(otherConv.stLocalVars.otherVar, 'initial', 'Switching the active conversation must not pollute the new conversation.');
assert.equal(context.recentRequestDiagnostics.at(-1).conversationId, originalConv.id);

context.state.settings.systemPrompt = '{{incvar::syncCounter}}';
const syncConv = createPromptConversation('sync', 'SYNC', { syncCounter: 2, setVar: 'initial' });
context.state.activeConvId = syncConv.id;
const syncMessages = context.buildMessagesForAPI(syncConv);
assert.equal(syncMessages[0].content, '3');
assert.equal(syncConv.stLocalVars.syncCounter, 3, 'Synchronous builds keep normal incvar semantics.');

context.state.settings.systemPrompt = 'plain';
const plainConv = createPromptConversation('plain', 'PLAIN', {});
context.state.activeConvId = plainConv.id;
const plainBefore = JSON.stringify(plainConv);
const plainPreview = await context.buildMessagesForAPIAsync(plainConv, { preview: true });
assert.ok(plainPreview.some(message => message.content.includes('PLAIN')));
assert.equal(JSON.stringify(plainConv), plainBefore, 'Read-only preview must not mutate the original conversation.');

const historyMvuConv = {
    id: 'history-mvu', character: { name: 'Alice', extensions: {} }, summaries: [], worldBookIds: [], stLocalVars: {},
    messages: [
        { id: 'm1', role: 'assistant', content: '<initvar>{"stat_data":{"name":"earlier"}}</initvar>初始化' },
        { id: 'm2', role: 'assistant', content: 'AAA' },
        { id: 'm3', role: 'assistant', content: '<UpdateVariable><JSONPatch>[{"op":"replace","path":"/stat_data/name","value":"latest"}]</JSONPatch></UpdateVariable>后续更新' }
    ]
};
context.state.activeConvId = historyMvuConv.id;
context.state.conversations[historyMvuConv.id] = historyMvuConv;
context.ensureConversationMvu(historyMvuConv);
context.state.settings.systemPrompt = 'latest=<%= stat_data.name %>';
context.state.settings.globalRegexEnabled = true;
context.state.settings.globalRegexScripts = [{ findRegex: 'AAA', replaceString: '<%= stat_data.name %>', placement: [2], processingPhase: 'prompt', flags: 'g' }];
const historyMvuAsync = await context.buildMessagesForAPIAsync(historyMvuConv);
const historyMvuSync = context.buildMessagesForAPI(historyMvuConv);
const historyMvuContext = context.buildRegexReplacementContext({ conv: historyMvuConv, message: historyMvuConv.messages[1], sourceMessage: historyMvuConv.messages[1], sourceId: 'm2', sourceRevision: context.getMessageRevision(historyMvuConv.messages[1]), historySnapshot: context.getMvuDataForMessage(historyMvuConv, historyMvuConv.messages[1]), settings: context.state.settings, processingPhase: 'prompt' }, 'AAA');
assert.notEqual(context.buildRegexContextKey(historyMvuContext, 'replacement'), context.buildRegexContextKey({ ...historyMvuContext, settings: { ...context.state.settings, userName: 'Other' } }, 'replacement'), 'Regex cache keys must include settings differences.');
for (const [label, messages] of [['sync warm cache', historyMvuSync], ['async', historyMvuAsync]]) {
    assert.equal(messages[0].content, 'latest=latest', `${label} current template must use current MVU data.`);
    assert.equal(messages[2].content, 'earlier', `${label} history formatting must use its source MVU snapshot.`);
    assert.ok(messages.every(message => Object.keys(message).sort().join(',') === 'content,role'), `${label} API messages must only expose role/content.`);
}
assert.deepEqual(historyMvuSync.map(({ role, content }) => ({ role, content })), historyMvuAsync.map(({ role, content }) => ({ role, content })), 'Synchronous and asynchronous history formatting must agree.');

historyMvuConv.messages[0].content = '<initvar>{"stat_data":{"name":"edited"}}</initvar>初始化';
historyMvuConv.messages[2].content = '<UpdateVariable><JSONPatch>[{"op":"replace","path":"/stat_data/name","value":"middle"}]</JSONPatch></UpdateVariable><UpdateVariable><JSONPatch>[{"op":"replace","path":"/stat_data/name","value":"latest"}]</JSONPatch></UpdateVariable>后续更新';
const historyMvuEdited = await context.buildMessagesForAPIAsync(historyMvuConv);
assert.equal(historyMvuEdited[2].content, 'edited', 'Editing an earlier MVU source must invalidate the old history result cache.');
assert.equal(historyMvuEdited[0].content, 'latest=latest', 'Multiple later MVU updates must still expose their final current value.');

const historyVersionA = { id: 'history-v1', message: { id: 'm1', role: 'assistant', content: '<initvar>{"stat_data":{"name":"version-a"}}</initvar>初始化' }, secondMessages: [] };
const historyVersionB = { id: 'history-v2', message: { id: 'm1', role: 'assistant', content: '<initvar>{"stat_data":{"name":"version-b"}}</initvar>初始化' }, secondMessages: [] };
Object.assign(historyMvuConv.messages[0], historyVersionA.message);
historyMvuConv.messages[0].responseVersions = [historyVersionA, historyVersionB];
historyMvuConv.messages[0].selectedResponseVersionId = historyVersionA.id;
const historyVersionAOutput = await context.buildMessagesForAPIAsync(historyMvuConv);
assert.equal(historyVersionAOutput[2].content, 'version-a', 'The selected response version must define the source history snapshot.');
Object.assign(historyMvuConv.messages[0], historyVersionB.message);
historyMvuConv.messages[0].responseVersions = [historyVersionA, historyVersionB];
historyMvuConv.messages[0].selectedResponseVersionId = historyVersionB.id;
const historyVersionBOutput = await context.buildMessagesForAPIAsync(historyMvuConv);
assert.equal(historyVersionBOutput[2].content, 'version-b', 'Switching response versions must not reuse the previous MVU cache result.');
const historySourceRecord = context.getRegularPromptMessages(historyMvuConv, 10).__promptSource;
assert.equal(historySourceRecord, undefined, 'The public message array must not expose source metadata.');
assert.equal(context.getRegularPromptMessages(historyMvuConv, 10)[1].__promptSource.id, 'm2', 'Internal history messages retain their source ID until formatting completes.');
assert.equal(context.getRegularPromptMessages(historyMvuConv, 10)[1].__promptSource.revision, context.getMessageRevision(historyMvuConv.messages[1]), 'Internal history messages retain their source revision until formatting completes.');

context.state.settings.globalRegexEnabled = true;
context.state.settings.globalRegexScripts = [{ findRegex: 'a', replaceString: 'b', placement: [1], flags: 'g' }];
const failRaceConv = createPromptConversation('fail-race', 'UNIQUE_FAIL_A_INPUT' + 'a'.repeat(500001) + '!', { lateFail: 'initial' });
context.state.activeConvId = failRaceConv.id;
context.state.settings.systemPrompt = '{{setvar::lateFail::from_failed_A}}';
const failWaitA = pauseNextFormat('UNIQUE_FAIL_A_INPUT');
const failRunA = runStream(failRaceConv);
await failWaitA.started;
context.stopGeneration();
failRaceConv.messages[0].content = 'UNIQUE_FAIL_B_INPUT';
context.state.settings.systemPrompt = '{{setvar::lateFail::from_B}}';
const failWaitB = pauseNextFormat('UNIQUE_FAIL_B_INPUT');
const failRunB = runStream(failRaceConv);
await failWaitB.started;
const failPendingB = context.state._promptBuildPendingSequence;
failWaitA.release();
await failRunA.promise;
assert.equal(formatErrors.length, 1, 'The late A case must fail in the real message formatter.');
assert.ok(formatErrors[0].text.includes('UNIQUE_FAIL_A_INPUT'));
assert.match(formatErrors[0].error.message, /500000/);
assert.equal(failRunB.events.completed + failRunB.events.errors, 0, 'A late failed build must not settle the new operation callbacks.');
assert.equal(context.state._promptBuildPendingSequence, failPendingB, 'A late failed build must not clear the new pending sequence.');
assert.equal(failRaceConv.stLocalVars.lateFail, 'initial', 'A late failed build must not commit macro variables.');
assert.equal(context.state.isGenerating, true, 'A late failed build must not release the new generation state.');
failWaitB.release();
await failRunB.terminal;
await failRunB.promise;
assert.equal(failRunB.events.completed, 1);
assert.equal(failRunB.events.errors, 0);
assert.equal(failRaceConv.stLocalVars.lateFail, 'from_B');
assert.equal(requestCount, beforeConflictRequests + 3, 'Only the current build after a real late format failure may request the model.');
context.state.settings.globalRegexEnabled = false;
context.state.settings.globalRegexScripts = [];

context.formatMessageAsync = realFormatMessageAsync;
fetchMode = 'abort';
const requestRun = runStream(createPromptConversation('request-stop', 'REQUEST_STOP', {}));
await waitFor(() => requestCount === beforeConflictRequests + 4, 'The request-sent case must reach fetch.');
context.stopGeneration();
await requestRun.terminal;
await requestRun.promise;
assert.equal(requestRun.events.interrupted, 1, 'Stopping after fetch keeps the existing interrupted completion behavior.');
assert.equal(context.state.isGenerating, false, 'Request cancellation must restore generation state.');

console.log('M2 prompt checks passed: migration, selection, ordering, isolated regex timeout, read-only preview, notes/depth, world-book overrides, post-processing, reasoning, final request diagnostics, and cancelled prompt-build macro protection.');
} finally {
    if (typeof context.resetRegexWorker === 'function') context.resetRegexWorker();
}
