import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const copy = value => JSON.parse(JSON.stringify(value));
let id = 0;
const context = {
    console: { ...console, error() {} }, dom: {}, setTimeout, clearTimeout, TextEncoder, DEFAULT_TWO_STAGE_PROMPT: 'options',
    makeId: () => 'restored-' + ++id,
    getConversationIdsWithMissingFallback: (order, records) => [...new Set([...(order || []), ...Object.keys(records || {})])].filter(key => Object.hasOwn(records || {}, key)),
    getValidConversationIdOrFallback: (active, order, records) => Object.hasOwn(records || {}, active) ? active : context.getConversationIdsWithMissingFallback(order, records)[0] || null,
    appStore: { notify() {} }, getSafeSettingsForPersist: () => context.state.settings,
    StorageService: { _cloneForPersist: copy, async saveAll(snapshot) {
        if (context.failSave) throw new Error('quota');
        context.durable = copy(snapshot);
        if (context.afterWrite) { const hook = context.afterWrite; context.afterWrite = null; await hook(); }
        return { runtimeSnapshot: copy(snapshot) };
    } }
};
vm.createContext(context);
for (const file of ['appearance/13-reading-appearance.js', 'conversation/19-conversation-order-helpers.js', 'sync/19-cloud-sync-settings-policy.js', 'storage/20-storage-service-operations-api.js', 'sync/22-cloud-sync-normalize.js', 'sync/22-cloud-sync-incremental-core.js', 'sync/22-cloud-sync-apply-settings.js', 'storage/23-storage-recovery-restore.js', 'state/30-state-default-settings.js', 'state/30-state-user-personas.js', 'conversation/32-message-identity.js', 'conversation/32-chat-operations.js', 'conversation/32-group-chat-members.js', 'summary/41-summary-validity.js', 'state/35-persist-records.js', 'state/35-state-persistence.js', 'state/35-persist-snapshot-helpers.js', 'state/35-conversation-mutation-persistence.js', 'prompt/40-character-regex-runtime.js', 'prompt/40-regex-worker-runtime.js', 'presets/62-sillytavern-preset-model.js', 'presets/62-preset-library.js', 'presets/62-sillytavern-preset-placement.js', 'presets/62-sillytavern-preset-runtime.js', 'library/60-library-my-card-order.js', 'library/60-library-my-card-reorder-input.js', 'library/60-library-my-card-reorder-drag.js', 'library/60-library-my-card-reorder-finalize.js', 'transfer/63-conversation-export-helpers.js', 'transfer/63-backup-restore-plan.js', 'transfer/63-backup-restore-runtime.js', 'sync/22-cloud-sync-upload.js', 'sync/22-cloud-sync-apply.js']) vm.runInContext(fs.readFileSync(new URL('../src/app/' + file, import.meta.url), 'utf8'), context, { filename: file });

