import { messageIdentitySource, summaryValiditySource, assert } from '../support.mjs';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';


async function assertFrontendConversationImportHelpers() {
  const sources = await Promise.all([
    '../../../src/app/sync/19-cloud-sync-settings-policy.js',
    '../../../src/app/conversation/19-conversation-order-helpers.js',
    '../../../src/app/conversation/59-conversation-timestamp-helpers.js',
    '../../../src/app/transfer/63-conversation-export-helpers.js',
    '../../../src/app/transfer/63-conversation-import-records.js',
    '../../../src/app/transfer/63-conversation-import-merge.js',
    '../../../src/app/transfer/63-conversation-import-helpers.js',
    '../../../src/app/character/66-character-import-conversation.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));
  let renderRequested = null;
  let persistCount = 0;
  const context = {
    state: {
      conversations: {
        existing: { id: 'existing', messages: [{ role: 'user', content: 'old' }], updated: 5000 },
        orphan: { id: 'orphan', messages: [{ role: 'user', content: 'missing order' }], updated: 6000 },
      },
      conversationOrder: ['existing'],
      activeConvId: null,
      characters: { arona: { name: 'Arona', description: 'existing metadata' } },
      worldBooks: {},
      _charactersMigrated: true,
    },
    makeId: () => 'new-id',
    getSafeSettingsForPersist: () => ({ theme: 'dark' }),
    getSafeSettingsForCloudSync: () => context.getCloudSyncPortableSettings(context.getSafeSettingsForPersist()),
    persistState: () => { persistCount += 1; },
    requestRender: (key) => { renderRequested = key; },
    updateStorageInfo() {},
    renderLibraryGrids() {},
    renderMyCards() {},
    t: (key) => ({
      import_conv_success: 'Imported ',
      import_conv_success_suffix: ' conversation(s).',
      import_conv_duplicate: ' duplicates',
    }[key] || key),
    JSON,
    Object,
    Array,
  };

  vm.runInNewContext(`${messageIdentitySource}\n${summaryValiditySource}\n${sources.join('\n')}\nthis.__exportRecords = getConversationExportRecords;\nthis.__singleExport = buildSingleConversationExportData;\nthis.__singleFilename = buildSingleConversationExportFilename;\nthis.__fullExport = buildAllConversationsExportData;\nthis.__fullFilename = buildAllConversationsExportFilename;\nthis.__records = getConversationImportRecords;\nthis.__import = importConversationRecords;\nthis.__apply = applySuccessfulConversationImport;\nthis.__message = buildConversationImportSuccessMessage;\nthis.__conversationRegister = registerImportedConversationCharacterPreservingExisting;`, context);

  const data = {
    conversations: [
      { id: 'existing', messages: [{ role: 'user', content: 'new' }], character: { name: 'Arona' }, updated: 900 },
      {
        id: 'group',
        messages: [{ role: 'assistant', content: 'group', createdAt: 500 }],
        group: { members: [{ character: { name: 'Plana' } }] },
      },
    ],
    characters: { top: { name: 'Top Card' } },
    worldBooks: { wb1: { id: 'wb1', entries: [{ content: 'Kivotos' }] } },
  };

  const records = context.__records(data);
  assert(records.length === 2, 'Conversation import records were not detected.');
  const result = context.__import(records);
  context.__apply(data, result);

  assert(result.imported === 2, 'Conversation import did not count imported conversations.');
  assert(result.skipped === 1, 'Conversation import did not count duplicated IDs.');
  assert(context.state.conversations['new-id'].messages[0].content === 'new', 'Duplicated conversation was not assigned a new ID.');
  assert(context.state.conversations.group.messages[0].content === 'group', 'Non-duplicated conversation was not imported.');
  assert(context.state.characters.top.name === 'Top Card', 'Top-level imported character card was not preserved.');
  assert(context.state.characters.arona.description === 'existing metadata', 'Conversation import fallback must preserve an existing same-ID character.');
  assert(context.state.characters.plana.name === 'Plana', 'Group member character was not registered.');
  context.state.characters.top = { name: 'Top Card', description: 'existing top metadata' };
  context.mergeImportedTopLevelCharacters({ top: { name: 'Top Card', description: 'new top metadata' } });
  assert(context.state.characters.top.description === 'existing top metadata', 'Conversation import fallback must preserve complete same-ID metadata.');
  context.state.characters.empty = { name: 'Existing', description: 'keep' };
  context.__conversationRegister();
  context.__conversationRegister({});
  assert(Object.keys(context.state.characters).filter((key) => key === 'empty').length === 1 && context.state.characters.empty.description === 'keep', 'Conversation import fallback must ignore empty character input.');
  assert(context.state.worldBooks.wb1.entries[0].content === 'Kivotos', 'World book was not imported.');
  assert(context.state.activeConvId === 'new-id', 'Import should select the newest imported conversation when no active conversation exists.');
  assert(persistCount === 2, 'Successful import should persist before and after active conversation update.');
  assert(renderRequested === 'activeConvId', 'Successful import should request active conversation render.');
  assert(context.__message(2, 1).includes('duplicates'), 'Import success message should include duplicate count.');

  const singleExport = context.__singleExport(context.state.conversations.group, '2026-07-08T12:00:00.000Z');
  assert(singleExport.version === 1 && singleExport.conversations[0].id === 'group', 'Single conversation export should preserve the selected conversation.');
  assert(context.__singleFilename({ title: 'Chat/Name:*' }) === 'Chat_Name__.json', 'Single conversation export should sanitize filenames.');

  const orderedExports = context.__exportRecords();
  assert(orderedExports.map((conv) => conv.id).join(',') === 'group,new-id,existing,orphan', 'Conversation export records should include conversations missing from conversation order.');

  const fullExport = context.__fullExport(orderedExports, '2026-07-08T12:00:00.000Z');
  assert(fullExport.version === 3 && fullExport.type === 'opentavern-full-export', 'Full conversation export should use the portable complete export format.');
  assert(fullExport.conversationOrder.join(',') === 'group,new-id,existing,orphan', 'Full conversation export should preserve the complete export order.');
  assert(fullExport.activeConvId === 'new-id', 'Full conversation export should preserve the active conversation.');
  assert(fullExport.settings.theme === 'dark' && fullExport.charactersMigrated === true, 'Full conversation export should include safe settings and migration state.');
  assert(fullExport.characters.arona.name === 'Arona' && fullExport.worldBooks.wb1.id === 'wb1', 'Full conversation export should include character cards and world books.');
  assert(context.__fullFilename('2026-07-08T12:00:00.000Z') === 'opentavern_all_2026-07-08.json', 'Full conversation export filename should use the export date.');
}
export { assertFrontendConversationImportHelpers };
