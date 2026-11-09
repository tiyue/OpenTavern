import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, 'src/app', file), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));

function createLocalStorage() {
  const values = new Map();
  return {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
    _values: values
  };
}

function createPersistHarness(context) {
  context._persistFail = false;
  context._persistBeforeAck = null;
  context._durable = null;
  context.persistState = async (_immediate, options = {}) => {
    if (options.beforePersist) options.beforePersist();
    const snapshot = options.transformSnapshot ? options.transformSnapshot({
      settings: clone(context.state.settings),
      conversations: clone(context.state.conversations || {}),
      conversationOrder: clone(context.state.conversationOrder || []),
      activeConvId: context.state.activeConvId || null,
      worldBooks: clone(context.state.worldBooks || {}),
      characters: clone(context.state.characters || {})
    }) : { settings: clone(context.state.settings) };
    context._pending = clone(snapshot);
    if (context._persistBeforeAck) await context._persistBeforeAck();
    if (context._persistFail) throw new Error('quota');
    if (options.onPersistSuccess) options.onPersistSuccess();
    if (options.commitPendingSnapshot) options.commitPendingSnapshot(clone(context._pending));
    context._durable = clone(snapshot);
  };
}

async function testConnectionProfiles() {
  const localStorage = createLocalStorage();
  const context = {
    console, localStorage, TextEncoder, TextDecoder, URL,
    makeId: (() => { let id = 0; return () => 'profile-id-' + ++id; })(),
    t: key => key,
    appStore: { notify() {} },
    isLiveConversation: () => true,
    getActiveConv: () => context.state.conversations[context.state.activeConvId],
    state: {
      settings: {
        apiProtocol: 'anthropic', apiEndpoint: 'https://legacy.example/v1/messages', apiKey: 'legacy-main-key', saveApiKey: true,
        model: 'legacy-model', maxTokens: 4096, temperature: 0.4, topP: 0.8, frequencyPenalty: 0.1, presencePenalty: 0.2,
        contextLength: 18, summarizeUseMainAPI: true, summarizeApiKey: '', summarizeModel: 'legacy-summary',
        summarizeApiEndpoint: '', summarizeApiProtocol: '', summaryTemperature: 0.3, summaryPromptMode: 'standard'
      },
      conversations: {}, conversationOrder: [], activeConvId: null, isGenerating: false
    },
    ensurePresetLibrary: settings => { settings.presetLibrary = settings.presetLibrary || [{ id: 'default-preset', name: 'Default', prompts: [], promptOrder: [], regexScripts: [] }]; settings.activePresetId = settings.activePresetId || 'default-preset'; settings.sillyTavernPreset = settings.sillyTavernPreset || settings.presetLibrary[0]; },
    defaultSettings: () => ({ saveApiKey: false, connectionProfiles: [], activeConnectionProfileIds: { main: '', summary: '', embedding: '' }, quickReplyGroups: [] }),
    settingsValueEqual: (a, b) => JSON.stringify(a) === JSON.stringify(b),
    settingsFormDraft: null, settingsFormBaseline: null, settingsFormStateBaseline: null,
    updateInputState() {}, renderTokenBar() {},
    deriveApiModelsEndpoint: () => 'https://example.test/models',
    runApiModelsEndpointTest: async () => ({ ok: true, models: ['m1'] })
  };
  vm.createContext(context);
  ['api/31-api-protocol.js', 'sync/19-cloud-sync-settings-policy.js', 'storage/24-storage-compat.js', 'connections/31-connection-profiles.js'].forEach(file => {
    vm.runInContext(read(file), context, { filename: file });
  });
  createPersistHarness(context);
  context.state.settings = Object.assign(context.defaultSettings(), context.state.settings);

  const before = clone(context.state.settings);
  context.ensureConnectionProfiles(context.state.settings);
  assert.equal(context.state.settings.apiEndpoint, before.apiEndpoint, 'Migration must preserve the current endpoint.');
  assert.equal(context.state.settings.model, before.model, 'Migration must preserve the current model.');
  assert.equal(context.state.settings.summarizeUseMainAPI, true, 'Migration must preserve the summary main toggle.');
  assert.equal(context.state.settings.connectionProfiles.length, 3);
  assert.equal(context.state.settings.activeConnectionProfileIds.main, 'legacy-main-connection');
  assert.equal(context.state.settings.activeConnectionProfileIds.embedding, 'legacy-embedding-connection');

  const mainProfile = context.getActiveConnectionProfile('main');
  assert.equal(context.getConnectionProfileCredential(mainProfile), '', 'Migration policy must not silently move an unsaved API key.');
  context.migrateLegacyConnectionProfileCredentials();
  assert.equal(context.getConnectionProfileCredential(mainProfile), 'legacy-main-key');
  assert.ok(localStorage.getItem('opentavern_connection_profile_credentials'), 'saveApiKey=true may persist the paired local credential.');

  const changedEndpoint = clone(mainProfile);
  changedEndpoint.endpoint = 'https://other.example/v1/messages';
  assert.equal(context.getConnectionProfileCredential(changedEndpoint), '', 'A changed endpoint must not reuse the old key.');

  context.state.settings.saveApiKey = false;
  context.setConnectionProfileCredential(mainProfile, 'new-secret');
  assert.equal(localStorage.getItem('opentavern_connection_profile_credentials'), null, 'saveApiKey=false must not persist profile credentials.');
  assert.equal(context.getConnectionProfileCredential(mainProfile), 'new-secret', 'The current session may still use an in-memory key.');
  context.state.settings.saveApiKey = true;
  context.setConnectionProfileCredential(mainProfile, 'legacy-main-key');

  const sanitizedImport = context.importConnectionProfilesData({ type: 'opentavern-connection-profiles', profiles: [{ name: 'sanitized', purpose: 'main', protocol: 'openai', endpoint: 'https://evil.example', model: 'm', nested: { apiKey: 'stolen', public: 1 }, headers: { Authorization: 'leak' } }] });
  assert.ok(!/stolen|leak|apiKey|headers/.test(JSON.stringify(sanitizedImport)), 'Nested import credentials must be stripped, not merged.');
  const imported = context.importConnectionProfilesData({ type: 'opentavern-connection-profiles', profiles: [{ id: 'remote', name: 'Remote', purpose: 'main', protocol: 'openai', endpoint: 'https://remote.example/v1', model: 'remote-model', credentialRef: 'remote', parameters: { temperature: 0.2 } }] });
  assert.notEqual(imported[0].id, 'remote');
  assert.equal(imported[0].credentialRef, undefined);
  assert.equal(context.getConnectionProfileCredential(imported[0]), '');
  const exported = context.exportConnectionProfilesData();
  assert.ok(!JSON.stringify(exported).match(/apiKey|credentialRef|legacy-main-key/));

  const nestedSettings = clone(context.state.settings);
  nestedSettings.connectionProfiles = [{ id: 'p', name: 'P', purpose: 'main', protocol: 'openai', endpoint: 'https://x', model: 'm', credentialRef: 'p', parameters: { nested: { apiKey: 'leak', headers: { Authorization: 'leak' } } } }];
  const portable = context.getCloudSyncPortableSettings(nestedSettings);
  assert.ok(!JSON.stringify(portable).match(/apiKey|credentialRef|Authorization|"headers"/), 'Outgoing/nested credentials must be stripped, not only top-level fields.');
  context.state.settings = nestedSettings;
  const safe = context.getSafeSettingsForPersist();
  assert.ok(!JSON.stringify(safe.connectionProfiles).match(/apiKey|credentialRef|leak/), 'Ordinary persistence must strip nested profile credentials.');

  context.state.settings = Object.assign(context.defaultSettings(), {
    apiEndpoint: 'https://base.example/v1', apiProtocol: 'openai', model: 'base-model', apiKey: '',
    summarizeUseMainAPI: true, summarizeModel: 'summary-model', summaryTemperature: 0.3, summaryPromptMode: 'standard',
    connectionProfiles: [], activeConnectionProfileIds: { main: '', summary: '', embedding: '' }
  });
  context.ensureConnectionProfiles(context.state.settings);
  const added = { id: 'new-main', name: 'New main', purpose: 'main', protocol: 'openai', endpoint: 'https://new.example/v1', model: 'new-model', parameters: { temperature: 0.15, topP: 0.5, maxTokens: 2048, contextLength: 12, frequencyPenalty: 0, presencePenalty: 0, presetId: '' } };
  context.setConnectionProfileCredential(added, 'new-key');
  await context.saveConnectionProfileChange((candidate, profiles) => { profiles.push(added); return added.id; });
  await context.applyConnectionProfileSelection('main', 'new-main');
  assert.equal(context.state.settings.apiEndpoint, 'https://new.example/v1');
  assert.equal(context.state.settings.model, 'new-model');
  assert.equal(context.state.settings.apiKey, 'new-key');
  assert.equal(context.state.settings.summarizeUseMainAPI, true, 'Switching main must not change the independent summary selection.');

  context._persistFail = true;
  const activeBeforeFailure = clone(context.state.settings);
  await assert.rejects(context.saveConnectionProfileChange((candidate, profiles) => { profiles.find(item => item.id === 'new-main').name = 'Broken'; return 'new-main'; }), /quota/);
  assert.deepEqual(clone(context.state.settings), activeBeforeFailure, 'Failed profile saves must keep the old state.');
  assert.ok(context.failedConnectionProfileDraft, 'Failed profile saves must retain a retryable draft.');
  context._persistFail = false;
  await context.commitConnectionProfileSettingsKeys(context.failedConnectionProfileDraft.candidate, context.failedConnectionProfileDraft.keys);
  assert.equal(context.state.settings.connectionProfiles.find(item => item.id === 'new-main').name, 'Broken');

  context.state.isGenerating = true;
  await assert.rejects(context.applyConnectionProfileSelection('main', 'new-main'), /wait_generation/);
  context.state.isGenerating = false;

  context.state.settings.activeConnectionProfileIds.main = 'missing-profile';
  context.ensureConnectionProfiles(context.state.settings);
  assert.equal(context.state.settings.activeConnectionProfileIds.main, 'missing-profile', 'Missing active references stay visible for an explicit choice.');
  assert.equal(context.getActiveConnectionProfile('main'), null);

  context.state.settings.activeConnectionProfileIds.main = 'new-main';
  context.settingsFormDraft = clone(context.state.settings);
  context.settingsFormBaseline = clone(context.state.settings);
  context.settingsFormStateBaseline = clone(context.state.settings);
  context.settingsFormDraft.temperature = 1.5;
  await assert.rejects(context.applyConnectionProfileSelection('main', 'new-main'), /settings_draft_conflict/);
  context.settingsFormDraft = null; context.settingsFormBaseline = null; context.settingsFormStateBaseline = null;
  context.failedConnectionProfileDraft = null;

  await assert.rejects(context.deleteConnectionProfile('new-main', {}), /replacement_required/);
  assert.ok(context.getConnectionProfileById('new-main'), 'A failed active-profile delete must keep the profile and references.');
  await context.deleteConnectionProfile('new-main', { main: 'legacy-main-connection' });
  assert.equal(context.getConnectionProfileById('new-main'), null);
  assert.equal(context.state.settings.activeConnectionProfileIds.main, 'legacy-main-connection');

  let revision = context.getConnectionProfileDraftRevision();
  const discovery = context.testConnectionProfileModels(mainProfile, revision);
  context.bumpConnectionProfileDraftRevision();
  return discovery.then(result => {
    assert.equal(result.stale, true, 'A model discovery response must be discarded after the profile draft generation changes.');
  }).then(() => context);
}

