import { assert, waitForTestCondition, messageIdentitySource, summaryValiditySource } from '../support.mjs';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';


async function assertFrontendStateStoreDefaults() {
  const sources = await Promise.all([
    '../../../src/app/state/30-state-store.js',
    '../../../src/app/state/30-state-default-settings.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  const events = [];
  const context = {
    DEFAULT_TWO_STAGE_PROMPT: 'two stage default',
    defaultSillyTavernPreset() { return { prompts: [] }; },
    console: { error() {} },
    JSON,
    Set,
    Array,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__store = createReactiveStore;\nthis.__defaults = defaultSettings;`, context);

  const defaults = context.__defaults();
  assert(defaults.cloudSyncEndpoint === '/api/sync', 'Default settings should include the cloud sync endpoint.');
  assert(defaults.cloudSyncEnabled === false && defaults.cloudSyncAutoUpload === false, 'Cloud sync should be disabled by default.');
  assert(defaults.sillyTavernPreset.prompts.length === 0, 'Default settings should include a SillyTavern preset object.');

  const store = context.__store({ settings: { lang: 'en' } });
  const unsubscribeKey = store.subscribe('settings', (key) => events.push(`key:${key}`));
  const unsubscribeGlobal = store.subscribe((keys) => events.push(`global:${keys.join(',')}`));
  store.notify('settings');
  unsubscribeKey();
  unsubscribeGlobal();
  store.notify('settings');

  assert(store.state.settings.lang === 'en', 'State store should expose cloned state.');
  assert(events.join('|') === 'key:settings|global:settings', 'State store notifications or unsubscribe behavior changed.');
}

async function assertFrontendStatePersistenceHelpers() {
  const policySource = await readFile(new URL('../../../src/app/sync/19-cloud-sync-settings-policy.js', import.meta.url), 'utf8');
  const orderSource = await readFile(new URL('../../../src/app/conversation/19-conversation-order-helpers.js', import.meta.url), 'utf8');
  const persistenceFiles = ['state/35-persist-records.js', 'state/35-state-persistence.js', 'state/35-persist-snapshot-helpers.js'];
  const source = (await Promise.all(persistenceFiles.map((file) => readFile(new URL('../../../src/app/' + file, import.meta.url), 'utf8')))).join('');

  const saved = [];
  const events = [];
  const timeouts = [];
  const cleared = [];
  let now = 123456;
  const context = {
    state: {
      settings: { model: 'safe-model' },
      conversations: {
        c1: { id: 'c1', messages: [{ content: 'hello' }] },
        orphan: { id: 'orphan', messages: [{ content: 'missing order' }] },
      },
      conversationOrder: ['c1'],
      activeConvId: 'c1',
      worldBooks: { wb1: { id: 'wb1' } },
      characters: { arona: { name: 'Arona' } },
      _charactersMigrated: true,
    },
    StorageService: {
      _lastSaveSnapshot: null,
      async saveAll(data) { saved.push(JSON.parse(JSON.stringify(data))); },
      _isQuotaError() { return false; },
    },
    getSafeSettingsForPersist() { return { model: context.state.settings.model, apiKey: '' }; },
    updateStorageInfo() { events.push('storage-info'); },
    scheduleCloudSyncUpload() { events.push('cloud-upload'); },
    setTimeout(handler, delay) {
      const id = `timeout-${timeouts.length}`;
      timeouts.push({ id, handler, delay });
      return id;
    },
    clearTimeout(id) { cleared.push(id); },
    Date: { now: () => now },
    console: { error(message) { events.push(`error:${message}`); } },
    JSON,
    Promise,
  };

  vm.runInNewContext(`${policySource}\n${orderSource}\n${source}\nthis.__persist = persistState;\nthis.__active = getActiveConv;\nthis.__signature = buildCloudSyncConversationSignature;`, context);

  assert(context.__active().id === 'c1', 'Active conversation helper should return the current active conversation.');

  await context.__persist(true);
  assert(saved.length === 1 && saved[0].settings.model === 'safe-model', 'Immediate persist should save sanitized settings.');
  assert(saved[0].conversations.c1.messages[0].content === 'hello', 'Immediate persist should include conversations.');
  assert(saved[0].conversationOrder.join(',') === 'c1,orphan', 'Immediate persist should include conversations missing from conversation order.');
  assert(saved[0].worldBooks.wb1.id === 'wb1' && saved[0].characters.arona.name === 'Arona', 'Immediate persist should include world books and character cards.');
  assert(saved[0].charactersMigrated === true && saved[0].lastSaved === 123456, 'Immediate persist should include migration and timestamp metadata.');
  assert(context.StorageService._lastSaveSnapshot.activeConvId === 'c1', 'Persist should cache the latest snapshot before async storage completes.');
  assert(events.includes('storage-info') && !events.includes('cloud-upload'), 'Initial persist should refresh storage status without auto uploading unchanged conversations.');
  const activeC1Signature = context.__signature(context.StorageService._lastSaveSnapshot);
  const activeOrphanSignature = context.__signature({
    ...context.StorageService._lastSaveSnapshot,
    activeConvId: 'orphan',
  });
  assert(activeC1Signature !== activeOrphanSignature, 'Switching the active conversation should be included in automatic cloud sync.');

  const settingsSignatureBase = {
    ...context.StorageService._lastSaveSnapshot,
    settings: {
      model: 'portable-model',
      cloudSyncToken: 'device-token-a',
      cloudSyncEnabled: true,
      sillyTavernPreset: { prompts: [{ id: 'main', content: 'Preset A', enabled: true }] },
    },
  };
  const localOnlySettingsSignature = context.__signature({
    ...settingsSignatureBase,
    settings: {
      ...settingsSignatureBase.settings,
      cloudSyncToken: 'device-token-b',
      cloudSyncEnabled: false,
    },
  });
  assert(context.__signature(settingsSignatureBase) === localOnlySettingsSignature,
    'Device-local cloud settings must not trigger an automatic cloud upload.');
  const changedPresetSignature = context.__signature({
    ...settingsSignatureBase,
    settings: {
      ...settingsSignatureBase.settings,
      sillyTavernPreset: { prompts: [{ id: 'main', content: 'Preset B', enabled: true }] },
    },
  });
  assert(context.__signature(settingsSignatureBase) !== changedPresetSignature,
    'SillyTavern preset changes must trigger an automatic cloud upload.');

  events.length = 0;
  now = 222222;
  context.state.settings.model = 'settings-only-change';
  await context.__persist(true);
  assert(saved.length === 2 && saved[1].lastSaved === 222222, 'Settings-only persists should still save local state.');
  assert(events.includes('storage-info') && events.includes('cloud-upload'), 'Settings-only persists should schedule automatic cloud upload.');

  events.length = 0;
  now = 333333;
  context.state.conversations.c1.messages.push({ content: 'conversation changed' });
  await context.__persist(true);
  assert(saved.length === 3 && saved[2].conversations.c1.messages.length === 2, 'Conversation persists should save changed messages.');
  assert(events.includes('cloud-upload'), 'Conversation changes should schedule automatic cloud upload.');

  now = 999999;
  await context.__persist(true, { preserveLastSaved: true });
  assert(saved.length === 4 && saved[3].lastSaved === 333333, 'Status-only persists should preserve the previous snapshot freshness timestamp.');

  await context.__persist(true, { lastSaved: 6000 });
  assert(saved.length === 5 && saved[4].lastSaved === 6000, 'Explicit snapshot timestamps should be preserved when applying remote data.');

  events.length = 0;
  context.state.conversations.c1.messages.push({ content: 'debounced conversation change' });
  await context.__persist(false);
  await context.__persist(false);
  assert(timeouts.length === 2 && timeouts[0].delay === 450 && timeouts[1].delay === 450, 'Debounced persist should schedule saves with the storage debounce delay.');
  assert(cleared.includes('timeout-0'), 'Debounced persist should clear the previous pending save.');
  timeouts[1].handler();
  await waitForTestCondition(
    () => saved.length === 6 && events.includes('cloud-upload'),
    'Debounced persistence did not finish its serialized write and cloud-upload scheduling.',
  );
  assert(saved.length === 6, 'Debounced persist handler should eventually save the snapshot.');
  assert(events.includes('cloud-upload'), 'Debounced conversation changes should still schedule automatic cloud upload.');

  events.length = 0;
  context.state.activeConvId = 'missing';
  await context.__persist(true, { skipCloudSyncAutoUpload: true });
  assert(saved.length === 7 && saved[6].activeConvId === 'c1', 'Persist should recover invalid active conversation ids before saving.');
  assert(!events.includes('cloud-upload'), 'Explicitly skipped active-id recovery persists should not schedule automatic cloud upload.');

  events.length = 0;
  context.state.activeConvId = 'c1';
  context.state.conversations.c1._historyWindow = 999;
  context.state.conversations.c1._lastRenderedVisibleCount = 42;
  context.state.conversations.c1._wiCache = { key: 'runtime-only' };
  context.state.conversations.c1._nextGroupSpeaker = { name: 'Runtime Speaker' };
  await context.__persist(true);
  assert(saved.length === 8 && !events.includes('cloud-upload'), 'Runtime-only conversation fields should not schedule automatic cloud upload.');
}

async function assertFrontendStateInitialization() {
  const sources = await Promise.all([
    '../../../src/app/conversation/19-conversation-order-helpers.js',
    '../../../src/app/conversation/32-group-chat-members.js',
    '../../../src/app/state/34-state-init-helpers.js',
    '../../../src/app/state/34-state-init-normalize.js',
    '../../../src/app/state/34-state-init-load.js',
    '../../../src/app/state/34-state-init-settings.js',
    '../../../src/app/state/34-state-init-conversations.js',
    '../../../src/app/state/34-state-init.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  let persisted = false;
  let migratedCount = 0;
  const context = {
    state: {
      settings: {},
      conversations: {},
      conversationOrder: [],
      activeConvId: null,
      characters: {},
      worldBooks: {},
    },
    StorageService: {
      async loadAll() {
        return {
          settings: { lang: 'en', saveApiKey: false, apiKey: 'secret', summarizeApiKey: 'summary-secret', uiTheme: 'new-light' },
          conversations: {
            c1: { id: 'c1', messages: [{ role: 'user', content: 'hello' }] },
            c2: { id: 'c2', messages: [{ role: 'assistant', content: 'world' }] },
          },
          conversationOrder: ['missing', 'c2', 'c2'],
          activeConvId: 'missing',
          characters: { arona: { name: 'Arona' } },
          worldBooks: { wb1: { id: 'wb1', entries: [] } },
          charactersMigrated: 'false',
          lastSaved: 10,
        };
      },
      getBackend() { return 'idb'; },
      _hasUserData() { return true; },
    },
    loadAll() { return null; },
    defaultConversation() { return { id: 'default', messages: [] }; },
    migrateCharactersToRegistry() { migratedCount += 1; },
    persistState() { persisted = true; },
    normalizeUiTheme(value) { return value; },
    cacheUiTheme() {},
    ensureInterfaceBehaviorSettings(settings) {
      if (typeof settings.showReplyAvatar !== 'boolean') settings.showReplyAvatar = false;
      if (typeof settings.showMsgTokenUsage !== 'boolean') settings.showMsgTokenUsage = false;
      if (typeof settings.submitWithCmdEnter !== 'boolean') settings.submitWithCmdEnter = true;
      if (typeof settings.streamEnabled !== 'boolean') settings.streamEnabled = true;
      return settings;
    },
    applyUiTheme() {},
    applyPerformanceMode() {},
    DEFAULT_TWO_STAGE_PROMPT: 'two stage default',
    console: { log() {}, warn() {} },
    Object,
    Array,
    Set,
  };

  vm.runInNewContext(`${messageIdentitySource}\n${summaryValiditySource}\n${sources.join('\n')}\nthis.__initState = initState;`, context);
  await context.__initState();

  assert(context.state.settings.lang === 'en', 'initState did not restore settings.');
  assert(context.state.settings.apiKey === '', 'initState should clear API key when saveApiKey is false/defaulted.');
  assert(context.state.settings.summarizeApiKey === '', 'initState should clear summarize API key when saveApiKey is false/defaulted.');
  assert(context.state.settings.twoStageSystemPrompt === 'two stage default', 'initState did not apply two-stage prompt default.');
  assert(context.state.conversations.c1.messages[0].content === 'hello', 'initState did not restore conversations.');
  assert(context.state.conversationOrder.join(',') === 'c2,c1', 'initState should normalize restored conversation order.');
  assert(context.state.activeConvId === 'c2', 'initState did not recover active conversation from conversationOrder.');
  assert(context.state.characters.arona.name === 'Arona', 'initState did not restore character cards.');
  assert(context.state.worldBooks.wb1.id === 'wb1', 'initState did not restore world books.');
  assert(context.state._charactersMigrated === true, 'initState did not set character migration flag.');
  assert(migratedCount === 1, 'initState should treat string "false" migration metadata as not migrated.');
  assert(context.state._storageMigration.backend === 'idb', 'initState did not record storage backend.');
  assert(persisted === true, 'initState should persist first character migration when user data exists.');
}
export { assertFrontendStateStoreDefaults, assertFrontendStatePersistenceHelpers, assertFrontendStateInitialization };
