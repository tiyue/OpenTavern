import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

let id = 0, fail = false, beforeAck = null, durable;
const clone = value => JSON.parse(JSON.stringify(value));
const conv = { id: 'c', title: 'chat', messages: [{ id: 'u', role: 'user', content: 'original question' }, { id: 'a', role: 'assistant', content: 'original answer' }, { id: 's', role: 'assistant', stage: 'second', parentId: 'a', content: 'original options' }], summaries: [] };
const state = { settings: {}, conversations: { c: conv }, conversationOrder: ['c'], activeConvId: 'c', isGenerating: false };
const context = vm.createContext({ state, console, atob, Blob, Uint8Array, makeId: () => 'id-' + ++id, t: value => value,
    refreshSummaryValidity() {}, renderMessagesOnly() {}, renderTokenBar() {}, renderConversationListOnly() {}, reportPersistPostSaveError() {}, appStore: { notify() {} },
    getActiveConv: () => state.conversations[state.activeConvId],
    getConversationIdsWithMissingFallback: (order, records) => Array.from(new Set(order.concat(Object.keys(records)))).filter(key => records[key]),
    persistState: async (_immediate, options) => {
        options.beforePersist();
        let snapshot = clone(state);
        if (options.conversationSnapshot) snapshot.conversations[options.conversationSnapshot.id] = clone(options.conversationSnapshot);
        if (options.transformSnapshot) snapshot = options.transformSnapshot(snapshot);
        if (beforeAck) await beforeAck();
        if (fail) throw new Error('quota');
        options.onPersistSuccess(); durable = snapshot;
    }, startUserMessageRegeneration: (...args) => { context.started = args; }
});
for (const file of ['offline/21-private-media-local.js', 'chat/60-composer-images.js', 'conversation/32-message-identity.js', 'conversation/32-user-message-versions.js', 'conversation/32-response-versions.js', 'state/35-conversation-mutation-persistence.js', 'chat/67-message-action-helpers.js', 'chat/67-message-edit-helpers.js', 'transfer/63-backup-restore-plan.js']) {
    vm.runInContext(fs.readFileSync(new URL('../src/app/' + file, import.meta.url), 'utf8'), context, { filename: file });
}
context.normalizeConversationMessageIdentity(conv);
const image = { type: 'image', source: 'user', mime: 'image/png', name: 'tiny.png', dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j8T8AAAAASUVORK5CYII=' };
assert.equal(context.validateUserImageAttachments({ role: 'user', attachments: [image] }).length, 1);
for (const bad of [{ ...image, dataUrl: 'https://remote.invalid/photo.png' }, { ...image, dataUrl: 'data:image/png;base64,YmFk' }, { ...image, mime: 'image/jpeg' }]) {
    assert.throws(() => context.validateUserImageAttachments({ role: 'user', attachments: [bad] }), /图片/);
}
assert.throws(() => context.validateUserImageAttachments({ role: 'user', attachments: Array(5).fill(image) }), /4/);
const requests = Array.from({ length: 6 }, (_, index) => ({ role: 'user', content: index === 0 ? '' : 'text ' + index, _userImages: [image] }));
const messages = context.applyUserImagesToApiMessages(requests);
assert.equal(messages.filter(message => Array.isArray(message.content)).length, 4);
assert.equal(typeof messages[0].content, 'string');
assert.ok(messages[0].content.includes('较早'));
assert.equal(requests[2]._userImages[0], image, 'Request conversion must not mutate stored attachments.');
const revision = context.getMessageRevision({ role: 'user', content: '', attachments: [image] });
assert.notEqual(revision, context.getMessageRevision({ role: 'user', content: '', attachments: [{ ...image, dataUrl: image.dataUrl + 'x' }] }));
const multimodal = context.mergePromptContents('prefix', messages.at(-1).content);
assert.equal(multimodal.at(-1).type, 'image_url');
context.validateBackupMessage({ role: 'user', content: '', attachments: [image] });
assert.throws(() => context.validateBackupMessage({ role: 'user', content: '', attachments: [{ ...image, dataUrl: 'bad' }] }), /图片/);
assert.throws(() => context.validateBackupMessage({ role: 'user', content: 'text', userVersions: [{ content: 3 }] }), /版本/);
assert.throws(() => context.validateBackupMessage({ role: 'user', content: 'text', selectedUserVersionId: [] }), /标识/);

const before = JSON.stringify(conv);
fail = true;
await assert.rejects(context.saveUserMessageEdit(conv, 'u', context.getMessageRevision(conv.messages[0]), 'edited question', false), /quota/);
assert.equal(JSON.stringify(conv), before, 'Failed editing must leave both user and assistant history unchanged.');
fail = false;
await context.saveUserMessageEdit(conv, 'u', context.getMessageRevision(conv.messages[0]), 'edited question', false);
assert.equal(conv.messages[0].userVersions.length, 2);
assert.equal(conv.messages[1].responseVersions[0].userContent, 'original question');
assert.equal(durable.conversations.c.messages[0].content, 'edited question');
const old = context.prepareResponseVersions(conv, conv.messages[1]).current;
const newVersion = context.captureResponseVersion(conv, conv.messages[1]);
newVersion.id = 'new-reply'; newVersion.message.content = 'new answer'; newVersion.secondMessages = [];
await context.commitResponseVersion(conv, conv.messages[1], newVersion, [old, newVersion]);
assert.equal(conv.messages[0].content, 'edited question');
await context.commitResponseVersion(conv, conv.messages[1], old, [old, newVersion]);
assert.equal(conv.messages[0].content, 'original question', 'Reply restoration must restore its linked user text atomically.');
assert.equal(conv.messages[1].content, 'original answer');
assert.equal(conv.messages[2].content, 'original options');
const oldState = JSON.stringify(conv);
fail = true;
await assert.rejects(context.commitResponseVersion(conv, conv.messages[1], newVersion, [old, newVersion]), /quota/);
assert.equal(JSON.stringify(conv), oldState);
fail = false;
conv.messages.push({ id: 'u2', role: 'user', content: 'later question' }, { id: 'a2', role: 'assistant', content: 'later answer' });
const original = JSON.stringify(conv);
const branch = await context.saveUserMessageEdit(conv, 'u', context.getMessageRevision(conv.messages[0]), 'branch question', true);
assert.equal(JSON.stringify(conv), original, 'Regeneration of an earlier turn must preserve the original conversation.');
assert.notEqual(branch.id, conv.id);
assert.equal(branch.messages.some(message => message.id === 'u2'), false);
assert.equal(branch.messages[0].content, 'branch question');
assert.equal(state.activeConvId, branch.id);
assert.equal(context.started[0], branch);
assert.equal(context.started[1], 'u');
assert.equal(durable.conversations.c.messages.at(-1).content, 'later answer');
const changed = branch.messages[0].content;
beforeAck = async () => { branch.messages[0].content = 'concurrent edit'; };
await assert.rejects(context.saveUserMessageEdit(branch, 'u', context.getMessageRevision(branch.messages[0]), 'late edit', false), /generation_target_changed/);
assert.equal(branch.messages[0].content, 'concurrent edit');
assert.notEqual(changed, branch.messages[0].content);
console.log('User images/versions passed: image validation/window/preservation, source revisions, durable editing, linked reply restoration, branch preservation and late-save guards.');