function testConnectionProfileMigrationPairing() {
  function makeContext() {
    const context = {
      console, JSON, Object, Array, String, Set,
      t: key => key,
      makeId: (() => { let id = 0; return () => 'migration-id-' + ++id; })(),
      localStorage: createLocalStorage(),
      state: {
        settings: {
          apiProtocol: 'openai', apiEndpoint: 'https://trusted.invalid/v1', apiKey: 'SYNTHETIC_LEGACY_MAIN_KEY',
          saveApiKey: true, model: 'test', summarizeUseMainAPI: true, summarizeApiKey: '', summarizeApiEndpoint: '',
          summarizeApiProtocol: '', summarizeModel: 'summary-model',
          connectionProfiles: [], activeConnectionProfileIds: { main: '', summary: '', embedding: '' }
        }
      }
    };
    vm.createContext(context);
    ['api/31-api-protocol.js', 'connections/31-connection-profiles.js'].forEach(file => {
      vm.runInContext(read(file), context, { filename: file });
    });
    return context;
  }

  const redirected = makeContext();
  redirected.state.settings.connectionProfiles = [{ id: 'remote-selected', name: 'remote', purpose: 'main', protocol: 'openai', endpoint: 'https://untrusted.invalid/v1', model: 'test', parameters: {} }];
  redirected.state.settings.activeConnectionProfileIds.main = 'remote-selected';
  redirected.migrateLegacyConnectionProfileCredentials();
  const remote = redirected.getActiveConnectionProfile('main');
  assert.equal(remote.id, 'remote-selected');
  assert.equal(redirected.getConnectionProfileCredential(remote), '', 'A legacy key must not bind to a replaced remote profile endpoint.');

  const paired = makeContext();
  paired.migrateLegacyConnectionProfileCredentials();
  const legacyMain = paired.getActiveConnectionProfile('main');
  assert.equal(paired.getConnectionProfileCredential(legacyMain), 'SYNTHETIC_LEGACY_MAIN_KEY', 'The legacy-created profile keeps its paired credential.');

  const independentSummary = makeContext();
  independentSummary.state.settings.summarizeUseMainAPI = false;
  independentSummary.state.settings.summarizeApiProtocol = 'openai';
  independentSummary.state.settings.summarizeApiEndpoint = 'https://summary.invalid/v1';
  independentSummary.state.settings.summarizeApiKey = 'SYNTHETIC_SUMMARY_KEY';
  independentSummary.migrateLegacyConnectionProfileCredentials();
  assert.equal(independentSummary.getConnectionProfileCredential(independentSummary.getActiveConnectionProfile('summary')), 'SYNTHETIC_SUMMARY_KEY');

  const replacedSummary = makeContext();
  replacedSummary.state.settings.summarizeUseMainAPI = false;
  replacedSummary.state.settings.summarizeApiProtocol = 'openai';
  replacedSummary.state.settings.summarizeApiEndpoint = 'https://summary.invalid/v1';
  replacedSummary.state.settings.summarizeApiKey = 'SYNTHETIC_SUMMARY_KEY';
  replacedSummary.state.settings.connectionProfiles = [{ id: 'remote-summary', name: 'remote summary', purpose: 'summary', protocol: 'openai', endpoint: 'https://untrusted.invalid/v1', model: 'test', parameters: { useMain: false } }];
  replacedSummary.state.settings.activeConnectionProfileIds.summary = 'remote-summary';
  replacedSummary.migrateLegacyConnectionProfileCredentials();
  assert.equal(replacedSummary.getConnectionProfileCredential(replacedSummary.getActiveConnectionProfile('summary')), '', 'A replaced summary endpoint must not inherit the legacy summary key.');

  const inherited = makeContext();
  inherited.state.settings.summarizeUseMainAPI = true;
  inherited.state.settings.summarizeApiKey = 'SYNTHETIC_SUMMARY_KEY';
  inherited.migrateLegacyConnectionProfileCredentials();
  assert.equal(inherited.getConnectionProfileCredential(inherited.getActiveConnectionProfile('summary')), '', 'A main-inheriting summary profile must not inherit the independent summary key.');
  assert.equal(inherited.getConnectionProfileCredential(inherited.getActiveConnectionProfile('main')), 'SYNTHETIC_LEGACY_MAIN_KEY');
}