function reset() {
    const settings = context.defaultSettings(); context.ensurePresetLibrary(settings);
    settings.presetLibrary[0].name = 'local'; settings.globalRegexScripts = [{ findRegex: 'local', replaceString: 'kept', placement: [1] }];
    settings.apiKey = 'local-secret'; settings.cloudSyncToken = 'local-sync-secret'; settings.saveApiKey = true;
    settings.myCardOrder = ['alice'];
    context.state = { settings, conversations: { local: { id: 'local', messages: [{ id: 'local-message', role: 'user', content: 'local' }], summaries: [] } }, conversationOrder: ['local'], activeConvId: 'local', worldBooks: { world: { id: 'world', name: 'local world', entries: {} } }, characters: { alice: { name: 'Alice', description: 'local' } }, _charactersMigrated: false };
    context.failSave = false; context.afterWrite = null; context.StorageService._lastSaveSnapshot = null;
    context._cloudSyncConversationSignature = null; context._persistLatestRecord = null; context._persistPendingRecords = []; context.cloudSyncActiveOperations = 0;
    context.normalizeConversation(context.state.conversations.local);
}
const backup = {
    type: 'opentavern-full-export', version: 3,
    conversations: [{ id: 'local', title: 'backup', messages: [{ id: 'backup-message', role: 'assistant', content: 'backup', extensions: { preserved: true } }], summaries: [], favoriteMessageIds: ['backup-message'] }], conversationOrder: ['local'], activeConvId: 'local',
    characters: { alice: { name: 'Alice', description: 'remote' }, bob: { name: 'Bob', extensions: { unknown: true } } },
    worldBooks: { world: { id: 'world', name: 'remote world', entries: { '0': { content: 'world text', unknown: 5 } } } }, charactersMigrated: true,
    settings: { temperature: 0, apiKey: 'remote-secret', apiEndpoint: 'https://remote.invalid/chat/completions', cloudSyncToken: 'remote-sync',
        userPersonas: [{ id: 'default', name: 'incoming persona', userName: 'Incoming', description: 'remote' }], activeUserPersonaId: 'default',
        presetLibrary: [{ id: 'legacy-preset', name: 'remote', prompts: [{ id: 'p', role: 'system', content: 'remote prompt', marker: false, unknown: 'kept' }], promptOrder: [], regexScripts: [], regexScriptsEnabled: true, unknown: { kept: true } }], activePresetId: 'legacy-preset',
        globalRegexScripts: [{ findRegex: 'remote', replaceString: 'replacement', placement: [1] }], globalRegexEnabled: true }
};
const groups = ['conversations', 'characters', 'worldBooks', 'settings', 'presets', 'regex'];
for (let mask = 0; mask < 64; mask++) {
    reset(); const before = copy(context.state), input = copy(backup);
    const selection = Object.fromEntries(groups.map((name, bit) => [name, !!(mask & (1 << bit))]));
    const plan = context.buildBackupRestorePlan(input, selection);
    assert.deepEqual(input, backup, 'Preview must not modify the source backup.');
    assert.deepEqual(copy(context.state), before, 'Preview must not mutate live state.');
    if (!mask) { await assert.rejects(context.commitBackupRestorePlan(plan), /至少选择/); continue; }
    await context.commitBackupRestorePlan(plan);
    const beforeRead = copy(context.state.settings); context.getOrderedMyLibraryCharacters(); assert.deepEqual(copy(context.state.settings), beforeRead, 'Library ordering reads must not modify unselected settings.');
    for (const name of ['conversations', 'characters', 'worldBooks']) if (!selection[name]) assert.deepEqual(copy(context.state[name]), before[name], 'Unselected ' + name);
    if (!selection.conversations) { assert.equal(context.state.activeConvId, before.activeConvId); assert.deepEqual(copy(context.state.conversationOrder), before.conversationOrder); }
    if (!selection.characters) assert.equal(context.state._charactersMigrated, before._charactersMigrated);
    if (!selection.settings) assert.equal(context.state.settings.temperature, before.settings.temperature);
    else assert.equal(context.state.settings.temperature, 0);
    for (const key of ['presetLibrary', 'activePresetId', 'sillyTavernPreset']) if (!selection.presets) assert.deepEqual(copy(context.state.settings[key]), before.settings[key]);
    for (const key of ['globalRegexScripts', 'globalRegexEnabled']) if (!selection.regex) assert.deepEqual(copy(context.state.settings[key]), before.settings[key]);
    assert.equal(context.state.settings.apiKey, 'local-secret'); assert.equal(context.state.settings.cloudSyncToken, 'local-sync-secret'); assert.equal(context.state.settings.apiEndpoint, before.settings.apiEndpoint);
    if (selection.characters) assert.deepEqual(copy(context.state.characters.alice), before.characters.alice);
    assert.deepEqual(context.durable.conversations, copy(context.state.conversations));
    if (selection.presets) assert.equal(context.state.settings.sillyTavernPreset, context.state.settings.presetLibrary.find(preset => preset.id === context.state.settings.activePresetId));
}

reset(); const privateBackup = copy(backup);
Object.assign(privateBackup.settings, { futureAccessToken: 'remote-test-token', futureToken: 'remote-test-token', cardRuntime: { enabled: true }, cardRuntimeEnabled: true, cardRuntimeGrants: ['remote'], cardRuntimePermissions: ['network'] });
await context.commitBackupRestorePlan(context.buildBackupRestorePlan(privateBackup, { settings: true }));
for (const key of ['futureAccessToken', 'futureToken', 'cardRuntime', 'cardRuntimeEnabled', 'cardRuntimeGrants', 'cardRuntimePermissions']) assert.equal(context.state.settings[key], undefined, 'Restore must exclude device field ' + key);
reset(); context.state.settings.cardRuntime = { enabled: false }; context.state.settings.futureToken = 'local-test-token';
await context.commitBackupRestorePlan(context.buildBackupRestorePlan(privateBackup, { settings: true }));
assert.deepEqual(copy(context.state.settings.cardRuntime), { enabled: false }); assert.equal(context.state.settings.futureToken, 'local-test-token');

