import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';
const copy = value => JSON.parse(JSON.stringify(value));
const CONTENT_MODULE_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';
let id = 0;
const context = {
    console: { ...console, error() {} }, dom: {}, setTimeout, clearTimeout, TextEncoder, URL, atob, DEFAULT_TWO_STAGE_PROMPT: 'options',
    window: { sha256: value => createHash('sha256').update(typeof value === 'string' ? value : Buffer.from(value)).digest('hex') },
    t: key => key,
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
for (const file of ['api/31-api-protocol.js', 'chat/60-composer-images.js', 'appearance/13-reading-appearance.js', 'conversation/19-conversation-order-helpers.js', 'sync/19-cloud-sync-settings-policy.js', 'storage/20-storage-service-operations-api.js', 'sync/22-cloud-sync-normalize.js', 'sync/22-cloud-sync-incremental-core.js', 'sync/22-cloud-sync-apply-settings.js', 'storage/23-storage-recovery-restore.js', 'state/30-state-default-settings.js', 'state/30-state-user-personas.js', 'automation/32-automation-rules.js', 'scenarios/32-scene-packages.js', 'modules/21-content-module-media.js', 'modules/32-content-modules.js', 'plugins/32-plugin-packages.js', 'conversation/32-message-identity.js', 'conversation/32-chat-operations.js', 'conversation/32-group-chat-members.js', 'summary/41-summary-validity.js', 'prompt/41-prompt-history-messages.js', 'retrieval/32-retrieval-sources.js', 'documents/32-documents.js', 'state/35-persist-records.js', 'state/35-state-persistence.js', 'state/35-persist-snapshot-helpers.js', 'state/35-conversation-mutation-persistence.js', 'prompt/40-character-regex-runtime.js', 'prompt/40-regex-worker-runtime.js', 'presets/62-sillytavern-preset-model.js', 'presets/62-preset-library.js', 'presets/62-sillytavern-preset-placement.js', 'presets/62-sillytavern-preset-runtime.js', 'library/60-library-my-card-order.js', 'library/60-library-my-card-reorder-input.js', 'library/60-library-my-card-reorder-drag.js', 'library/60-library-my-card-reorder-finalize.js', 'transfer/63-conversation-export-helpers.js', 'transfer/63-backup-restore-plan.js', 'transfer/63-backup-restore-runtime.js', 'sync/22-cloud-sync-upload.js', 'sync/22-cloud-sync-apply.js']) vm.runInContext(fs.readFileSync(new URL('../src/app/' + file, import.meta.url), 'utf8'), context, { filename: file });

context.stopAllPluginInstances = () => { context.pluginStops = (context.pluginStops || 0) + 1; };
const examplePlugin = JSON.parse(fs.readFileSync(new URL('../examples/plugins/conversation-stats-v1.json', import.meta.url), 'utf8'));

function reset() {
    const settings = context.defaultSettings(); context.ensurePresetLibrary(settings);
    settings.presetLibrary[0].name = 'local'; settings.globalRegexScripts = [{ findRegex: 'local', replaceString: 'kept', placement: [1] }];
    settings.apiKey = 'local-secret'; settings.cloudSyncToken = 'local-sync-secret'; settings.saveApiKey = true;
    settings.myCardOrder = ['alice'];
    context.state = { settings, conversations: { local: { id: 'local', messages: [{ id: 'local-message', role: 'user', content: 'local' }], summaries: [] } }, conversationOrder: ['local'], activeConvId: 'local', worldBooks: { world: { id: 'world', name: 'local world', entries: {} } }, characters: { alice: { name: 'Alice', description: 'local' } }, _charactersMigrated: false };
    context.state.documents = {};
    context.failSave = false; context.afterWrite = null; context.StorageService._lastSaveSnapshot = null; context.pluginStops = 0;
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

reset();
const pluginBackup = copy(backup);
const pluginRecord = context.pluginInstalledRecordFromPackage(context.normalizePluginPackage(examplePlugin).record);
const localGrant = { fingerprint: context.pluginFingerprint(pluginRecord), version: pluginRecord.version, digest: pluginRecord.digest, capabilities: pluginRecord.capabilities.slice(), network: [], grantedAt: 1 };
Object.assign(pluginBackup.settings, {
    plugins: [pluginRecord],
    pluginPrivateData: { 'conversation-stats': { messages: 2 } },
    pluginGrants: { 'conversation-stats': localGrant }
});
context.state.settings.pluginGrants = { 'conversation-stats': copy(localGrant) };
await context.commitBackupRestorePlan(context.buildBackupRestorePlan(pluginBackup, { settings: true }));
assert.equal(context.state.settings.plugins.length, 1);
assert.equal(context.state.settings.plugins[0].version, '1.0.0');
assert.deepEqual(copy(context.state.settings.pluginPrivateData), { 'conversation-stats': { messages: 2 } });
assert.deepEqual(copy(context.state.settings.pluginGrants), copy({ 'conversation-stats': localGrant }), 'Portable backup must not replace the local grant.');
assert.equal(context.pluginStops, 1, 'A successful settings restore stops running plugins.');
reset();
const invalidPluginBackup = copy(pluginBackup);
invalidPluginBackup.settings.plugins[0].entry.code += 'changed';
assert.throws(() => context.buildBackupRestorePlan(invalidPluginBackup, { settings: true }));

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
{
// New global and per-character links must follow collided worldbook IDs in every container.
reset();
const linkedBackup = copy(backup);
linkedBackup.settings.globalWorldBookIds = ['world'];
linkedBackup.settings.worldBookOrder = ['world'];
linkedBackup.characters.bob.linkedWorldBookId = 'world';
linkedBackup.characters.bob.linkedExtraWorldBookIds = ['world'];
linkedBackup.conversations[0].worldBookIds = ['world'];
linkedBackup.conversations[0].character = { name: 'Bob', linkedWorldBookId: 'world', linkedExtraWorldBookIds: ['world'] };
linkedBackup.conversations[0].group = { members: [{ character: { name: 'Member', linkedExtraWorldBookIds: ['world'] } }] };
const linkedPlan = context.buildBackupRestorePlan(linkedBackup, Object.fromEntries(groups.map(name => [name, true])));
const importedWorldId = Object.keys(linkedPlan.additions.worldBooks)[0];
assert.notEqual(importedWorldId, 'world');
assert.deepEqual(copy(linkedPlan.settingsPatch.globalWorldBookIds), [importedWorldId]);
assert.deepEqual(copy(linkedPlan.settingsPatch.worldBookOrder), [importedWorldId]);
assert.equal(linkedPlan.additions.characters.bob.linkedWorldBookId, importedWorldId);
const linkedConv = Object.values(linkedPlan.additions.conversations)[0];
assert.equal(linkedConv.character.linkedWorldBookId, importedWorldId);
assert.deepEqual(copy(linkedConv.group.members[0].character.linkedExtraWorldBookIds), [importedWorldId]);
await context.commitBackupRestorePlan(linkedPlan);
assert.deepEqual(copy(context.durable.settings.globalWorldBookIds), [importedWorldId]);
reset();
assert.throws(() => context.buildBackupRestorePlan(linkedBackup, { settings: true, worldBooks: false }), /世界书/);

}

{
// Renamed conversation copies must keep imported quick reply targets and branch parents on the copies.
reset();
const bindingBackup = copy(backup);
bindingBackup.conversations = [
    { id: 'child', title: 'incoming child', branchOf: { conversationId: 'local', userMessageId: 'fork', unknown: { kept: true } }, messages: [{ id: 'fork', role: 'user', content: 'incoming fork' }], summaries: [] },
    { id: 'local', title: 'incoming parent', messages: [{ id: 'fork', role: 'user', content: 'incoming fork' }], summaries: [] },
    { id: 'legacy', title: 'legacy link', branchOf: 'legacy-source', messages: [], summaries: [] }
];
bindingBackup.conversationOrder = ['local', 'child', 'legacy']; bindingBackup.activeConvId = 'local';
bindingBackup.settings.quickReplyGroups = [
    { id: 'conv-target', name: 'conversation target', enabled: true, scope: 'conversation', targetId: 'local', buttons: [{ id: 'b1', name: 'say', content: 'hello', action: 'insert' }] },
    { id: 'global-target', name: 'global target', enabled: true, scope: 'global', targetId: '', buttons: [] },
    { id: 'character-target', name: 'character target', enabled: true, scope: 'character', targetId: 'Alice', buttons: [] },
    { id: 'outside-target', name: 'outside target', enabled: true, scope: 'conversation', targetId: 'outside', unknown: { kept: true }, buttons: [] }
];
const bindingSource = copy(bindingBackup), bindingLocal = JSON.stringify(context.state.conversations.local), bindingLive = JSON.stringify(context.state.settings);
const bindingPlan = context.buildBackupRestorePlan(bindingBackup, { conversations: true, settings: true });
assert.deepEqual(bindingBackup, bindingSource, 'Binding remaps must not change the parsed backup.');
assert.equal(JSON.stringify(context.state.conversations.local), bindingLocal, 'Preview must not change the existing local conversation.');
assert.equal(JSON.stringify(context.state.settings), bindingLive, 'Preview must not change live quick reply groups.');
const bindingParent = Object.values(bindingPlan.additions.conversations).find(conv => conv.title === 'incoming parent');
assert.notEqual(bindingParent.id, 'local', 'Fixture must create an ID conflict copy.');
const bindingChild = Object.values(bindingPlan.additions.conversations).find(conv => conv.title === 'incoming child');
assert.equal(bindingChild.branchOf.conversationId, bindingParent.id, 'Imported branch parents must follow the restored copy.');
assert.equal(bindingChild.branchOf.userMessageId, 'fork'); assert.deepEqual(copy(bindingChild.branchOf.unknown), { kept: true });
assert.equal(Object.values(bindingPlan.additions.conversations).find(conv => conv.title === 'legacy link').branchOf, 'legacy-source', 'Non-record branch metadata must stay unchanged.');
assert.equal(bindingPlan.settingsPatch.quickReplyGroups[0].targetId, bindingParent.id, 'Imported conversation-scope quick replies must follow the restored copy.');
assert.equal(bindingPlan.settingsPatch.quickReplyGroups[1].targetId, '', 'Global quick reply groups must not be rebound.');
assert.equal(bindingPlan.settingsPatch.quickReplyGroups[2].targetId, 'Alice', 'Character quick reply groups must not be rebound.');
assert.equal(bindingPlan.settingsPatch.quickReplyGroups[3].targetId, 'outside', 'Targets outside this import must keep their existing meaning.');
assert.deepEqual(copy(bindingPlan.settingsPatch.quickReplyGroups[3].unknown), { kept: true });
await context.commitBackupRestorePlan(bindingPlan);
assert.equal(context.state.settings.quickReplyGroups[0].targetId, bindingParent.id);
assert.equal(context.state.settings.quickReplyGroups[3].targetId, 'outside');
assert.equal(context.state.conversations[bindingChild.id].branchOf.conversationId, bindingParent.id);
assert.deepEqual(copy(context.durable.settings.quickReplyGroups), copy(context.state.settings.quickReplyGroups));
assert.equal(JSON.stringify(context.state.conversations.local), bindingLocal, 'Restored copies must not rewrite the existing local conversation.');

// Non-conflicting imports keep the original IDs and bindings.
reset();
const freshBackup = copy(backup);
freshBackup.conversations = [
    { id: 'fresh', title: 'fresh parent', messages: [{ id: 'fresh-message', role: 'user', content: 'x' }], summaries: [] },
    { id: 'fresh-child', title: 'fresh child', branchOf: { conversationId: 'fresh', userMessageId: 'fresh-message' }, messages: [{ id: 'fresh-message', role: 'user', content: 'x' }], summaries: [] }
];
freshBackup.conversationOrder = ['fresh', 'fresh-child']; freshBackup.activeConvId = 'fresh';
freshBackup.settings.quickReplyGroups = [{ id: 'fresh-group', name: 'fresh', enabled: true, scope: 'conversation', targetId: 'fresh', buttons: [] }];
const freshPlan = context.buildBackupRestorePlan(freshBackup, { conversations: true, settings: true });
assert.equal(freshPlan.additions.conversations.fresh.id, 'fresh');
assert.equal(freshPlan.additions.conversations['fresh-child'].branchOf.conversationId, 'fresh');
assert.equal(freshPlan.settingsPatch.quickReplyGroups[0].targetId, 'fresh');
await context.commitBackupRestorePlan(freshPlan);
assert.equal(context.state.conversations['fresh-child'].branchOf.conversationId, 'fresh');
assert.equal(context.state.settings.quickReplyGroups[0].targetId, 'fresh');

// Restoring conversations alone must not touch existing local quick reply groups.
reset();
context.state.settings.quickReplyGroups = [{ id: 'local-group', name: 'local', enabled: true, scope: 'conversation', targetId: 'local', buttons: [] }];
const localGroups = copy(context.state.settings.quickReplyGroups), localConversation = JSON.stringify(context.state.conversations.local);
const conversationsOnly = copy(bindingBackup);
const conversationsOnlyPlan = context.buildBackupRestorePlan(conversationsOnly, { conversations: true });
assert.equal(conversationsOnlyPlan.settingsPatch.quickReplyGroups, undefined);
await context.commitBackupRestorePlan(conversationsOnlyPlan);
assert.deepEqual(copy(context.state.settings.quickReplyGroups), localGroups, 'Conversation-only restore must not rebind local quick reply groups.');
assert.equal(JSON.stringify(context.state.conversations.local), localConversation);

// Restoring settings alone cannot invent a conversation target.
reset();
const settingsOnly = copy(bindingBackup);
const settingsOnlyPlan = context.buildBackupRestorePlan(settingsOnly, { settings: true });
assert.equal(settingsOnlyPlan.settingsPatch.quickReplyGroups[0].targetId, 'local', 'Settings-only restore must not guess a conversation copy.');
await context.commitBackupRestorePlan(settingsOnlyPlan);
assert.equal(context.state.settings.quickReplyGroups[0].targetId, 'local');
assert.equal(JSON.stringify(context.state.conversations.local), localConversation);

// A branch parent outside the import keeps its existing reference, as does a quick reply target.
reset();
const outsideBackup = copy(backup);
outsideBackup.conversations = [{ id: 'orphan', title: 'orphan child', branchOf: { conversationId: 'local', userMessageId: 'x' }, messages: [{ id: 'x', role: 'user', content: 'x' }], summaries: [] }];
outsideBackup.conversationOrder = ['orphan']; outsideBackup.activeConvId = 'orphan';
outsideBackup.settings.quickReplyGroups = [{ id: 'outside-group', name: 'outside', enabled: true, scope: 'conversation', targetId: 'local', buttons: [] }];
const outsidePlan = context.buildBackupRestorePlan(outsideBackup, { conversations: true, settings: true });
assert.equal(outsidePlan.additions.conversations.orphan.branchOf.conversationId, 'local', 'A non-imported branch parent must keep its existing reference.');
assert.equal(outsidePlan.settingsPatch.quickReplyGroups[0].targetId, 'local', 'A non-imported quick reply target must keep its existing reference.');
await context.commitBackupRestorePlan(outsidePlan);
assert.equal(context.state.conversations.orphan.branchOf.conversationId, 'local');
assert.equal(context.state.settings.quickReplyGroups[0].targetId, 'local');

// A failed save must not apply the remapped bindings.
reset();
const failurePlan = context.buildBackupRestorePlan(bindingBackup, { conversations: true, settings: true });
const failureBefore = copy(context.state);
context.failSave = true;
await assert.rejects(context.commitBackupRestorePlan(failurePlan), /quota/);
assert.deepEqual(copy(context.state), failureBefore, 'A failed restore must not apply conversation or quick reply bindings.');
context.failSave = false;
}

{
// Restored connection profiles must follow imported preset copies without guessing for local-only references.
reset();
const profileBackup = copy(backup);
profileBackup.conversations = [];
profileBackup.settings.presetLibrary = [
    { id: 'legacy-preset', name: 'incoming preset', prompts: [{ id: 'one', identifier: 'one', role: 'system', content: 'incoming prompt' }], promptOrder: [], regexScripts: [] },
    { id: 'fresh-preset', name: 'fresh preset', prompts: [], promptOrder: [], regexScripts: [] }
];
profileBackup.settings.activePresetId = 'legacy-preset';
profileBackup.settings.connectionProfiles = [
    { id: 'conflict-profile', name: 'conflict', purpose: 'main', protocol: 'openai', endpoint: 'https://provider.invalid/v1', model: 'synthetic', parameters: { temperature: 0.2, presetId: 'legacy-preset' } },
    { id: 'fresh-profile', name: 'fresh', purpose: 'summary', protocol: 'openai', endpoint: 'https://provider.invalid/v1', model: 'synthetic', parameters: { presetId: 'fresh-preset' } },
    { id: 'local-profile', name: 'local', purpose: 'embedding', protocol: 'openai', endpoint: 'https://provider.invalid/v1', model: 'synthetic', parameters: { presetId: 'local-only-preset' } }
];
const profileSource = copy(profileBackup);
const profilePlan = context.buildBackupRestorePlan(profileBackup, { settings: true, presets: true });
assert.deepEqual(profileBackup, profileSource, 'Preset reference remaps must not change the parsed backup.');
const mappedPreset = profilePlan.settingsPatch.activePresetId;
assert.notEqual(mappedPreset, 'legacy-preset', 'Fixture must create a preset ID conflict copy.');
assert.equal(profilePlan.settingsPatch.presetLibrary.find(preset => preset.id === mappedPreset).name, 'incoming preset');
assert.equal(profilePlan.settingsPatch.connectionProfiles[0].parameters.presetId, mappedPreset, 'Imported profile preset references must follow the restored preset copy.');
assert.equal(profilePlan.settingsPatch.connectionProfiles[0].parameters.temperature, 0.2);
assert.equal(profilePlan.settingsPatch.connectionProfiles[1].parameters.presetId, 'fresh-preset', 'Non-conflicting preset references keep their ID.');
assert.equal(profilePlan.settingsPatch.connectionProfiles[2].parameters.presetId, 'local-only-preset', 'Preset references outside this import keep their existing meaning.');
await context.commitBackupRestorePlan(profilePlan);
assert.equal(context.state.settings.connectionProfiles[0].parameters.presetId, context.state.settings.activePresetId);
assert.equal(context.state.settings.connectionProfiles[1].parameters.presetId, 'fresh-preset');
assert.equal(context.state.settings.connectionProfiles[2].parameters.presetId, 'local-only-preset');
assert.equal(context.state.settings.presetLibrary.find(preset => preset.id === 'legacy-preset').name, 'local', 'A preset ID conflict must keep the existing local preset.');
assert.deepEqual(copy(context.durable.settings.connectionProfiles), copy(context.state.settings.connectionProfiles));

reset();
const profilePresetsOnly = context.buildBackupRestorePlan(profileBackup, { presets: true });
assert.equal(profilePresetsOnly.settingsPatch.connectionProfiles, undefined, 'Preset-only restore must not touch connection profiles.');
reset();
const profileSettingsOnly = context.buildBackupRestorePlan(profileBackup, { settings: true });
assert.equal(profileSettingsOnly.settingsPatch.connectionProfiles[0].parameters.presetId, 'legacy-preset', 'Settings-only restore must not guess a preset copy.');
await context.commitBackupRestorePlan(profileSettingsOnly);
assert.equal(context.state.settings.connectionProfiles[0].parameters.presetId, 'legacy-preset');
assert.equal(context.state.settings.presetLibrary[0].id, 'legacy-preset');

reset();
const profileFailurePlan = context.buildBackupRestorePlan(profileBackup, { settings: true, presets: true });
const profileFailureBefore = copy(context.state);
context.failSave = true;
await assert.rejects(context.commitBackupRestorePlan(profileFailurePlan), /quota/);
assert.deepEqual(copy(context.state), profileFailureBefore, 'A failed restore must not apply remapped connection profile preset references.');
context.failSave = false;

reset();
const memorySourceBackup = copy(backup);
memorySourceBackup.conversations = [
    { id: 'local', title: 'incoming memory source', messages: [{ id: 'source-message', role: 'user', content: 'imported source only' }], summaries: [] },
    { id: 'new-conv', title: 'incoming target', memorySourceConversationIds: ['local', 'local', 'new-conv', 'outside', 'missing'], messages: [{ id: 'target-message', role: 'user', content: 'target' }], summaries: [] }
];
memorySourceBackup.conversationOrder = ['local', 'new-conv'];
memorySourceBackup.activeConvId = 'new-conv';
context.state.conversations.outside = { id: 'outside', title: 'local outside', messages: [], summaries: [] };
const memorySourceInput = copy(memorySourceBackup), memorySourceLive = JSON.stringify(context.state.conversations.local);
const memorySourcePlan = context.buildBackupRestorePlan(memorySourceBackup, { conversations: true });
assert.deepEqual(memorySourceBackup, memorySourceInput, 'Memory source remaps must not change the parsed backup.');
assert.equal(JSON.stringify(context.state.conversations.local), memorySourceLive, 'Memory source preview must not change the local conversation.');
const mappedSource = Object.values(memorySourcePlan.additions.conversations).find(conv => conv.title === 'incoming memory source');
assert.notEqual(mappedSource.id, 'local');
assert.deepEqual(copy(memorySourcePlan.additions.conversations['new-conv'].memorySourceConversationIds), [mappedSource.id, 'outside'],
    'Memory sources must follow conflict copies, dedupe, drop self/unknown targets and keep existing local targets.');
for (let index = 0; index < 5; index += 1) context.state.conversations['local-memory-' + index] = { id: 'local-memory-' + index, title: 'local memory ' + index, messages: [], summaries: [] };
const limitedBackup = copy(memorySourceBackup);
limitedBackup.conversations[1].memorySourceConversationIds = ['local-memory-0', 'local-memory-1', 'local-memory-2', 'local-memory-3', 'local-memory-4', 'local'];
const limitedPlan = context.buildBackupRestorePlan(limitedBackup, { conversations: true });
assert.deepEqual(copy(limitedPlan.additions.conversations['new-conv'].memorySourceConversationIds), ['local-memory-0', 'local-memory-1', 'local-memory-2', 'local-memory-3'],
    'Memory source links must obey the fixed linked-conversation limit after remapping.');
await context.commitBackupRestorePlan(memorySourcePlan);
assert.deepEqual(copy(context.state.conversations['new-conv'].memorySourceConversationIds), [mappedSource.id, 'outside']);

reset();
const documentBackup = copy(backup);
documentBackup.documents = {
    doc1: {
        id: 'doc1', name: '设定.md', format: 'markdown', content: '北境资料', revision: 'stale-revision',
        createdAt: 1, updatedAt: 1,
        bindings: [{ scope: 'conversation', targetId: 'local' }, { scope: 'character', targetId: 'alice' }]
    }
};
const documentPlan = context.buildBackupRestorePlan(documentBackup, { documents: true, conversations: true });
assert.equal(documentPlan.selection.documents, true);
await context.commitBackupRestorePlan(documentPlan);
const restoredDocument = Object.values(context.state.documents)[0];
assert.equal(restoredDocument.content, '北境资料');
assert.equal(restoredDocument.revision, context.computeDocumentRevision('北境资料'), 'Restore must derive the source revision from content.');
const restoredConversationBinding = restoredDocument.bindings.find(binding => binding.scope === 'conversation');
assert.notEqual(restoredConversationBinding.targetId, 'local', 'Document conversation bindings must follow restored conversation copies.');
assert.equal(context.state.conversations[restoredConversationBinding.targetId].title, 'backup');
assert.equal(restoredDocument.bindings.find(binding => binding.scope === 'character').targetId, 'alice');
assert.deepEqual(copy(context.durable.documents), copy(context.state.documents));

reset();
context.state.documents = { doc1: context.normalizeDocumentRecord({
    id: 'doc1', name: '设定.md', format: 'markdown', content: '北境资料',
    revision: context.computeDocumentRevision('北境资料'),
    createdAt: 1, updatedAt: 1,
    bindings: [{ scope: 'conversation', targetId: 'local' }, { scope: 'character', targetId: 'alice' }]
}, 'doc1') };
const equalDocumentPlan = context.buildBackupRestorePlan(documentBackup, { documents: true });
assert.equal(Object.keys(equalDocumentPlan.additions.documents).length, 0, 'An identical document must not be duplicated.');
await context.commitBackupRestorePlan(equalDocumentPlan);
assert.equal(Object.keys(context.state.documents).length, 1);

reset();
const documentFailurePlan = context.buildBackupRestorePlan(documentBackup, { documents: true });
const documentsBeforeFailure = copy(context.state.documents);
context.failSave = true;
await assert.rejects(context.commitBackupRestorePlan(documentFailurePlan), /quota/);
assert.deepEqual(copy(context.state.documents), documentsBeforeFailure, 'A failed restore must keep the original document library.');
context.failSave = false;
const invalidDocumentBackup = copy(documentBackup);
invalidDocumentBackup.documents.doc1.content = '';
assert.throws(() => context.buildBackupRestorePlan(invalidDocumentBackup, { documents: true }), /资料|原文/);
}

reset();
const automationRule = {
    id: 'automation-rule-1', revision: 1, name: 'restored rule', enabled: true, event: 'user-message-saved',
    scope: 'global', targetId: '', order: 0, conditions: [{ id: 'c1', source: 'event-text', op: 'contains', value: 'hello' }],
    actions: [{ id: 'a1', type: 'append-draft', text: 'restored' }]
};
context.state.settings.automationRuleGrants = { 'automation-rule-1': { revision: 1, allowSend: true } };
context.state.settings.automationSendGrants = { 'automation-rule-1': true };
const automationBackup = copy(backup);
automationBackup.settings = Object.assign({}, automationBackup.settings, { automationRules: [automationRule] });
await context.commitBackupRestorePlan(context.buildBackupRestorePlan(automationBackup, { settings: true }));
assert.equal(context.state.settings.automationRules.length, 1, 'Restoring settings must carry automation rule definitions.');
assert.equal(context.state.settings.automationRules[0].name, 'restored rule');
assert.deepEqual(context.state.settings.automationRuleGrants, { 'automation-rule-1': { revision: 1, allowSend: true } }, 'Restoring settings must preserve local automation run grants.');
assert.deepEqual(context.state.settings.automationSendGrants, { 'automation-rule-1': true }, 'Restoring settings must preserve local auto-send grants.');
assert.equal(context.isAutomationRuleAuthorized(context.state.settings.automationRules[0]), false, 'A restored revision-only legacy grant must not authorize an executable rule.');
context.setAutomationRuleGrant(context.state.settings, 'automation-rule-1', 1, true);
assert.equal(context.isAutomationRuleAuthorized(context.state.settings.automationRules[0]), true, 'An explicit local grant binds the restored executable content.');
context.state.settings.automationRules[0].actions[0].text = 'changed without revision';
context.ensureAutomationSettings(context.state.settings);
assert.equal(context.isAutomationRuleAuthorized(context.state.settings.automationRules[0]), false, 'Changing executable content under the same ID/revision must revoke the local grant.');
const conversationBoundBackup = copy(automationBackup);
conversationBoundBackup.settings.automationRules = [Object.assign({}, automationRule, { scope: 'conversation', targetId: 'local' })];
const conversationBoundPlan = context.buildBackupRestorePlan(conversationBoundBackup, { settings: true, conversations: true });
const mappedConversationId = Object.keys(conversationBoundPlan.additions.conversations)[0];
await context.commitBackupRestorePlan(conversationBoundPlan);
assert.equal(context.state.settings.automationRules[0].targetId, mappedConversationId, 'A restored conversation-bound rule must follow the imported conversation copy.');
assert.notEqual(context.state.settings.automationRules[0].targetId, 'local');
const settingsOnlyBoundBackup = copy(automationBackup);
settingsOnlyBoundBackup.settings.automationRules = [Object.assign({}, automationRule, { scope: 'conversation', targetId: 'local' })];
await context.commitBackupRestorePlan(context.buildBackupRestorePlan(settingsOnlyBoundBackup, { settings: true }));
assert.equal(context.state.settings.automationRules[0].enabled, false, 'A settings-only restore must disable conversation-bound rules instead of binding to a private local conversation.');
assert.ok(context.state.settings.automationRules[0].targetId.startsWith('disabled:'));
const invalidAutomationBackup = copy(automationBackup);
invalidAutomationBackup.settings.automationRules[0].actions[0] = { id: 'a1', type: 'mvu-set', path: '__proto__.x', valueType: 'number', value: 1 };
assert.throws(() => context.buildBackupRestorePlan(invalidAutomationBackup, { settings: true }), /automation_mvu_path_invalid|automation_action_event_invalid/);

reset();
const scenePackage = {
    id: 'scene-package-1', revision: 1, name: 'restored scene', enabled: true, scope: 'conversation', targetId: 'local', order: 0,
    events: [{ id: 'scene-event-1', revision: 1, name: 'Opening', order: 0, trigger: 'opening', once: true, conditions: [], text: 'Restored scene text', mvu: [] }]
};
context.state.settings.scenePackageGrants = { 'scene-package-1': { revision: 1, fingerprint: 'local-grant' } };
const sceneBackup = copy(backup);
sceneBackup.settings = Object.assign({}, sceneBackup.settings, { scenePackages: [scenePackage] });
await context.commitBackupRestorePlan(context.buildBackupRestorePlan(sceneBackup, { settings: true }));
assert.equal(context.state.settings.scenePackages.length, 1, 'Restoring settings must carry scene package definitions.');
assert.equal(context.state.settings.scenePackages[0].name, 'restored scene');
assert.deepEqual(copy(context.state.settings.scenePackageGrants), { 'scene-package-1': { revision: 1, fingerprint: 'local-grant' } }, 'Restoring settings must preserve local scene grants.');
assert.equal(context.state.settings.scenePackages[0].enabled, false, 'A settings-only restore must disable conversation-bound scene packages.');
assert.ok(context.state.settings.scenePackages[0].targetId.startsWith('disabled:'));
context.state.settings.scenePackages[0].enabled = true;
context.state.settings.scenePackages[0].targetId = 'local';
context.setScenePackageGrant(context.state.settings, 'scene-package-1', 1, true);
assert.equal(context.isScenePackageAuthorized(context.state.settings.scenePackages[0]), true);
const sceneBoundPlan = context.buildBackupRestorePlan(sceneBackup, { settings: true, conversations: true });
const sceneMappedConversationId = Object.keys(sceneBoundPlan.additions.conversations)[0];
await context.commitBackupRestorePlan(sceneBoundPlan);
assert.equal(context.state.settings.scenePackages[0].targetId, sceneMappedConversationId, 'A restored conversation-bound scene package must follow the imported conversation copy.');
assert.notEqual(context.state.settings.scenePackages[0].targetId, 'local');
const invalidSceneBackup = copy(sceneBackup);
invalidSceneBackup.settings.scenePackages[0].events[0].mvu = [{ id: 'm', path: '__proto__.x', valueType: 'number', value: 1 }];
assert.throws(() => context.buildBackupRestorePlan(invalidSceneBackup, { settings: true }), /场景|scene/);

reset();
const contentModule = {
    id: 'content-module-1', formatVersion: 1, version: '1.0.0', name: 'Restored module', description: '', source: 'backup',
    items: {
        worldBooks: [{ id: 'book-1', name: 'Module book', entries: [{ id: 'entry-1', content: 'module entry', key: ['m'] }] }],
        regexScripts: [], automationRules: [], scenePackages: []
    },
    assets: [{ id: 'asset-1', name: 'pixel.png', mime: 'image/png', bytes: 68, dataUrl: CONTENT_MODULE_PNG }],
    dependencies: [], hostQuickReplyRefs: [],
    previousVersions: [{
        version: '0.9.0', revision: 1, savedAt: 1,
        items: { worldBooks: [{ id: 'old-book', name: 'Old book', entries: [{ id: 'old-entry', content: 'old entry' }] }], regexScripts: [], automationRules: [], scenePackages: [] },
        assets: [], dependencies: [], hostQuickReplyRefs: []
    }]
};
const contentBackup = copy(backup);
contentBackup.settings = Object.assign({}, contentBackup.settings, {
    contentModules: [contentModule],
    contentModuleBindings: [
        { id: 'module-global', moduleId: 'content-module-1', scope: 'global', targetId: '', enabled: true, order: 0 },
        { id: 'module-conversation', moduleId: 'content-module-1', scope: 'conversation', targetId: 'local', enabled: true, order: 1 }
    ],
    contentModuleConversationDisabled: { local: ['content-module-1'] }
});
context.state.settings.contentModuleGrants = { 'content-module-1': { approved: { '1.0.0': 'sha256:' + 'a'.repeat(64) } } };
const contentBoundPlan = context.buildBackupRestorePlan(contentBackup, { settings: true, conversations: true });
const contentMappedConversationId = Object.keys(contentBoundPlan.additions.conversations)[0];
await context.commitBackupRestorePlan(contentBoundPlan);
assert.equal(context.state.settings.contentModules.length, 1, 'Restoring settings must carry content module definitions.');
assert.equal(context.state.settings.contentModules[0].name, 'Restored module');
assert.equal(context.state.settings.contentModules[0].id, 'content-module-1');
assert.equal(context.state.settings.contentModules[0].assets[0].dataUrl, CONTENT_MODULE_PNG, 'Restoring settings must preserve saved module asset bytes.');
assert.equal(context.state.settings.contentModules[0].previousVersions[0].items.worldBooks[0].entries[0].content, 'old entry', 'Restoring settings must preserve a validated previous version.');
assert.equal(context.state.settings.contentModuleBindings.find(binding => binding.id === 'module-conversation').targetId, contentMappedConversationId, 'A restored conversation-scoped module binding must follow the imported conversation copy.');
assert.deepEqual(copy(context.state.settings.contentModuleConversationDisabled), Object.fromEntries([[contentMappedConversationId, ['content-module-1']]]), 'Conversation disable records must follow the imported conversation copy.');
assert.deepEqual(copy(context.state.settings.contentModuleGrants), { 'content-module-1': { approved: { '1.0.0': 'sha256:' + 'a'.repeat(64) } } }, 'Restoring settings must preserve local content module grants.');
const contentSettingsOnly = copy(contentBackup);
await context.commitBackupRestorePlan(context.buildBackupRestorePlan(contentSettingsOnly, { settings: true }));
const disabledBinding = context.state.settings.contentModuleBindings.find(binding => binding.id === 'module-conversation');
assert.equal(disabledBinding.enabled, false, 'A settings-only restore must disable conversation-bound content modules.');
assert.ok(disabledBinding.targetId.startsWith('disabled:'), 'A private local conversation ID must not be retained as the module target.');
assert.deepEqual(copy(context.state.settings.contentModuleConversationDisabled), {}, 'Settings-only restore must drop private conversation disable records.');
const invalidContentBackup = copy(contentBackup);
invalidContentBackup.settings.contentModules[0].assets = [{ id: 'bad', name: 'bad.png', mime: 'image/png', bytes: 4, dataUrl: 'data:image/png;base64,' + Buffer.from('<html>').toString('base64') }];
assert.throws(() => context.buildBackupRestorePlan(invalidContentBackup, { settings: true }), /内容模块|asset|素材/);

console.log('Backup restore runtime passed: 64 selections, dependency remapping, restored quick reply/branch/profile-preset/document/memory-source/automation/scene/content-module bindings, invalid input, credentials, reliable ACK, concurrent chat, late failure/clear, special IDs and sync exclusion.');