async function testConnectionProfileReasoningCapture() {
  const localStorage = createLocalStorage();
  const context = {
    console, localStorage, TextEncoder, TextDecoder, URL,
    makeId: (() => { let id = 0; return () => 'reasoning-profile-' + ++id; })(),
    t: key => key,
    appStore: { notify() {} },
    updateInputState() {}, renderTokenBar() {},
    settingsFormDraft: null, settingsFormBaseline: null, settingsFormStateBaseline: null,
    defaultSettings: () => ({ saveApiKey: false, connectionProfiles: [], activeConnectionProfileIds: { main: '', summary: '', embedding: '' } }),
    settingsValueEqual: (a, b) => JSON.stringify(a) === JSON.stringify(b),
    state: {
      settings: {
        apiProtocol: 'openai', apiEndpoint: 'https://main.example/v1', apiKey: '', saveApiKey: false,
        model: 'main-model', temperature: 0.3, topP: 0.8, maxTokens: 4096, contextLength: 12,
        frequencyPenalty: 0, presencePenalty: 0, reasoningEffort: '', thinking: null, modelContextCapacity: 0,
        summarizeUseMainAPI: false, summarizeApiProtocol: 'anthropic', summarizeApiEndpoint: 'https://summary.example/v1',
        summarizeModel: 'summary-model', summarizeApiKey: '', summaryTemperature: 0.3, summaryPromptMode: 'standard',
        summaryReasoningEffort: '', summaryThinking: { type: 'enabled', budget_tokens: 1024 },
        activePresetId: '', connectionProfiles: [], activeConnectionProfileIds: { main: '', summary: '', embedding: '' }
      },
      conversations: {}, conversationOrder: [], activeConvId: null, isGenerating: false
    }
  };
  vm.createContext(context);
  ['api/31-api-protocol.js', 'sync/19-cloud-sync-settings-policy.js', 'storage/24-storage-compat.js', 'connections/31-connection-profiles.js'].forEach(file => {
    vm.runInContext(read(file), context, { filename: file });
  });
  createPersistHarness(context);

  context.ensureConnectionProfiles(context.state.settings);
  const migratedMain = context.getActiveConnectionProfile('main');
  const migratedSummary = context.getActiveConnectionProfile('summary');
  assert.ok(Object.prototype.hasOwnProperty.call(migratedMain.parameters, 'thinking'), 'Migration must keep the explicit thinking key.');
  assert.equal(migratedMain.parameters.thinking, null, 'Migration must keep an explicit thinking disable instead of dropping it.');
  assert.deepEqual(clone(migratedSummary.parameters.summaryThinking), { type: 'enabled', budget_tokens: 1024 }, 'Migration must keep the independent summary thinking object.');
  assert.ok(!Object.prototype.hasOwnProperty.call(migratedMain.parameters, 'summaryThinking'), 'Main profiles must not absorb summary thinking.');
  assert.ok(!Object.prototype.hasOwnProperty.call(migratedSummary.parameters, 'thinking'), 'Summary profiles must not absorb main thinking.');

  const portable = context.getCloudSyncPortableSettings(context.state.settings);
  const portableMain = portable.connectionProfiles.find(profile => profile.id === migratedMain.id);
  const portableSummary = portable.connectionProfiles.find(profile => profile.id === migratedSummary.id);
  assert.ok(Object.prototype.hasOwnProperty.call(portableMain.parameters, 'thinking'), 'Portable sync must keep the explicit thinking key.');
  assert.equal(portableMain.parameters.thinking, null, 'Portable sync must keep an explicit thinking null.');
  assert.deepEqual(clone(portableSummary.parameters.summaryThinking), { type: 'enabled', budget_tokens: 1024 });

  const exported = JSON.parse(JSON.stringify(context.exportConnectionProfilesData()));
  const imported = context.importConnectionProfilesData(exported);
  const importedMain = imported.find(profile => profile.purpose === 'main');
  const importedSummary = imported.find(profile => profile.purpose === 'summary');
  assert.equal(importedMain.parameters.thinking, null, 'Export/import must keep an explicit thinking null.');
  assert.deepEqual(clone(importedSummary.parameters.summaryThinking), { type: 'enabled', budget_tokens: 1024 }, 'Export/import must keep the summary thinking object.');

  const mainThinking = { type: 'enabled', budget_tokens: 4096 };
  const addedMain = { id: 'main-thinking', name: 'Main thinking', purpose: 'main', protocol: 'openai', endpoint: 'https://thinking.example/v1', model: 'thinking-model', parameters: { temperature: 0.2, topP: 0.7, maxTokens: 4096, contextLength: 12, frequencyPenalty: 0, presencePenalty: 0, thinking: mainThinking } };
  await context.saveConnectionProfileChange((candidate, profiles) => { profiles.push(addedMain); return addedMain.id; });
  mainThinking.type = 'disabled';
  const savedMain = context.getConnectionProfileById('main-thinking');
  assert.deepEqual(clone(savedMain.parameters.thinking), { type: 'enabled', budget_tokens: 4096 }, 'Saved thinking objects must be deep-copied, not aliased to the editor draft.');

  const addedSummary = { id: 'summary-disabled', name: 'Summary disabled', purpose: 'summary', protocol: 'openai', endpoint: 'https://summary-disabled.example/v1', model: 'summary-disabled-model', parameters: { useMain: false, summaryTemperature: 0.2, summaryPromptMode: 'standard', summaryThinking: null } };
  await context.saveConnectionProfileChange((candidate, profiles) => { profiles.push(addedSummary); return addedSummary.id; });
  context.ensureConnectionProfiles(context.state.settings);
  const savedSummary = context.getConnectionProfileById('summary-disabled');
  assert.ok(Object.prototype.hasOwnProperty.call(savedSummary.parameters, 'summaryThinking'), 'Saved summary profiles must keep the explicit summaryThinking key.');
  assert.equal(savedSummary.parameters.summaryThinking, null, 'Saved summary profiles must keep an explicit summaryThinking null.');

  const unrecorded = { id: 'plain-main', name: 'Plain', purpose: 'main', protocol: 'openai', endpoint: 'https://plain.example/v1', model: 'plain-model', parameters: { temperature: 0.5 } };
  assert.ok(!Object.prototype.hasOwnProperty.call(context.buildConnectionProfileProjection(unrecorded), 'thinking'), 'An unrecorded thinking field must stay absent from the projection.');
  const disabledSummaryProjection = context.buildConnectionProfileProjection(addedSummary);
  assert.ok(Object.prototype.hasOwnProperty.call(disabledSummaryProjection, 'summaryThinking'));
  assert.equal(disabledSummaryProjection.summaryThinking, null, 'An explicit summaryThinking null must project as a clear.');

  context.state.settings.thinking = { type: 'enabled', budget_tokens: 2048 };
  context.state.settings.summaryThinking = { type: 'disabled' };
  const mainPatch = context.buildConnectionProfileProjection(migratedMain);
  assert.ok(!Object.prototype.hasOwnProperty.call(mainPatch, 'summaryThinking'), 'Selecting a main profile must not project summary thinking.');
  assert.equal(mainPatch.thinking, null);
  const summaryPatch = context.buildConnectionProfileProjection(migratedSummary);
  assert.ok(!Object.prototype.hasOwnProperty.call(summaryPatch, 'thinking'), 'Selecting a summary profile must not project main thinking.');

  await context.applyConnectionProfileSelection('main', migratedMain.id);
  assert.equal(context.state.settings.thinking, null, 'Switching to the recorded main profile must clear the previous thinking object.');
  assert.deepEqual(clone(context.state.settings.summaryThinking), { type: 'disabled' }, 'Switching main must not change the summary thinking setting.');
  assert.equal(context._durable.settings.thinking, null, 'The durable snapshot must record the projected thinking null.');
  assert.deepEqual(clone(context._durable.settings.summaryThinking), { type: 'disabled' }, 'The durable snapshot must leave summary thinking untouched.');

  await context.applyConnectionProfileSelection('summary', migratedSummary.id);
  assert.deepEqual(clone(context.state.settings.summaryThinking), { type: 'enabled', budget_tokens: 1024 }, 'Switching to the summary profile must restore its recorded thinking object.');
  assert.equal(context.state.settings.thinking, null, 'Switching summary must not change the main thinking setting.');

  await context.applyConnectionProfileSelection('main', 'main-thinking');
  assert.deepEqual(clone(context.state.settings.thinking), { type: 'enabled', budget_tokens: 4096 }, 'Switching to an enabled main profile must project its thinking object.');
  assert.deepEqual(clone(context.state.settings.summaryThinking), { type: 'enabled', budget_tokens: 1024 }, 'The summary thinking setting must stay independent after a main switch.');
  await context.applyConnectionProfileSelection('summary', 'summary-disabled');
  assert.equal(context.state.settings.summaryThinking, null, 'Switching to the summary profile with an explicit null must clear its previous object.');
  assert.deepEqual(clone(context.state.settings.thinking), { type: 'enabled', budget_tokens: 4096 }, 'The main thinking setting must stay independent after a summary switch.');
}

