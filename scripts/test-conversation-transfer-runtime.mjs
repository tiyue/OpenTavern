import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceFiles = [
  'src/app/sync/19-cloud-sync-settings-policy.js',
  'src/app/sync/22-cloud-sync-apply-settings.js',
  'src/app/conversation/32-message-identity.js',
  'src/app/summary/41-summary-validity.js',
  'src/app/transfer/63-conversation-export-helpers.js',
  'src/app/transfer/63-conversation-import-records.js',
  'src/app/transfer/63-conversation-import-merge.js',
  'src/app/transfer/63-conversation-import-helpers.js',
];

const context = {
  console,
  state: {},
  makeId: () => 'imported-duplicate',
  getConversationIdsWithMissingFallback(order, conversations) {
    return order.filter((id) => conversations[id]);
  },
  getMostRecentConversationIdFromOrder(order, conversations) {
    return order.find((id) => conversations[id]) || null;
  },
  persistState() {},
  requestRender() {},
};
vm.createContext(context);
for (const file of sourceFiles) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
}

context.state = {
  settings: {
    language: 'zh-CN',
    apiKey: 'must-not-export',
    apiEndpoint: 'https://local.example/v1/chat/completions',
    cloudSyncToken: 'must-not-export',
    imageGenerationEndpoint: 'https://images.local/generate',
  },
  conversations: {
    alpha: { id: 'alpha', messages: [] },
  },
  conversationOrder: ['alpha'],
  activeConvId: 'alpha',
  characters: { alice: { name: 'Alice' } },
  worldBooks: { world: { id: 'world' } },
  _charactersMigrated: true,
};
context.getSafeSettingsForCloudSync = () => context.getCloudSyncPortableSettings(context.state.settings);

const exported = context.buildAllConversationsExportData(
  context.getConversationExportRecords(),
  '2026-08-31T00:00:00.000Z',
);
assert.equal(exported.version, 3);
assert.equal(exported.activeConvId, 'alpha');
assert.deepEqual(Array.from(exported.conversationOrder), ['alpha']);
assert.equal(exported.settings.language, 'zh-CN');
assert.equal(exported.settings.apiKey, undefined);
assert.equal(exported.settings.cloudSyncToken, undefined);
assert.equal(exported.settings.imageGenerationEndpoint, undefined);

context.state = {
  settings: {
    language: 'zh-CN',
    apiKey: 'local-key',
    apiEndpoint: 'https://local.example/v1/chat/completions',
    cloudSyncToken: 'local-sync-token',
  },
  conversations: {
    duplicate: { id: 'duplicate', messages: [{ role: 'user', content: 'local' }] },
    existing: { id: 'existing', messages: [] },
  },
  conversationOrder: ['existing', 'duplicate'],
  activeConvId: 'existing',
  characters: {},
  worldBooks: {},
  _charactersMigrated: false,
};

const backup = {
  version: 3,
  type: 'opentavern-full-export',
  settings: {
    language: 'en',
    apiKey: 'remote-key',
    apiEndpoint: 'https://remote.example/v1/chat/completions',
    cloudSyncToken: 'remote-sync-token',
  },
  conversations: [
    { id: 'duplicate', messages: [{ role: 'assistant', content: 'imported' }] },
    { id: 'fresh', messages: [] },
  ],
  conversationOrder: ['fresh', 'duplicate'],
  activeConvId: 'duplicate',
  characters: { alice: { name: 'Alice' } },
  worldBooks: { world: { id: 'world' } },
  charactersMigrated: true,
};

const result = context.importConversationRecords(backup.conversations);
context.applySuccessfulConversationImport(backup, result);

assert.equal(result.idMap.duplicate, 'imported-duplicate');
assert.deepEqual(Array.from(context.state.conversationOrder), [
  'fresh',
  'imported-duplicate',
  'existing',
  'duplicate',
]);
assert.equal(context.state.activeConvId, 'imported-duplicate');
assert.equal(context.state.settings.language, 'en');
assert.equal(context.state.settings.apiKey, 'local-key');
assert.equal(context.state.settings.apiEndpoint, 'https://local.example/v1/chat/completions');
assert.equal(context.state.settings.cloudSyncToken, 'local-sync-token');
assert.equal(context.state.characters.alice.name, 'Alice');
assert.equal(context.state.worldBooks.world.id, 'world');
assert.equal(context.state._charactersMigrated, true);
assert.equal(context.isOpenTavernFullExport({ version: 3, type: 'opentavern-full-export', conversations: [] }), true);

