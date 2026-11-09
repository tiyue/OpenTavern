import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const clone = value => JSON.parse(JSON.stringify(value));
let id = 0, fail = false, beforeAck = null, durable, pendingSnapshot;
const state = { settings: { sillyTavernPreset: { name: 'local', prompts: [{ id: 'p', name: 'rule', content: 'original', role: 'system', position: 'before_history', depth: 0 }], promptOrder: [], regexScripts: [] } } };
const context = vm.createContext({ state, console, makeId: () => 'id-' + ++id, validateRegexScript() {}, renderSillyTavernPresetSettings() {}, renderTokenBar() {}, appStore: { notify() {} },
    getSillyTavernPresetPlacement: prompt => prompt.position || 'before_history', parseSillyTavernDepth: prompt => prompt.depth || 0,
    persistState: async (_immediate, options) => {
        options.beforePersist();
        const snapshot = options.transformSnapshot(clone(state));
        pendingSnapshot = clone(state);
        if (beforeAck) await beforeAck();
        if (fail) throw new Error('quota');
        options.onPersistSuccess(); options.commitPendingSnapshot(pendingSnapshot); durable = snapshot;
    }
});
for (const file of ['chat/60-composer-images.js', 'presets/62-sillytavern-preset-model.js', 'presets/62-preset-library.js', 'presets/62-preset-transactions.js', 'generation/50-generation-api-request.js', 'api/31-api-protocol.js']) {
    vm.runInContext(fs.readFileSync(new URL('../src/app/' + file, import.meta.url), 'utf8'), context, { filename: file });
}
context.ensurePresetLibrary();
const before = JSON.stringify(state.settings);
fail = true;
await assert.rejects(context.savePresetLibraryChange(settings => { settings.sillyTavernPreset.prompts[0].content = 'draft'; }), /quota/);
assert.equal(JSON.stringify(state.settings), before);
assert.equal(context.failedPresetLibraryDraft.settings.sillyTavernPreset.prompts[0].content, 'draft');
await assert.rejects(context.addLibraryPreset({ name: 'ignored' }), /草稿/);
fail = false;
await context.commitPresetLibraryDraft(context.failedPresetLibraryDraft);
assert.equal(state.settings.sillyTavernPreset.prompts[0].content, 'draft');
assert.equal(durable.settings.sillyTavernPreset.prompts[0].content, 'draft');
assert.equal(pendingSnapshot.settings.sillyTavernPreset.prompts[0].content, 'draft');
assert.equal(context.failedPresetLibraryDraft, null);
const draft = context.createPresetLibraryDraft();
draft.settings.sillyTavernPreset.name = 'stale candidate';
beforeAck = async () => { state.settings.sillyTavernPreset.name = 'concurrent name'; };
await assert.rejects(context.commitPresetLibraryDraft(draft), /已变化/);
assert.equal(state.settings.sillyTavernPreset.name, 'concurrent name');
context.failedPresetLibraryDraft = null; beforeAck = null;
await assert.rejects(context.savePresetLibraryChange(settings => { settings.sillyTavernPreset.prompts[0].depth = -1; }), /深度/);
await context.savePresetLibraryChange(settings => { settings.sillyTavernPreset.squashSystemMessages = true; });
const messages = [{ role: 'system', content: 'A' }, { role: 'system', content: 'B' }, { role: 'user', content: 'Q' }, { role: 'system', content: 'C', name: 'other' }, { role: 'system', content: 'D' }];
const settings = { ...state.settings, maxTokens: 2048, apiProtocol: 'openai' };
let payload = context.buildChatCompletionPayload(settings, messages, {});
assert.equal(payload.messages.length, 4);
assert.equal(payload.messages[0].content, 'A\n\nB');
assert.equal(messages[0].content, 'A');
settings.sillyTavernPreset = { ...settings.sillyTavernPreset, squashSystemMessages: false };
payload = context.buildChatCompletionPayload(settings, messages, {});
assert.equal(payload.messages.length, 5);
console.log('Preset transactions passed: ACK-only changes, failed draft retry, pending snapshot propagation, stale write rejection, invalid input and opt-in System compression.');