async function testConnectionProfileTransactionSnapshots() {
  const localStorage = createLocalStorage();
  const context = {
    console, setTimeout, clearTimeout, JSON, Number, Object, Array, String, Set, Promise, URL, localStorage,
    makeId: (() => { let id = 0; return () => 'tx-profile-' + ++id; })(),
    t: key => key,
    appStore: { notify() {} },
    isLiveConversation: () => true,
    getActiveConv: () => context.state.conversations[context.state.activeConvId],
    defaultSettings: () => ({ saveApiKey: false, connectionProfiles: [], activeConnectionProfileIds: { main: '', summary: '', embedding: '' }, quickReplyGroups: [] }),
    settingsValueEqual: (a, b) => JSON.stringify(a) === JSON.stringify(b),
    settingsFormDraft: null, settingsFormBaseline: null, settingsFormStateBaseline: null,
    updateInputState() {}, renderTokenBar() {},
    state: {
      settings: {
        apiProtocol: 'openai', apiEndpoint: 'https://tx.example/v1', apiKey: '', saveApiKey: false, model: 'tx-model',
        summarizeUseMainAPI: false, summarizeApiKey: '', summarizeApiEndpoint: 'https://summary.example/v1',
        summarizeApiProtocol: 'openai', summarizeModel: 'summary-model',
        connectionProfiles: [], activeConnectionProfileIds: { main: '', summary: '', embedding: '' }
      },
      conversations: { c1: { id: 'c1', messages: [] } }, conversationOrder: ['c1'], activeConvId: 'c1', isGenerating: false
    }
  };
  vm.createContext(context);
  ['api/31-api-protocol.js', 'conversation/19-conversation-order-helpers.js', 'sync/19-cloud-sync-settings-policy.js', 'storage/24-storage-compat.js', 'state/35-persist-records.js', 'state/35-persist-snapshot-helpers.js', 'state/35-state-persistence.js', 'connections/31-connection-profiles.js'].forEach(file => {
    vm.runInContext(read(file), context, { filename: file });
  });
  const written = [];
  let deferredQueued = false;
  context.StorageService = {
    _lastSaveSnapshot: null,
    _cloneForPersist: value => value == null ? value : clone(value),
    _isQuotaError: () => false,
    saveAll: async snapshot => {
      written.push(clone(snapshot));
      if (!deferredQueued) {
        deferredQueued = true;
        context.persistState(false);
      }
      return { runtimeSnapshot: null };
    }
  };
  context.state.settings = Object.assign(context.defaultSettings(), context.state.settings);
  context.ensureConnectionProfiles(context.state.settings);
  const main = context.getActiveConnectionProfile('main');
  context.setConnectionProfileCredential(main, 'SYNTHETIC_MEMORY_ONLY_KEY');
  assert.equal(localStorage.getItem('opentavern_connection_profile_credentials'), null, 'saveApiKey=false must not persist a profile credential.');

  await context.applyConnectionProfileSelection('main', main.id);
  assert.equal(context.state.settings.apiKey, 'SYNTHETIC_MEMORY_ONLY_KEY', 'The runtime keeps the in-memory credential after a successful save.');
  assert.ok(written[0], 'The immediate persist must write a canonical snapshot.');
  assert.ok(!JSON.stringify(written[0].settings).includes('SYNTHETIC_MEMORY_ONLY_KEY'), 'The canonical snapshot must apply saveApiKey=false.');
  await new Promise(resolve => setTimeout(resolve, 700));
  assert.ok(written[1], 'The deferred persist must write its pending snapshot.');
  assert.ok(!JSON.stringify(written[1].settings).includes('SYNTHETIC_MEMORY_ONLY_KEY'), 'Pending snapshot merges must apply saveApiKey=false.');
  const refreshed = clone(written[1]);
  assert.equal(refreshed.settings.activeConnectionProfileIds.main, main.id, 'The deferred snapshot must include the committed profile selection.');
  assert.equal(refreshed.settings.apiKey, '', 'A refresh from the durable snapshot must not restore a memory-only key.');
  assert.equal(refreshed.settings.summarizeApiKey, '');
}

function testConnectionProfileCredentialStorageFailures() {
  function makeContext(localStorage) {
    const context = {
      console, JSON, Object, Array, String, Set,
      t: key => key,
      localStorage,
      state: {
        settings: {
          saveApiKey: true, apiEndpoint: 'https://store.example/v1', apiProtocol: 'openai',
          connectionProfiles: [], activeConnectionProfileIds: { main: '', summary: '', embedding: '' }
        }
      }
    };
    vm.createContext(context);
    ['api/31-api-protocol.js', 'connections/31-connection-profiles.js'].forEach(file => {
      vm.runInContext(read(file), context, { filename: file });
    });
    return context;
  }
  const profile = { id: 'store-profile', purpose: 'main', protocol: 'openai', endpoint: 'https://store.example/v1' };

  const throwingValues = new Map();
  const throwing = makeContext({
    getItem: key => throwingValues.has(key) ? throwingValues.get(key) : null,
    setItem: () => { throw new Error('quota'); },
    removeItem: key => throwingValues.delete(key)
  });
  assert.throws(() => throwing.setConnectionProfileCredential(profile, 'SYNTHETIC_RETRY_KEY'), /conn_profile_credential_save_failed/);
  assert.equal(throwing.getConnectionProfileCredential(profile), '', 'A quota failure must not leave a falsely saved credential in memory.');
  assert.equal(throwingValues.size, 0);

  const silentValues = new Map();
  const silent = makeContext({
    getItem: key => silentValues.has(key) ? silentValues.get(key) : null,
    setItem: () => {},
    removeItem: key => silentValues.delete(key)
  });
  assert.throws(() => silent.setConnectionProfileCredential(profile, 'SYNTHETIC_RETRY_KEY'), /conn_profile_credential_save_failed/);
  assert.equal(silent.getConnectionProfileCredential(profile), '', 'A silently dropped write is detected by the read-back check.');

  const stored = createLocalStorage();
  const saved = makeContext(stored);
  saved.setConnectionProfileCredential(profile, 'SYNTHETIC_ROUNDTRIP_KEY');
  assert.ok(stored.getItem('opentavern_connection_profile_credentials').includes('SYNTHETIC_ROUNDTRIP_KEY'));
  const seeded = createLocalStorage();
  seeded.setItem('opentavern_connection_profile_credentials', stored.getItem('opentavern_connection_profile_credentials'));
  const restored = makeContext(seeded);
  assert.equal(restored.getConnectionProfileCredential(profile), 'SYNTHETIC_ROUNDTRIP_KEY', 'A stored credential is read back on the next startup with its endpoint pair.');

  const memoryStore = createLocalStorage();
  const memoryOnly = makeContext(memoryStore);
  memoryOnly.state.settings.saveApiKey = false;
  memoryOnly.setConnectionProfileCredential(profile, 'SYNTHETIC_MEMORY_KEY');
  assert.equal(memoryOnly.getConnectionProfileCredential(profile), 'SYNTHETIC_MEMORY_KEY');
  assert.equal(memoryStore.getItem('opentavern_connection_profile_credentials'), null, 'saveApiKey=false must never write the credential store.');
}

