import { assertFrontendCloudSnapshot, assertFrontendCloudSnapshotApply, assertFrontendCloudSyncCrypto, assertFrontendCloudSyncTransport, assertFrontendCloudSyncOperations, assertFrontendCloudSyncEncryptionGuard, assertFrontendCloudSyncScheduler } from './tests/frontend/sync.mjs';
import { assertFrontendAppDialogHelpers, assertFrontendDomCache, assertFrontendI18nRuntime, assertFrontendMobileSidebarUI, assertFrontendStateLifecycleHelpers } from './tests/frontend/core.mjs';
import { assertFrontendStateStoreDefaults, assertFrontendStatePersistenceHelpers, assertFrontendStateInitialization } from './tests/frontend/state.mjs';
import { assertFrontendWebGLBackgroundHelpers } from './tests/frontend/appearance.mjs';
import { assertFrontendCloudSyncLegacyStatusMigration, assertFrontendSettingsSaveHelpers, assertFrontendSettingsHydrationHelpers, assertFrontendSettingsStorageClearHelpers } from './tests/frontend/settings.mjs';
import { assertFrontendSummaryService, assertFrontendAutoSummarizationHelpers, assertFrontendSummarizationRuntimeLock, assertFrontendSummaryManagerHelpers, assertFrontendSummaryHistoryUI } from './tests/frontend/summary.mjs';
import { assertFrontendPromptSummaryEvents, assertFrontendSecondStageRuntime, assertFrontendPromptMessageHelpers, assertFrontendSecondStagePromptBuilder, assertFrontendPromptBuilderContexts } from './tests/frontend/prompt.mjs';
import { assertFrontendSettingsEventBindings, assertFrontendMessageOptionInteractions, assertFrontendSendMessageHelpers } from './tests/frontend/events.mjs';
import { assertFrontendApiConnectionHelpers, assertFrontendApiCompatibilityHelpers } from './tests/frontend/api.mjs';
import { assertFrontendGenerationHelpers, assertFrontendGenerationStageIsolation } from './tests/frontend/generation.mjs';
import { assertFrontendCharacterImportHelpers, assertFrontendCharacterPanelUI } from './tests/frontend/character.mjs';
import { assertFrontendCharacterImportEventHelpers, assertFrontendNewChatPickerMultiSelection, assertFrontendQuickNewChatModalHelpers, assertFrontendNewChatWorkflowHelpers, assertFrontendGroupChatCoreHelpers, assertFrontendGroupMentionUI, assertFrontendConversationModelHelpers, assertFrontendLibraryConversationHelpers, assertFrontendConversationListUI, assertFrontendCharacterEditorUI, assertFrontendStorageRecoveryRestoreHelpers } from './tests/frontend/conversation.mjs';
import { assertFrontendWorldInfoNormalizerHelpers, assertFrontendWorldBookDefaults, assertFrontendWorldBookFormatHelpers, assertFrontendWorldBookActivation, assertFrontendWorldBookActivationHelpers, assertFrontendWorldBookMatchingHelpers, assertFrontendWorldBookEntryActionHelpers, assertFrontendWorldBookEntryListFiltering, assertFrontendWorldBookEntryListUIHelpers, assertFrontendWorldBookEntryLiveHelpers, assertFrontendWorldBookEntryEditorHelpers, assertFrontendWorldBookImportExportUIHelpers, assertFrontendWorldBookGlobalListUIHelpers } from './tests/frontend/worldbook.mjs';
import { assertFrontendPublicCardAssets, assertFrontendLibraryCardFilterHelpers, assertFrontendLibraryCardDisplayHelpers, assertFrontendMyCardGridFiltering, assertFrontendMyCardControlHelpers, assertFrontendMyCardImageUploadHelpers, assertFrontendMyCardActionHelpers, assertFrontendPublicCardGridFiltering, assertFrontendPublicCardListUI, assertFrontendPublicCardImportFlow, assertFrontendLibraryPublicCardDetailModal, assertFrontendLibraryViewHelpers } from './tests/frontend/library.mjs';
import { assertFrontendSillyTavernPresetNormalizer, assertFrontendSillyTavernPresetSettingsRows } from './tests/frontend/presets.mjs';
import { assertPackyImageGenerationContract } from './tests/frontend/image.mjs';
import { assertFrontendMessageContentHelpers, assertFrontendMessageEditHelpers, assertFrontendMessageActionHelpers, assertFrontendChatTopBarUI, assertFrontendChatMessageRendererHelpers } from './tests/frontend/chat.mjs';
import { assertFrontendFileProtocolOPFSSilence, assertFrontendOPFSReadWriteHelpers, assertFrontendIDBStorageHelpers, assertFrontendStorageRecoveryScanner, assertFrontendLegacyIDBRecoveryReader, assertFrontendStorageStatusRenderHelpers } from './tests/frontend/storage.mjs';
import { assertFrontendStorageServiceLoadHelpers, assertFrontendStorageServiceSaveHelpers, assertFrontendStorageServiceQuotaBackupHelpers, assertFrontendStorageServicePageLifecycleHelpers, assertFrontendStorageServiceClearBackendHelpers, assertFrontendStorageServiceInfoHelpers, assertFrontendStorageServicePipeline, assertFrontendStorageServiceFileProtocolStatus } from './tests/frontend/storage-service.mjs';
import { assertFrontendAppInitHelpers } from './tests/frontend/bootstrap.mjs';
import { assertFrontendConversationImportHelpers } from './tests/frontend/transfer.mjs';
import { createMockD1, request, assert, assertOk, readJson } from './tests/support.mjs';
import { onRequest } from '../functions/api/sync.js';


