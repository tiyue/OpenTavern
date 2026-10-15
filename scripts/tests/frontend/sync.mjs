import { assert, assertThrows, assertRejects } from '../support.mjs';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';


async function assertFrontendCloudSnapshot() {
  const policySource = await readFile(new URL('../../../src/app/sync/19-cloud-sync-settings-policy.js', import.meta.url), 'utf8');
  const compatSource = await readFile(new URL('../../../src/app/storage/24-storage-compat.js', import.meta.url), 'utf8');
  const orderSource = await readFile(new URL('../../../src/app/conversation/19-conversation-order-helpers.js', import.meta.url), 'utf8');
  const cloudSource = await readFile(new URL('../../../src/app/sync/22-cloud-sync.js', import.meta.url), 'utf8');
  const context = {
    state: {
      settings: {
        model: 'frontend-model',
        lang: 'en',
        showReplyAvatar: true,
        streamIdleTimeoutSec: 115,
        customPortableSetting: 'portable-value',
        saveApiKey: true,
        apiKey: 'secret-api-key',
        summarizeApiKey: 'secret-summary-key',
        futureAccessToken: 'future-secret-token',
        imageGenerationEndpoint: 'https://private-image.example/generate',
        imageGenerationToken: 'secret-image-token',
        cloudSyncEnabled: true,
        cloudSyncAutoUpload: true,
        cloudSyncEndpoint: 'https://sync.example/api',
        cloudSyncToken: 'secret-cloud-token',
        cloudSyncEncrypted: false,
        cloudSyncPassphrase: 'secret-passphrase',
        cloudSyncLastAt: 123456,
        cloudSyncLastStatus: 'last status',
        systemPrompt: '',
        postHistoryInstructions: '',
        twoStageSystemPrompt: '',
        twoStagePostHistoryInstructions: '',
        summaryPrompt: '',
        sillyTavernPreset: {
          name: 'Cloud preset',
          importedAt: '2026-08-31',
          prompts: [{ id: 'main', content: 'Portable SillyTavern prompt', enabled: false, order: 7 }],
          promptOrder: [{ identifier: 'main', enabled: false, order: 7 }],
          regexScripts: [{ findRegex: 'before', replaceString: 'after' }],
          regexScriptsEnabled: true,
          regexScriptsPrompted: true,
        },
      },
      conversations: {
        c1: { id: 'c1', messages: [{ role: 'user', content: 'frontend hello' }] },
        c2: { id: 'c2', messages: [{ role: 'assistant', content: 'missing from order' }] },
      },
      conversationOrder: ['c1'],
      activeConvId: 'c1',
      characters: {
        arona: { id: 'arona', name: 'Arona', first_mes: 'Sensei!' },
      },
      worldBooks: {
        wb1: { id: 'wb1', entries: [{ id: 'e1', content: 'Kivotos' }] },
      },
      _charactersMigrated: true,
    },
    StorageService: { _lastSaveSnapshot: null },
    dom: {
      settingsModal: { classList: { contains() { return false; } } },
      systemPrompt: { value: '  cloud system prompt  ' },
      postHistoryInstructions: { value: '  cloud post-history prompt  ' },
      twoStageSystemPrompt: { value: '  cloud second-stage system prompt  ' },
      twoStagePostHistoryInstructions: { value: '  cloud second-stage post prompt  ' },
      summaryPrompt: { value: '  cloud summary prompt  ' },
    },
    console,
    Date,
    JSON,
  };

  vm.runInNewContext(`${policySource}\n${compatSource}\n${orderSource}\n${cloudSource}\nthis.__freshness = getCloudSyncFreshness;\nthis.__prepareLocal = prepareCloudSyncLocalSnapshotForComparison;\nthis.__bytes = getCloudSyncSerializedBytes;\nthis.__conversationBytes = getCloudSyncConversationSerializedBytes;`, context);
  const snapshot = context.buildAppDataSnapshot();

  assert(snapshot.settings.model === 'frontend-model', 'Frontend cloud snapshot did not include settings.');
  assert(snapshot.settings.showReplyAvatar === true && snapshot.settings.streamIdleTimeoutSec === 115,
    'Frontend cloud snapshot must include interface behavior settings.');
  assert(snapshot.settings.customPortableSetting === 'portable-value',
    'Frontend cloud snapshot must include new ordinary settings by default.');
  assert(snapshot.settings.sillyTavernPreset.prompts[0].content === 'Portable SillyTavern prompt',
    'Frontend cloud snapshot must include complete SillyTavern prompt content.');
  assert(snapshot.settings.sillyTavernPreset.prompts[0].enabled === false &&
    snapshot.settings.sillyTavernPreset.promptOrder[0].order === 7 &&
    snapshot.settings.sillyTavernPreset.regexScriptsEnabled === true,
  'Frontend cloud snapshot must preserve SillyTavern order, enablement, and regex consent.');
  ['apiKey', 'summarizeApiKey', 'futureAccessToken', 'saveApiKey', 'imageGenerationEndpoint', 'imageGenerationToken',
    'cloudSyncEnabled', 'cloudSyncAutoUpload', 'cloudSyncEndpoint', 'cloudSyncToken',
    'cloudSyncEncrypted', 'cloudSyncPassphrase', 'cloudSyncLastAt', 'cloudSyncLastStatus'].forEach((key) => {
    assert(!Object.prototype.hasOwnProperty.call(snapshot.settings, key),
      `Frontend cloud snapshot must omit local-only setting: ${key}.`);
  });
  assert(snapshot.settings.systemPrompt === 'cloud system prompt', 'Frontend cloud snapshot should include non-empty custom system prompts from the visible settings form.');
  assert(snapshot.settings.postHistoryInstructions === 'cloud post-history prompt', 'Frontend cloud snapshot should include non-empty post-history prompts from the visible settings form.');
  assert(snapshot.settings.twoStageSystemPrompt === 'cloud second-stage system prompt', 'Frontend cloud snapshot should include non-empty second-stage system prompts from the visible settings form.');
  assert(snapshot.settings.twoStagePostHistoryInstructions === 'cloud second-stage post prompt', 'Frontend cloud snapshot should include non-empty second-stage post-history prompts from the visible settings form.');
  assert(snapshot.settings.summaryPrompt === 'cloud summary prompt', 'Frontend cloud snapshot should include non-empty summary prompts from the visible settings form.');
  assert(snapshot.conversations.c1.messages[0].content === 'frontend hello', 'Frontend cloud snapshot did not include chat history.');
  assert(snapshot.conversationOrder.join(',') === 'c1,c2', 'Frontend cloud snapshot should include conversations missing from conversation order.');
  assert(snapshot.activeConvId === 'c1', 'Frontend cloud snapshot did not include active conversation id.');
  assert(snapshot.characters.arona.first_mes === 'Sensei!', 'Frontend cloud snapshot did not include character cards.');
  assert(snapshot.worldBooks.wb1.entries[0].content === 'Kivotos', 'Frontend cloud snapshot did not include world books.');
  assert(snapshot.charactersMigrated === true, 'Frontend cloud snapshot did not include character migration state.');
  assert(Number.isFinite(snapshot.lastSaved), 'Frontend cloud snapshot did not include a timestamp.');
  context.state.activeConvId = 'missing';
  const activeFallbackSnapshot = context.buildAppDataSnapshot();
  assert(activeFallbackSnapshot.activeConvId === 'c1', 'Frontend cloud snapshot should recover invalid active conversation ids.');
  context.state.activeConvId = 'c1';
  context.state.conversations.c1.messages[0].content = 'mutated after snapshot';
  context.state.conversationOrder.push('later');
  context.state.characters.arona.first_mes = 'Changed!';
  context.state.worldBooks.wb1.entries[0].content = 'Changed world';
  assert(snapshot.conversations.c1.messages[0].content === 'frontend hello', 'Frontend cloud snapshot should not retain live conversation references.');
  assert(snapshot.conversationOrder.length === 2 && snapshot.conversationOrder[0] === 'c1' && snapshot.conversationOrder[1] === 'c2', 'Frontend cloud snapshot should not retain the live conversation order array.');
  assert(snapshot.characters.arona.first_mes === 'Sensei!', 'Frontend cloud snapshot should not retain live character card references.');
  assert(snapshot.worldBooks.wb1.entries[0].content === 'Kivotos', 'Frontend cloud snapshot should not retain live world book references.');
  assert(context.__freshness({ lastSaved: 1000 }) === 'newer', 'Cloud freshness should treat a timestamped remote snapshot as newer when no local snapshot is known.');
  context.StorageService._lastSaveSnapshot = { lastSaved: 2500, settings: { apiKey: 'stored-secret', cloudSyncToken: 'stored-token' } };
  assert(context.__freshness({ lastSaved: 1000 }) === 'older', 'Cloud freshness should compare against the loaded local snapshot timestamp.');
  assert(context.__freshness({ lastSaved: 2000 }) === 'same', 'Cloud freshness should tolerate small timestamp drift.');
  const comparableLocal = context.__prepareLocal();
  assert(comparableLocal.lastSaved === 2500, 'Cloud comparison snapshot should keep the stored local timestamp.');
  assert(!Object.prototype.hasOwnProperty.call(comparableLocal.settings, 'apiKey') &&
    !Object.prototype.hasOwnProperty.call(comparableLocal.settings, 'cloudSyncToken'),
  'Cloud comparison snapshot should omit local-only settings.');
  const localBytes = context.__conversationBytes(comparableLocal);
  assert(localBytes > 0, 'Cloud freshness should be able to measure local conversation bytes.');
  const dirtyComparableLocal = JSON.parse(JSON.stringify(comparableLocal));
  dirtyComparableLocal.conversationOrder = ['missing', 'c1', 'c1', 'c2'];
  dirtyComparableLocal.activeConvId = 'missing';
  assert(context.__conversationBytes(dirtyComparableLocal) === localBytes, 'Cloud freshness byte comparison should normalize dirty conversation order and active ids.');
  const remoteLarger = JSON.parse(JSON.stringify(comparableLocal));
  remoteLarger.lastSaved = 1000;
  remoteLarger.conversations.c3 = { id: 'c3', messages: [{ role: 'user', content: 'larger remote conversation payload'.repeat(10) }] };
  remoteLarger.conversationOrder.push('c3');
  assert(context.__freshness(remoteLarger, comparableLocal) === 'older', 'Cloud freshness should use timestamps even when an older remote snapshot is larger.');
  const remoteSmaller = { lastSaved: 4000, conversations: {}, conversationOrder: [], activeConvId: null };
  assert(context.__freshness(remoteSmaller, comparableLocal) === 'newer', 'Cloud freshness should use timestamps even when a newer remote snapshot is smaller.');
  const remoteSameSize = JSON.parse(JSON.stringify(comparableLocal));
  assert(context.__freshness(remoteSameSize, comparableLocal) === 'same', 'Cloud freshness should fall back to timestamp comparison when conversation sizes match.');
  remoteSameSize.lastSaved = 4000;
  assert(context.__freshness(remoteSameSize, comparableLocal) === 'newer', 'Cloud freshness should use timestamps when conversation sizes match.');
  const encryptedRemote = JSON.parse(JSON.stringify(remoteLarger));
  encryptedRemote.lastSaved = 2500;
  encryptedRemote.encrypted = true;
  assert(context.__freshness(encryptedRemote, comparableLocal) === 'same', 'Cloud freshness should not compare encrypted envelope bytes with plain local snapshots.');
}