async function testQuickReplies() {
  const context = {
    console, makeId: (() => { let id = 0; return () => 'qr-' + ++id; })(), t: key => key,
    state: {
      settings: { quickReplyGroups: [], userName: 'User', apiEndpoint: 'https://test.example/v1', apiKey: 'test-key' }, conversations: {}, conversationOrder: [], activeConvId: null, isGenerating: false,
      characters: { alice: { name: 'Alice' } }
    },
    appStore: { notify() {} },
    isLiveConversation: () => true,
    getActiveConv: () => context.state.conversations[context.state.activeConvId],
    persistConversationMutation: async (conv, rollback, candidate, commit) => {
      if (context._convFail) throw new Error('conv-fail');
      if (!commit(conv, true)) throw new Error('stale');
      commit(conv);
    },
    replacePlaceholders: text => String(text).replace(/\{\{user\}\}/g, 'User').replace(/\{\{char\}\}/g, 'Alice'),
    dom: { messageInput: { value: '', focus() {}, dispatchEvent() {} } },
    document: { getElementById: () => null },
    syncComposerConversation() {}, getComposerDraft: () => context._draft || (context._draft = { text: '', images: [], pending: 0, revision: 0, notice: '' }),
    cancelUserDraft() {}, sendMessage: async () => { context._sends = (context._sends || 0) + 1; await Promise.resolve(); },
    _persistPendingRecords: [], isBackupRestorePending: () => false, cloudSyncActiveOperations: 0,
    composerSendInProgress: false,
    Event: class { constructor(type) { this.type = type; } }
  };
  vm.createContext(context);
  ['quick-replies/32-quick-replies.js', 'quick-replies/67-quick-replies-ui.js'].forEach(file => vm.runInContext(read(file), context, { filename: file }));
  createPersistHarness(context);
  const conv = { id: 'c1', character: { name: 'Alice' }, messages: [{ id: 'u1', role: 'user', content: 'hi', revision: 'r1' }], group: null };
  context.state.conversations.c1 = conv; context.state.conversationOrder = ['c1']; context.state.activeConvId = 'c1';

  await context.saveQuickReplyGroupsChange((candidate, groups) => {
    groups.push({ id: 'g1', name: 'G', enabled: true, scope: 'global', targetId: '', buttons: [{ id: 'b1', name: 'B', content: 'Hello {{user}}', action: 'insert', enabled: true }] });
  });
  assert.equal(context.getActiveQuickReplyButtons(conv).length, 1, 'A global group must be visible.');
  assert.equal(context.expandQuickReplyText('Hello {{user}}', conv), 'Hello User', 'Known macros are expanded without executing code.');
  assert.equal(context.expandQuickReplyText('X {{unknown::run}}', conv), 'X {{unknown::run}}', 'Unknown macros remain untouched.');
  assert.equal(context.mergeQuickReplyIntoComposerText('draft', 'button', 'append'), 'draft\nbutton');
  assert.equal(context.mergeQuickReplyIntoComposerText('draft', 'button', 'replace'), 'button');

  await context.saveQuickReplyGroupsChange((candidate, groups) => {
    groups.push({ id: 'g2', name: 'Char', enabled: true, scope: 'character', targetId: 'alice', buttons: [{ id: 'b2', name: 'B2', content: 'x', action: 'send', enabled: true }] });
    groups.push({ id: 'g3', name: 'Conv', enabled: true, scope: 'conversation', targetId: 'c1', buttons: [{ id: 'b3', name: 'B3', content: 'y', action: 'insert', enabled: true }] });
  });
  assert.deepEqual(Array.from(context.getActiveQuickReplyButtons(conv), item => item.groupId), ['g1', 'g2', 'g3']);
  await context.toggleConversationQuickReplyGroup(conv, 'g2', true);
  assert.deepEqual(Array.from(context.getActiveQuickReplyButtons(conv), item => item.groupId), ['g1', 'g3'], 'A conversation can disable an inherited group.');

  const beforeFailure = clone(context.state.settings.quickReplyGroups);
  context._persistFail = true;
  await assert.rejects(context.saveQuickReplyGroupsChange((candidate, groups) => { groups[0].name = 'broken'; }), /quota/);
  assert.deepEqual(clone(context.state.settings.quickReplyGroups), beforeFailure);
  assert.ok(context.failedQuickReplyDraft);
  context._persistFail = false;
  context.failedQuickReplyDraft = null;

  const imported = context.importQuickReplyGroupsData({ type: 'opentavern-quick-replies', groups: [{ name: 'I', scope: 'global', buttons: [{ name: 'S', content: 'send me', action: 'send' }] }] });
  assert.equal(imported[0].buttons[0].action, 'insert', 'Imported direct-send buttons must be reset to insert.');

  const directItem = { groupId: 'g1', groupName: 'G', button: { id: 'b1', name: 'B', content: 'Hello {{user}}', action: 'send' } };
  const first = context.directSendQuickReply(directItem);
  const second = context.directSendQuickReply(directItem);
  await Promise.all([first, second]);
  assert.equal(context._sends, 1, 'Double clicking a direct-send button must not send twice.');
  assert.equal(context.dom.messageInput.value, 'Hello User');

  context.state.isGenerating = true;
  await assert.rejects(context.directSendQuickReply(directItem), /send_busy/);
  context.state.isGenerating = false;
  return context;
}