const reliableConversation = {
  id: 'reliable',
  messages: [
    { id: 'user-1', role: 'user', content: 'A question', futureExtension: { retained: true } },
    {
      id: 'main-1', role: 'assistant', stage: 'main', content: 'Selected response',
      cot: 'Selected reasoning', speaker: 'Alice', usage: { total_tokens: 23 },
      responseVersions: [
        {
          id: 'version-old', created: 1,
          message: { id: 'main-1', role: 'assistant', stage: 'main', content: 'Old response', cot: 'Old reasoning', speaker: 'Bob', usage: { total_tokens: 11 } },
          secondMessages: [{ id: 'second-old', role: 'assistant', stage: 'second', parentId: 'main-1', content: '<options>old</options>' }],
        },
        {
          id: 'version-selected', created: 2,
          message: { id: 'main-1', role: 'assistant', stage: 'main', content: 'Selected response', cot: 'Selected reasoning', speaker: 'Alice', usage: { total_tokens: 23 } },
          secondMessages: [{ id: 'second-selected', role: 'assistant', stage: 'second', parentId: 'main-1', content: '<details>status</details>', cot: 'Option reasoning', usage: { total_tokens: 7 } }],
        },
      ],
      selectedResponseVersionId: 'version-selected',
    },
    { id: 'second-selected', role: 'assistant', stage: 'second', parentId: 'main-1', content: '<details>status</details>', cot: 'Option reasoning', usage: { total_tokens: 7 } },
  ],
  summaries: [{ id: 'legacy-summary', text: 'Preserved legacy summary', coveredStart: 0, coveredEnd: 1 }],
};
context.normalizeConversationMessageIdentity(reliableConversation);
reliableConversation.messages[2].parentRevision = context.getMessageRevision(reliableConversation.messages[1]);
reliableConversation.summaries.push({
  id: 'verified-summary', text: 'Verified question and answer', summaryVersion: 2,
  coveredStart: 0, coveredEnd: 1,
  sourceMessages: context.captureSummarySources(reliableConversation.messages.slice(0, 2)),
});
context.refreshSummaryValidity(reliableConversation);
context.state.conversations.reliable = reliableConversation;
context.state.conversationOrder.push('reliable');
const portableBackup = JSON.parse(JSON.stringify(context.buildAllConversationsExportData(
  context.getConversationExportRecords(), '2026-10-01T00:00:00.000Z',
)));
const exportedReliable = portableBackup.conversations.find((conv) => conv.id === 'reliable');
assert.deepEqual(exportedReliable, JSON.parse(JSON.stringify(reliableConversation)),
  'v3 export must retain message identities, sources, versions, linked stage results and unknown extensions.');
assert.equal(portableBackup.settings.apiKey, undefined);
assert.equal(portableBackup.settings.cloudSyncToken, undefined);

const inputBeforeImport = JSON.stringify(portableBackup);
context.state = {
  settings: { apiKey: 'device-local-key', cloudSyncToken: 'device-local-sync' },
  conversations: { reliable: { id: 'reliable', messages: [{ role: 'user', content: 'Different local conversation' }] } },
  conversationOrder: ['reliable'], activeConvId: 'reliable', characters: {}, worldBooks: {},
};
let importId = 0;
context.makeId = () => `restored-${++importId}`;
const reliableImport = context.importConversationRecords(portableBackup.conversations);
context.applySuccessfulConversationImport(portableBackup, reliableImport);
const restored = context.state.conversations[reliableImport.idMap.reliable];
assert.notEqual(restored.id, 'reliable', 'An imported conversation collision must not overwrite the local conversation.');
assert.equal(context.state.conversations.reliable.messages[0].content, 'Different local conversation');
assert.equal(restored.messages[0].id, 'user-1', 'Conversation-local message references must remain stable after conversation ID remapping.');
assert.deepEqual(JSON.parse(JSON.stringify(restored.messages)), exportedReliable.messages);
assert.equal(restored.summaries[0].text, 'Preserved legacy summary');
assert.equal(restored.summaries[0].validity, 'unverified');
assert.equal(restored.summaries[1].validity, 'valid');
assert.deepEqual(JSON.parse(JSON.stringify(restored.summaries[1].sourceMessages)), exportedReliable.summaries[1].sourceMessages);
assert.equal(context.state.settings.apiKey, 'device-local-key');
assert.equal(context.state.settings.cloudSyncToken, 'device-local-sync');
assert.equal(JSON.stringify(portableBackup), inputBeforeImport, 'Import must not mutate the backup object.');
const once = JSON.stringify(restored);
context.normalizeConversationMessageIdentity(restored);
context.refreshSummaryValidity(restored);
assert.equal(JSON.stringify(restored), once, 'Reload migration must be idempotent after a conflict import.');

console.log('conversation transfer runtime checks passed');
