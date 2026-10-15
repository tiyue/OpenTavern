import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const copy = value => JSON.parse(JSON.stringify(value));
let id = 0;
const conv = { id: 'test', character: { name: 'Test', extensions: { mvu: { initvar: { energy: 1 } } } }, messages: [{ id: 'u', role: 'user', content: 'Question' }], summaries: [], updated: 1 };
const ctx = {
    console, TextEncoder, TextDecoder, setTimeout, clearTimeout, makeId: () => `id-${++id}`, t: value => value,
    state: { conversations: { test: conv }, activeConvId: 'test', conversationOrder: ['test'], settings: {} },
    getActiveConv: () => conv, getSafeSettingsForPersist: () => ({}), getCloudSyncPortableSettings: value => value,
    getConversationIdsWithMissingFallback: order => order, getValidConversationIdOrFallback: active => active,
    scheduleCloudSyncUpload() {}, reportPersistPostSaveError() {}, appStore: { notify() {} },
    appendFinalAssistantMessage() {}, renderTokenBar() {}, renderMessagesOnly() {}, alert() {},
    StorageService: { _cloneForPersist: copy, async saveAll(snapshot) { if (ctx.fail) throw new Error('quota'); if (ctx.pending) await new Promise(resolve => ctx.resolve = resolve); ctx.saved = copy(snapshot); } }
};
vm.createContext(ctx);
for (const name of ['conversation/32-message-identity.js','conversation/32-response-versions.js','state/35-persist-records.js', 'state/35-state-persistence.js', 'state/35-persist-snapshot-helpers.js','state/35-conversation-mutation-persistence.js','mvu/40-mvu-data.js','mvu/40-mvu-parser.js', 'mvu/40-mvu-yaml-parser.js', 'mvu/40-mvu-update-blocks.js', 'mvu/40-mvu-patch-runtime.js', 'mvu/40-mvu-schema-defaults.js','mvu/40-mvu-template-expressions.js', 'mvu/40-mvu-template-parser.js', 'mvu/40-mvu-template.js','mvu/40-mvu-initial-state.js', 'mvu/40-mvu-runtime.js', 'mvu/40-mvu-mutations.js','prompt/40-sillytavern-macro-runtime.js','prompt/40-character-prompt-helpers.js','summary/41-summary-validity.js','generation/52-generation-message-lifecycle.js','chat/67-message-edit-helpers.js','chat/67-message-action-helpers.js']) vm.runInContext(fs.readFileSync(new URL('../src/app/' + name, import.meta.url), 'utf8'), ctx, { filename: name });
ctx.normalizeConversationMessageIdentity(conv); ctx.rememberCloudSyncConversationBaseline();
ctx.pending = true;
const finish = ctx.finishAssistantMessage(conv, 'Reply <JSONPatch>[{"op":"delta","path":"/energy","value":2}]</JSONPatch>', null, 'main');
await new Promise(resolve => setImmediate(resolve));
assert.equal(conv.messages.length, 1); assert.equal(ctx.getMvuDataForMessage(conv, null).stat_data.energy, 1);
ctx.pending = false; ctx.resolve(); await finish;
assert.equal(conv.messages.length, 2); assert.equal(ctx.getMvuDataForMessage(conv, null).stat_data.energy, 3);
assert.equal(ctx.saved.conversations.test.mvu.current.stat_data.energy, 3);
const original = copy(conv), env = ctx.createSillyTavernMacroEnv(conv, { persist: false });
ctx.fail = true;
await assert.rejects(ctx.persistConversationMessageMutation(conv, candidate => ctx.applyMessageEditContent(candidate, 1, candidate.messages[1].content, 'Changed <JSONPatch>[{"op":"replace","path":"/energy","value":9}]</JSONPatch>')), /quota/);
assert.deepEqual(copy(conv.messages), original.messages); assert.equal(ctx.getMvuDataForMessage(conv, null).stat_data.energy, 3);
await assert.rejects(ctx.persistConversationMessageMutation(conv, candidate => ctx.deleteAssistantMessageAt(candidate, 1)), /quota/);
assert.deepEqual(copy(conv.messages), original.messages);
ctx.fail = false;
const manual = ctx.createEmptyMvuData(); manual.stat_data.energy=7; manual.display_data.energy=7;
await ctx.replaceMvuDataForMessage(conv,conv.messages[1],manual);
assert.equal(ctx.getMvuDataForMessage(conv,null).stat_data.energy,7);
await ctx.persistConversationMessageMutation(conv, candidate => ctx.applyMessageEditContent(candidate, 1, candidate.messages[1].content, 'Changed <JSONPatch>[{"op":"replace","path":"/energy","value":9}]</JSONPatch>'));
assert.equal(ctx.getMvuDataForMessage(conv, null).stat_data.energy, 9);
assert.equal(ctx.getResponseVersions(conv.messages[1]).length,2);
await ctx.switchResponseVersion(1,-1); assert.equal(ctx.getMvuDataForMessage(conv,null).stat_data.energy,7,'Edited old version retains its manual override.');
await ctx.switchResponseVersion(1,1); assert.equal(ctx.getMvuDataForMessage(conv,null).stat_data.energy,9);
assert.equal(ctx.lookupSillyTavernGetvar('energy', env), '3', 'Prompt MVU reads use their frozen build snapshot.');
assert.equal(ctx.evaluateSillyTavernMacros('{{setvar::draft::kept}}{{getvar::draft}}', env, { mutate: true }), 'kept');
await ctx.finishAssistantMessage(conv, '<JSONPatch>[{"op":"replace","path":"/energy","value":99}]</JSONPatch>', null, 'main', null, '', null, { interrupted: true });
assert.equal(ctx.getMvuDataForMessage(conv, null).stat_data.energy, 9, 'Interrupted first replies cannot apply update blocks.');
await ctx.persistConversationMessageMutation(conv, candidate => ctx.deleteAssistantMessageAt(candidate, 1));
assert.equal(ctx.getMvuDataForMessage(conv, null).stat_data.energy, 1);
if (ctx._persistTimeout) clearTimeout(ctx._persistTimeout);
await ctx._persistWriteChain;
console.log('MVU integration passed: actual first-reply/edit/delete candidates, durable ACK failures, frozen prompt reads and interrupted replies.');