function testNestedCredentialFlows() {
  const context = {
    console, t: key => key,
    state: {
      settings: { apiKey: 'local-key', apiEndpoint: 'https://local.example/v1', apiProtocol: 'openai', saveApiKey: true },
      conversations: {}, conversationOrder: [], activeConvId: null, worldBooks: {}, characters: {}
    },
    defaultSettings: () => ({ apiKey: '', apiEndpoint: '', apiProtocol: 'openai', saveApiKey: false, connectionProfiles: [], activeConnectionProfileIds: { main: '', summary: '', embedding: '' } }),
    normalizeCloudSyncSnapshot: data => clone(data),
    normalizeCloudSyncRestoredConversations() {}, ensureCloudSyncRestoredActiveConversation() {},
    persistCloudSyncAppliedSnapshot() {}, notifyCloudSyncSnapshotApplied() {},
    READING_WIDTHS: { narrow: true, medium: true, wide: true, full: true }, READING_FONT_SIZES: ['default', '14', '15', '16', '18'],
    isSafeChatBackground: () => true, validateRegexScript() {}, normalizeUserPersonaRecord: (persona, index, legacy, source) => persona,
    ensurePresetLibrary(settings) { settings.presetLibrary = settings.presetLibrary || []; settings.activePresetId = settings.activePresetId || ''; settings.sillyTavernPreset = settings.sillyTavernPreset || {}; }
  };
  vm.createContext(context);
  ['api/31-api-protocol.js', 'conversation/19-conversation-order-helpers.js', 'sync/19-cloud-sync-settings-policy.js', 'sync/22-cloud-sync-apply-settings.js', 'storage/24-storage-compat.js', 'sync/22-cloud-sync-apply.js', 'transfer/63-backup-restore-plan.js'].forEach(file => {
    vm.runInContext(read(file), context, { filename: file });
  });
  const poisonedProfiles = [{
    id: 'remote-main', name: 'Remote', purpose: 'main', protocol: 'openai', endpoint: 'https://remote.example/v1', model: 'remote-model',
    credentialRef: 'remote-main', apiKey: 'remote-secret', headers: { Authorization: 'Bearer remote-secret' },
    parameters: { temperature: 0.2, nested: { apiKey: 'nested-secret' } }
  }];
  const presetMetadata = { id: 'p', name: 'Preset', prompts: [], promptOrder: [], regexScripts: [], extensions: { token: 'literal-template-token', headers: { label: 'imported-metadata' }, future: { privateKey: 'non-executing-raw-metadata' } } };
  const portableOut = context.getCloudSyncPortableSettings({
    presetLibrary: [clone(presetMetadata)],
    connectionProfiles: [{ id: 'synthetic', purpose: 'main', parameters: { thinking: { apiKey: 'SYNTHETIC_NESTED_SECRET' } }, apiKey: 'SYNTHETIC_PROFILE_SECRET' }]
  });
  assert.deepEqual(JSON.parse(JSON.stringify(portableOut.presetLibrary)), [presetMetadata], 'Raw preset metadata must survive portable-settings filtering unchanged.');
  assert.ok(!JSON.stringify(portableOut.connectionProfiles).includes('SYNTHETIC_'), 'Profile credentials are stripped at the connection-profile boundary only.');
  context.applyCloudSyncSnapshot({
    settings: { connectionProfiles: clone(poisonedProfiles), activeConnectionProfileIds: { main: 'remote-main', summary: '', embedding: '' }, presetLibrary: [clone(presetMetadata)] },
    conversations: {}, conversationOrder: [], activeConvId: null, characters: {}, worldBooks: {}, lastSaved: 1
  });
  const cloudProfiles = JSON.stringify(context.state.settings.connectionProfiles);
  assert.ok(!/remote-secret|nested-secret|credentialRef|Authorization/.test(cloudProfiles), 'Inbound cloud profiles must be sanitized at every depth.');
  assert.deepEqual(JSON.parse(JSON.stringify(context.state.settings.presetLibrary)), [presetMetadata], 'Inbound cloud settings must keep raw preset metadata intact.');
  assert.equal(context.state.settings.apiKey, 'local-key', 'Existing local credentials remain paired with the local endpoint.');
  assert.equal(context.state.settings.apiEndpoint, 'https://local.example/v1');
  const plan = context.buildBackupRestorePlan({
    type: 'opentavern-full-export', version: 3, conversations: [], conversationOrder: [], settings: { connectionProfiles: clone(poisonedProfiles) }
  }, { settings: true });
  const patchProfiles = JSON.stringify(plan.settingsPatch.connectionProfiles || []);
  assert.ok(patchProfiles.indexOf('remote-main') >= 0, 'Ordinary backup settings should still carry portable profile descriptions.');
  assert.ok(!/remote-secret|nested-secret|credentialRef|Authorization/.test(patchProfiles), 'Backup restore plans must strip nested credentials before applying them.');
  const presetPlan = context.buildBackupRestorePlan({
    type: 'opentavern-full-export', version: 3, conversations: [], conversationOrder: [],
    settings: { presetLibrary: [clone(presetMetadata)] }
  }, { presets: true });
  assert.deepEqual(JSON.parse(JSON.stringify(presetPlan.settingsPatch.presetLibrary)), [presetMetadata], 'Backup restore plans must keep raw preset metadata intact.');
  return context;
}

async function testGroupStrategies() {
  const alice = { name: 'Alice' };
  const bob = { name: 'Bob' };
  const carol = { name: 'Carol' };
  const conv = {
    id: 'g', title: 'Group', character: alice,
    group: { members: [
      { character: alice, muted: false, order: 0 },
      { character: bob, muted: false, order: 1 },
      { character: carol, muted: true, order: 2 }
    ] },
    messages: [
      { id: 'u1', role: 'user', content: '@Bob hello', revision: 'u1:1' },
      { id: 'a1', role: 'assistant', content: 'hi', speaker: 'Alice', revision: 'a1:1' }
    ],
    summaries: []
  };
  const context = {
    console, t: key => key, state: { settings: { userName: 'User' }, conversations: { g: conv }, activeConvId: 'g', isGenerating: false },
    getActiveConv: () => conv, isLiveConversation: () => true, appStore: { notify() {} },
    updateInputState() {}, requestFullRender() {}, updateStreamingBubble() {}, renderMessagesOnly() {}, alert() {},
    streamChat(onToken, onComplete) { context._turns = (context._turns || 0) + 1; Promise.resolve().then(() => onComplete('ok', '', null, {})); },
    handlePrimaryAssistantComplete(fullContent, fullCot, usage, conversation) { context.advanceGroupAutoRounds(conversation); },
    pendingGroupMention: null,
    persistConversationMutation: async (target, rollback, candidate, commit) => {
      if (context._convFail) throw new Error('conv-fail');
      if (!commit(target, true)) throw new Error('stale');
      commit(target);
    },
    setTimeout: (fn, ms) => { context._timer = { fn, ms }; return context._timer; },
    clearTimeout: timer => { if (context._timer === timer) context._timer = null; }
  };
  vm.createContext(context);
  ['conversation/32-group-chat-members.js', 'conversation/32-group-chat-speakers.js', 'conversation/32-group-chat-message-helpers.js', 'conversation/32-group-chat-strategies.js'].forEach(file => {
    vm.runInContext(read(file), context, { filename: file });
  });
  assert.equal(context.getNextGroupSpeaker(conv).name, 'Bob', 'Default round-robin must preserve the legacy order.');
  assert.equal(context.getGroupSpeakerForMode(conv, 'natural').name, 'Bob', 'A recent @ mention drives the natural strategy.');
  conv.group.speakerStrategy = { mode: 'probability', weights: { Alice: 0, Bob: 1, Carol: 0 }, autoRoundCount: 2, autoRoundIntervalSec: 1 };
  context.groupSpeakerRandom = () => 0.9;
  assert.equal(context.getGroupSpeakerForMode(conv, 'probability').name, 'Bob');
  conv.group.speakerStrategy.weights = { Alice: 0, Bob: 0, Carol: 0 };
  assert.equal(context.getGroupSpeakerForMode(conv, 'probability'), null, 'All-zero weights must not loop or fall back silently.');
  assert.equal(context.getGroupSendBlockReason(conv, 'hello'), 'group_strategy_zero_weights');
  conv.group.speakerStrategy = { mode: 'manual', weights: { Alice: 1, Bob: 1, Carol: 1 }, manualSpeakerName: 'Alice' };
  assert.equal(context.getNextGroupSpeaker(conv).name, 'Alice');
  assert.equal(context.getGroupSpeakerForUserMessage(conv, '@Carol hi').reason, 'group_strategy_muted_mention', 'A muted @ mention must not participate silently.');
  conv.group.speakerStrategy = { mode: 'round-robin', weights: {}, autoRoundCount: 2, autoRoundIntervalSec: 1 };
  context.pendingGroupMention = null;

  const validStrategy = { weights: {}, manualSpeakerName: '', autoRoundCount: 2, autoRoundIntervalSec: 1 };
  ['round-robin', 'manual', 'natural', 'probability'].forEach(mode => {
    assert.equal(context.validateGroupSpeakerStrategy(conv, Object.assign({}, validStrategy, { mode })).mode, mode, 'Each supported strategy mode must validate.');
  });
  assert.equal(context.validateGroupSpeakerStrategy(conv, validStrategy).mode, 'round-robin', 'Legacy records without an explicit mode stay compatible.');
  assert.throws(() => context.validateGroupSpeakerStrategy(conv, Object.assign({}, validStrategy, { mode: 'invalid' })), /group_strategy_mode_invalid/, 'An explicit invalid mode string must be rejected, not coerced.');
  assert.throws(() => context.validateGroupSpeakerStrategy(conv, Object.assign({}, validStrategy, { mode: 7 })), /group_strategy_mode_invalid/, 'A non-string mode must be rejected.');
  assert.throws(() => context.validateGroupSpeakerStrategy(conv, Object.assign({}, validStrategy, { mode: { value: 'natural' } })), /group_strategy_mode_invalid/, 'An object mode must be rejected.');

  context._convFail = true;
  const savedGroup = JSON.stringify(conv.group);
  await assert.rejects(context.saveGroupSpeakerStrategy(conv, { mode: 'natural', weights: {}, autoRoundCount: 2, autoRoundIntervalSec: 1 }), /conv-fail/);
  assert.equal(JSON.stringify(conv.group), savedGroup, 'Failed group strategy saves must preserve the old configuration.');
  context._convFail = false;

  assert.throws(() => context.startGroupAutoRounds(conv, 0, 1), /rounds_invalid/);
  assert.throws(() => context.startGroupAutoRounds(conv, 1, 31), /interval_invalid/);
  context.startGroupAutoRounds(conv, 2, 1);
  assert.equal(context._turns, 1);
  assert.equal(context.groupAutoRoundState.remaining, 2);
  return Promise.resolve().then(() => Promise.resolve()).then(() => {
    assert.equal(context.groupAutoRoundState.remaining, 1, 'One successfully saved assistant reply counts as one step.');
    assert.ok(context._timer, 'The next bounded auto round must wait for the configured interval.');
    context._timer.fn();
    return Promise.resolve().then(() => Promise.resolve()).then(() => {
      assert.equal(context._turns, 2);
      assert.equal(context.groupAutoRoundState, null, 'The bounded auto rounds must stop after the configured count.');
      context.startGroupAutoRounds(conv, 1, 1);
      context.cancelGroupAutoRounds();
      assert.equal(context.groupAutoRoundState, null, 'Stop must cancel pending auto rounds.');
      return context;
    });
  });
}

