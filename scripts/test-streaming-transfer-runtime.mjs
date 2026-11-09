import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
let id = 0;
const context = vm.createContext({ Blob, TextDecoder, setTimeout, Date, makeId: () => 'id-' + ++id });
vm.runInContext(fs.readFileSync(new URL('../src/app/transfer/63-streaming-transfer.js', import.meta.url), 'utf8'), context);
const plain = value => JSON.parse(JSON.stringify(value));
const data = { version: 3, type: 'opentavern-full-export', settings: { name: '中文🙂"\\', values: [null, true, false, -2.5] }, conversations: [{ id: 'c', messages: [{ role: 'user', content: '{}[,]"\\🙂' }] }], characters: { a: { name: '角色' } }, worldBooks: {} };
const encoded = await context.buildSegmentedJsonBlob(data).text();
assert.deepEqual(JSON.parse(encoded), data);
const optionalValues = { ...data, conversations: [, undefined, null], characters: { omitted: undefined, retained: { name: '保留' } }, worldBooks: { omitted: undefined } };
assert.deepEqual(JSON.parse(await context.buildSegmentedJsonBlob(optionalValues).text()), JSON.parse(JSON.stringify(optionalValues)));
for (const chunkSize of [1, 2, 7, 31, 1024]) {
    const parser = context.createIncrementalBackupParser();
    for (let i = 0; i < encoded.length; i += chunkSize) parser.write(encoded.slice(i, i + chunkSize));
    assert.deepEqual(plain(parser.finish()), data);
}
for (const text of ['{"a":1,}', '{"conversations":[{},]}', '{"characters":{"a":{},}}', '{"a":1,"a":2}', '{"conversations":[{}]}junk', '{"a":"unfinished', '{"a":', '[]']) {
    const parser = context.createIncrementalBackupParser();
    assert.throws(() => { parser.write(text); parser.finish(); }, /JSON/);
}
const unsafe = context.createIncrementalBackupParser(); unsafe.write('{"__proto__":{"polluted":true}}');
assert.equal(Object.prototype.hasOwnProperty.call(unsafe.finish(), '__proto__'), true);
assert.equal({}.polluted, undefined);
const large = { ...data, conversations: [{ id: 'large', messages: [{ role: 'user', content: 'a'.repeat(4 * 1024 * 1024 - 12) + '中文🙂' }] }] };
const blob = context.buildSegmentedJsonBlob(large);
assert.deepEqual(plain(await context.readConversationTransferFile(Object.assign(blob, { name: 'large.json' }))), large);
const rows = [{ user_name: '用户', character_name: '角色', chat_metadata: { note_prompt: '剧情提示' } }, { is_user: true, name: '用户', mes: '你好' }, { is_user: false, name: '角色', mes: '回复二', swipes: ['回复一', '回复二'], swipe_id: 1, extra: { reasoning: '思考' } }];
const imported = await context.readConversationTransferFile(Object.assign(new Blob([rows.map(row => JSON.stringify(row)).join('\r\n')]), { name: 'chat.jsonl' }));
assert.equal(imported.conversations[0].messages.length, 2);
assert.equal(imported.conversations[0].messages[1].responseVersions.length, 2);
assert.equal(imported.conversations[0].messages[1].cot, '思考');
assert.equal(imported.conversations[0].messages[1].responseVersions[1].message.cot, '思考');
const withSwipeReasoning = context.convertSillyTavernJsonl([rows[0], { ...rows[2], swipe_info: [{ extra: { reasoning: '旧版本思考' } }, { extra: { reasoning: '选中版本思考' } }] }]);
assert.equal(withSwipeReasoning.conversations[0].messages[0].responseVersions[0].message.cot, '旧版本思考');
assert.equal(withSwipeReasoning.conversations[0].messages[0].responseVersions[1].message.cot, '选中版本思考');
await assert.rejects(context.readConversationTransferFile(Object.assign(new Blob(['{}\n{bad}']), { name: 'bad.jsonl' })), /第 2 行/);
assert.throws(() => context.convertSillyTavernJsonl([{}, { mes: 'bad' }]), /格式/);
console.log('Streaming transfer passed: exact JSON roundtrip, tiny chunks, UTF-8 chunk boundary, malformed/duplicate data, JSONL versions/reasoning and invalid rows.');
