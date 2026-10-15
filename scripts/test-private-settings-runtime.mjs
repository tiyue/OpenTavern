import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const clone = value => JSON.parse(JSON.stringify(value));
const context = {
  console, state: {}, saved: null,
  normalizeCloudSyncSnapshot: clone,
  normalizeCloudSyncRestoredConversations() {},
  ensureCloudSyncRestoredActiveConversation() {},
  persistCloudSyncAppliedSnapshot() { context.saved = clone(context.state); },
  notifyCloudSyncSnapshotApplied() {},
};
vm.createContext(context);
for (const file of ['conversation/19-conversation-order-helpers.js', 'sync/19-cloud-sync-settings-policy.js', 'sync/22-cloud-sync-apply-settings.js', 'storage/24-storage-compat.js', 'state/30-state-default-settings.js', 'presets/62-sillytavern-preset-model.js', 'transfer/63-conversation-export-helpers.js', 'sync/22-cloud-sync-apply.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, 'src/app', file), 'utf8'), context, { filename: file });
}

const privateFields = {
  apiKey: 'remote-test-key', summarizeApiKey: 'remote-test-summary', futureAccessToken: 'remote-test-token',
  futureToken: 'remote-test-token', futureSecret: 'remote-test-secret', futurePassword: 'remote-test-password',
  futureCredential: 'remote-test-credential', futurePrivateKey: 'remote-test-private-key',
  imageGenerationEndpoint: 'https://remote.invalid/images', imageGenerationToken: 'remote-test-image',
  cloudSyncEnabled: true, cloudSyncEndpoint: 'https://remote.invalid/sync', cloudSyncToken: 'remote-test-sync',
  cloudSyncEncrypted: true, cloudSyncPassphrase: 'remote-test-passphrase',
  cardRuntime: { enabled: true, grants: ['read-all'] }, cardRuntimeEnabled: true,
  cardRuntimeGrants: { card: ['read-all'] }, cardRuntimePermissions: ['network'],
};
const remote = {
  settings: { ...privateFields, temperature: 0, maxTokens: 4096, showMsgTokenUsage: true, futurePublicOption: { value: 7 }, apiEndpoint: 'https://remote.invalid/v1', summarizeApiEndpoint: 'https://remote.invalid/summary' },
  conversations: { card: { id: 'card', messages: [{ id: 'm1', revision: 'm1:test', role: 'assistant', content: 'original', responseVersions: [{ id: 'v1', message: { content: 'original' } }] }], character: { extensions: { cardRuntimeEnabled: true, futureToken: 'raw-metadata' } } } },
  characters: { card: { name: 'card', extensions: { scripts: ['raw-script-text'], cardRuntime: { enabled: true } } } },
  worldBooks: {}, conversationOrder: ['card'], activeConvId: 'card',
};
const beforeRemote = JSON.stringify(remote);

// Reproduce the inbound gap with fields absent from this device; no real credentials or cloud access.
context.state = { settings: { temperature: 0.7 } };
context.applyCloudSyncSnapshot(remote);
assert.equal(context.state.settings.futureAccessToken, undefined, 'Remote future credentials must not enter local settings.');
for (const key of Object.keys(privateFields)) {
  assert.equal(context.getCloudSyncPortableSettings(privateFields)[key], undefined, `Outgoing ${key} must be excluded.`);
  assert.equal(context.saved.settings[key], context.defaultSettings()[key], `Incoming ${key} must not be adopted.`);
}
assert.equal(context.state.settings.temperature, 0);
assert.equal(context.state.settings.maxTokens, 4096);
assert.equal(context.state.settings.showMsgTokenUsage, true);
assert.deepEqual(clone(context.state.settings.futurePublicOption), { value: 7 });
assert.deepEqual(context.saved.conversations, remote.conversations, 'Message identity, versions and raw card metadata remain data.');
assert.deepEqual(context.saved.characters, remote.characters);
assert.equal(JSON.stringify(remote), beforeRemote, 'Incoming snapshot must not be mutated.');

// Existing local credentials and their endpoint pairs win; transient values reset by the existing restore policy.
const local = { ...clone(privateFields), apiKey: 'local-test-key', apiEndpoint: 'https://local.invalid/v1', summarizeApiKey: 'local-test-summary', summarizeApiEndpoint: 'https://local.invalid/summary', futureToken: 'local-test-token', imageGenerationToken: 'transient-test-token', cloudSyncLastAt: 1, cloudSyncLastStatus: 'old' };
Object.assign(local, { cardRuntime: { enabled: false, grants: [] }, cardRuntimeEnabled: false, cardRuntimeGrants: {}, cardRuntimePermissions: [] });
context.state = { settings: local };
context.applyCloudSyncSnapshot(remote);
const expected = { ...context.getCloudSyncPreservedLocalSettings(local), apiEndpoint: local.apiEndpoint, summarizeApiEndpoint: local.summarizeApiEndpoint };
for (const [key, value] of Object.entries(expected)) assert.deepEqual(clone(context.state.settings[key]), clone(value), `Keep local ${key}.`);
assert.equal(context.state.settings.imageGenerationToken, '');
assert.notEqual(context.state.settings.cloudSyncLastAt, 1);
assert.notEqual(context.state.settings.cloudSyncLastStatus, 'old');
const exported = context.buildAllConversationsExportData(Object.values(context.state.conversations), '2026-10-02T00:00:00Z');
for (const key of Object.keys(privateFields)) assert.equal(exported.settings[key], undefined, `Full backup excludes ${key}.`);
assert.deepEqual(exported.characters, remote.characters);

// Structural property names must never change the settings prototype via Object.assign.
context.state = { settings: {} };
const structural = JSON.parse('{"settings":{"__proto__":{"remotePrototypeValue":true},"constructor":{"remote":true},"prototype":{"remote":true},"temperature":0.2},"conversations":{}}');
context.applyCloudSyncSnapshot(structural);
assert.equal(context.state.settings.remotePrototypeValue, undefined);
for (const key of ['__proto__', 'constructor', 'prototype']) assert.equal(Object.hasOwn(context.state.settings, key), false);
assert.equal(context.state.settings.temperature, 0.2);
assert.deepEqual(clone(context.getCloudSyncPortableSettings(null)), {});
assert.deepEqual(clone(context.getCloudSyncPortableSettings([])), {});
context.isBackupRestorePending = () => true;
const beforeBlocked = JSON.stringify(context.state);
assert.throws(() => context.applyCloudSyncSnapshot(remote), /备份恢复正在保存/);
assert.equal(JSON.stringify(context.state), beforeBlocked);
console.log('Private settings policy passed: inbound/outbound, local pairs, runtime namespace, structural keys and raw metadata.');