async function main() {
  await assertFrontendCloudSnapshot();
  await assertFrontendAppDialogHelpers();
  await assertFrontendStateStoreDefaults();
  await assertFrontendStatePersistenceHelpers();
  await assertFrontendWebGLBackgroundHelpers();
  await assertFrontendCloudSnapshotApply();
  await assertFrontendCloudSyncCrypto();
  await assertFrontendCloudSyncTransport();
  await assertFrontendCloudSyncOperations();
  await assertFrontendCloudSyncEncryptionGuard();
  await assertFrontendCloudSyncLegacyStatusMigration();
  await assertFrontendCloudSyncScheduler();
  await assertFrontendSummaryService();
  await assertFrontendAutoSummarizationHelpers();
  await assertFrontendSummarizationRuntimeLock();
  await assertFrontendSummaryManagerHelpers();
  await assertFrontendSummaryHistoryUI();
  await assertFrontendPromptSummaryEvents();
  await assertFrontendSettingsEventBindings();
  await assertFrontendApiConnectionHelpers();
  await assertFrontendApiCompatibilityHelpers();
  await assertFrontendGenerationHelpers();
  await assertFrontendGenerationStageIsolation();
  await assertFrontendSecondStageRuntime();
  await assertFrontendPromptMessageHelpers();
  await assertFrontendSecondStagePromptBuilder();
  await assertFrontendPromptBuilderContexts();
  await assertFrontendCharacterImportHelpers();
  await assertFrontendCharacterImportEventHelpers();
  await assertFrontendWorldInfoNormalizerHelpers();
  await assertFrontendWorldBookDefaults();
  await assertFrontendWorldBookFormatHelpers();
  await assertFrontendSettingsSaveHelpers();
  await assertFrontendSettingsHydrationHelpers();
  await assertFrontendPublicCardAssets();
  await assertFrontendLibraryCardFilterHelpers();
  await assertFrontendLibraryCardDisplayHelpers();
  await assertFrontendMyCardGridFiltering();
  await assertFrontendMyCardControlHelpers();
  await assertFrontendMyCardImageUploadHelpers();
  await assertFrontendMyCardActionHelpers();
  await assertFrontendPublicCardGridFiltering();
  await assertFrontendDomCache();
  await assertFrontendPublicCardListUI();
  await assertFrontendPublicCardImportFlow();
  await assertFrontendLibraryPublicCardDetailModal();
  await assertFrontendI18nRuntime();
  await assertFrontendSillyTavernPresetNormalizer();
  await assertFrontendSillyTavernPresetSettingsRows();
  await assertFrontendNewChatPickerMultiSelection();
  await assertFrontendQuickNewChatModalHelpers();
  await assertFrontendNewChatWorkflowHelpers();
  await assertFrontendWorldBookActivation();
  await assertFrontendWorldBookActivationHelpers();
  await assertFrontendWorldBookMatchingHelpers();
  await assertFrontendGroupChatCoreHelpers();
  await assertFrontendGroupMentionUI();
  await assertFrontendConversationModelHelpers();
  await assertPackyImageGenerationContract();
  await assertFrontendLibraryConversationHelpers();
  await assertFrontendLibraryViewHelpers();
  await assertFrontendMobileSidebarUI();
  await assertFrontendConversationListUI();
  await assertFrontendCharacterPanelUI();
  await assertFrontendCharacterEditorUI();
  await assertFrontendStateLifecycleHelpers();
  await assertFrontendMessageContentHelpers();
  await assertFrontendMessageOptionInteractions();
  await assertFrontendMessageEditHelpers();
  await assertFrontendMessageActionHelpers();
  await assertFrontendSendMessageHelpers();
  await assertFrontendChatTopBarUI();
  await assertFrontendChatMessageRendererHelpers();
  await assertFrontendWorldBookEntryActionHelpers();
  await assertFrontendWorldBookEntryListFiltering();
  await assertFrontendWorldBookEntryListUIHelpers();
  await assertFrontendWorldBookEntryLiveHelpers();
  await assertFrontendWorldBookEntryEditorHelpers();
  await assertFrontendWorldBookImportExportUIHelpers();
  await assertFrontendWorldBookGlobalListUIHelpers();
  await assertFrontendFileProtocolOPFSSilence();
  await assertFrontendOPFSReadWriteHelpers();
  await assertFrontendIDBStorageHelpers();
  await assertFrontendStorageServiceLoadHelpers();
  await assertFrontendStorageServiceSaveHelpers();
  await assertFrontendStorageServiceQuotaBackupHelpers();
  await assertFrontendStorageRecoveryRestoreHelpers();
  await assertFrontendStorageServicePageLifecycleHelpers();
  await assertFrontendStorageServiceClearBackendHelpers();
  await assertFrontendStorageServiceInfoHelpers();
  await assertFrontendStorageServicePipeline();
  await assertFrontendStorageRecoveryScanner();
  await assertFrontendLegacyIDBRecoveryReader();
  await assertFrontendStorageServiceFileProtocolStatus();
  await assertFrontendSettingsStorageClearHelpers();
  await assertFrontendStorageStatusRenderHelpers();
  await assertFrontendStateInitialization();
  await assertFrontendAppInitHelpers();
  await assertFrontendConversationImportHelpers();

  const { db, store } = createMockD1();
  const env = { SYNC_DB: db };
  const tokenA = 'test-token-alpha';
  const tokenB = 'test-token-bravo';
  const snapshot = {
    settings: {
      model: 'demo-model',
      lang: 'zh-CN',
      summaryEnabled: true,
      cloudSyncToken: 'frontend-should-strip-before-upload',
    },
    conversations: {
      c1: {
        id: 'c1',
        title: 'Cloud sync chat',
        messages: [
          { role: 'user', content: 'hello' },
          { role: 'assistant', content: 'world', speaker: 'Arona' },
        ],
        summaries: [{ id: 's1', text: 'short summary' }],
      },
    },
    conversationOrder: ['c1'],
    activeConvId: 'c1',
    characters: {
      arona: {
        id: 'arona',
        name: 'Arona',
        description: 'Student council AI',
        first_mes: 'Sensei!',
        tags: ['blue-archive'],
      },
    },
    worldBooks: {
      wb1: {
        id: 'wb1',
        name: 'World',
        entries: [{ id: 'e1', key: ['academy'], content: 'Kivotos' }],
      },
    },
    lastSaved: 123,
  };

  const unauthorized = await onRequest({ request: request('GET'), env });
  assert(unauthorized.status === 401, 'Expected missing-token request to be unauthorized.');

  const health = await onRequest({
    request: request('GET', null, undefined, {}, 'https://example.com/api/sync?health=1'),
    env,
  });
  await assertOk(health, 'health check');
  const healthJson = await readJson(health);
  assert(healthJson.service === 'opentavern-sync' && healthJson.methods.includes('DELETE'), 'Health check should expose backend sync capabilities.');

  const preflight = await onRequest({ request: request('OPTIONS'), env });
  assert(preflight.headers.get('Access-Control-Allow-Methods').includes('DELETE'), 'CORS preflight should allow DELETE sync requests.');

  const post = await onRequest({ request: request('POST', tokenA, { data: snapshot }), env });
  await assertOk(post, 'POST');
  const postJson = await readJson(post);
  assert(postJson.success && postJson.updatedAt && postJson.bytes > 0, 'POST response missing success metadata.');
  assert(post.headers.get('ETag') === `"${postJson.updatedAt}"`, 'POST should expose a sync ETag matching updatedAt.');
  assert(post.headers.get('X-OpenTavern-Exists') === 'true', 'POST should expose snapshot existence metadata.');

  const badArraySnapshot = await onRequest({
    request: request('POST', 'test-token-array', { data: [] }),
    env,
  });
  assert(badArraySnapshot.status === 400, 'Array sync payloads should be rejected.');

  const headA = await onRequest({ request: request('HEAD', tokenA), env });
  assert(headA.status === 200 && headA.headers.get('X-OpenTavern-Exists') === 'true', 'HEAD should report existing cloud snapshots.');
  assert(headA.headers.get('ETag') === `"${postJson.updatedAt}"` && Number(headA.headers.get('X-OpenTavern-Data-Bytes')) > 0, 'HEAD should expose sync metadata headers.');

  const getA = await onRequest({ request: request('GET', tokenA), env });
  await assertOk(getA, 'GET A');
  const getAJson = await readJson(getA);
  assert(getAJson.data.settings.model === 'demo-model', 'Settings were not restored.');
  assert(getAJson.data.settings.lang === 'zh-CN', 'Settings language was not restored.');
  assert(getAJson.data.conversations.c1, 'Conversation was not restored.');
  assert(getAJson.data.conversations.c1.messages[0].content === 'hello', 'Chat user message was not restored.');
  assert(getAJson.data.conversations.c1.messages[1].speaker === 'Arona', 'Chat speaker metadata was not restored.');
  assert(getAJson.data.conversations.c1.summaries[0].text === 'short summary', 'Chat summary was not restored.');
  assert(getAJson.data.conversationOrder[0] === 'c1', 'Conversation order was not restored.');
  assert(getAJson.data.activeConvId === 'c1', 'Active conversation id was not restored.');
  assert(getAJson.data.characters.arona, 'Character card was not restored.');
  assert(getAJson.data.characters.arona.first_mes === 'Sensei!', 'Character card first message was not restored.');
  assert(getAJson.data.characters.arona.tags.includes('blue-archive'), 'Character card tags were not restored.');
  assert(getAJson.data.worldBooks.wb1, 'World book was not restored.');
  assert(getAJson.data.worldBooks.wb1.entries[0].content === 'Kivotos', 'World book entry was not restored.');
  assert(getAJson.bytes > 0 && getA.headers.get('X-OpenTavern-Encrypted') === 'false', 'GET should expose payload size and encryption metadata.');

  const stalePost = await onRequest({
    request: request('POST', tokenA, { data: Object.assign({}, snapshot, { settings: { model: 'stale-write' } }) }, {
      'X-OpenTavern-If-Match-Updated-At': String(postJson.updatedAt - 1),
    }),
    env,
  });
  const staleJson = await readJson(stalePost);
  assert(stalePost.status === 409 && staleJson.currentUpdatedAt === postJson.updatedAt, 'Conditional POST should reject stale cloud snapshot writes.');

  const conditionalPost = await onRequest({
    request: request('POST', tokenA, { data: Object.assign({}, snapshot, { settings: { model: 'conditional-model' }, lastSaved: 789 }) }, {
      'If-Match': `"${postJson.updatedAt}"`,
    }),
    env,
  });
  await assertOk(conditionalPost, 'conditional POST');
  const conditionalJson = await readJson(conditionalPost);
  assert(conditionalJson.updatedAt > postJson.updatedAt, 'Conditional POST should advance the backend updatedAt value.');

  const staleDelete = await onRequest({
    request: request('DELETE', tokenA, undefined, { 'X-OpenTavern-If-Match-Updated-At': String(postJson.updatedAt) }),
    env,
  });
  assert(staleDelete.status === 409, 'Conditional DELETE should reject stale snapshot metadata.');

  const deleteA = await onRequest({
    request: request('DELETE', tokenA, undefined, { 'X-OpenTavern-If-Match-Updated-At': String(conditionalJson.updatedAt) }),
    env,
  });
  await assertOk(deleteA, 'DELETE A');
  const deleteAJson = await readJson(deleteA);
  assert(deleteAJson.deleted === true && deleteAJson.previousUpdatedAt === conditionalJson.updatedAt, 'DELETE should remove existing cloud snapshots and report previous metadata.');
  const deletedGetA = await onRequest({ request: request('GET', tokenA), env });
  const deletedGetAJson = await readJson(deletedGetA);
  assert(deletedGetAJson.data === null && deletedGetA.headers.get('X-OpenTavern-Exists') === 'false', 'Deleted cloud snapshots should no longer be returned.');

  const getB = await onRequest({ request: request('GET', tokenB), env });
  await assertOk(getB, 'GET B');
  const getBJson = await readJson(getB);
  assert(getBJson.data === null, 'Different tokens must not share snapshots.');
  const headB = await onRequest({ request: request('HEAD', tokenB), env });
  assert(headB.headers.get('X-OpenTavern-Exists') === 'false', 'HEAD should report missing cloud snapshots.');

  const partialToken = 'test-token-partial';
  const partialPost = await onRequest({
    request: request('POST', partialToken, {
      data: {
        settings: { model: 'partial-model' },
        conversations: {
          c2: { id: 'c2', messages: [] },
          c1: { id: 'c1', messages: [] },
        },
        conversationOrder: ['missing', 'c2', 'c2'],
        activeConvId: 'missing',
        characters: null,
        worldBooks: [],
        charactersMigrated: 'yes',
        lastSaved: 'not-a-number',
      },
    }),
    env,
  });
  await assertOk(partialPost, 'partial POST');
  const partialGet = await onRequest({ request: request('GET', partialToken), env });
  await assertOk(partialGet, 'partial GET');
  const partialJson = await readJson(partialGet);
  assert(partialJson.data.settings.model === 'partial-model', 'Partial settings were not preserved.');
  assert(partialJson.data.conversations && typeof partialJson.data.conversations === 'object' && !Array.isArray(partialJson.data.conversations), 'Conversations should normalize to an object map.');
  assert(partialJson.data.characters && typeof partialJson.data.characters === 'object' && !Array.isArray(partialJson.data.characters), 'Character cards should normalize to an object map.');
  assert(partialJson.data.worldBooks && typeof partialJson.data.worldBooks === 'object' && !Array.isArray(partialJson.data.worldBooks), 'World books should normalize to an object map.');
  assert(partialJson.data.conversationOrder.join(',') === 'c2,c1', 'Dirty conversation order should normalize to existing unique ids.');
  assert(partialJson.data.activeConvId === 'c2', 'Invalid active conversation should fall back to the first valid ordered conversation.');
  assert(partialJson.data.charactersMigrated === true, 'Character migration metadata should normalize to a boolean.');
  assert(Number.isFinite(partialJson.data.lastSaved), 'Invalid lastSaved should normalize to a timestamp.');

  const corruptToken = 'test-token-corrupt';
  const corruptPost = await onRequest({
    request: request('POST', corruptToken, { data: { settings: { model: 'corrupt-model' } } }),
    env,
  });
  await assertOk(corruptPost, 'corrupt seed POST');
  const corruptRow = Array.from(store.values()).find((row) => row.data.includes('corrupt-model'));
  corruptRow.data = '{not-json';
  const corruptGet = await onRequest({ request: request('GET', corruptToken), env });
  const corruptJson = await readJson(corruptGet);
  assert(corruptGet.status === 500 && corruptJson.success === false, 'Corrupt stored sync snapshots should return a structured error.');

  const falseMigratedToken = 'test-token-false-migrated';
  const falseMigratedPost = await onRequest({
    request: request('POST', falseMigratedToken, {
      data: {
        settings: { model: 'false-migrated-model' },
        conversations: { c1: { id: 'c1', messages: [] } },
        conversationOrder: ['c1'],
        activeConvId: 'c1',
        charactersMigrated: 'false',
      },
    }),
    env,
  });
  await assertOk(falseMigratedPost, 'false migrated POST');
  const falseMigratedGet = await onRequest({ request: request('GET', falseMigratedToken), env });
  await assertOk(falseMigratedGet, 'false migrated GET');
  const falseMigratedJson = await readJson(falseMigratedGet);
  assert(falseMigratedJson.data.charactersMigrated === false, 'String false migration metadata should normalize to false.');

  const badEncrypted = await onRequest({
    request: request('POST', tokenB, { encrypted: true, data: { encrypted: true, payload: 'missing-metadata' } }),
    env,
  });
  assert(badEncrypted.status === 400, 'Invalid encrypted payload should return 400.');

  const badEncryptedEnvelope = await onRequest({
    request: request('POST', tokenB, {
      encrypted: true,
      data: { encrypted: true, payload: [], iv: 'aXY=', salt: 'c2FsdA==', iterations: 210000 },
    }),
    env,
  });
  assert(badEncryptedEnvelope.status === 400, 'Encrypted payload metadata must be non-empty strings.');

  const badEncryptedIterations = await onRequest({
    request: request('POST', tokenB, {
      encrypted: true,
      data: { encrypted: true, algorithm: 'AES-GCM', payload: 'Y2lwaGVy', iv: 'aXY=', salt: 'c2FsdA==', iterations: 0 },
    }),
    env,
  });
  assert(badEncryptedIterations.status === 400, 'Encrypted payload iterations must reject explicit invalid values.');

  const encryptedEnvelope = {
    encrypted: true,
    version: 1,
    algorithm: 'AES-GCM',
    kdf: 'PBKDF2-SHA256',
    iterations: 210000,
    salt: 'c2FsdA==',
    iv: 'aXY=',
    payload: 'Y2lwaGVydGV4dA==',
    conversationBytes: 1234,
    lastSaved: 456,
  };
  const postEncrypted = await onRequest({
    request: request('POST', tokenB, { encrypted: true, data: encryptedEnvelope }),
    env,
  });
  await assertOk(postEncrypted, 'encrypted POST');

  const getEncrypted = await onRequest({ request: request('GET', tokenB), env });
  await assertOk(getEncrypted, 'encrypted GET');
  const getEncryptedJson = await readJson(getEncrypted);
  assert(getEncryptedJson.data.encrypted === true, 'Encrypted envelope flag was not preserved.');
  assert(getEncryptedJson.data.payload === encryptedEnvelope.payload, 'Encrypted payload was not preserved.');
  assert(getEncryptedJson.data.conversationBytes === encryptedEnvelope.conversationBytes, 'Encrypted conversation byte metadata was not preserved.');

  console.log('frontend and sync function tests passed');
}
await main();
