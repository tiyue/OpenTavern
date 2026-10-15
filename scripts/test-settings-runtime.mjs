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

console.log('Settings runtime checks passed: legacy persona migration, conversation memory, model discovery, penalties, Ollama auto-compatibility, stream mode and tab structure.');
