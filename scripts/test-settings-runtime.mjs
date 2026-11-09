import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readSource = (name) => fs.readFileSync(path.join(projectRoot, 'src', 'app', name), 'utf8');

const personaContext = {
    console,
    makeId: () => 'generated',
    state: {
        settings: {
            lang: 'zh-CN',
            userName: 'Legacy User',
            userDescription: 'Legacy persona',
            userPersonas: [{ id: 'default', name: '默认设定', userName: 'User', description: '' }],
            activeUserPersonaId: 'default'
        },
        conversations: { first: {}, second: {} },
        activeConvId: 'first'
    }
};
vm.createContext(personaContext);
vm.runInContext(
    readSource('state/30-state-user-personas.js') +
    '\n;globalThis.personaRuntime={ensure:ensureUserPersonaSettings,activate:activateUserPersona,sync:syncActiveConversationUserPersona,update:updateActiveUserPersona};',
    personaContext
);

let personas = personaContext.personaRuntime.ensure(personaContext.state.settings);
assert.equal(personas[0].userName, 'Legacy User', 'Legacy userName should migrate into the default persona.');
assert.equal(personas[0].description, 'Legacy persona', 'Legacy userDescription should migrate into the default persona.');

personas.push({ id: 'detective', name: '侦探线', userName: 'Lin', description: 'Detective' });
personaContext.personaRuntime.activate('detective', personaContext.state.conversations.first, true);
assert.equal(personaContext.state.settings.userName, 'Lin');
assert.equal(personaContext.state.conversations.first.userPersonaId, 'detective');

personaContext.state.conversations.second.userPersonaId = 'default';
personaContext.state.activeConvId = 'second';
personaContext.personaRuntime.sync();
assert.equal(personaContext.state.settings.userName, 'Legacy User', 'Switching conversations should restore its remembered persona.');
personaContext.personaRuntime.update({ userName: 'Updated', description: 'Updated persona' });
assert.equal(personaContext.state.settings.userPersonas[0].userName, 'Updated');
assert.equal(personaContext.state.conversations.second.userPersonaId, 'default');

const runtimeContext = {
    console,
    window: {},
    dom: { modelCatalog: null, modelName: null },
    state: { settings: { apiModelCatalog: [], model: 'manual-model' } },
    t: (key) => key
};
vm.createContext(runtimeContext);
vm.runInContext([
    readSource('api/31-api-ollama-compat.js'),
    readSource('api/31-api-connection-response-helpers.js'),
    readSource('api/31-api-model-catalog.js'),
    readSource('api/31-api-protocol.js'),
    readSource('generation/50-generation-api-request.js'),
    `globalThis.settingsRuntime={
        normalizeCatalog:normalizeApiModelCatalog,
        applyCatalog:applyDiscoveredApiModels,
        collectModels:collectApiTestModelNames,
        shouldOllama:shouldUseOllamaCompat,
        payload:buildChatCompletionPayload
    };`
].join('\n'), runtimeContext);

assert.deepEqual(
    Array.from(runtimeContext.settingsRuntime.normalizeCatalog(['alpha', 'alpha', '', 'beta'])),
    ['alpha', 'beta'],
    'Discovered model IDs should be unique and preserve provider order.'
);
assert.deepEqual(
    Array.from(runtimeContext.settingsRuntime.collectModels({ models: [{ name: 'qwen' }, { model: 'llama' }] })),
    ['qwen', 'llama'],
    'Ollama-style model responses should be accepted.'
);
runtimeContext.settingsRuntime.applyCatalog(['alpha', 'beta']);
assert.equal(runtimeContext.state.settings.model, 'manual-model', 'Refreshing models must preserve an arbitrary manual model ID.');
assert.equal(runtimeContext.settingsRuntime.shouldOllama('http://localhost:11434/v1'), true, 'Ollama endpoints should enable compatibility automatically.');
assert.equal(runtimeContext.settingsRuntime.shouldOllama('https://example.test/v1'), false, 'Regular OpenAI-compatible endpoints should not use Ollama normalization.');

const payload = runtimeContext.settingsRuntime.payload({
    model: 'alpha', maxTokens: 8192, temperature: 0.7, topP: 0.9,
    frequencyPenalty: 0.35, presencePenalty: -0.2
}, [{ role: 'user', content: 'hello' }], {});
assert.equal(payload.frequency_penalty, 0.35);
assert.equal(payload.presence_penalty, -0.2);
assert.equal(payload.max_tokens, 8192);
assert.equal(payload.stream, true);
const nonStreamingPayload = runtimeContext.settingsRuntime.payload({
    model: 'alpha', maxTokens: 8192, temperature: 0.7, topP: 0.9,
    frequencyPenalty: 0, presencePenalty: 0, streamEnabled: false
}, [{ role: 'user', content: 'hello' }], {});
assert.equal(nonStreamingPayload.stream, false);