async function assertFrontendCloudSnapshotApply() {
  const policySource = await readFile(new URL('../../../src/app/sync/19-cloud-sync-settings-policy.js', import.meta.url), 'utf8');
  const cloudSource = await readFile(new URL('../../../src/app/sync/22-cloud-sync.js', import.meta.url), 'utf8');
  const orderSource = await readFile(new URL('../../../src/app/conversation/19-conversation-order-helpers.js', import.meta.url), 'utf8');
  const normalizeSource = await readFile(new URL('../../../src/app/sync/22-cloud-sync-normalize.js', import.meta.url), 'utf8');
  const applySources = await Promise.all([
    '../../../src/app/sync/22-cloud-sync-apply-settings.js',
    '../../../src/app/sync/22-cloud-sync-apply-conversations.js',
    '../../../src/app/sync/22-cloud-sync-apply-effects.js',
    '../../../src/app/sync/22-cloud-sync-apply.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));
  let persisted = false;
  const persistCalls = [];
  let notified = null;
  let rendered = false;
  const promptControls = {
    systemPrompt: { value: 'old system prompt' },
    postHistoryInstructions: { value: 'old post prompt' },
    twoStageSystemPrompt: { value: 'old second system prompt' },
    twoStagePostHistoryInstructions: { value: 'old second post prompt' },
    summaryPrompt: { value: 'old summary prompt' },
  };
  const context = {
    state: {
      settings: {
        cloudSyncEnabled: true,
        cloudSyncAutoUpload: true,
        cloudSyncEndpoint: 'https://sync.example/api',
        cloudSyncToken: 'local-token',
        cloudSyncEncrypted: true,
        cloudSyncPassphrase: 'local-passphrase',
        saveApiKey: true,
        apiEndpoint: 'https://local-api.example/v1',
        apiKey: 'local-api-key',
        summarizeApiEndpoint: 'https://local-summary.example/v1',
        summarizeApiKey: 'local-summary-key',
        futureAccessToken: 'local-future-secret',
        imageGenerationEndpoint: 'https://local-image.example/generate',
        imageGenerationToken: '',
        systemPrompt: 'local system prompt',
        postHistoryInstructions: 'local post prompt',
        twoStageSystemPrompt: 'local second system prompt',
        twoStagePostHistoryInstructions: 'local second post prompt',
        summaryPrompt: 'local summary prompt',
      },
      conversations: {},
      conversationOrder: [],
      activeConvId: null,
      characters: {},
      worldBooks: {},
    },
    defaultSettings: () => ({
      model: 'default-model',
      cloudSyncEnabled: false,
      cloudSyncAutoUpload: false,
      cloudSyncEndpoint: '/api/sync',
      cloudSyncToken: '',
      cloudSyncEncrypted: false,
      cloudSyncPassphrase: '',
      cloudSyncLastAt: 0,
      cloudSyncLastStatus: '',
      imageGenerationEndpoint: '/api/image/generate',
      imageGenerationToken: '',
      systemPrompt: '',
      postHistoryInstructions: '',
      twoStageSystemPrompt: 'default second system prompt',
      twoStagePostHistoryInstructions: '',
      summaryPrompt: '',
    }),
    dom: {
      settingsModal: { classList: { contains() { return false; } } },
      ...promptControls,
    },
    hydratePrimaryApiSettings() {},
    hydrateGenerationSettings() {},
    hydratePromptSettings() {
      promptControls.systemPrompt.value = context.state.settings.systemPrompt || '';
      promptControls.postHistoryInstructions.value = context.state.settings.postHistoryInstructions || '';
    },
    hydrateTwoStageSettings() {
      promptControls.twoStageSystemPrompt.value = context.state.settings.twoStageSystemPrompt || '';
      promptControls.twoStagePostHistoryInstructions.value = context.state.settings.twoStagePostHistoryInstructions || '';
    },
    hydrateSillyTavernPresetSettings() {},
    hydrateSummarySettings() {
      promptControls.summaryPrompt.value = context.state.settings.summaryPrompt || '';
    },
    hydrateWorldInfoBudgetSettings() {},
    hydrateThemePerformanceSettings() {},
    hydrateSummarizationApiSettings() {},
    hydrateImageGenerationSettingsControls() {},
    normalizeConversation(conv) { conv.normalized = true; },
    defaultConversation() { return { id: 'default', messages: [] }; },
    persistState(force, options) {
      persisted = true;
      persistCalls.push({ force, options });
    },
    appStore: { notify(value) { notified = value; } },
    requestFullRender() { rendered = true; },
    updateInputState() {},
    updateStorageInfo() {},
    Date,
    Object,
    Array,
    Number,
    String,
  };

  vm.runInNewContext(`${policySource}\n${cloudSource}\n${orderSource}\n${normalizeSource}\n${applySources.join('\n')}\nthis.__apply = applyCloudSyncSnapshot;`, context);
  const applied = context.__apply({
    settings: {
      model: 'remote-model',
      apiEndpoint: 'https://remote-api.example/v1',
      cloudSyncToken: 'remote-token',
      saveApiKey: false,
      apiKey: '',
      summarizeApiEndpoint: 'https://remote-summary.example/v1',
      summarizeApiKey: '',
      futureAccessToken: 'remote-secret',
      imageGenerationEndpoint: 'https://remote-image.example/steal',
      imageGenerationToken: 'remote-image-token',
      systemPrompt: 'remote system prompt',
      postHistoryInstructions: 'remote post prompt',
      twoStageSystemPrompt: 'remote second system prompt',
      twoStagePostHistoryInstructions: 'remote second post prompt',
      summaryPrompt: 'remote summary prompt',
      showReplyAvatar: true,
      streamIdleTimeoutSec: 115,
      sillyTavernPreset: {
        name: 'Remote preset',
        importedAt: '2026-08-31',
        prompts: [{ id: 'main', content: 'Remote ST prompt', enabled: false, order: 4 }],
        promptOrder: [{ identifier: 'main', enabled: false, order: 4 }],
        regexScripts: [{ findRegex: 'x', replaceString: 'y' }],
        regexScriptsEnabled: true,
        regexScriptsPrompted: true,
      },
    },
    conversations: { c1: { id: 'c1', messages: [{ role: 'user', content: 'hello cloud' }] } },
    conversationOrder: ['c1'],
    activeConvId: 'c1',
    characters: { arona: { id: 'arona', name: 'Arona' } },
    worldBooks: { wb1: { id: 'wb1', entries: [] } },
    charactersMigrated: true,
    lastSaved: 123,
  });

  assert(applied.settings.model === 'remote-model', 'Applied cloud snapshot did not return remote settings.');
  assert(context.state.settings.model === 'remote-model', 'Cloud apply did not restore settings.');
  assert(context.state.settings.cloudSyncToken === 'local-token', 'Cloud apply must preserve local cloud sync token.');
  assert(context.state.settings.cloudSyncPassphrase === 'local-passphrase', 'Cloud apply must preserve local cloud sync passphrase.');
  assert(context.state.settings.saveApiKey === true, 'Cloud apply must preserve the local API key persistence setting.');
  assert(context.state.settings.apiKey === 'local-api-key', 'Cloud apply must preserve the local main API key.');
  assert(context.state.settings.apiEndpoint === 'https://local-api.example/v1',
    'Cloud apply must preserve the endpoint paired with a local main API key.');
  assert(context.state.settings.summarizeApiKey === 'local-summary-key', 'Cloud apply must preserve the local summary API key.');
  assert(context.state.settings.summarizeApiEndpoint === 'https://local-summary.example/v1',
    'Cloud apply must preserve the endpoint paired with a local summary API key.');
  assert(context.state.settings.futureAccessToken === 'local-future-secret',
    'Cloud apply must preserve future credential-like settings locally.');
  assert(context.state.settings.imageGenerationEndpoint === 'https://local-image.example/generate', 'Cloud apply must preserve the device-local image endpoint.');
  assert(context.state.settings.imageGenerationToken === '', 'Cloud apply must never restore an image gateway token from the remote snapshot.');
  assert(context.state.settings.systemPrompt === 'remote system prompt', 'Cloud apply did not restore the remote system prompt.');
  assert(promptControls.systemPrompt.value === 'remote system prompt', 'Cloud apply should refresh the visible system prompt field.');
  assert(promptControls.postHistoryInstructions.value === 'remote post prompt', 'Cloud apply should refresh the visible post-history prompt field.');
  assert(promptControls.twoStageSystemPrompt.value === 'remote second system prompt', 'Cloud apply should refresh the visible second-stage system prompt field.');
  assert(promptControls.twoStagePostHistoryInstructions.value === 'remote second post prompt', 'Cloud apply should refresh the visible second-stage post-history prompt field.');
  assert(promptControls.summaryPrompt.value === 'remote summary prompt', 'Cloud apply should refresh the visible summary prompt field.');
  assert(context.state.settings.showReplyAvatar === true && context.state.settings.streamIdleTimeoutSec === 115,
    'Cloud apply must restore interface behavior settings.');
  assert(context.state.settings.sillyTavernPreset.prompts[0].content === 'Remote ST prompt' &&
    context.state.settings.sillyTavernPreset.prompts[0].enabled === false &&
    context.state.settings.sillyTavernPreset.promptOrder[0].order === 4 &&
    context.state.settings.sillyTavernPreset.regexScriptsEnabled === true,
  'Cloud apply must restore complete SillyTavern preset data.');
  assert(context.state.conversations.c1.normalized === true, 'Cloud apply did not normalize restored conversations.');
  assert(context.state.conversations.c1.messages[0].content === 'hello cloud', 'Cloud apply did not restore chat history.');
  assert(context.state.characters.arona.name === 'Arona', 'Cloud apply did not restore character cards.');
  assert(context.state.worldBooks.wb1.id === 'wb1', 'Cloud apply did not restore world books.');
  assert(context.state.activeConvId === 'c1', 'Cloud apply did not restore active conversation.');
  assert(context.state._charactersMigrated === true, 'Cloud apply did not restore character migration flag.');
  assert(persisted === true, 'Cloud apply did not persist restored snapshot.');
  assert(persistCalls[0].force === true && persistCalls[0].options.lastSaved === 123, 'Cloud apply should persist using the remote snapshot freshness timestamp.');
  assert(rendered === true, 'Cloud apply did not request a full render.');
  assert(Array.isArray(notified) && notified.includes('characters') && notified.includes('worldBooks'), 'Cloud apply did not notify restored data domains.');

  const dirtyApplied = context.__apply({
    settings: { model: 'dirty-model' },
    conversations: {
      c2: { id: 'c2', messages: [] },
      c1: { id: 'c1', messages: [] },
    },
    conversationOrder: ['missing', 'c2', 1, 'c2'],
    activeConvId: 1,
    characters: null,
    worldBooks: [],
    charactersMigrated: 'yes',
    lastSaved: 'not-a-number',
  });

  assert(dirtyApplied.conversationOrder.join(',') === 'c2,c1', 'Cloud apply should normalize dirty conversation order.');
  assert(context.state.activeConvId === 'c2', 'Cloud apply should recover from an invalid active conversation id.');
  assert(context.state.conversations.c2.normalized === true, 'Cloud apply should normalize recovered conversations.');
  assert(context.state.characters && !Array.isArray(context.state.characters), 'Cloud apply should normalize invalid character cards to an object map.');
  assert(context.state.worldBooks && !Array.isArray(context.state.worldBooks), 'Cloud apply should normalize invalid world books to an object map.');
  assert(context.state._charactersMigrated === true, 'Cloud apply should normalize character migration metadata.');
  assert(Number.isFinite(dirtyApplied.lastSaved), 'Cloud apply should normalize invalid timestamps.');
  assert(persistCalls[1].options.lastSaved === dirtyApplied.lastSaved, 'Cloud apply should persist using the normalized remote timestamp.');

  const falseMigratedApplied = context.__apply({
    settings: { model: 'legacy-false-model' },
    conversations: { c3: { id: 'c3', messages: [] } },
    conversationOrder: ['c3'],
    activeConvId: 'c3',
    characters: {},
    worldBooks: {},
    charactersMigrated: 'false',
    lastSaved: 777,
  });

  assert(falseMigratedApplied.charactersMigrated === false && context.state._charactersMigrated === false, 'Cloud apply should not treat string "false" as migrated.');

  context.state.settings = {};
  const sparseLocalApplied = context.__apply({
    settings: { model: 'remote-after-sparse-local' },
    conversations: { c4: { id: 'c4', messages: [] } },
    conversationOrder: ['c4'],
    activeConvId: 'c4',
    characters: {},
    worldBooks: {},
    charactersMigrated: true,
    lastSaved: 888,
  });

  assert(sparseLocalApplied.settings.model === 'remote-after-sparse-local', 'Cloud apply should return the remote settings for sparse local settings.');
  assert(context.state.settings.model === 'remote-after-sparse-local', 'Sparse local settings should not overwrite remote settings with undefined values.');
  assert(context.state.settings.cloudSyncEndpoint === '/api/sync', 'Sparse local settings should preserve default cloud sync endpoint instead of undefined.');
  assertThrows(() => context.__apply([]), 'Cloud apply should reject array snapshots instead of treating them as object maps.');
}

async function assertFrontendCloudSyncCrypto() {
  const sources = await Promise.all([
    '../../../src/app/sync/22-cloud-sync.js',
    '../../../src/app/conversation/19-conversation-order-helpers.js',
    '../../../src/app/sync/22-cloud-sync-normalize.js',
    '../../../src/app/sync/22-cloud-sync-crypto-envelope.js',
    '../../../src/app/sync/22-cloud-sync-base64.js',
    '../../../src/app/sync/22-cloud-sync-key-derivation.js',
    '../../../src/app/sync/22-cloud-sync-decrypt.js',
    '../../../src/app/sync/22-cloud-sync-crypto.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  const snapshot = {
    settings: { model: 'secret-model-unique-9241' },
    conversations: {
      c1: {
        id: 'c1',
        messages: [{ role: 'user', content: 'secret-chat-message-9241' }],
      },
    },
    conversationOrder: ['c1'],
    activeConvId: 'c1',
    characters: { arona: { id: 'arona', name: 'secret-card-name-9241' } },
    worldBooks: { wb1: { id: 'wb1', entries: [{ id: 'e1', content: 'secret-world-entry-9241' }] } },
    charactersMigrated: true,
    lastSaved: 987654,
  };
  const legacyPassphrase = 'correct passphrase';
  const legacySalt = Uint8Array.from({ length: 16 }, (_, index) => index + 1);
  const legacyIv = Uint8Array.from({ length: 12 }, (_, index) => 32 + index);
  const legacyMaterial = await webcrypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(legacyPassphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  const legacyKey = await webcrypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: legacySalt, iterations: 210000, hash: 'SHA-256' },
    legacyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  );
  const legacyCipher = new Uint8Array(await webcrypto.subtle.encrypt(
    { name: 'AES-GCM', iv: legacyIv },
    legacyKey,
    new TextEncoder().encode(JSON.stringify(snapshot)),
  ));
  const encrypted = {
    encrypted: true,
    version: 1,
    algorithm: 'AES-GCM',
    kdf: 'PBKDF2-SHA256',
    iterations: 210000,
    salt: Buffer.from(legacySalt).toString('base64'),
    iv: Buffer.from(legacyIv).toString('base64'),
    payload: Buffer.from(legacyCipher).toString('base64'),
    conversationBytes: Buffer.byteLength(JSON.stringify(snapshot.conversations)),
    lastSaved: snapshot.lastSaved,
  };
  const context = {
    state: {
      settings: {
        cloudSyncEncrypted: true,
        cloudSyncPassphrase: legacyPassphrase,
      },
    },
    defaultSettings: () => ({
      cloudSyncEnabled: false,
      cloudSyncAutoUpload: false,
      cloudSyncEndpoint: '/api/sync',
      cloudSyncToken: '',
      cloudSyncEncrypted: false,
      cloudSyncPassphrase: '',
      cloudSyncLastAt: 0,
      cloudSyncLastStatus: '',
    }),
    StorageService: { _lastSaveSnapshot: null },
    window: { crypto: webcrypto },
    crypto: webcrypto,
    TextEncoder,
    TextDecoder,
    Uint8Array,
    Date,
    JSON,
    Number,
    Object,
    Array,
    String,
    btoa(text) { return Buffer.from(text, 'binary').toString('base64'); },
    atob(text) { return Buffer.from(text, 'base64').toString('binary'); },
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__decrypt = decryptCloudSyncSnapshot;\nthis.__freshness = getCloudSyncFreshness;`, context);

  assert(encrypted.encrypted === true && encrypted.payload && encrypted.iv && encrypted.salt, 'The legacy v1 encrypted fixture should contain a complete AES-GCM envelope.');
  assert(context.__freshness({ ...encrypted, conversationBytes: encrypted.conversationBytes + 100, lastSaved: 1 }, snapshot) === 'older', 'Encrypted cloud freshness should prioritize timestamps over envelope size.');

  const decrypted = await context.__decrypt(encrypted);
  assert(decrypted.settings.model === snapshot.settings.model, 'Encrypted cloud snapshot did not restore settings.');
  assert(decrypted.conversations.c1.messages[0].content === 'secret-chat-message-9241', 'Encrypted cloud snapshot did not restore chat history.');
  assert(decrypted.characters.arona.name === 'secret-card-name-9241', 'Encrypted cloud snapshot did not restore character cards.');
  assert(decrypted.worldBooks.wb1.entries[0].content === 'secret-world-entry-9241', 'Encrypted cloud snapshot did not restore world books.');
  assert(decrypted.activeConvId === 'c1' && decrypted.conversationOrder[0] === 'c1', 'Encrypted cloud snapshot did not restore conversation metadata.');

  await assertRejects(context.__decrypt({
    encrypted: true,
    algorithm: 'AES-GCM',
    iterations: 210000,
    salt: encrypted.salt,
    iv: encrypted.iv,
    payload: [],
  }), 'Malformed encrypted envelopes should be rejected before WebCrypto runs.');

  await assertRejects(context.__decrypt({
    encrypted: true,
    algorithm: 'AES-GCM',
    iterations: 0,
    salt: encrypted.salt,
    iv: encrypted.iv,
    payload: encrypted.payload,
  }), 'Explicitly invalid encrypted envelope iterations should be rejected.');

  context.state.settings.cloudSyncPassphrase = 'short';
  await assertRejects(context.__decrypt(encrypted), 'Short decryption passphrases should be rejected before WebCrypto runs.');
}

async function assertFrontendCloudSyncTransport() {
  const sources = await Promise.all([
    '../../../src/app/sync/22-cloud-sync.js',
    '../../../src/app/conversation/19-conversation-order-helpers.js',
    '../../../src/app/sync/22-cloud-sync-normalize.js',
    '../../../src/app/sync/22-cloud-sync-incremental-crypto.js',
    '../../../src/app/sync/22-cloud-sync-transport.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  const requests = [];
  const context = {
    state: {
      settings: {
        cloudSyncEndpoint: 'https://sync.example/api',
        cloudSyncToken: 'short',
        cloudSyncEncrypted: false,
      },
    },
    defaultSettings: () => ({
      cloudSyncEnabled: false,
      cloudSyncAutoUpload: false,
      cloudSyncEndpoint: '/api/sync',
      cloudSyncToken: '',
      cloudSyncEncrypted: false,
      cloudSyncPassphrase: '',
      cloudSyncLastAt: 0,
      cloudSyncLastStatus: '',
    }),
    StorageService: { _lastSaveSnapshot: null },
    document: { getElementById() { return null; } },
    async fetch(url, options) {
      requests.push({ url, options });
      return new Response(JSON.stringify({ success: true, data: null }), { status: 200 });
    },
    Response,
    JSON,
    Date,
    Number,
    Object,
    Array,
    String,
    Error,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__request = requestCloudSync;\nthis.__status = setCloudSyncStatus;`, context);

  await assertRejects(context.__request('GET'), 'Short cloud sync tokens should be rejected before fetch.');
  assert(requests.length === 0, 'Short cloud sync tokens should not issue a network request.');

  context.state.settings.cloudSyncToken = 'valid-token';
  const result = await context.__request('GET');
  assert(result.success === true, 'Valid cloud sync requests should parse JSON responses.');
  assert(requests[0].url === 'https://sync.example/api', 'Cloud sync transport should use the configured endpoint.');
  assert(requests[0].options.headers.Authorization === 'Bearer valid-token', 'Cloud sync transport should send the bearer token.');
  assert(requests[0].options.headers['X-OpenTavern-Token'] === 'valid-token', 'Cloud sync transport should send the compatibility token header.');

  await context.__request('POST', { data: {} }, { expectedUpdatedAt: 1234 });
  assert(requests[1].options.headers['If-Match'] === '1234', 'Cloud sync transport should send an If-Match precondition for protected uploads.');
  assert(requests[1].options.headers['X-OpenTavern-If-Match-Updated-At'] === '1234', 'Cloud sync transport should send the compatibility precondition header.');

  context.state.settings.cloudSyncEncrypted = true;
  const requestsBeforeBlockedWrite = requests.length;
  let blockedWriteError = null;
  try {
    await context.__request('POST', { data: { plaintext: true } });
  } catch (error) {
    blockedWriteError = error;
  }
  assert(blockedWriteError && blockedWriteError.code === 'CLOUD_SYNC_ENCRYPTION_NOT_IMPLEMENTED', 'The final v1 transport boundary must reject encrypted-upload requests.');
  assert(requests.length === requestsBeforeBlockedWrite, 'A blocked direct v1 write must not call fetch.');
  context.state.settings.cloudSyncEncrypted = false;

  context.fetch = async function() {
    return new Response(JSON.stringify({ success: false, error: 'bad token' }), { status: 200 });
  };
  await assertRejects(context.__request('GET'), 'Cloud sync API error responses should reject.');

  context.fetch = async function() {
    return new Response(JSON.stringify({ success: false, error: 'conflict', currentUpdatedAt: 5678 }), { status: 409 });
  };
  let conflictError = null;
  try {
    await context.__request('POST', { data: {} }, { expectedUpdatedAt: 1234 });
  } catch (error) {
    conflictError = error;
  }
  assert(conflictError && conflictError.status === 409 && conflictError.currentUpdatedAt === 5678, 'Cloud sync transport should expose remote write conflicts to the caller.');
}

async function assertFrontendCloudSyncOperations() {
  const sources = await Promise.all([
    '../../../src/app/sync/22-cloud-sync-incremental-crypto.js',
    '../../../src/app/sync/22-cloud-sync-operation-helpers.js',
    '../../../src/app/sync/22-cloud-sync-upload.js',
    '../../../src/app/sync/22-cloud-sync-download.js',
    '../../../src/app/sync/22-cloud-sync-sync.js',
    '../../../src/app/sync/22-cloud-sync-operations.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  const explicitStatus = { textContent: '', className: '' };
  const documentStatus = { textContent: '', className: '' };
  const events = [];
  let capturedRequest = null;
  let appliedSnapshot = null;
  const localSnapshot = {
    settings: { model: 'cloud-model' },
    conversations: { c1: { id: 'c1', messages: [{ content: 'hello cloud' }] } },
    conversationOrder: ['c1'],
    activeConvId: 'c1',
    characters: { arona: { name: 'Arona' } },
    worldBooks: { wb1: { id: 'wb1' } },
    lastSaved: 1000,
  };
  const context = {
    _cloudSyncSavingStatus: false,
    remoteSnapshot: null,
    readFails: false,
    encryptAsEncrypted: false,
    state: { settings: { cloudSyncEndpoint: '/api/sync', cloudSyncToken: 'token', cloudSyncEncrypted: false } },
    document: {
      getElementById(id) { return id === 'cloudSyncStatus' ? documentStatus : null; },
    },
    ensureCloudSyncSettings() { events.push('ensure'); return context.state.settings; },
    buildAppDataSnapshot() { events.push('snapshot'); return localSnapshot; },
    prepareCloudSyncLocalSnapshotForComparison() { events.push('prepare'); return localSnapshot; },
    readCloudSyncRemoteMetadata() {
      events.push('read');
      if (context.readFails) throw new Error('offline');
      return {
        protocol: 1,
        v2Supported: false,
        exists: !!context.remoteSnapshot,
        snapshot: context.remoteSnapshot,
        lastSaved: Number(context.remoteSnapshot && context.remoteSnapshot.lastSaved) || 0,
      };
    },
    readCloudSyncRemoteSnapshot(metadata) {
      events.push('read-snapshot');
      return metadata && metadata.snapshot !== undefined ? metadata.snapshot : context.remoteSnapshot;
    },
    getCloudSyncSelectedRemoteSnapshot(metadata) {
      if (!metadata) return null;
      if (Number(metadata.protocol) !== 2) return metadata.snapshot || null;
      return Number(metadata.selectedProtocol) === 1
        ? (metadata.legacySnapshot || null)
        : (metadata.exists ? metadata : (metadata.legacySnapshot || null));
    },
    getCloudSyncFreshness(remote, local) { events.push(`fresh:${remote && remote.freshness || 'same'}:${local ? 'local' : 'none'}`); return (remote && remote.freshness) || 'same'; },
    getCloudSyncRemoteUpdatedAt(remote) {
      const updatedAt = Number(remote && remote.__cloudSyncUpdatedAt);
      return Number.isFinite(updatedAt) && updatedAt >= 0 ? updatedAt : null;
    },
    getCloudSyncRemoteRevision() { return null; },
    async encryptCloudSyncSnapshot(snapshot) {
      events.push('encrypt');
      return Object.assign({ encrypted: !!context.encryptAsEncrypted }, snapshot);
    },
    async requestCloudSync(method, payload, requestOptions) {
      events.push(`request:${method}`);
      capturedRequest = { method, payload, requestOptions };
      return { success: true, updatedAt: 2000 };
    },
    async decryptCloudSyncSnapshot(raw) { events.push('decrypt'); return raw.data || raw; },
    applyCloudSyncSnapshot(data) { events.push('apply'); appliedSnapshot = data; },
    setCloudSyncStatus(message, isError) {
      events.push(`status:${isError ? 'error' : 'ok'}:${message}`);
      context.state.settings.cloudSyncLastStatus = message;
    },
    async persistState(force, options) {
      events.push(`persist:${force}:${context._cloudSyncSavingStatus}`);
      if (options && options.preserveLastSaved) events.push('preserve-last-saved');
    },
    Date,
    Promise,
    console: { warn(message) { events.push(`warn:${message}`); } },
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__pending = setCloudSyncPendingStatus;\nthis.__persistOp = persistCloudSyncOperationState;\nthis.__upload = uploadCloudSyncSnapshot;\nthis.__download = downloadCloudSyncSnapshot;\nthis.__sync = syncCloudSyncSnapshot;`, context);

  context.__pending(explicitStatus, 'Working...');
  assert(explicitStatus.textContent === 'Working...' && explicitStatus.className.includes('text-amber-300'), 'Cloud sync pending helper should update the provided status element.');
  context.__pending(null, 'Fallback working...');
  assert(documentStatus.textContent === 'Fallback working...', 'Cloud sync pending helper should fall back to the document status element.');

  await context.__persistOp();
  assert(events.includes('persist:true:true') && events.includes('preserve-last-saved') && context._cloudSyncSavingStatus === false, 'Cloud sync operation persist should pause auto-upload and preserve snapshot freshness.');

  events.length = 0;
  capturedRequest = null;
  await context.__upload(explicitStatus, { force: true });
  assert(capturedRequest.method === 'POST' && capturedRequest.payload.encrypted === false, 'Legacy v1 uploads should remain plaintext while encryption upload is unimplemented.');
  assert(!events.includes('encrypt'), 'Legacy v1 uploads must not use the retained AES-GCM read-compatibility helper.');
  assert(capturedRequest.payload.data.conversations.c1.messages[0].content === 'hello cloud', 'Cloud upload should include chat history.');
  assert(capturedRequest.payload.data.settings.model === 'cloud-model', 'Cloud upload should include settings.');
  assert(capturedRequest.payload.data.characters.arona.name === 'Arona', 'Cloud upload should include character cards.');
  assert(capturedRequest.payload.data.worldBooks.wb1.id === 'wb1', 'Cloud upload should include world books.');
  assert(events.some((event) => event.startsWith('status:ok:云端上传完成')) && events.includes('persist:true:true'), 'Cloud upload should report success and persist status.');

  events.length = 0;
  capturedRequest = null;
  context.readFails = true;
  const failedPreflight = await context.__upload(explicitStatus, { force: false });
  assert(failedPreflight.skipped === true && failedPreflight.reason === 'preflight-failed' && capturedRequest === null, 'Protected cloud upload should skip when remote freshness cannot be verified.');
  assert(events.includes('persist:true:true') && events.includes('preserve-last-saved'), 'Protected cloud upload preflight skips should persist the status without changing snapshot freshness.');

  events.length = 0;
  capturedRequest = null;
  context.readFails = false;
  context.remoteSnapshot = { freshness: 'newer', lastSaved: 5000 };
  const skipped = await context.__upload(explicitStatus, { force: false });
  assert(skipped.skipped === true && skipped.reason === 'remote-newer' && capturedRequest === null, 'Protected cloud upload should skip when the remote snapshot is newer.');
  assert(events.includes('persist:true:true') && events.includes('preserve-last-saved'), 'Protected cloud upload remote-newer skips should persist the status without changing snapshot freshness.');

  events.length = 0;
  capturedRequest = null;
  context.remoteSnapshot = { freshness: 'newer-by-size', lastSaved: 1000 };
  const uploadedDespiteSize = await context.__upload(explicitStatus, { force: false });
  assert(uploadedDespiteSize.success === true && capturedRequest.method === 'POST', 'Protected cloud upload should not treat a larger snapshot as newer without a newer timestamp.');

  events.length = 0;
  capturedRequest = null;
  context.remoteSnapshot = { freshness: 'same', lastSaved: 1000, __cloudSyncUpdatedAt: 3456 };
  await context.__upload(explicitStatus, { force: false });
  assert(capturedRequest.requestOptions.expectedUpdatedAt === 3456, 'Automatic cloud uploads should use the remote version from their preflight check.');

  events.length = 0;
  context.remoteSnapshot = { freshness: 'same', lastSaved: 1000 };
  const synced = await context.__sync(null);
  assert(synced.upToDate === true && events.includes('persist:true:true'), 'Cloud sync should persist status when local and remote snapshots are already in sync.');

  events.length = 0;
  appliedSnapshot = null;
  context.remoteSnapshot = {
    freshness: 'newer',
    lastSaved: 7000,
    data: { lastSaved: 7000, settings: { model: 'newer' }, conversations: {}, characters: {}, worldBooks: {} },
  };
  const syncDownloaded = await context.__sync(explicitStatus);
  assert(syncDownloaded.lastSaved === 7000 && appliedSnapshot === syncDownloaded, 'Cloud sync should apply the newer remote snapshot.');
  assert(events.filter((event) => event === 'read').length === 1, 'Cloud sync should reuse the preflight remote snapshot instead of reading twice.');

  events.length = 0;
  appliedSnapshot = null;
  context.remoteSnapshot = {
    freshness: 'newer-by-size',
    lastSaved: 7000,
    data: { lastSaved: 7000, settings: { model: 'larger-cloud' }, conversations: {}, characters: {}, worldBooks: {} },
  };
  const syncIgnoredSize = await context.__sync(explicitStatus);
  assert(syncIgnoredSize.upToDate === true && appliedSnapshot === null, 'Cloud sync should not download solely because the remote snapshot is larger.');

  events.length = 0;
  capturedRequest = null;
  context.remoteSnapshot = { freshness: 'older-by-size', lastSaved: 1000, __cloudSyncUpdatedAt: 4321 };
  const syncIgnoredLocalSize = await context.__sync(explicitStatus);
  assert(syncIgnoredLocalSize.upToDate === true && capturedRequest === null, 'Cloud sync should not upload solely because the local snapshot is larger.');

  events.length = 0;
  capturedRequest = null;
  context.remoteSnapshot = null;
  const syncCreated = await context.__sync(explicitStatus);
  assert(syncCreated.success === true && capturedRequest.requestOptions.expectedUpdatedAt === 0, 'First cloud sync upload should fail safely if another device creates the snapshot concurrently.');

  events.length = 0;
  appliedSnapshot = null;
  context.remoteSnapshot = null;
  const emptyDownload = await context.__download(explicitStatus);
  assert(emptyDownload === null && appliedSnapshot === null && events.includes('persist:true:true'), 'Cloud download should persist the empty-remote status.');

  events.length = 0;
  appliedSnapshot = null;
  context.remoteSnapshot = {
    freshness: 'newer',
    encrypted: false,
    data: { lastSaved: 6000, settings: {}, conversations: {}, characters: {}, worldBooks: {} },
  };
  const downloaded = await context.__download(explicitStatus);
  assert(downloaded.lastSaved === 6000 && appliedSnapshot === downloaded, 'Cloud download should decrypt and apply the remote snapshot.');

  events.length = 0;
  context.state.settings.cloudSyncEncrypted = true;
  const originalUpload = context.uploadCloudSyncSnapshot;
  const originalDownload = context.downloadCloudSyncSnapshot;
  context.uploadCloudSyncSnapshot = async function guardedSyncUploadProbe() {
    events.push('sync-upload');
    return { success: true };
  };
  context.downloadCloudSyncSnapshot = async function guardedSyncDownloadProbe() {
    events.push('sync-download');
    return { lastSaved: 9999 };
  };
  const blockedSyncError = await context.__sync(explicitStatus).then(
    () => null,
    (error) => error,
  );
  context.uploadCloudSyncSnapshot = originalUpload;
  context.downloadCloudSyncSnapshot = originalDownload;
  context.state.settings.cloudSyncEncrypted = false;

  assert(blockedSyncError && blockedSyncError.code === 'CLOUD_SYNC_ENCRYPTION_NOT_IMPLEMENTED', 'Immediate sync should reject while encrypted upload is requested.');
  assert(!events.includes('read'), 'Immediate sync must block encrypted upload before requesting remote metadata.');
  assert(!events.includes('prepare') && !events.includes('snapshot'), 'Immediate sync must block encrypted upload before building any local snapshot.');
  assert(!events.includes('sync-upload') && !events.includes('sync-download'), 'Immediate sync must not enter either upload or download while encrypted upload is requested.');
}

async function assertFrontendCloudSyncEncryptionGuard() {
  const sources = await Promise.all([
    '../../../src/app/sync/22-cloud-sync-incremental-crypto.js',
    '../../../src/app/sync/22-cloud-sync-operation-helpers.js',
    '../../../src/app/sync/22-cloud-sync-upload.js',
    '../../../src/app/sync/22-cloud-sync-scheduler.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  const events = [];
  const timers = [];
  const statusEl = { textContent: '', className: '' };
  let releasePersist = null;
  const context = {
    _cloudSyncSavingStatus: false,
    state: {
      settings: {
        cloudSyncEncrypted: true,
        cloudSyncPassphrase: 'legacy-download-passphrase',
        cloudSyncLastStatus: '',
        cloudSyncEnabled: true,
        cloudSyncAutoUpload: true,
        cloudSyncEndpoint: '/api/sync',
        cloudSyncToken: 'valid-token',
      },
    },
    document: {
      getElementById() { return statusEl; },
    },
    ensureCloudSyncSettings() { return context.state.settings; },
    readCloudSyncRemoteMetadata() {
      events.push('metadata');
      return { protocol: 2, v2Supported: true, exists: false, revision: 0 };
    },
    getCloudSyncSelectedRemoteSnapshot() { return null; },
    prepareCloudSyncLocalSnapshotForComparison() { events.push('prepare'); return {}; },
    buildAppDataSnapshot() { events.push('snapshot'); return { lastSaved: 1000 }; },
    async uploadCloudSyncSnapshotV2() {
      events.push('upload-v2');
      return { success: true, updatedAt: 2000, stats: { uploadedObjects: 1, reusedObjects: 0 } };
    },
    async encryptCloudSyncSnapshot() { events.push('encrypt-v1'); return { encrypted: true }; },
    async requestCloudSync() { events.push('request-v1'); return { success: true, updatedAt: 2000 }; },
    setCloudSyncStatus(message, isError) {
      events.push(`status:${isError ? 'error' : 'ok'}:${message}`);
      context.state.settings.cloudSyncLastStatus = message;
    },
    async persistState(force, options) {
      events.push(`persist:${force}:${context._cloudSyncSavingStatus}:${!!(options && options.preserveLastSaved)}`);
      if (context.persistBarrier) await context.persistBarrier;
      if (context.persistReject) throw new Error('persist failed');
    },
    setTimeout(handler, delay) {
      const timer = { id: `timer-${timers.length + 1}`, handler, delay, cancelled: false };
      timers.push(timer);
      return timer.id;
    },
    clearTimeout(id) {
      const timer = timers.find((entry) => entry.id === id);
      if (timer) timer.cancelled = true;
      events.push(`clear:${id}`);
    },
    Date,
    Number,
    Promise,
    Error,
    console,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__state = getCloudSyncEncryptionUploadState;\nthis.__disable = disableCloudSyncEncryptionForFutureUploads;\nthis.__upload = uploadCloudSyncSnapshot;\nthis.__schedule = scheduleCloudSyncUpload;`, context);

  const initialState = context.__state();
  assert(initialState.requested === true && initialState.supported === false && initialState.blocked === true, 'Encryption state should explicitly report an unsupported requested upload.');
  assert(initialState.code === 'encryption-not-implemented' && initialState.message.includes('加密上传功能尚未实现'), 'Encryption state should expose the implementation status instead of blaming WebCrypto or HTTP.');

  context.__schedule();
  assert(timers.length === 1 && timers[0].delay === 2500, 'The race test should begin with one queued automatic upload.');
  context.persistBarrier = new Promise((resolve) => { releasePersist = resolve; });
  const blockedPromise = context.__upload(statusEl, { force: true }).then(
    () => null,
    (error) => error,
  );
  await Promise.resolve();
  assert(!events.includes('metadata'), 'Encryption must be captured and blocked before any metadata request.');
  const disablePromise = context.__disable(statusEl);
  await Promise.resolve();
  assert(context.state.settings.cloudSyncEncrypted === false, 'The explicit disable action should flip the setting only after cancelling queued work.');
  assert(timers[0].cancelled === true && events.includes('clear:timer-1'), 'Explicitly disabling encryption should cancel the queued automatic upload first.');
  releasePersist();
  const [blockedError, disabled] = await Promise.all([blockedPromise, disablePromise]);
  for (const timer of timers) {
    if (!timer.cancelled) timer.handler();
  }
  await Promise.resolve();

  assert(blockedError && blockedError.code === 'CLOUD_SYNC_ENCRYPTION_NOT_IMPLEMENTED', 'Uploads started while encryption was requested should remain blocked after the setting is disabled.');
  assert(blockedError.message.includes('不会回退旧版同步') && blockedError.message.includes('不会上传明文'), 'Encrypted upload errors should state the no-fallback and no-plaintext guarantees.');
  assert(!blockedError.message.includes('WebCrypto') && !blockedError.message.includes('HTTPS'), 'Encrypted upload errors should not report an unrelated browser security-context cause.');
  assert(!events.includes('metadata') && !events.includes('snapshot') && !events.includes('upload-v2') && !events.includes('encrypt-v1') && !events.includes('request-v1'), 'Blocked uploads and cancelled timers must not read metadata or enter any plaintext/legacy upload path.');
  assert(disabled.changed === true && disabled.encryptionEnabled === false && disabled.uploadStarted === false && disabled.retryRequired === true, 'Explicitly disabling encryption should require a separate retry and never start an upload itself.');
  assert(disabled.cancelledAutoUpload === true, 'The disable result should report cancellation of queued automatic upload work.');
  assert(context.state.settings.cloudSyncEncrypted === false, 'The explicit disable action should persist the disabled encryption setting.');
  assert(context.state.settings.cloudSyncPassphrase === 'legacy-download-passphrase', 'Disabling future encrypted uploads should preserve the passphrase needed for legacy encrypted downloads.');
  assert(!events.includes('upload-v2') && !events.includes('encrypt-v1') && !events.includes('request-v1'), 'The explicit disable action must not silently retry as plaintext.');
  assert(events.includes('persist:true:true:true'), 'The explicit disable action should persist its status without changing snapshot freshness.');

  events.length = 0;
  context.persistBarrier = null;
  const retried = await context.__upload(statusEl, {
    force: true,
    remoteMetadata: { protocol: 2, v2Supported: true, exists: false, revision: 0 },
  });
  assert(retried.success === true && events.includes('upload-v2'), 'A separate user-triggered retry should allow plaintext v2 upload only after encryption is explicitly disabled.');

  context.state.settings.cloudSyncEncrypted = true;
  context.state.settings.cloudSyncLastStatus = 'previous status';
  context.persistReject = true;
  await assertRejects(context.__disable(statusEl), 'A failed explicit-disable persist should reject.');
  assert(context.state.settings.cloudSyncEncrypted === true && context.state.settings.cloudSyncLastStatus === 'previous status', 'Failed disable persistence should restore the in-memory encryption guard and prior status.');
}

async function assertFrontendCloudSyncScheduler() {
  const sources = await Promise.all([
    '../../../src/app/sync/22-cloud-sync-operation-helpers.js',
    '../../../src/app/sync/22-cloud-sync-scheduler.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  const events = [];
  const timers = [];
  const context = {
    _cloudSyncSavingStatus: false,
    state: {
      settings: {
        cloudSyncEnabled: true,
        cloudSyncAutoUpload: true,
        cloudSyncEndpoint: '/api/sync',
        cloudSyncToken: 'valid-token',
      },
    },
    ensureCloudSyncSettings() { events.push('ensure'); return context.state.settings; },
    uploadCloudSyncSnapshot() {
      events.push('upload');
      return Promise.reject(new Error('network down'));
    },
    setCloudSyncStatus(message, isError) {
      events.push(`status:${isError ? 'error' : 'ok'}:${message}`);
      context.state.settings.cloudSyncLastStatus = message;
    },
    async persistState(force, options) {
      events.push(`persist:${force}:${context._cloudSyncSavingStatus}:${!!(options && options.preserveLastSaved)}`);
    },
    setTimeout(handler, delay) {
      timers.push({ handler, delay });
      return `timer-${timers.length}`;
    },
    clearTimeout(id) { events.push(`clear:${id}`); },
    Promise,
    Error,
    console: { warn(message) { events.push(`warn:${message}`); } },
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__schedule = scheduleCloudSyncUpload;\nthis.__saving = function() { return _cloudSyncSavingStatus; };`, context);

  context._cloudSyncSavingStatus = true;
  context.__schedule();
  assert(timers.length === 0, 'Cloud sync scheduler should not run while a cloud status persist is active.');

  context._cloudSyncSavingStatus = false;
  context.__schedule();
  assert(timers.length === 1 && timers[0].delay === 2500, 'Cloud sync scheduler should debounce auto uploads.');
  timers[0].handler();
  for (let i = 0; i < 5; i++) await Promise.resolve();

  assert(events.includes('upload'), 'Cloud sync scheduler should attempt the auto upload.');
  assert(events.some((event) => event.includes('云端自动上传失败：network down')), 'Cloud sync scheduler should report auto upload failures.');
  assert(events.includes('persist:true:true:true'), 'Cloud sync scheduler should persist failure status while preserving snapshot freshness.');
  assert(context.__saving() === false, 'Cloud sync scheduler should restore the saving guard after failure status persistence.');
}
export { assertFrontendCloudSnapshot, assertFrontendCloudSnapshotApply, assertFrontendCloudSyncCrypto, assertFrontendCloudSyncTransport, assertFrontendCloudSyncOperations, assertFrontendCloudSyncEncryptionGuard, assertFrontendCloudSyncScheduler };
