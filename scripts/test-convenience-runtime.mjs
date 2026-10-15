import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const copy = value => JSON.parse(JSON.stringify(value));
let confirmation, saves = 0, errors = [];
const context = {
    state: {}, dom: { userPersonaSelect: {}, userPersonaName: {}, userName: {}, userDescription: {} },
    document: { getElementById() { return null; } }, t: key => key,
    readTrimmedControlValue: control => String(control.value || '').trim(),
    readTrimmedControlValueOr: (control, fallback) => String(control.value || '').trim() || fallback,
    persistState() { saves++; }, showGlassConfirm: () => new Promise(resolve => { confirmation = resolve; })
};
vm.createContext(context);
for (const name of ['state/30-state-user-personas.js', 'settings/68-settings-draft.js', 'settings/68-settings-user-personas.js']) vm.runInContext(fs.readFileSync(new URL('../src/app/' + name, import.meta.url), 'utf8'), context, { filename: name });
context.setSettingsDraftError = text => errors.push(text);
context.renderUserPersonaSelect = () => {};
context.hydrateActiveUserPersonaFields = () => {};
function reset() {
    saves = 0; errors = [];
    context.state = { settings: { userPersonas: [1, 2, 3].map(n => ({ id: 'p' + n, name: 'P' + n, userName: 'U' + n, description: 'D' + n })), activeUserPersonaId: 'p2' }, conversations: { a: { userPersonaId: 'p2' }, b: { userPersonaId: 'p3' } }, activeConvId: 'a' };
    context.settingsFormDraft = copy(context.state.settings); context.settingsFormOriginal = context.state.settings;
    context.settingsPersonaBaseline = copy(context.state.settings.userPersonas[1]);
    context.dom.userPersonaSelect.value = 'p2'; context.dom.userPersonaName.value = 'P2'; context.dom.userName.value = 'U2'; context.dom.userDescription.value = 'D2';
}
reset(); context.state.settings.activeUserPersonaId = 'p3'; context.state.activeConvId = 'b'; context.dom.userDescription.value = 'edited P2';
assert.equal(context.commitUserPersonaForm().id, 'p2'); assert.equal(context.state.settings.userPersonas[1].description, 'edited P2'); assert.equal(context.state.settings.userPersonas[2].description, 'D3'); assert.equal(context.state.conversations.b.userPersonaId, 'p3');
reset(); context.dom.userDescription.value = 'draft'; context.state.settings.userPersonas[1].description = 'concurrent';
assert.equal(context.commitUserPersonaForm(), null); assert.equal(context.state.settings.userPersonas[1].description, 'concurrent'); assert.equal(saves, 0);
reset(); context.state.settings = copy(context.state.settings); assert.equal(context.commitUserPersonaForm(), null); assert.equal(saves, 0);
reset(); context.settingsFormBaseline = copy(context.state.settings); context.settingsFormStateBaseline = copy(context.state.settings); context.validateSettingsFormControls = () => {}; context.readSettingsFormIntoState = () => {}; context.validatePromptControlsSettings = () => {}; context.dom.userDescription.value = 'persona-only draft'; context.state.settings = copy(context.state.settings);
assert.throws(() => context.commitSettingsDraft(), /恢复替换/); assert.equal(context.state.settings.userPersonas[1].description, 'D2'); assert.equal(saves, 0);
reset(); let operation = context.deleteActiveUserPersona(); context.state.activeConvId = 'b'; context.state.settings.activeUserPersonaId = 'p3'; confirmation(true); await operation;
assert.equal(context.state.conversations.a.userPersonaId, 'p1'); assert.equal(context.state.conversations.b.userPersonaId, 'p3'); assert.equal(context.state.settings.activeUserPersonaId, 'p3'); assert.equal(saves, 1);
for (const change of ['restore', 'target-edit', 'last-persona']) {
    reset(); operation = context.deleteActiveUserPersona();
    if (change === 'restore') context.state.settings = copy(context.state.settings);
    if (change === 'target-edit') context.state.settings.userPersonas[1].description = 'updated';
    if (change === 'last-persona') context.state.settings.userPersonas = [context.state.settings.userPersonas[1]];
    const before = copy(context.state); confirmation(true); await operation; assert.deepEqual(copy(context.state), before); assert.equal(saves, 0); assert.equal(errors.length, 1);
}

let resolveRequest, calls = 0, prepareFails = false, alerts = [];
const input = { value: 'draft', dispatchEvent() {}, focus() {} };
const draftContext = {
    console, AbortController, Event, state: { settings: { apiEndpoint: '/chat', apiKey: 'dummy', maxTokens: 100, contextLength: 10 }, conversations: {}, isGenerating: false },
    document: { getElementById() { return null; } }, dom: { messageInput: input }, t: key => key, alert: text => alerts.push(text),
    getUserPersonaById() { if (prepareFails) throw new Error('prepare failure'); return { userName: 'User', description: 'persona' }; },
    normalizeApiEndpoint: endpoint => endpoint, postProcessPromptMessages: messages => messages,
    buildChatCompletionPayload: (settings, messages, options) => ({ ...options, messages }), buildChatCompletionFetchOptions: (settings, payload, controller) => ({ body: JSON.stringify(payload), signal: controller.signal }),
    splitInlineCot: text => ({ content: text }), fetch() { calls++; return new Promise(resolve => { resolveRequest = resolve; }); }
};
vm.createContext(draftContext);
for (const name of ['conversation/32-message-identity.js', 'chat/67-user-draft.js']) vm.runInContext(fs.readFileSync(new URL('../src/app/' + name, import.meta.url), 'utf8'), draftContext, { filename: name });
const conv = { id: 'draft-conv', character: { name: 'Character' }, messages: [{ id: 'm', role: 'assistant', content: 'history' }] }; draftContext.getActiveConv = () => conv;
prepareFails = true; assert.equal(await draftContext.generateUserDraft(), false); assert.equal(draftContext.userDraftRequest, null); assert.equal(calls, 0); assert.match(alerts[0], /prepare failure/);
prepareFails = false; operation = draftContext.generateUserDraft(); conv.messages[0].speaker = 'changed'; resolveRequest({ ok: true, json: async () => ({ choices: [{ message: { content: 'late draft' } }] }) });
assert.equal(await operation, false); assert.equal(input.value, 'draft'); assert.equal(draftContext.userDraftRequest, null);
operation = draftContext.generateUserDraft(); resolveRequest({ ok: true, json: async () => ({ choices: [{ message: { content: 'accepted draft' } }] }) }); assert.equal(await operation, true); assert.equal(input.value, 'accepted draft'); assert.equal(conv.messages.length, 1);
console.log('Convenience runtime passed: persona form origin/conflicts, deletion confirmation races, draft preparation failure, full revision guard and draft-only output.');