const indexHtml = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8');
const tabOrder = ['settingsTabModel', 'settingsTabPrompts', 'settingsTabSummary', 'settingsTabExtensions', 'settingsTabWorkspace'];
let previousIndex = -1;
for (const id of tabOrder) {
    const currentIndex = indexHtml.indexOf(`id="${id}"`);
    assert.ok(currentIndex > previousIndex, `Settings tab order is wrong around ${id}.`);
    previousIndex = currentIndex;
}
assert.ok(indexHtml.includes('id="modelCatalog"'));
assert.ok(indexHtml.includes('id="frequencyPenalty"'));
assert.ok(indexHtml.includes('id="presencePenalty"'));
assert.ok(indexHtml.includes('id="userPersonaSelect"'));
assert.ok(!indexHtml.includes('class="language-switcher flex items-center"'));
assert.ok(!indexHtml.includes('id="ollamaCompatMode"'));
assert.ok(indexHtml.includes('id="streamEnabled"'));
assert.ok(
    indexHtml.indexOf('id="settingsPanelSummary"') < indexHtml.indexOf('id="worldInfoBudget"') &&
    indexHtml.indexOf('id="worldInfoBudget"') < indexHtml.indexOf('id="settingsPanelWorkspace"'),
    'World Info budget should live in the Memory panel.'
);

const defaultsSource = readSource('state/30-state-default-settings.js');
assert.match(defaultsSource, /automationRules: \[\]/);
assert.match(defaultsSource, /automationRuleGrants: \{\}/);
assert.match(defaultsSource, /automationSendGrants: \{\}/);
assert.match(defaultsSource, /automationRecentRuns: \[\]/);
assert.match(defaultsSource, /contentModules: \[\]/);
assert.match(defaultsSource, /contentModuleBindings: \[\]/);
assert.match(defaultsSource, /contentModuleConversationDisabled: \{\}/);
assert.match(defaultsSource, /contentModuleGrants: \{\}/);
assert.match(defaultsSource, /plugins: \[\]/);
assert.match(defaultsSource, /pluginPrivateData: \{\}/);
assert.match(defaultsSource, /pluginGrants: \{\}/);
const draftSource = readSource('settings/68-settings-draft.js');
const formKeys = (draftSource.match(/var SETTINGS_FORM_KEYS = '([^']+)'/) || [])[1] || '';
assert.ok(!/\bautomationRules\b/.test(formKeys) && !/\bautomationRuleGrants\b/.test(formKeys), 'Automation CRUD must not be committed by the ordinary settings Done/Discard form.');

const policyContext = {};
vm.createContext(policyContext);
vm.runInContext(readSource('sync/19-cloud-sync-settings-policy.js') + '\n;globalThis.portable = getCloudSyncPortableSettings;', policyContext);
const portable = policyContext.portable({
    automationRules: [{ id: 'rule-1' }],
    automationRuleGrants: { 'rule-1': { revision: 1, allowSend: true } },
    automationSendGrants: { 'rule-1': true },
    automationRecentRuns: [{ id: 'run-1' }],
    temperature: 0.5
});
assert.equal(JSON.stringify(portable.automationRules), JSON.stringify([{ id: 'rule-1' }]), 'Automation definitions are portable user data.');
assert.equal(portable.automationRuleGrants, undefined, 'Local run grants must not enter cloud snapshots.');
assert.equal(portable.automationSendGrants, undefined, 'Local auto-send grants must not enter cloud snapshots.');
assert.equal(portable.automationRecentRuns, undefined, 'Runtime records must stay local.');
const modulePortable = policyContext.portable({
    contentModules: [{ id: 'module-1' }],
    contentModuleBindings: [{ id: 'binding-1' }],
    contentModuleConversationDisabled: { conv: ['module-1'] },
    contentModuleGrants: { 'module-1': { approved: { '1.0.0': 'c1:1:2:3' } } }
});
assert.deepEqual(JSON.parse(JSON.stringify(modulePortable.contentModules)), [{ id: 'module-1' }], 'Content module definitions are portable.');
assert.deepEqual(JSON.parse(JSON.stringify(modulePortable.contentModuleBindings)), [{ id: 'binding-1' }], 'Content module bindings are portable.');
assert.deepEqual(JSON.parse(JSON.stringify(modulePortable.contentModuleConversationDisabled)), { conv: ['module-1'] }, 'Conversation disables are portable.');
assert.equal(modulePortable.contentModuleGrants, undefined, 'Local content module grants must not enter cloud snapshots.');
const pluginPortable = policyContext.portable({
    plugins: [{ id: 'conversation-stats' }],
    pluginPrivateData: { 'conversation-stats': { messages: 2 } },
    pluginGrants: { 'conversation-stats': { fingerprint: 'sha256:' + '0'.repeat(64) } }
});
assert.deepEqual(JSON.parse(JSON.stringify(pluginPortable.plugins)), [{ id: 'conversation-stats' }], 'Plugin definitions are portable data.');
assert.deepEqual(JSON.parse(JSON.stringify(pluginPortable.pluginPrivateData)), { 'conversation-stats': { messages: 2 } }, 'Plugin private data is portable.');
assert.equal(pluginPortable.pluginGrants, undefined, 'Local plugin grants must not enter cloud snapshots.');

console.log('Settings runtime checks passed: legacy persona migration, conversation memory, model discovery, penalties, Ollama auto-compatibility, stream mode and tab structure.');
