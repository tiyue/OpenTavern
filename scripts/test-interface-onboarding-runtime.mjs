import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readSource = (name) => fs.readFileSync(path.join(projectRoot, 'src', 'app', name), 'utf8');
const indexHtml = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, 'src', 'app', 'manifest.json'), 'utf8'));

for (const id of [
    'showReplyAvatar', 'showMsgTokenUsage', 'submitWithCmdEnter', 'streamEnabled',
    'streamTextAnimEnabled', 'streamTextAnimEffect', 'streamTextAnimUnit',
    'streamIdleTimeoutSec', 'onboardingDialog', 'onboardingReplayBtn'
]) {
    assert.ok(indexHtml.includes(`id="${id}"`), `Missing required UI control: ${id}`);
}
for (const removedId of ['ollamaCompatMode', 'inferenceBackend', 'webllmModel', 'webllmConfirmModal', 'webllmProgressModal', 'clearWebLLMBtn']) {
    assert.ok(!indexHtml.includes(`id="${removedId}"`), `Removed control is still present: ${removedId}`);
}
assert.equal((indexHtml.match(/data-onboarding-step="\d"/g) || []).length, 4, 'Onboarding must keep exactly four steps.');
assert.ok(!indexHtml.includes('class="language-switcher'), 'Top-bar language switchers must be removed.');
assert.ok(!indexHtml.includes('GitHub Repository'), 'Top-bar repository links must be removed.');
assert.equal((indexHtml.match(/class="cloud-sync-shortcut-btn inline-flex/g) || []).length, 3, 'Announcement, library and chat headers must keep visible sync shortcuts.');
assert.ok(!manifest.some((name) => /webllm|webgpu/i.test(name)), 'Local inference chunks must not remain in the manifest.');
for (const chunk of ['conversation/32-group-chat-avatar-helpers.js', 'generation/50-generation-usage.js', 'generation/52-generation-stream-animation.js', 'onboarding/57-onboarding-state.js', 'onboarding/57-onboarding-actions.js']) {
    assert.ok(manifest.includes(chunk), `Manifest is missing ${chunk}.`);
}

const defaultContext = {
    DEFAULT_TWO_STAGE_PROMPT: 'two-stage',
    defaultSillyTavernPreset: () => ({}),
    t: (key) => key,
    console
};
vm.createContext(defaultContext);
vm.runInContext(readSource('state/30-state-default-settings.js') + '\n;globalThis.getDefaults=defaultSettings;', defaultContext);
const defaults = defaultContext.getDefaults();
assert.equal(defaults.showReplyAvatar, false);
assert.equal(defaults.showMsgTokenUsage, false);
assert.equal(defaults.submitWithCmdEnter, true);
assert.equal(defaults.streamEnabled, true);
assert.equal(defaults.streamTextAnimEnabled, false);
assert.equal(defaults.streamTextAnimEffect, 'rise');
assert.equal(defaults.streamTextAnimUnit, 'token');
assert.equal(defaults.streamTextAnimDuration, 180);
assert.equal(defaults.streamIdleTimeoutSec, 0);
assert.ok(!Object.hasOwn(defaults, 'inferenceBackend'));
assert.ok(!Object.hasOwn(defaults, 'webllmModel'));
assert.ok(!Object.hasOwn(defaults, 'ollamaCompatMode'));
assert.equal(defaultContext.normalizeStreamIdleTimeoutSec(5), 15);
assert.equal(defaultContext.normalizeStreamIdleTimeoutSec(301), 300);
assert.equal(defaultContext.normalizeStreamIdleTimeoutSec(0), 0);

const preservedConversation = { id: 'keep', messages: [{ role: 'assistant', content: 'existing data' }] };
const migrationContext = {
    console,
    DEFAULT_TWO_STAGE_PROMPT: 'two-stage',
    defaultSillyTavernPreset: () => ({}),
    t: (key) => key,
    state: {
        settings: {
            lang: 'zh-CN', apiEndpoint: 'https://example.test/v1', apiKey: 'keep-key',
            inferenceBackend: 'webllm', webllmModel: 'old-model', ollamaCompatMode: true,
            streamIdleTimeoutSec: 5
        },
        conversations: { keep: preservedConversation }
    },
    ensureUserPersonaSettings() {},
    normalizeUiTheme: (value) => value || 'new-light',
    cacheUiTheme() {}
};
vm.createContext(migrationContext);
vm.runInContext([
    readSource('state/30-state-default-settings.js'),
    readSource('state/34-state-init-settings.js'),
    ';globalThis.ensureDefaults=ensureStateSettingDefaults;'
].join('\n'), migrationContext);
migrationContext.ensureDefaults();
assert.equal(migrationContext.state.conversations.keep, preservedConversation, 'Settings migration must not replace conversations.');
assert.equal(migrationContext.state.conversations.keep.messages[0].content, 'existing data');
assert.equal(migrationContext.state.settings.apiKey, 'keep-key');
assert.equal(migrationContext.state.settings.streamIdleTimeoutSec, 15);
assert.ok(!Object.hasOwn(migrationContext.state.settings, 'inferenceBackend'));
assert.ok(!Object.hasOwn(migrationContext.state.settings, 'webllmModel'));
assert.ok(!Object.hasOwn(migrationContext.state.settings, 'ollamaCompatMode'));

const messageUiContext = {
    state: { settings: { showReplyAvatar: false, showMsgTokenUsage: false }, characters: {} },
    PUBLIC_CARDS: [],
    isGroupChat: () => false,
    escapeHtml: (value) => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'),
    resolvePublicCardAssetUrl: (value) => value,
    t: (key) => ({ msg_token_usage_cached: 'cached', msg_token_usage_tok_s: 'tok/s' }[key] || key)
};
vm.createContext(messageUiContext);
vm.runInContext([
    readSource('conversation/32-group-chat-avatar-helpers.js'),
    readSource('generation/50-generation-usage.js'),
    ';globalThis.messageUi={sender:renderAssistantSenderHtml,tokens:renderMsgTokenMeta};'
].join('\n'), messageUiContext);
const sampleCharacter = { name: 'Mika', avatar: '' };
assert.ok(!messageUiContext.messageUi.sender('Mika', sampleCharacter).includes('msg-avatar'));
messageUiContext.state.settings.showReplyAvatar = true;
assert.ok(messageUiContext.messageUi.sender('Mika', sampleCharacter).includes('msg-avatar--letter'));
const sampleUsageMessage = { role: 'assistant', usage: { promptTokens: 12, completionTokens: 4, cachedTokens: 3, tokensPerSecond: 8.5 } };
assert.equal(messageUiContext.messageUi.tokens(sampleUsageMessage), '');
messageUiContext.state.settings.showMsgTokenUsage = true;
const usageHtml = messageUiContext.messageUi.tokens(sampleUsageMessage);
assert.ok(usageHtml.includes('↑ 12 tokens'));
assert.ok(usageHtml.includes('↓ 4 tokens'));
assert.ok(usageHtml.includes('8.5 tok/s'));

const messageLifecycleContext = {
    makeId: () => 'assistant-id',
    async persistConversationMessageMutation(conv, mutate) { const candidate = structuredClone(conv); const result = mutate(candidate); conv.messages = candidate.messages; return result; },
    appendFinalAssistantMessage() {},
    renderTokenBar() {}
};
vm.createContext(messageLifecycleContext);
vm.runInContext([
    readSource('conversation/32-message-identity.js'),
    readSource('generation/52-generation-message-lifecycle.js'),
    ';globalThis.finishMessage=finishAssistantMessage;'
].join('\n'), messageLifecycleContext);
const lifecycleConversation = { messages: [], updated: 0 };
const lifecycleUsage = { promptTokens: 7, completionTokens: 2 };
const storedMessage = await messageLifecycleContext.finishMessage(lifecycleConversation, 'Saved', null, 'main', null, '', lifecycleUsage);
assert.equal(storedMessage.usage.promptTokens, 7);
assert.equal(lifecycleConversation.messages[0].usage.completionTokens, 2, 'API usage must be persisted on the assistant message.');

const requestBodies = [];
let responseMode = 'stream';
let idleReadPending = false;
const generationContext = {
    console,
    AbortController,
    TextDecoder,
    Response,
    ReadableStream,
    setTimeout,
    clearTimeout,
    state: {
        settings: {
            apiEndpoint: 'https://example.test/v1', apiKey: 'key', model: 'model', maxTokens: 512,
            temperature: 0.7, frequencyPenalty: 0.1, presencePenalty: -0.1, topP: 0.9,
            requestCotEnabled: false, streamEnabled: true, streamIdleTimeoutSec: 0
        },
        isGenerating: false
    },
    appStore: { notify() {} },
    t: (key) => key,
    fetch: async (_url, options) => {
        requestBodies.push(JSON.parse(options.body));
        if (responseMode === 'idle') {
            let readCount = 0;
            const encoder = new TextEncoder();
            return {
                ok: true,
                body: {
                    getReader() {
                        return {
                            read() {
                                readCount += 1;
                                if (readCount === 1) {
                                    return Promise.resolve({ done: false, value: encoder.encode('data: {"choices":[{"delta":{"content":"Partial"}}]}\n\n') });
                                }
                                if (readCount === 2) {
                                    return Promise.resolve({ done: false, value: encoder.encode(': keep-alive\n\n') });
                                }
                                idleReadPending = true;
                                return new Promise((_resolve, reject) => {
                                    options.signal.addEventListener('abort', () => {
                                        const error = new Error('aborted');
                                        error.name = 'AbortError';
                                        reject(error);
                                    }, { once: true });
                                });
                            }
                        };
                    }
                }
            };
        }
        if (responseMode === 'json') {
            return new Response(JSON.stringify({
                choices: [{ message: { content: 'Complete' } }],
                usage: { prompt_tokens: 9, completion_tokens: 4, total_tokens: 13 }
            }), { status: 200, headers: { 'content-type': 'application/json' } });
        }
        const chunks = [
            'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n',
            'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n',
            'data: {"choices":[],"usage":{"prompt_tokens":11,"completion_tokens":5,"total_tokens":16}}\n\n',
            'data: [DONE]\n\n'
        ];
        return new Response(new ReadableStream({
            start(controller) {
                for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
                controller.close();
            }
        }), { status: 200, headers: { 'content-type': 'text/event-stream' } });
    }
};
vm.createContext(generationContext);
vm.runInContext([
    readSource('state/30-state-default-settings.js'),
    readSource('api/31-api-endpoint-normalizer.js'),
    readSource('api/31-api-ollama-compat.js'),
    readSource('generation/50-generation-cot-utils.js'),
    readSource('generation/50-generation-usage.js'),
    readSource('generation/50-generation-api-request.js'),
    readSource('generation/50-generation-stream-state.js'),
    readSource('generation/50-generation-transport-module.js'),
    readSource('generation/50-generation-response-stream.js'),
    readSource('generation/50-generation-integrations.js'),
    ';globalThis.generationRuntime={stream:streamChatWithMessages};'
].join('\n'), generationContext);

const streamed = await new Promise((resolve, reject) => {
    const snapshots = [];
    generationContext.generationRuntime.stream(
        [{ role: 'user', content: 'hello' }],
        (_token, fullContent) => snapshots.push(fullContent),
        (content, cot, usage) => resolve({ snapshots, content, cot, usage }),
        reject
    );
});
assert.deepEqual(streamed.snapshots, ['Hel', 'Hello']);
assert.equal(streamed.content, 'Hello');
assert.equal(streamed.usage.promptTokens, 11);
assert.equal(streamed.usage.completionTokens, 5);
assert.equal(requestBodies[0].stream, true);
assert.deepEqual(requestBodies[0].stream_options, { include_usage: true });

responseMode = 'json';
generationContext.state.settings.streamEnabled = false;
const nonStreamed = await new Promise((resolve, reject) => {
    let tokenCalls = 0;
    generationContext.generationRuntime.stream(
        [{ role: 'user', content: 'hello again' }],
        () => { tokenCalls += 1; },
        (content, cot, usage) => resolve({ tokenCalls, content, cot, usage }),
        reject
    );
});
assert.equal(nonStreamed.tokenCalls, 0);
assert.equal(nonStreamed.content, 'Complete');
assert.equal(nonStreamed.usage.totalTokens, 13);
assert.equal(requestBodies[1].stream, false);
assert.ok(!Object.hasOwn(requestBodies[1], 'stream_options'));

const pendingIdleTimers = new Map();
let idleTimerId = 0;
let idleTimerSchedules = 0;
generationContext.setTimeout = (callback) => {
    idleTimerSchedules += 1;
    const id = ++idleTimerId;
    pendingIdleTimers.set(id, callback);
    return id;
};
generationContext.clearTimeout = (id) => pendingIdleTimers.delete(id);
responseMode = 'idle';
generationContext.state.settings.streamEnabled = true;
generationContext.state.settings.streamIdleTimeoutSec = 15;
const idleResultPromise = new Promise((resolve, reject) => {
    const snapshots = [];
    generationContext.generationRuntime.stream(
        [{ role: 'user', content: 'wait' }],
        (_token, fullContent) => snapshots.push(fullContent),
        (content, cot, usage) => resolve({ snapshots, content, cot, usage }),
        reject
    );
});
for (let i = 0; i < 5 && !idleReadPending; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
}
assert.equal(idleReadPending, true, 'Idle stream must be waiting for another chunk before the timer fires.');
assert.equal(idleTimerSchedules, 3, 'SSE keep-alive data must not reset the content idle timer.');
assert.equal(pendingIdleTimers.size, 1);
Array.from(pendingIdleTimers.values())[0]();
const idleResult = await idleResultPromise;
assert.deepEqual(idleResult.snapshots, ['Partial']);
assert.equal(idleResult.content, 'Partial', 'Idle timeout must preserve the generated partial reply.');
assert.equal(idleResult.usage, null);
generationContext.setTimeout = setTimeout;
generationContext.clearTimeout = clearTimeout;

const inputContext = {};
vm.createContext(inputContext);
vm.runInContext(readSource('events/71-event-chat-composer-bindings.js') + '\n;globalThis.shouldSubmit=shouldSubmitComposerKeydown;', inputContext);
assert.equal(inputContext.shouldSubmit({ key: 'Enter' }, { submitWithCmdEnter: true }), false);
assert.equal(inputContext.shouldSubmit({ key: 'Enter', ctrlKey: true }, { submitWithCmdEnter: true }), true);
assert.equal(inputContext.shouldSubmit({ key: 'Enter' }, { submitWithCmdEnter: false }), true);
assert.equal(inputContext.shouldSubmit({ key: 'Enter', shiftKey: true }, { submitWithCmdEnter: false }), false);
assert.equal(inputContext.shouldSubmit({ key: 'Enter', ctrlKey: true, isComposing: true }, { submitWithCmdEnter: true }), false);

const animationContext = {
    DEFAULT_TWO_STAGE_PROMPT: 'two-stage', defaultSillyTavernPreset: () => ({}), t: (key) => key,
    state: { settings: { streamTextAnimEnabled: true, lowPowerMode: false } },
    window: { matchMedia: () => ({ matches: false }) }, console
};
vm.createContext(animationContext);
vm.runInContext(readSource('state/30-state-default-settings.js') + '\n' + readSource('generation/52-generation-stream-animation.js') + '\n;globalThis.animActive=isStreamTextAnimationActive;', animationContext);
assert.equal(animationContext.animActive(), true);
animationContext.state.settings.lowPowerMode = true;
assert.equal(animationContext.animActive(), false, 'Low-power mode must disable stream animation.');
animationContext.state.settings.lowPowerMode = false;
animationContext.window.matchMedia = () => ({ matches: true });
assert.equal(animationContext.animActive(), false, 'Reduced-motion preference must disable stream animation.');

const localValues = new Map();
let persisted = 0;
let personaValues = null;
const onboardingElements = {
    endpoint: { value: 'https://example.test/v1/chat/completions' }, apiKey: { value: 'session-key' },
    saveApiKey: { checked: false }, modelName: { value: 'test-model' }, personaName: { value: 'Detective' },
    userName: { value: 'Lin' }, userDescription: { value: 'City detective' }
};
const onboardingContext = {
    console,
    localStorage: { getItem: (key) => localValues.get(key) || null, setItem: (key, value) => localValues.set(key, String(value)) },
    document: { getElementById: () => null },
    state: { settings: { apiEndpoint: '', apiKey: '', saveApiKey: false, model: '', systemPrompt: '' } },
    BASE_SYSTEM_PROMPT: 'built-in-roleplay-prompt',
    getOnboardingElements: () => onboardingElements,
    updateActiveUserPersona: (values) => { personaValues = values; },
    persistState: () => { persisted += 1; return Promise.resolve(); }
};
vm.createContext(onboardingContext);
vm.runInContext([
    readSource('onboarding/57-onboarding-state.js'), readSource('onboarding/57-onboarding-actions.js'),
    `globalThis.onboardingRuntime={shouldShow:shouldShowOnboarding,mark:markOnboardingCompleted,commit:commitOnboardingStep,featured:ONBOARDING_FEATURED_CARD_IDS};`
].join('\n'), onboardingContext);
assert.equal(onboardingContext.onboardingRuntime.shouldShow(), true);
onboardingContext.onboardingRuntime.mark();
assert.equal(onboardingContext.onboardingRuntime.shouldShow(), false);
assert.deepEqual(Array.from(onboardingContext.onboardingRuntime.featured), ['misono_mika', 'sakuraba_ema']);
onboardingContext.onboardingRuntime.commit(0);
onboardingContext.onboardingRuntime.commit(1);
onboardingContext.onboardingRuntime.commit(2);
assert.equal(onboardingContext.state.settings.model, 'test-model');
assert.equal(personaValues.userName, 'Lin');
assert.equal(onboardingContext.state.settings.systemPrompt, 'built-in-roleplay-prompt');
assert.equal(persisted, 3);

console.log('Interface/onboarding checks passed: remote-only UI, defaults, data-safe migration, stream modes, usage, keyboard, motion guards and onboarding.');
