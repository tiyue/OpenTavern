import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const state = { settings: {}, worldBooks: {
    a: { id: 'a', entries: { '1': { uid: 1, content: 'A', order: 100 }, '2': { uid: 2, content: 'B', order: 50 } } },
    b: { id: 'b', entries: { '1': { uid: 1, content: 'C', order: 100 } } }
}, conversations: {} };
const conv = { id: 'chat', messages: [], worldBookIds: ['a'], worldInfo: { entries: {} } };
state.conversations.chat = conv;
let pending, saved;
const context = vm.createContext({ state, Set, console, normalizeWIEntry: value => ({ ...value }), persistState: async (_immediate, options) => {
    options.beforePersist();
    const snapshot = options.transformSnapshot(JSON.parse(JSON.stringify(state)));
    if (pending) await pending();
    options.onPersistSuccess();
    saved = snapshot;
} });
for (const name of ['42-worldbook-bindings.js', '44-worldbook-activation-collection.js']) {
    vm.runInContext(fs.readFileSync(new URL('../src/app/worldbook/' + name, import.meta.url), 'utf8'), context);
}
await context.setWorldBookBinding('b', 'global', true);
assert.deepEqual(Array.from(context.getEffectiveWorldBookIds(conv)), ['a', 'b']);
assert.deepEqual(Array.from(saved.settings.globalWorldBookIds), ['b']);
state.settings.globalWorldBookIds.push('a', 'missing', 'b');
assert.deepEqual(Array.from(context.getEffectiveWorldBookIds(conv)), ['a', 'b']);
const collection = context.collectWorldInfoActivationEntries(conv);
assert.equal(collection.length, 3);
assert.equal(Object.keys(context.buildCombinedWorldInfo(collection).entries).length, 3, 'Different books can share entry UID.');
const badge = { textContent: '', title: '' };
context.dom = { wiEntryCount: badge }; context.getActiveConv = () => conv; context.t = value => value;
vm.runInContext(fs.readFileSync(new URL('../src/app/worldbook/43-worldbook-badge-ui.js', import.meta.url), 'utf8'), context);
context.renderWorldInfoBadge();
assert.equal(Number(badge.textContent), 3, 'The badge must include both global and conversation book entries once.');
assert.ok(badge.title.includes('2'));
conv.worldBookMode = 'off';
assert.equal(context.collectWorldInfoActivationEntries(conv).length, 0);
delete conv.worldBookMode;

await context.moveWorldBookDisplay('b', -1);
assert.deepEqual(Array.from(context.getWorldBookDisplayIds()), ['b', 'a']);
await context.moveWorldBookEntryDisplay(state.worldBooks.a, '2', -1);
assert.deepEqual(Array.from(context.getWorldBookEntryDisplayIds(state.worldBooks.a)), ['2', '1']);
assert.equal(state.worldBooks.a.entries['1'].order, 100, 'Display order must not alter insertion priority.');
assert.equal(state.worldBooks.a.entries['2'].order, 50);

const before = JSON.stringify(state.settings);
pending = async () => { throw new Error('quota'); };
await assert.rejects(context.setWorldBookBinding('b', 'global', false), /quota/);
assert.equal(JSON.stringify(state.settings), before, 'Failed save cannot change live bindings.');
pending = async () => { state.settings.globalWorldBookIds = []; };
await assert.rejects(context.setWorldBookBinding('b', 'global', false), /已变化/);
assert.deepEqual(state.settings.globalWorldBookIds, [], 'Late save must not replace a concurrent update.');
pending = null;
await assert.rejects(context.setWorldBookBinding('missing', 'global', true), /不存在/);
await assert.rejects(context.setWorldBookBinding('a', 'unknown', true), /范围/);
await assert.rejects(context.persistWorldBookChanges([{ path: ['settings', '__proto__'], value: {} }]), /路径/);
state.settings.worldBookOrder = {};
assert.deepEqual(Array.from(context.getWorldBookDisplayIds()), ['a', 'b']);

// Primary and extra character books keep separate identities through standard card export.
let id = 0;
const cardState = { settings: {}, worldBooks: {} };
const cards = vm.createContext({ state: cardState, makeId: () => 'card-' + ++id, normalizeWIEntry: entry => JSON.parse(JSON.stringify(entry)) });
for (const file of ['worldbook/41-world-info-constants.js', 'worldbook/41-world-info-position.js', 'worldbook/41-world-info-extension-fields.js', 'worldbook/41-world-info-normalizer.js', 'character/40-character-book-import.js', 'worldbook/42-worldbook-import-format.js', 'worldbook/42-worldbook-st-export-format.js', 'worldbook/42-worldbook-bindings.js', 'worldbook/42-worldbook-character-book-export.js', 'character/65-character-export.js']) {
    vm.runInContext(fs.readFileSync(new URL('../src/app/' + file, import.meta.url), 'utf8'), cards, { filename: file });
}
const card = { data: { name: 'Card', character_book: { name: 'Primary', entries: [{ uid: 1, content: 'primary' }] }, extensions: { opentavern: { keep: true, world_books: [{ name: 'Extra', entries: [{ uid: 1, content: 'extra' }] }, { name: 'Repeated primary', entries: [{ uid: 1, content: 'primary' }] }] } } } };
const character = JSON.parse(JSON.stringify(card.data));
const prepared = cards.prepareCharacterWorldBookRecords(card, character);
assert.equal(Object.keys(cardState.worldBooks).length, 0, 'Preparing an import must not mutate the live registry.');
assert.equal(prepared.books.length, 2);
assert.equal(prepared.extraIds.length, 1);
prepared.books.forEach(book => { cardState.worldBooks[book.id] = book; });
const conversation = { character, worldBookIds: [] };
cards.linkPreparedCharacterWorldBooks(conversation, character);
const exported = cards.buildCharacterCardExportPayload(character, cards.getCharacterBookForExport(conversation));
assert.equal(exported.data.character_book.entries.length, 1);
assert.equal(exported.data.character_book.entries[0].content, 'primary');
assert.equal(exported.data.extensions.opentavern.world_books[0].entries[0].content, 'extra');
assert.equal(exported.data.extensions.opentavern.keep, true);
const again = cards.prepareCharacterWorldBookRecords(exported, JSON.parse(JSON.stringify(exported.data)));
assert.equal(again.primaryId, prepared.primaryId);
assert.deepEqual(Array.from(again.extraIds), Array.from(prepared.extraIds));
assert.equal(id, 2, 'A normalized reimport must reuse both existing books, including exported extension mirrors.');
assert.throws(() => cards.prepareCharacterWorldBookRecords(card, { name: 'Bad', extensions: { opentavern: { world_books: {} } } }), /数组/);
console.log('Worldbook bindings passed: global/turn union, duplicate UID, independent display order, durable ACK, failure and late-write guards.');