function testGroupAutoRoundOwnership() {
  function makeContext() {
    const conv = {
      id: 'g', title: 'Group', character: { name: 'Alice' },
      group: { members: [{ character: { name: 'Alice' }, muted: false }], speakerStrategy: { mode: 'round-robin', autoRoundCount: 2, autoRoundIntervalSec: 1 } },
      messages: []
    };
    const context = {
      console, clearTimeout() {},
      setTimeout: (fn, ms) => ({ fn, ms }),
      t: key => key,
      state: { settings: { userName: 'User' }, conversations: { g: conv }, activeConvId: 'g', isGenerating: false, abortController: null },
      appStore: { notify() {} },
      isGroupChat: target => !!(target && target.group),
      getGroupMembers: target => target.group.members,
      parseGroupMention: () => null,
      getActiveConv: () => conv,
      isLiveConversation: target => target === conv,
      getCurrentGeneratingSpeakerName: () => 'Alice',
      getNextGroupSpeaker: () => ({ name: 'Alice' }),
      updateInputState() {}, requestFullRender() {}, updateStreamingBubble() {}, renderMessagesOnly() {},
      document: { getElementById: () => null },
      alerts: [],
      alert(message) { context.alerts.push(message); },
      completions: [], errors: [], handled: 0, aborts: 0,
      streamChat(onToken, onComplete, onError) {
        context.state.isGenerating = true;
        context.state.abortController = { abort() { context.aborts++; } };
        context.completions.push(onComplete);
        context.errors.push(onError);
      },
      handlePrimaryAssistantComplete(fullContent, fullCot, usage, conversation) {
        context.handled++;
        context.state.isGenerating = false;
        context.state.abortController = null;
        context.advanceGroupAutoRounds(conversation);
      }
    };
    vm.createContext(context);
    ['conversation/32-group-chat-strategies.js', 'generation/52-generation-message-lifecycle.js'].forEach(file => {
      vm.runInContext(read(file), context, { filename: file });
    });
    return context;
  }

  const cancelled = makeContext();
  cancelled.startGroupAutoRounds(cancelled.state.conversations.g, 2, 1);
  assert.equal(cancelled.state.isGenerating, true);
  cancelled.cancelGroupAutoRounds();
  assert.equal(cancelled.isGroupAutoRoundsActive(), false);
  cancelled.completions[0]('Current reply', '', null, {});
  assert.equal(cancelled.handled, 1, 'Cancelling future rounds must not discard the owned current completion.');
  assert.equal(cancelled.state.isGenerating, false, 'The owned completion must release the generation lock.');
  assert.equal(cancelled.isGroupAutoRoundsActive(), false, 'A cancelled run must not schedule further rounds.');

  const failed = makeContext();
  failed.startGroupAutoRounds(failed.state.conversations.g, 2, 1);
  failed.cancelGroupAutoRounds();
  failed.errors[0](new Error('synthetic stream error'));
  assert.equal(failed.handled, 0);
  assert.equal(failed.state.isGenerating, false, 'An owned stream error after cancellation must release the lock.');
  assert.equal(failed.alerts.length, 1);

  const dialogFailure = makeContext();
  dialogFailure.startGroupAutoRounds(dialogFailure.state.conversations.g, 2, 1);
  const dialogError = { textContent: '' };
  dialogFailure.document = {
    getElementById: () => null,
    querySelectorAll: () => [{ querySelector: selector => selector === '.feature-error' ? dialogError : null }]
  };
  dialogFailure.errors[0](new Error('synthetic stream error'));
  assert.equal(dialogError.textContent, 'group_strategy_auto_failed: synthetic stream error', 'An open secondary dialog must show the auto-round error in its existing error slot.');
  assert.equal(dialogFailure.alerts.length, 0, 'An open secondary dialog must not stack a blocked glass alert.');
  assert.equal(dialogFailure.state.isGenerating, false);
  assert.equal(dialogFailure.isGroupAutoRoundsActive(), false);

  const stopped = makeContext();
  stopped.startGroupAutoRounds(stopped.state.conversations.g, 2, 1);
  stopped.stopGeneration();
  assert.equal(stopped.aborts, 1, 'The explicit stop button must abort the owned request.');
  stopped.completions[0]('', '', null, { interrupted: true });
  assert.equal(stopped.handled, 1, 'An interrupted completion from the owned request must still be settled.');
  assert.equal(stopped.state.isGenerating, false);

  const late = makeContext();
  late.startGroupAutoRounds(late.state.conversations.g, 1, 1);
  const oldComplete = late.completions[0];
  late.cancelGroupAutoRounds();
  oldComplete('First reply', '', null, {});
  assert.equal(late.handled, 1);
  late.state.isGenerating = true;
  oldComplete('Duplicate late reply', '', null, {});
  assert.equal(late.handled, 1, 'A late duplicate completion from a settled run must be ignored.');
  assert.equal(late.state.isGenerating, true, 'A late completion must not clear a newer request lock.');
}

