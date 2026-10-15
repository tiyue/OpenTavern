import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const copy = value => JSON.parse(JSON.stringify(value));
let id = 0;
const alice = { name: 'Alice', avatar: 'alice.png', first_mes: 'default', alternate_greetings: ['alternate {{user}}'], group_only_greetings: ['group'] };
const bob = { name: 'Bob', avatar: 'bob.png' };
const conv = { id: 'a', title: 'A', character: alice, group: { members: [{ character: alice, order: 0 }, { character: bob, order: 1 }] }, messages: [{ role: 'assistant', content: 'default' }, { role: 'user', content: 'find needle' }, { role: 'assistant', content: 'Bob said needle', speaker: 'Bob' }], summaries: [], updated: 1 };
const context = {
    console, setTimeout, clearTimeout, TextEncoder, TextDecoder, Blob, Uint8Array, DataView, atob, btoa,
    state: { conversations: { a: conv }, conversationOrder: ['a'], activeConvId: 'a', settings: { userName: 'User' }, characters: { alice, bob }, isGenerating: false },
    getActiveConv() { return context.state.conversations[context.state.activeConvId]; }, makeId: () => 'new-' + ++id, t: key => key,
    appStore: { notify() {} }, renderMessagesOnly() {}, requestFullRender() {}, renderTokenBar() {},
    getSafeSettingsForPersist: () => ({}), getCloudSyncPortableSettings: value => value,
    getConversationIdsWithMissingFallback: (order, conversations) => [...new Set([...order, ...Object.keys(conversations)])],
    getValidConversationIdOrFallback: (active, order, conversations) => conversations[active] ? active : order[0], scheduleCloudSyncUpload() {},
    StorageService: { _cloneForPersist: copy, async saveAll(snapshot) { if (context.failSave) throw new Error('quota'); context.durable = copy(snapshot); } },
    showGlassConfirm: async () => context.confirm !== false,
    replacePlaceholders: text => text.replace(/\{\{user\}\}/g, 'User')
};
vm.createContext(context);
for (const name of ['conversation/32-message-identity.js', 'conversation/32-response-versions.js', 'conversation/32-chat-operations.js', 'conversation/32-group-chat-members.js', 'conversation/32-group-chat-message-helpers.js', 'conversation/32-group-chat-avatar-helpers.js', 'summary/41-summary-validity.js', 'state/35-persist-records.js', 'state/35-state-persistence.js', 'state/35-persist-snapshot-helpers.js', 'state/35-conversation-mutation-persistence.js', 'conversation/59-new-chat-group.js', 'character/65-character-greetings.js', 'character/65-character-export.js', 'character/40-character-png-extract.js', 'character/65-character-png-export.js']) vm.runInContext(fs.readFileSync(new URL('../src/app/' + name, import.meta.url), 'utf8'), context, { filename: name });
context.normalizeConversation(conv); context.rememberCloudSyncConversationBaseline();
const revisions = conv.messages.map(context.getMessageRevision);
await context.toggleMessageFavorite(conv, conv.messages[1].id);
conv.messages[1].content = 'edited needle';
assert.equal(context.findConversationMessages('needle', 'current', true).length, 1);
assert.equal(context.findConversationMessages('needle', 'all', false).length, 2);
await context.toggleMessageFavorite(conv, conv.messages[1].id);
assert.equal(conv.favoriteMessageIds.length, 0);
conv.favoriteMessageIds = ['gone', conv.messages[0].id, conv.messages[0].id];
assert.deepEqual(copy(context.normalizeConversationFavorites(conv)), [conv.messages[0].id]);
conv.messages[1].content = 'find needle';
await context.saveConversationMembers(conv, [{ character: bob, muted: false }]);
assert.equal(context.isGroupChat(conv), false);
assert.equal(context.getMessageSenderName(conv.messages[0], conv), 'Alice');
assert.equal(context.getMessageSpeakerCharacter(conv.messages[0], conv).avatar, 'alice.png');
assert.equal(context.getMessageSpeakerCharacter(conv.messages[2], conv).avatar, 'bob.png');
assert.deepEqual(conv.messages.map(context.getMessageRevision), revisions, 'Member edits must preserve message content revisions.');
for (const invalid of [[], [{ character: bob, muted: true }], [{ character: bob }, { character: bob }]]) assert.throws(() => context.validateConversationMembers(invalid));
const previousMembers = copy(conv.group);
context.failSave = true;
await assert.rejects(context.saveConversationMembers(conv, [{ character: alice }]), /quota/);
assert.deepEqual(copy(conv.group), previousMembers); context.failSave = false;
assert.deepEqual(copy(context.getCharacterGreetings(alice, true)), ['default', 'alternate {{user}}', 'group']);
assert.throws(() => context.validateCharacterGreetings([42]), /文本数组/);
assert.throws(() => context.validateCharacterGreetings(Array(101).fill('x')), /100/);
context.confirm = false;
assert.equal(await context.switchConversationGreeting(conv, alice, 'alternate {{user}}'), false);
assert.equal(conv.messages[0].content, 'default');
context.confirm = true;
await context.switchConversationGreeting(conv, alice, 'alternate {{user}}');
assert.equal(conv.messages[0].content, 'alternate User');
assert.equal(conv.messages[1].content, 'find needle');
await context.switchResponseVersion(0, -1);
assert.equal(conv.messages[0].content, 'default');
const payload = context.buildCharacterCardExportPayload(alice, null);
const png = new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lN0AAAAASUVORK5CYII=', 'base64')]);
const embedded = await context.embedCharacterCardPng(png, payload);
const extracted = await context.extractCharaFromPng(embedded);
assert.deepEqual(copy(extracted.data.alternate_greetings), alice.alternate_greetings);
assert.deepEqual(copy(extracted.data.group_only_greetings), alice.group_only_greetings);
const replaced = await context.embedCharacterCardPng(embedded, { data: { first_mes: 'replacement' } });
assert.equal((await context.extractCharaFromPng(replaced)).data.first_mes, 'replacement');
await context.saveConversationMembers(conv, [{ character: alice }]);
conv.character = { ...conv.character, alternate_greetings: ['new greeting'] };
assert.deepEqual(copy(context.getConversationGreetingCharacter(conv, conv.messages[0]).alternate_greetings), ['new greeting'], 'Greeting choices must use the current member, rather than the historical avatar snapshot.');
for (const specialId of ['toString', '__proto__', 'constructor']) {
    const special = { id: 'special-' + specialId, character: alice, messages: [{ id: specialId, role: 'assistant', content: 'old' }], summaries: [] };
    context.state.conversations[special.id] = special; context.state.activeConvId = special.id;
    await context.saveConversationMembers(special, [{ character: bob }]);
    assert.equal(context.getMessageSenderName(special.messages[0], special), 'Alice');
    assert.equal(context.getMessageSpeakerCharacter(special.messages[0], special).name, 'Alice');
}
context.state.activeConvId = 'a';
assert.equal(context.canContinueMessage(conv, conv.messages[0]), false);
assert.equal(context.canContinueMessage(conv, conv.messages.at(-1)), true);
if (context._persistTimeout) clearTimeout(context._persistTimeout);
await context._persistWriteChain;
console.log('M3 runtime checks passed: favorites, raw-text search, members and historical avatars, immutable revisions, reliable failures, greeting confirmation/versions and JSON/PNG roundtrip.');