reset(); const linked = copy(backup); linked.conversations[0].worldBookIds = ['world']; linked.conversations[0].userPersonaId = 'default';
assert.throws(() => context.buildBackupRestorePlan(linked, { conversations: true }), /世界书/);
assert.throws(() => context.buildBackupRestorePlan(linked, { conversations: true, worldBooks: true }), /用户设定/);
const linkedPlan = context.buildBackupRestorePlan(linked, Object.fromEntries(groups.map(key => [key, true])));
await context.commitBackupRestorePlan(linkedPlan);
const restored = Object.values(context.state.conversations).find(conv => conv.title === 'backup');
assert.notEqual(restored.worldBookIds[0], 'world'); assert.equal(context.state.worldBooks[restored.worldBookIds[0]].entries['0'].content, 'world text');
assert.notEqual(restored.userPersonaId, 'default'); assert.equal(context.state.settings.userPersonas.find(persona => persona.id === restored.userPersonaId).userName, 'Incoming');
assert.equal(restored.messages[0].id, 'backup-message'); assert.deepEqual(copy(restored.favoriteMessageIds), ['backup-message']); assert.equal(restored.messages[0].extensions.preserved, true);
assert.equal(context.state.settings.sillyTavernPreset.unknown.kept, true);

for (const mutate of [
    data => data.conversations.push(null), data => data.conversations.push(copy(data.conversations[0])),
    data => data.conversations[0].messages[0].content = {}, data => data.settings.temperature = 'bad',
    data => data.settings.chatBackground = 'https://remote.invalid/image.png', data => data.settings.globalRegexScripts[0].findRegex = '[',
    data => data.worldBooks.world.entries['1'] = null, data => data.settings.userPersonas.push(copy(data.settings.userPersonas[0])),
    data => data.settings = null, data => data.settings.presetLibrary[0].prompts = [null], data => data.version = 9
]) {
    reset(); const original = copy(context.state), invalid = copy(backup); mutate(invalid);
    assert.throws(() => context.buildBackupRestorePlan(invalid, Object.fromEntries(groups.map(key => [key, true]))));
    assert.deepEqual(copy(context.state), original);
}
reset(); let plan = context.buildBackupRestorePlan(backup, { conversations: true, settings: true }), before = copy(context.state);
context.failSave = true; await assert.rejects(context.commitBackupRestorePlan(plan), /quota/); assert.deepEqual(copy(context.state), before); assert.equal(context.backupRestorePending, false);
context.failSave = false;
reset(); plan = context.buildBackupRestorePlan(backup, { conversations: true });
context._cloudSyncUploadTimer = setTimeout(() => {}, 10000); let schedules = 0;
context.scheduleCloudSyncUpload = () => { schedules++; }; context.failSave = true;
await assert.rejects(context.commitBackupRestorePlan(plan), /quota/); assert.equal(schedules, 1, 'A failed restore must reschedule a previously pending upload.');
context.failSave = false; delete context.scheduleCloudSyncUpload;

reset(); plan = context.buildBackupRestorePlan(backup, { conversations: true, worldBooks: true });
let queued;
context.afterWrite = async () => {
    context.state.conversations.newChat = { id: 'newChat', messages: [], summaries: [] }; context.state.conversationOrder.unshift('newChat'); context.state.activeConvId = 'newChat';
    queued = context.persistState(true);
    await assert.rejects(context.runCloudSyncOutsideBackupRestore(async () => {}), /恢复正在保存/);
    assert.throws(() => context.applyCloudSyncSnapshot({}), /恢复正在保存/);
};
await context.commitBackupRestorePlan(plan); await queued;
assert.equal(context.state.activeConvId, 'newChat'); assert.equal(context.durable.activeConvId, 'newChat');
assert.equal(Object.keys(context.durable.conversations).length, 3); assert.deepEqual(context.durable.conversations, copy(context.state.conversations));