async function testConversationSwitchCancellation() {
  const convA = { id: 'a', messages: [] };
  const convB = { id: 'b', messages: [] };
  const context = {
    console, setTimeout, t: key => key,
    state: { isGenerating: true, activeConvId: 'a', conversations: { a: convA, b: convB }, settings: { summaryEnabled: false } },
    getActiveConv: () => context.state.conversations[context.state.activeConvId],
    groupAutoRoundState: { conversationId: 'b' },
    confirmResult: false,
    cancelledRounds: 0,
    stopped: 0,
    showGlassConfirm: async () => context.confirmResult,
    stopGeneration() { context.stopped++; },
    cancelGroupAutoRounds() { context.cancelledRounds++; },
    saveCurrentConversation() {}, clearPendingGroupMention() {}, isGroupChat: () => false,
    getConversationDisplayCharacterName: () => '', resetConversationRuntimeState() {}, persistState() {},
    deleteConversationFromLibraryState() {}, requestRender() {}, renderTokenBar() {},
    dom: { messagesContainer: null }, currentView: 'chat', isMobile: () => false
  };
  vm.createContext(context);
  vm.runInContext(read('library/60-library-conversation-actions.js'), context, { filename: 'library/60-library-conversation-actions.js' });

  await context.loadConversation('b');
  assert.equal(context.stopped, 0, 'A cancelled switch confirmation must not stop generation.');
  assert.equal(context.cancelledRounds, 0, 'A cancelled switch confirmation must leave pending auto rounds intact.');
  assert.equal(context.state.activeConvId, 'a');

  await context.deleteConversation('b');
  assert.equal(context.cancelledRounds, 0, 'A cancelled delete confirmation must leave pending auto rounds intact.');

  context.confirmResult = true;
  await context.loadConversation('b');
  assert.equal(context.stopped, 1, 'A confirmed switch stops the current generation.');
  assert.equal(context.cancelledRounds, 1, 'A confirmed switch cancels future auto rounds.');
  assert.equal(context.state.activeConvId, 'b');
  context.state.isGenerating = false;
  context.confirmResult = true;
  await context.deleteConversation('b');
  assert.equal(context.cancelledRounds, 2, 'A confirmed delete of the running conversation cancels its auto rounds.');
}

function testBranches() {
  const convA = { id: 'a', title: 'Root', messages: [{ id: 'u1', role: 'user', content: 'fork here', revision: 'u1:1' }], created: 1 };
  const convB = { id: 'b', title: 'Branch B', branchOf: { conversationId: 'a', userMessageId: 'u1' }, messages: [{ id: 'u1', role: 'user', content: 'branch b', revision: 'u1:1' }], created: 2 };
  const convC = { id: 'c', title: 'Branch C', branchOf: { conversationId: 'a', userMessageId: 'u1' }, messages: [{ id: 'u1', role: 'user', content: 'branch c', revision: 'u1:1' }], created: 3 };
  const convD = { id: 'd', title: 'Branch D', branchOf: { conversationId: 'b', userMessageId: 'u1' }, messages: [{ id: 'u1', role: 'user', content: 'branch d', revision: 'u1:1' }], created: 4 };
  const orphan = { id: 'e', title: 'Orphan', branchOf: { conversationId: 'missing', userMessageId: 'u9' }, messages: [], created: 5 };
  const cycleA = { id: 'f', title: 'Cycle A', branchOf: { conversationId: 'g', userMessageId: 'u1' }, messages: [{ id: 'u1', role: 'user', content: 'x' }], created: 6 };
  const cycleB = { id: 'g', title: 'Cycle B', branchOf: { conversationId: 'f', userMessageId: 'u1' }, messages: [{ id: 'u1', role: 'user', content: 'y' }], created: 7 };
  const context = {
    t: key => key,
    state: { conversations: { a: convA, b: convB, c: convC, d: convD, e: orphan, f: cycleA, g: cycleB }, conversationOrder: ['a', 'b', 'c', 'd', 'e', 'f', 'g'], activeConvId: 'b' },
    getConversationIdsWithMissingFallback: (order, conversations) => [...new Set([...order, ...Object.keys(conversations)])],
    getActiveConv: () => convB
  };
  vm.createContext(context);
  vm.runInContext(read('conversation/32-conversation-branches.js'), context, { filename: 'conversation/32-conversation-branches.js' });
  const tree = context.buildConversationBranchTree(convB);
  assert.equal(tree.root.conversationId, 'a');
  assert.equal(tree.root.children.length, 2, 'Same-source branches must share the parent node.');
  assert.equal(tree.root.children[0].children.length, 1, 'Nested branches must be represented.');
  assert.equal(tree.root.children.find(node => node.conversationId === 'b').current, true);
  assert.equal(tree.root.children[0].fork.text, 'fork here');
  const orphanTree = context.buildConversationBranchTree(orphan);
  assert.equal(orphanTree.root.issue, 'branch_parent_missing');
  const cycleTree = context.buildConversationBranchTree(cycleA);
  assert.ok(cycleTree.issues.length > 0, 'Cycle bad data must be reported rather than recursing forever.');
  assert.ok(JSON.stringify(tree).indexOf('responseVersions') < 0, 'Reply versions are not separate branch nodes.');
  return context;
}

function testPresetDiff() {
  const context = { t: key => key };
  vm.createContext(context);
  ['presets/62-sillytavern-preset-placement.js', 'presets/62-sillytavern-preset-model.js', 'presets/62-preset-diff.js'].forEach(file => {
    vm.runInContext(read(file), context, { filename: file });
  });
  const left = { id: 'l', name: 'Left', temperature: 0.7, prompts: [
    { id: 'p1', identifier: 'p1', name: 'System', role: 'system', content: 'Line one\nLine two\n<img src=x onerror=alert(1)>', enabled: true, position: 'before_history', depth: 0 },
    { id: 'p2', identifier: 'p2', name: 'Rule', role: 'system', content: 'rule', enabled: true, position: 'in_chat', depth: 4 }
  ], promptOrder: [{ identifier: 'p1', order: 0 }, { identifier: 'p2', order: 1 }], regexScripts: [], squashSystemMessages: false };
  const same = clone(left);
  const noDiff = context.buildPresetDiff(left, same);
  assert.equal(noDiff.metadata.length, 0, 'Normalized identical presets must not show fake metadata differences.');
  assert.equal(noDiff.prompts.changed.length + noDiff.prompts.added.length + noDiff.prompts.removed.length, 0);

  const emptyContent = clone(left);
  emptyContent.prompts[0].content = '';
  const emptyDiff = context.buildPresetDiff(left, emptyContent);
  assert.equal(emptyDiff.prompts.changed.length, 1);
  assert.ok(emptyDiff.prompts.changed[0].textDiff.length > 0);

  const reordered = clone(left);
  reordered.promptOrder = [{ identifier: 'p2', order: 0 }, { identifier: 'p1', order: 1 }];
  const orderDiff = context.buildPresetDiff(left, reordered);
  assert.notDeepEqual(orderDiff.prompts.leftOrder, orderDiff.prompts.rightOrder);

  const missingContent = clone(left);
  delete missingContent.prompts[0].content;
  const missingDiff = context.buildPresetDiff(left, missingContent);
  const contentField = missingDiff.prompts.changed[0].fields.find(field => field.key === 'content');
  assert.equal(contentField.right.present, false, 'Missing fields must remain distinct from explicit empty values.');

  const metadata = clone(left);
  metadata.top_p = 0.5;
  const metadataDiff = context.buildPresetDiff(left, metadata);
  assert.ok(metadataDiff.metadata.some(field => field.key === 'top_p'));
  assert.ok(missingDiff.prompts.changed[0].textDiff.some(line => line.type === 'del' && line.text.indexOf('<img') >= 0), 'Malicious text stays data for the safe renderer.');
  return context;
}

await testConnectionProfiles();
testConnectionProfileMigrationPairing();
await testConnectionProfileReasoningCapture();
await testConnectionProfileTransactionSnapshots();
testConnectionProfileCredentialStorageFailures();
await testQuickReplies();
testNestedCredentialFlows();
await testGroupStrategies();
testGroupAutoRoundOwnership();
await testConversationSwitchCancellation();
testBranches();
testPresetDiff();
console.log('Tavern stage A runtime checks passed: connection profile migration pairing/credential storage failures/saveApiKey snapshot policy/delete replacement/reasoning capture and switch isolation, raw preset metadata preservation, quick reply bindings/import/direct send guard, group strategy validation/auto-round ownership/stops, branch bad data and preset diff.');