reset(); plan = context.buildBackupRestorePlan(backup, { conversations: true, settings: true });
context.afterWrite = async () => { context.state.settings.temperature = 0.9; };
await assert.rejects(context.commitBackupRestorePlan(plan), /设置已变化/);
assert.equal(context.state.settings.temperature, 0.9); assert.equal(context.durable.settings.temperature, 0.9); assert.deepEqual(Object.keys(context.durable.conversations), ['local']);
reset(); plan = context.buildBackupRestorePlan(backup, { conversations: true });
context.afterWrite = async () => { context.state.conversations = {}; context.state.conversationOrder = []; context.state.activeConvId = null; };
await assert.rejects(context.commitBackupRestorePlan(plan), /替换/); assert.deepEqual(context.durable.conversations, {}); assert.equal(context.durable.activeConvId, null);

reset(); const special = copy(backup); special.conversations = [{ id: '__proto__', messages: [{ id: 'constructor', role: 'user', content: 'safe' }] }]; special.conversationOrder = ['__proto__']; special.activeConvId = '__proto__';
special.characters = JSON.parse('{"__proto__":{"name":"Special"}}'); special.worldBooks = JSON.parse('{"__proto__":{"id":"__proto__","entries":{}}}');
await context.commitBackupRestorePlan(context.buildBackupRestorePlan(special, { conversations: true, characters: true, worldBooks: true }));
assert.equal(Object.hasOwn(context.state.conversations, '__proto__'), true); assert.equal(context.state.conversations.__proto__.messages[0].id, 'constructor'); assert.equal(context.state.characters.special.name, 'Special');
assert.deepEqual(copy(context.getConversationIdsWithMissingFallback(['__proto__', 'constructor'], {})), []); assert.equal(context.getValidConversationIdOrFallback('__proto__', [], {}), null);
const signature = context.buildCloudSyncConversationSignature(context.durable); context.durable.conversations.__proto__.messages[0].content = 'changed';
assert.notEqual(context.buildCloudSyncConversationSignature(context.durable), signature, 'Special IDs must participate in change detection.');
context.durable.conversations.__proto__.extensions = JSON.parse('{"__proto__":{"preserved":true}}');
const reconstructed = context.rebuildCloudSyncSnapshotFromItems(context.splitCloudSyncSnapshotItems(context.durable), context.durable.lastSaved);
assert.deepEqual(copy(reconstructed.conversations), context.durable.conversations); assert.deepEqual(copy(reconstructed.characters), context.durable.characters); assert.deepEqual(copy(reconstructed.worldBooks), context.durable.worldBooks);
assert.deepEqual(JSON.parse(context.stringifyCloudSyncCanonical(reconstructed.conversations)), context.durable.conversations);
assert.equal(context.getConversationExportRecords().some(conv => conv.id === '__proto__'), true);
const specialConv = context.state.conversations.__proto__, candidate = copy(specialConv); candidate.messages.push({ id: 'new-special-message', role: 'assistant', content: 'reliable mutation' });
await context.persistConversationMutation(specialConv, () => {}, candidate, (target, validateOnly) => { if (!validateOnly) target.messages = copy(candidate.messages); return true; });
assert.equal(context.durable.conversations.__proto__.messages.length, 2, 'Reliable candidate persistence must retain a special-ID conversation.');
Object.defineProperty(specialConv, '__proto__', { value: { preserved: true }, enumerable: true });
Object.defineProperty(specialConv, 'constructor', { value: { preserved: true }, enumerable: true });
assert.equal(Object.hasOwn(context.sanitizeCloudSyncSignatureConversation(specialConv), '__proto__'), true); assert.equal(Object.hasOwn(context.sanitizeCloudSyncSignatureConversation(specialConv), 'constructor'), true);
reset(); const personaBackup = copy(backup); personaBackup.settings.userPersonas[0].id = 'constructor'; personaBackup.settings.userPersonas[0].unknown = { preserved: true }; personaBackup.settings.activeUserPersonaId = 'constructor'; personaBackup.conversations[0].userPersonaId = 'constructor';
await context.commitBackupRestorePlan(context.buildBackupRestorePlan(personaBackup, { settings: true, conversations: true }));
const importedPersona = context.getUserPersonaById('constructor'); assert.equal(importedPersona.userName, 'Incoming'); assert.equal(importedPersona.unknown.preserved, true);
reset(); const promptBackup = copy(backup); promptBackup.settings.presetLibrary[0].prompts = [{ id: 'constructor', identifier: 'constructor', name: 'Special prompt', role: 'system', content: 'must be in request', enabled: true }];
await context.commitBackupRestorePlan(context.buildBackupRestorePlan(promptBackup, { presets: true })); context.replacePlaceholders = text => text;
assert.equal(context.buildSillyTavernPresetMessageBuckets('Character', 'User').beforeHistory[0].content, 'must be in request');
for (const [endpointKey, credentialKey] of [['apiEndpoint', 'apiKey'], ['summarizeApiEndpoint', 'summarizeApiKey']]) {
    reset(); context.state.settings[credentialKey] = ''; const data = copy(backup); data.settings[endpointKey] = 'https://remote.invalid/chat/completions';
    plan = context.buildBackupRestorePlan(data, { settings: true });
    const originalEndpoint = context.state.settings[endpointKey];
    context.afterWrite = async () => { context.state.settings[credentialKey] = 'new-local-secret'; queued = context.persistState(true); };
    await assert.rejects(context.commitBackupRestorePlan(plan), /凭据已变化/); await queued;
    assert.equal(context.durable.settings[endpointKey], originalEndpoint); assert.equal(context.durable.settings[credentialKey], 'new-local-secret');
}
reset(); await context.commitBackupRestorePlan(context.buildBackupRestorePlan({ type: 'opentavern-export', version: 1, conversations: [{ id: 'single', messages: [] }] }, { conversations: true })); assert.equal(context.state.activeConvId, 'local', 'Legacy single-conversation imports must preserve the current conversation.');

reset(); plan = context.buildBackupRestorePlan(backup, { conversations: true });
let release;
const sync = context.runCloudSyncOutsideBackupRestore(() => new Promise(resolve => { release = resolve; }));
await assert.rejects(context.commitBackupRestorePlan(plan), /云同步正在进行/); release(); await sync;
assert.equal(context.cloudSyncActiveOperations, 0);
await assert.rejects(context.runCloudSyncOutsideBackupRestore(async () => { throw new Error('network'); }), /network/); assert.equal(context.cloudSyncActiveOperations, 0);
reset(); context.showGlassConfirm = async () => true; context.alert = () => {}; context.location = { reload() {} }; let releaseLocal;
context.afterWrite = () => new Promise(resolve => { releaseLocal = resolve; });
const oldRecovery = context.restoreFromStorageCandidate({ data: copy(context.state), backend: 'test' });
while (!releaseLocal) await Promise.resolve();
await assert.rejects(context.commitBackupRestorePlan(context.buildBackupRestorePlan(backup, { conversations: true })), /存储恢复或清空/);
releaseLocal(); await oldRecovery; assert.equal(context.storageReplacementActive, 0);
context.clearStorageServiceData = () => new Promise(resolve => { releaseLocal = resolve; });
const clearing = context.createStorageServiceOperationsAPI().clearAllData();
await assert.rejects(context.commitBackupRestorePlan(context.buildBackupRestorePlan(backup, { conversations: true })), /存储恢复或清空/); releaseLocal(); await clearing; assert.equal(context.storageReplacementActive, 0);
reset(); plan = context.buildBackupRestorePlan(backup, { conversations: true }); context.afterWrite = () => new Promise(resolve => { releaseLocal = resolve; });
const restoring = context.commitBackupRestorePlan(plan); while (!context.storageReplacementActive && !context.backupRestorePending) await Promise.resolve();
await assert.rejects(context.createStorageServiceOperationsAPI().clearAllData(), /另一项恢复/);
await context.restoreFromStorageCandidate({ data: copy(context.state), backend: 'test' });
while (!releaseLocal) await Promise.resolve(); releaseLocal(); await restoring; assert.equal(Object.keys(context.state.conversations).length, 2);
reset(); let scheduledAfterRenderFailure = 0; context.scheduleCloudSyncUpload = () => scheduledAfterRenderFailure++; context.renderMyCards = () => { throw new Error('render-test'); };
assert.equal(await context.commitBackupRestorePlan(context.buildBackupRestorePlan(backup, { conversations: true })), true); assert.equal(scheduledAfterRenderFailure, 1); delete context.scheduleCloudSyncUpload; delete context.renderMyCards;
console.log('Backup restore runtime passed: 64 selections, dependency remapping, invalid input, credentials, reliable ACK, concurrent chat, late failure/clear, special IDs and sync exclusion.');
