import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, 'src/app', file), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
const sha256 = value => createHash('sha256').update(typeof value === 'string' ? value : Buffer.from(value)).digest('hex');
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAABQCAYAAADRAH3kAAACNUlEQVR4AeyUwW0DMQwEDy4pPaSZPFOBK0hPaSAtJbiHPgIUkhL94HIMCIc7kQR3d+DH98f7L6evB4+LX2sHAKB1/NcFAADQ3IHm8vkHAIDmDjSXzz9AUwCGbBOAt8/nFTljsPcZmX3XeueOursnckaf9xmZfdd65466uydyRp/3aQLgHURdTQcAoGZuaVsDQJqVNQcBQM3c0rYGgDQraw4CgJq5pW0NAGlW1hg0bwkAsyPN3gGgWeCzXACYHWn2DgDNAp/lAsDsSLN3AGgW+CwXAGZHmr0DQJPAVzIBYOVMk+8A0CTolUwAWDnT5DsANAl6JRMAVs40+Q4ATYJeyQSAlTNNvgOAeNCWPACwHBK/BwDxgC15AGA5JH4PAOIBW/IAwHJI/B4AxAO25AGA5ZD4PQCIBuyVBQBep0TrAEA0WK8sAPA6JVoHAKLBemUBgNcp0ToAEA3WKwsAvE6J1gGAWLBROQAQdUysHgDEAo3KAYCoY2L1ACAWaFQOAEQdE6sHALFAo3IAIOqYWD0AiAS6KwMAdp0T6QMAkSB3ZQDArnMifQAgEuSuDADYdU6kDwBEgtyVAQC7zon0AUDxIE/XB4BTB4v3A0DxAE/XB4BTB4v3A0DxAE/XB4BTB4v3A0DxAE/XB4BTB4v3A0DRALPWNgH4+XpekRNdLDL7rmX+/3lE/TEBiA6kvpYDAFArr/RtASDd0loDAaBWXunbAkC6pbUGAkCtvNK3BYB0S187MHv6HwAAAP//6uBn/wAAAAZJREFUAwDNRuwwkkAgiwAAAABJRU5ErkJggg==';

function baseSettings() {
    return {
        lang: 'zh-CN', globalRegexEnabled: false, globalRegexScripts: [],
        sillyTavernPreset: { regexScriptsEnabled: false, regexScripts: [] },
        quickReplyGroups: [], automationRules: [], automationRuleGrants: {}, automationSendGrants: {}, automationRecentRuns: [],
        scenePackages: [], scenePackageGrants: {}, sceneRecentRuns: [],
        contentModules: [], contentModuleBindings: [], contentModuleConversationDisabled: {}, contentModuleGrants: {},
        worldInfoBudgetEnabled: false, worldInfoBudget: 1000
    };
}

function createHarness(options = {}) {
    let idCounter = 0;
    const context = {
        console, JSON, Object, Array, String, Number, Math, Date, Promise, Set, Map, WeakSet, Uint8Array, atob, TextEncoder,
        window: { sha256 },
        setTimeout, clearTimeout, Worker: function TestWorker() {},
        appStore: { notify() {} },
        makeId: () => 'generated-' + (++idCounter),
        t: key => key,
        escapeHtml: value => String(value == null ? '' : value),
        reportPersistPostSaveError() {},
        state: { settings: baseSettings(), conversations: {}, conversationOrder: [], activeConvId: null, isGenerating: false, worldBooks: {}, characters: {} },
        getActiveConv() { return context.state.conversations[context.state.activeConvId]; },
        getMessageRevision(message) {
            return JSON.stringify([message && message.id, message && message.content, message && message.stage || '',
                message && message.selectedResponseVersionId || '', message && message.interrupted === true]);
        },
        normalizeWIEntry: value => value && typeof value === 'object' ? clone(value) : null,
        captureMvuSources: () => ({ stamp: 'mvu-stable' }),
        getMvuMainMessages(conv) { return (conv && conv.messages || []).filter(message => message && message.role === 'assistant' && message.stage !== 'second'); },
        getMvuDataForMessage(conv) { return clone(conv && conv.mvu && conv.mvu.current || { stat_data: { hp: 1 } }); },
        getMvuInitialData() { return { stat_data: { hp: 1 } }; },
        validateMvuData(value) { return { valid: true, data: clone(value), diagnostics: [] }; },
        cloneMvuRuntimeValue: clone,
        getComposerDraft(conv) { if (!conv._draft) conv._draft = { text: '', images: [], revision: 0 }; return conv._draft; },
        renderComposerImages() {},
        sendMessage: async () => ({ started: true }),
        isGroupAutoRoundsActive: () => false,
        quickReplyConversationBusy: () => false,
        getPromptBuildConnectionStamp: () => 'connection',
        harness: { failSettingsSave: false, settingsSaves: 0, messages: [] }
    };
    context.persistState = async (_immediate, persistOptions) => {
        persistOptions = persistOptions || {};
        if (context.harness.failSettingsSave) throw new Error('settings-quota');
        if (persistOptions.beforePersist) persistOptions.beforePersist();
        let snapshot = { settings: clone(context.state.settings), conversations: clone(context.state.conversations) };
        if (persistOptions.transformSnapshot) snapshot = persistOptions.transformSnapshot(snapshot);
        if (persistOptions.onPersistSuccess) persistOptions.onPersistSuccess();
        if (persistOptions.commitPendingSnapshot) persistOptions.commitPendingSnapshot(snapshot);
        context.harness.settingsSaves++;
        return true;
    };
    context.persistConversationMessageMutation = async (conv, mutate, mutateOptions) => {
        const candidate = Object.assign({}, conv, { messages: clone(conv.messages || []), summaries: clone(conv.summaries || []) });
        const result = mutate(candidate);
        if (mutateOptions && typeof mutateOptions.validate === 'function' && !mutateOptions.validate()) throw new Error('stale-scene');
        conv.messages = clone(candidate.messages);
        conv.summaries = clone(candidate.summaries);
        conv.updated = Date.now();
        context.harness.messages.push(clone(candidate.messages));
        return result;
    };
    context.persistConversationMutation = async (conv, rollback, candidate, commit) => {
        if (commit(conv, true) === false) throw new Error('stale-mvu');
        commit(conv, false);
    };
    context.replaceMvuDataForMessage = async () => {};
    vm.createContext(context);
    const files = [
        'conversation/32-message-identity.js',
        'conversation/59-conversation-timestamp-helpers.js',
        'prompt/40-regex-worker-runtime.js',
        'automation/32-automation-rules.js',
        'automation/32-automation-conditions.js',
        'scenarios/32-scene-packages.js',
        'modules/21-content-module-media.js',
        'modules/32-content-modules.js',
        'modules/40-content-module-runtime.js',
        'scenarios/52-scene-runtime.js',
        'automation/52-automation-runtime.js',
        'worldbook/44-worldbook-activation-collection.js',
        'worldbook/44-worldbook-activation-cache.js',
        'prompt/40-character-regex-runtime.js',
        'prompt/41-prompt-message-builder.js',
        'generation/50-generation-integrations.js'
    ];
    if (options.withMvu) {
        files.push('mvu/40-mvu-initial-state.js');
    }
    vm.runInContext(files.map(read).join('\n'), context, { filename: 'c3-runtime-harness.js' });
    return context;
}

function addConversation(context, id = 'conv-1') {
    const conv = {
        id, title: 'C3 ' + id, character: { name: 'Alice' },
        messages: [{ id: 'u1', role: 'user', content: 'go' }], summaries: [], created: Date.now() - 3600000, updated: Date.now() - 1000
    };
    context.state.conversations[id] = conv;
    context.state.conversationOrder.push(id);
    context.state.activeConvId = id;
    return conv;
}

function makeRule(id, event, text, value) {
    return {
        id, revision: 1, name: 'Rule ' + id, enabled: true, event,
        scope: 'global', targetId: '', order: 0,
        conditions: [{ id: 'c1', source: 'worldbook-entry', op: 'equals', value }],
        actions: [{ id: 'a1', type: 'prompt-fragment', role: 'system', text }]
    };
}

function makeModule(id, overrides = {}) {
    const raw = {
        id, formatVersion: 1, version: '1.0.0', name: 'Module ' + id, description: 'desc', source: 'unit',
        items: {
            worldBooks: [{ id: 'book-1', name: 'Book 1', entries: [{ id: 'entry-1', content: 'module entry', key: ['alpha'], automationId: 'same-auto' }] }],
            regexScripts: [],
            automationRules: [],
            scenePackages: []
        },
        assets: [{ id: 'asset-1', name: 'pixel.png', mime: 'image/png', bytes: 0, dataUrl: PNG }],
        dependencies: [], hostQuickReplyRefs: []
    };
    return Object.assign(raw, overrides || {});
}

function installModule(context, raw, options = {}) {
    const module = context.normalizeContentModule(clone(raw), context.state.settings.contentModules.length, Object.create(null));
    assert.ok(module, 'module should normalize');
    assert.equal(module.invalid, undefined, 'module should be valid: ' + (raw && raw.id));
    context.state.settings.contentModules.push(module);
    context.ensureContentModuleSettings(context.state.settings);
    if (options.grant !== false) context.setContentModuleGrant(context.state.settings, module.id, true);
    if (options.bind !== false) {
        context.state.settings.contentModuleBindings.push({
            id: 'bind-' + module.id, moduleId: module.id, scope: options.scope || 'global',
            targetId: options.targetId || '', enabled: options.enabled !== false, order: context.state.settings.contentModuleBindings.length
        });
        context.ensureContentModuleSettings(context.state.settings);
    }
    return context.getContentModuleById(module.id);
}

function hash(value) { return JSON.stringify(value); }

function createPersistHarness() {
    const context = {
        console, JSON, Object, Array, String, Number, Math, Date, Promise, Set, Map, WeakSet, Uint8Array, atob, TextEncoder,
        window: { sha256 }, dom: {},
        appStore: { notify() {} },
        t: key => key,
        escapeHtml: value => String(value == null ? '' : value),
        reportPersistPostSaveError() {},
        normalizeWIEntry: value => value && typeof value === 'object' ? clone(value) : null,
        getActiveConv() { return context.state.conversations[context.state.activeConvId]; },
        buildCloudSyncConversationSignature: () => 'test-signature',
        getSafeSettingsForPersist: () => clone(context.state.settings),
        getConversationIdsWithMissingFallback: (order, records) => Array.from(new Set([...(order || []), ...Object.keys(records || {})])).filter(id => Object.hasOwn(records || {}, id)),
        getValidConversationIdOrFallback: (active, order, records) => Object.hasOwn(records || {}, active) ? active : (order || Object.keys(records || {}))[0] || null,
        updateStorageInfo() {},
        failSave: false,
        saved: null,
        StorageService: {
            _lastSaveSnapshot: null,
            _cloneForPersist: clone,
            async saveAll(snapshot) {
                if (context.failSave) throw new Error('settings-quota');
                context.saved = clone(snapshot);
                return { runtimeSnapshot: clone(snapshot) };
            }
        },
        state: { settings: baseSettings(), conversations: {}, conversationOrder: [], activeConvId: null, isGenerating: false, worldBooks: {}, characters: {}, documents: {} }
    };
    vm.createContext(context);
    const files = [
        'conversation/32-message-identity.js',
        'automation/32-automation-rules.js',
        'scenarios/32-scene-packages.js',
        'modules/21-content-module-media.js',
        'modules/32-content-modules.js',
        'state/35-persist-records.js',
        'state/35-persist-snapshot-helpers.js',
        'state/35-state-persistence.js'
    ];
    vm.runInContext(files.map(read).join('\n'), context, { filename: 'c3-persist-harness.js' });
    return context;
}

// ---------- data model, validation, import/export, media ----------
{
    const context = createHarness();
    addConversation(context);
    const module = installModule(context, makeModule('m1'));
    assert.equal(context.contentModuleItemCount(module), 1);
    assert.ok(module.assets[0].bytes > 0);
    assert.deepEqual(clone(module.hostQuickReplyRefs), []);
    assert.equal(context.isContentModuleAuthorized(module), true);
    module.items.worldBooks[0].entries[0].assetIds = ['asset-1'];
    assert.deepEqual(clone(context.contentModuleAssetUsage(module, 'asset-1')), ['Book 1 · entry-1'], 'asset references must resolve to module content');
    context.state.settings.contentModules[0].items.regexScripts.push({ id: 'rx', findRegex: 'a', replaceString: 'b', placement: [2], flags: 'g' });
    assert.equal(context.isContentModuleAuthorized(module), false, 'executable content changes must revoke the local grant');
    context.setContentModuleGrant(context.state.settings, module.id, true);
    assert.equal(context.isContentModuleAuthorized(module), true);

    const exported = context.exportContentModuleData(module);
    assert.equal(exported.type, 'opentavern-content-module');
    assert.equal(exported.module.previousVersions, undefined);
    const reimported = context.importContentModuleData(clone(exported));
    assert.equal(reimported.id, module.id);
    assert.equal(context.contentModuleFingerprint(reimported), context.contentModuleFingerprint(module));
    assert.throws(() => context.importContentModuleData(Object.assign({}, exported, { extra: true })), /content_module_import_invalid/);
    assert.throws(() => context.importContentModuleData(Object.assign({}, exported, { formatVersion: 2 })), /content_module_import_invalid/);
    assert.throws(() => context.importContentModuleData(Object.assign({}, exported, { module: Object.assign({}, exported.module, { version: '1.0' }) })), /content_module_import_invalid/);
    assert.throws(() => context.importContentModuleData(Object.assign({}, exported, { module: Object.assign({}, exported.module, { dependencies: [{ moduleId: 'missing', version: '1.0.0' }] }) })), /content_module_dependency_missing/);
    assert.throws(() => context.importContentModuleData(Object.assign({}, exported, { module: Object.assign({}, exported.module, { dependencies: [{ moduleId: module.id, version: '1.0.0' }] }) })), /content_module_dependency_cycle/);
    const HTML = Buffer.from('<html><script>alert(1)</script></html>').toString('base64');
    assert.throws(() => context.contentModuleDecodeAssetDataUrl('data:image/png;base64,' + HTML), /content_module_asset_unsupported/);
    assert.throws(() => context.contentModuleDecodeAssetDataUrl(PNG.replace('image/png', 'image/jpeg')), /content_module_asset_mismatch/);
    assert.throws(() => context.contentModuleDecodeAssetDataUrl('data:image/svg+xml;base64,' + Buffer.from('<svg/>').toString('base64')), /content_module_asset_invalid|content_module_asset_unsupported/);
    assert.throws(() => context.contentModuleDecodeAssetDataUrl('data:image/png;base64,' + 'A'.repeat(Math.ceil(1024 * 1024 / 3) * 4 + 32)), /content_module_asset_too_large/);
    const ruleWithSend = makeRule('r-send', 'user-message-saved', 'x', 'module-entry:entry-1');
    ruleWithSend.conditions = [];
    ruleWithSend.actions = [{ id: 'a', type: 'send-message', text: 'nope' }];
    const sendModule = context.normalizeContentModule(makeModule('m-send', { items: { worldBooks: [], regexScripts: [], automationRules: [ruleWithSend], scenePackages: [] } }), 0, Object.create(null));
    assert.equal(sendModule.invalid, undefined, 'send rules stay in the package instead of being silently dropped');
    assert.equal(context.contentModuleHasSendActions(sendModule), true);
    assert.equal(context.isContentModuleAuthorized(sendModule), false, 'a send rule is not authorized before the local grant');
    context.state.settings.contentModules.push(sendModule);
    context.ensureContentModuleSettings(context.state.settings);
    context.setContentModuleGrant(context.state.settings, sendModule.id, true);
    assert.equal(context.isContentModuleAuthorized(context.getContentModuleById(sendModule.id)), true);
    assert.equal(context.isContentModuleSendAuthorized(context.getContentModuleById(sendModule.id)), false, 'content permission alone must not grant auto-sending');
    context.setContentModuleSendGrant(context.state.settings, sendModule.id, true);
    assert.equal(context.isContentModuleSendAuthorized(context.getContentModuleById(sendModule.id)), true);
    const sendRoundtrip = context.importContentModuleData(context.exportContentModuleData(sendModule));
    assert.equal(sendRoundtrip.items.automationRules[0].actions[0].type, 'send-message', 'package import must not silently drop send rules');
    context.state.settings.contentModuleBindings.push({ id: 'send-binding', moduleId: sendModule.id, scope: 'global', targetId: '', enabled: true, order: 0 });
    context.ensureContentModuleSettings(context.state.settings);
    const sendConv = context.getActiveConv();
    const sendRule = context.getContentModuleAutomationRules(sendConv)[0];
    const pendingSend = { conversationId: sendConv.id, ruleId: sendRule.id, revision: sendRule.revision, eventName: 'user-message-saved',
        text: 'pending', baseRevision: 0, baseText: '', at: Date.now(), chain: { depth: 0, hits: {}, steps: 0 } };
    assert.equal(context.automationPendingStillValid(pendingSend, sendConv), true, 'an authorized pending send is still valid');
    context.setContentModuleSendGrant(context.state.settings, sendModule.id, false);
    assert.equal(context.automationPendingStillValid(pendingSend, sendConv), false, 'revoking send permission invalidates a late queued send');
    context.setContentModuleGrant(context.state.settings, sendModule.id, false);
    assert.equal(context.isContentModuleSendAuthorized(context.getContentModuleById(sendModule.id)), false, 'revoking content permission also stops sending');
    context.state.settings.contentModules = [];
    context.state.settings.contentModuleGrants = {};
    context.ensureContentModuleSettings(context.state.settings);
    assert.throws(() => context.contentModuleFromHost({ name: 'empty', version: '1.0.0', assets: [] }), /content_module_empty/);
    console.log('C3 data model: normalization, grant binding, package roundtrip, unknown fields, versions, dependencies/cycles and media spoofing passed.');
}

// ---------- reserved module IDs ----------
{
    const context = createHarness();
    addConversation(context);
    const reservedIds = ['__proto__', 'prototype', 'constructor'];
    reservedIds.forEach(reservedId => {
        const normalized = context.normalizeContentModule(makeModule(reservedId), 0, Object.create(null));
        assert.ok(normalized, 'reserved ID module should still normalize: ' + reservedId);
        assert.equal(normalized.invalid, true, 'reserved module ID must be marked invalid: ' + reservedId);
        assert.notEqual(normalized.id, reservedId, 'a reserved module ID must not survive normalization: ' + reservedId);
        assert.throws(() => context.validateContentModule(normalized), /content_module_invalid/, 'invalid reserved module must be rejected: ' + reservedId);
        assert.throws(() => context.validateContentModule(makeModule(reservedId)), /content_module_invalid/, 'validation must reject a hand-built reserved ID: ' + reservedId);
        assert.throws(() => context.importContentModuleData({
            type: 'opentavern-content-module', formatVersion: 1, module: makeModule(reservedId)
        }), /content_module_import_invalid/, 'a package with a reserved module ID must be rejected: ' + reservedId);
    });

    // 旧数据里的保留名模块以无效项保留，用户可删除，但不能执行或取得许可。
    context.state.settings.contentModules.push(makeModule('__proto__'));
    context.state.settings.contentModuleGrants = {};
    context.ensureContentModuleSettings(context.state.settings);
    assert.equal(context.state.settings.contentModules.length, 1, 'a stored reserved-ID module stays listed as invalid instead of being dropped');
    const legacy = context.state.settings.contentModules[0];
    assert.equal(legacy.invalid, true);
    assert.equal(Object.hasOwn(context.state.settings.contentModuleGrants, '__proto__'), false);
    context.setContentModuleGrant(context.state.settings, legacy.id, true);
    assert.equal(Object.hasOwn(context.state.settings.contentModuleGrants, legacy.id), false, 'an invalid reserved-ID module must not get a grant record');
    assert.equal(context.isContentModuleAuthorized(legacy), false, 'an invalid reserved-ID module must never be authorized');
    context.state.settings.contentModuleBindings.push({ id: 'bind-legacy', moduleId: legacy.id, scope: 'global', targetId: '', enabled: true, order: 0 });
    context.ensureContentModuleSettings(context.state.settings);
    assert.equal(context.getContentModuleEffectiveModules(context.getActiveConv()).length, 0, 'an invalid reserved-ID module must not execute');

    // 普通 ID 与含冒号 ID 仍是合法身份，许可按自身属性记录。
    const plain = installModule(context, makeModule('plain-module'));
    assert.equal(plain.id, 'plain-module');
    assert.equal(plain.invalid, undefined);
    assert.equal(Object.hasOwn(context.state.settings.contentModuleGrants, plain.id), true, 'a plain module ID keeps an own grant record');
    assert.equal(context.isContentModuleAuthorized(plain), true);
    const colon = installModule(context, makeModule('module:2026'));
    assert.equal(colon.id, 'module:2026');
    assert.equal(colon.invalid, undefined);
    assert.equal(Object.hasOwn(context.state.settings.contentModuleGrants, colon.id), true, 'a colon module ID keeps an own grant record');
    assert.equal(context.isContentModuleAuthorized(colon), true);
    console.log('C3 reserved IDs: __proto__/prototype/constructor are marked invalid and rejected, legacy entries stay deletable without grants, and plain/colon IDs keep their own grants.');
}

// ---------- authoring from host, bindings, dedupe, inheritance ----------
{
    const context = createHarness();
    const conv = addConversation(context);
    context.state.worldBooks.wb1 = { name: 'Host Book', entries: { 0: { id: 'host-entry', content: 'host entry', key: ['h'] } } };
    context.state.settings.globalRegexEnabled = true;
    context.state.settings.globalRegexScripts = [{ findRegex: 'hostrx', replaceString: 'x', placement: [2], flags: 'g' }];
    context.state.settings.automationRules = [makeRule('host-rule', 'worldbook-activated', 'HOST', 'module-entry:host-entry')];
    context.ensureAutomationSettings(context.state.settings);
    context.setAutomationRuleGrant(context.state.settings, 'host-rule', 1, false);
    context.state.settings.scenePackages = [{
        id: 'host-scene', revision: 1, name: 'Host Scene', enabled: true, scope: 'global', targetId: '', order: 0,
        events: [{ id: 'he', revision: 1, name: 'Host event', order: 0, trigger: 'user-message-saved', once: true, conditions: [], text: 'HOST SCENE', mvu: [] }]
    }];
    context.ensureSceneSettings(context.state.settings);
    context.setScenePackageGrant(context.state.settings, 'host-scene', 1, true);
    const before = hash([context.state.worldBooks, context.state.settings.globalRegexScripts, context.state.settings.automationRules, context.state.settings.scenePackages]);
    const module = context.contentModuleFromHost({
        name: 'Hosted', version: '1.0.0', description: 'from host', source: 'host',
        worldBookIds: ['wb1'], regexScripts: [{ layer: 'global', index: 0 }],
        automationRuleIds: ['host-rule'], scenePackageIds: ['host-scene'], assets: []
    });
    assert.ok(module && module.items.worldBooks.length === 1);
    assert.equal(module.items.regexScripts.length, 1);
    assert.equal(module.items.automationRules[0].scope, 'global');
    assert.equal(module.items.scenePackages[0].scope, 'global');
    assert.equal(context.contentModuleHasHostQuickReplyRefs(module), true);
    context.state.settings.contentModules.push(module);
    context.ensureContentModuleSettings(context.state.settings);
    context.setContentModuleGrant(context.state.settings, module.id, true);
    context.state.settings.contentModuleBindings = [
        { id: 'g', moduleId: module.id, scope: 'global', targetId: '', enabled: true, order: 0 },
        { id: 'c', moduleId: module.id, scope: 'conversation', targetId: conv.id, enabled: true, order: 1 }
    ];
    context.ensureContentModuleSettings(context.state.settings);
    assert.equal(context.getContentModuleEffectiveModules(conv).length, 1, 'same module in two scopes must assemble once');
    context.state.settings.contentModuleConversationDisabled[conv.id] = [module.id];
    context.ensureContentModuleSettings(context.state.settings);
    assert.equal(context.getContentModuleEffectiveModules(conv).length, 0, 'conversation override must stop inherited global/character bindings');
    assert.equal(context.state.settings.contentModuleBindings.length, 2, 'conversation override must not delete other bindings');
    context.state.settings.contentModuleConversationDisabled[conv.id] = [];
    context.state.settings.contentModuleBindings[0].enabled = false;
    context.ensureContentModuleSettings(context.state.settings);
    assert.equal(context.getContentModuleEffectiveModules(conv).length, 1, 'the remaining conversation binding still applies');
    assert.equal(hash([context.state.worldBooks, context.state.settings.globalRegexScripts, context.state.settings.automationRules, context.state.settings.scenePackages]), before, 'authoring must not mutate host content');
    console.log('C3 authoring/bindings: host copy, multi-scope dedupe, conversation disable inheritance and host immutability passed.');
}

// ---------- worldbook order/cache, regex order, automation identity ----------
{
    const context = createHarness();
    const conv = addConversation(context);
    context.state.worldBooks.host = { name: 'Host', entries: { 0: { content: 'host', key: ['h'] } } };
    conv.worldBookIds = ['host'];
    context.state.settings.globalRegexEnabled = true;
    context.state.settings.globalRegexScripts = [{ findRegex: 'host', replaceString: 'x', placement: [2], flags: 'g' }];
    const rule = makeRule('r1', 'worldbook-activated', 'ONE', 'module-entry:entry-1');
    const module = installModule(context, makeModule('m1', {
        items: {
            worldBooks: [{ id: 'b1', name: 'B1', entries: [{ id: 'entry-1', content: 'module entry', key: ['k'], automationId: 'same' }] }],
            regexScripts: [{ id: 'rx1', findRegex: 'module', replaceString: 'y', placement: [2], flags: 'g' }],
            automationRules: [rule], scenePackages: []
        }
    }));
    const entries = context.collectWorldInfoActivationEntries(conv);
    assert.deepEqual(clone(entries.map(entry => entry._sourceWorldBookId)), ['host', 'cm:m1:wb:b1'], 'host world book stays first, module follows');
    assert.equal(entries[1].uid, 'cm:m1:wb:b1:entry-1');
    assert.equal(entries[1]._moduleId, module.id, 'world book projections retain the module source');
    assert.equal(entries[1].automationId, 'cm:m1:automation:same');
    const regex = context.getEnabledRegexScripts(conv.character, { conv, processingPhase: 'prompt' });
    assert.deepEqual(clone(regex.map(script => script.findRegex)), ['host', 'module'], 'module regex runs after host groups');
    assert.equal(regex[1]._moduleId, module.id);
    const keyBefore = context.buildWorldInfoActivationCacheKey(conv, { entries: {} });
    context.state.settings.contentModuleBindings[0].enabled = false;
    context.ensureContentModuleSettings(context.state.settings);
    const keyAfter = context.buildWorldInfoActivationCacheKey(conv, { entries: {} });
    assert.notEqual(keyBefore, keyAfter, 'module enablement must invalidate the world book cache');
    context.state.settings.contentModuleBindings[0].enabled = true;
    context.ensureContentModuleSettings(context.state.settings);
    const moduleEntries = context.getContentModuleWorldBookEntries(conv);
    await context.dispatchAutomationEvent('worldbook-activated', conv, { worldbookEntries: moduleEntries.map(entry => ({ worldBookId: entry._sourceWorldBookId, uid: entry.uid, automationId: entry.automationId })) });
    assert.deepEqual(clone(context.takeAutomationPromptFragments(conv, {}).map(fragment => fragment.content)), ['ONE']);
    context.state.settings.contentModuleBindings[0].enabled = false;
    context.ensureContentModuleSettings(context.state.settings);
    await context.dispatchAutomationEvent('worldbook-activated', conv, { worldbookEntries: moduleEntries.map(entry => ({ worldBookId: entry._sourceWorldBookId, uid: entry.uid, automationId: entry.automationId })) });
    assert.deepEqual(clone(context.takeAutomationPromptFragments(conv, {})), [], 'a disabled module must not fire a late automation fragment');
    console.log('C3 runtime integration: world book order/budget/cache, regex order and automation source isolation passed.');
}

// ---------- same internal ids in two modules must not cross-trigger ----------
{
    const context = createHarness();
    const conv = addConversation(context);
    const one = installModule(context, makeModule('m1', {
        items: { worldBooks: [{ id: 'b', name: 'B', entries: [{ id: 'e', content: 'one', key: ['k'], automationId: 'same' }] }], regexScripts: [], automationRules: [makeRule('r', 'worldbook-activated', 'ONE', 'module-entry:e')], scenePackages: [] }
    }));
    const two = installModule(context, makeModule('m2', {
        items: { worldBooks: [{ id: 'b', name: 'B', entries: [{ id: 'e', content: 'two', key: ['k'], automationId: 'same' }] }], regexScripts: [], automationRules: [makeRule('r', 'worldbook-activated', 'TWO', 'module-entry:e')], scenePackages: [] }
    }));
    assert.notEqual(one.id, two.id);
    const entryTwo = context.getContentModuleWorldBookEntries(conv).filter(entry => entry._moduleId === 'm2').map(entry => ({ worldBookId: entry._sourceWorldBookId, uid: entry.uid, automationId: entry.automationId }));
    await context.dispatchAutomationEvent('worldbook-activated', conv, { worldbookEntries: entryTwo });
    assert.deepEqual(clone(context.takeAutomationPromptFragments(conv, {}).map(fragment => fragment.content)), ['TWO'], 'only the module whose own entry activated may run');
    const projected = context.getContentModuleAutomationRules(conv);
    assert.equal(projected.length, 2);
    assert.notEqual(projected[0].id, projected[1].id);
    console.log('C3 module identity: identical internal IDs in two modules stay namespaced and do not cross-trigger.');
}

// ---------- delimiter-safe identities and author-selected automation links ----------
{
    const context = createHarness();
    const conv = addConversation(context);
    installModule(context, makeModule('positive-control'));
    const compound = makeModule('compound-ids', {
        assets: [],
        items: {
            worldBooks: [
                { id: 'a:b', name: 'First', entries: [{ id: 'c', content: 'First unique entry' }] },
                { id: 'a', name: 'Second', entries: [{ id: 'b:c', content: 'Second unique entry' }] }
            ],
            regexScripts: [], automationRules: [], scenePackages: []
        }
    });
    const prepared = context.normalizeContentModule(clone(compound), 1, Object.create(null));
    assert.equal(prepared.invalid, undefined);
    context.validateContentModule(prepared);
    const compoundModule = installModule(context, compound);
    const compoundEntries = context.getContentModuleWorldBookEntries(conv).filter(entry => entry._moduleId === compoundModule.id);
    assert.equal(compoundEntries.length, 2);
    assert.equal(new Set(compoundEntries.map(entry => entry.uid)).size, 2, 'book/entry IDs containing a colon must stay distinct');

    const delimiterRaw = makeModule('package:2026', {
        assets: [],
        items: {
            worldBooks: [], regexScripts: [], scenePackages: [],
            automationRules: [{ id: 'rule-one', revision: 1, name: 'Rule', enabled: true, event: 'before-send', scope: 'global', targetId: '', order: 0,
                conditions: [], actions: [{ id: 'action', type: 'append-draft', text: 'MODULE_DRAFT' }] }]
        }
    });
    const delimiterModule = installModule(context, delimiterRaw);
    const delimiterRule = context.getContentModuleAutomationRules(conv).find(rule => rule._contentModuleId === delimiterModule.id);
    assert.ok(delimiterRule);
    assert.ok(context.getContentModuleAutomationRuleById(delimiterRule.id, conv), 'an accepted module ID containing a delimiter must resolve its rules');

    const authored = createHarness();
    const authoredConv = addConversation(authored);
    authored.state.worldBooks.host = { id: 'host', name: 'Host book', entries: { 7: { id: 'host-entry', uid: 7, content: 'Selected book entry', constant: true, key: [], automationId: 'shared-automation' } } };
    authored.state.settings.automationRules = [{ id: 'host-rule', revision: 1, name: 'Selected existing rule', enabled: false, event: 'worldbook-activated', scope: 'global', targetId: '', order: 0,
        conditions: [{ id: 'entry', source: 'worldbook-entry', op: 'equals', value: 'shared-automation' }], actions: [{ id: 'prompt', type: 'prompt-fragment', role: 'system', text: 'MODULE_AUTOMATION_EFFECT' }] }];
    const authoredRaw = authored.contentModuleFromHost({ name: 'Authored module', version: '1.0.0', worldBookIds: ['host'], automationRuleIds: ['host-rule'], assets: [] });
    const authoredModule = installModule(authored, authoredRaw);
    const authoredEntries = authored.getContentModuleWorldBookEntries(authoredConv).filter(entry => entry._moduleId === authoredModule.id);
    assert.equal(authoredEntries.length, 1);
    const firstResult = await authored.dispatchAutomationEvent('worldbook-activated', authoredConv, {
        eventId: 'independent-worldbook-positive', worldbookEntries: authoredEntries.map(entry => ({ worldBookId: entry._sourceWorldBookId, uid: entry.uid, automationId: entry.automationId }))
    });
    assert.equal(firstResult.matched, 1, 'a rule selected with its world book must keep triggering on the projected entry');
    assert.deepEqual(clone(authored.takeAutomationPromptFragments(authoredConv, {}).map(fragment => fragment.content)), ['MODULE_AUTOMATION_EFFECT']);

    const otherRaw = makeModule('other-shared', {
        assets: [],
        items: {
            worldBooks: [{ id: 'other-book', name: 'Other', entries: [{ id: 'other-entry', content: 'other', key: ['o'], automationId: 'shared-automation' }] }],
            regexScripts: [], automationRules: [makeRule('other-rule', 'worldbook-activated', 'OTHER_EFFECT', 'module-entry:other-entry')], scenePackages: []
        }
    });
    const otherModule = installModule(authored, otherRaw);
    const otherEntries = authored.getContentModuleWorldBookEntries(authoredConv).filter(entry => entry._moduleId === otherModule.id);
    await authored.dispatchAutomationEvent('worldbook-activated', authoredConv, {
        eventId: 'independent-worldbook-negative', worldbookEntries: otherEntries.map(entry => ({ worldBookId: entry._sourceWorldBookId, uid: entry.uid, automationId: entry.automationId }))
    });
    const negativeFragments = authored.takeAutomationPromptFragments(authoredConv, {}).map(fragment => fragment.content);
    assert.deepEqual(clone(negativeFragments), ['OTHER_EFFECT'], 'another module with the same automationId must not trigger this module rule');
    console.log('C3 identity: delimiter-safe IDs, lookup and author-selected automation links are scoped to the actual module entries.');
}

// ---------- dependency gating and failures ----------
{
    const context = createHarness();
    const conv = addConversation(context);
    const dependency = installModule(context, makeModule('dep'));
    const dependentRaw = makeModule('child', { dependencies: [{ moduleId: dependency.id, version: '1.0.0' }] });
    const dependent = installModule(context, dependentRaw);
    assert.equal(context.getContentModuleEffectiveModules(conv).length, 2);
    context.state.settings.contentModuleBindings.find(binding => binding.moduleId === dependency.id).enabled = false;
    context.ensureContentModuleSettings(context.state.settings);
    assert.equal(context.getContentModuleEffectiveModules(conv).some(entry => entry.module.id === dependent.id), false, 'a dependent module must not assemble without its dependency');
    context.state.settings.contentModuleBindings.find(binding => binding.moduleId === dependency.id).enabled = true;
    context.ensureContentModuleSettings(context.state.settings);
    const before = clone(context.state.settings.contentModules);
    context.harness.failSettingsSave = true;
    await assert.rejects(context.saveContentModulesChange(candidate => { candidate.contentModules.push(clone(makeModule('failed'))); }), /settings-quota/);
    assert.deepEqual(clone(context.state.settings.contentModules), before, 'failed save must keep the old module set');
    context.harness.failSettingsSave = false;
    context.failedContentModuleDraft = null;
    console.log('C3 dependencies/failures: missing effective dependency blocks assembly and a failed save keeps the old data.');
}

// ---------- host quick-reply reference validation ----------
{
    const context = createHarness();
    const conv = addConversation(context);
    context.state.settings.quickReplyGroups = [{ id: 'qr-group', name: 'Group', enabled: true, buttons: [{ id: 'qr-button', name: 'Button', content: 'hello', enabled: true }] }];
    context.state.settings.automationRules = [{
        id: 'qr-rule', revision: 1, name: 'QR rule', enabled: true, event: 'before-send', scope: 'global', targetId: '', order: 0,
        conditions: [], actions: [{ id: 'a', type: 'quick-reply', groupId: 'qr-group', buttonId: 'qr-button', mode: 'append' }]
    }];
    context.ensureAutomationSettings(context.state.settings);
    context.setAutomationRuleGrant(context.state.settings, 'qr-rule', 1, false);
    const module = context.contentModuleFromHost({
        name: 'QR module', version: '1.0.0', source: 'host', automationRuleIds: ['qr-rule'], assets: []
    });
    assert.equal(module.hostQuickReplyRefs.length, 1, 'quick-reply host references must be declared explicitly');
    context.state.settings.contentModules.push(module);
    context.ensureContentModuleSettings(context.state.settings);
    context.setContentModuleGrant(context.state.settings, module.id, true);
    context.state.settings.contentModuleBindings = [{ id: 'b', moduleId: module.id, scope: 'global', targetId: '', enabled: true, order: 0 }];
    context.ensureContentModuleSettings(context.state.settings);
    assert.equal(context.getContentModuleEffectiveModules(conv).length, 1);
    context.state.settings.quickReplyGroups = [];
    context.ensureContentModuleSettings(context.state.settings);
    const assembly = context.getContentModuleAssembly(conv);
    assert.equal(assembly.modules.length, 0, 'a missing host quick-reply reference must refuse the whole module');
    assert.equal(assembly.statuses[0].reason, 'content_module_status_host_ref');
    context.state.settings.quickReplyGroups = [{ id: 'qr-group', name: 'Other conversation group', enabled: true, scope: 'conversation', targetId: 'other', buttons: [{ id: 'qr-button', content: 'hello', enabled: true }] }];
    assert.equal(context.getContentModuleEffectiveModules(conv).length, 0, 'a host quick-reply group scoped to another conversation must not be borrowed');
    console.log('C3 host references: module quick-reply references are explicit and a missing host target refuses assembly.');
}

// ---------- scene execution and disable ----------
{
    const context = createHarness();
    const conv = addConversation(context);
    const pkgRule = {
        id: 'scene-1', revision: 1, name: 'Module Scene', enabled: true, scope: 'global', targetId: '', order: 0,
        events: [{
            id: 'ev1', revision: 1, name: 'Saved event', order: 0, trigger: 'user-message-saved', once: true,
            conditions: [{ id: 'c', source: 'event-text', op: 'contains', value: 'go' }], text: 'MODULE SCENE', mvu: []
        }]
    };
    const module = installModule(context, makeModule('m-scene', {
        items: { worldBooks: [], regexScripts: [], automationRules: [], scenePackages: [pkgRule] }
    }));
    const projected = context.getContentModuleScenePackages(conv);
    assert.equal(projected.length, 1);
    assert.equal(projected[0].id, 'cm:' + module.id + ':scene:scene-1');
    const result = await context.runSceneDispatchEvent('user-message-saved', conv, { messageId: 'u1', role: 'user', text: 'go' });
    assert.equal(result.executed, 1);
    assert.equal(conv.messages.some(message => message.stage === 'scene' && message.content === 'MODULE SCENE'), true);
    context.state.settings.contentModuleBindings[0].enabled = false;
    context.ensureContentModuleSettings(context.state.settings);
    const beforeCount = conv.messages.length;
    const after = await context.runSceneDispatchEvent('user-message-saved', conv, { messageId: 'u1', role: 'user', text: 'go' });
    assert.equal(after.executed, 0);
    assert.equal(conv.messages.length, beforeCount, 'a disabled module must not append a late scene message');
    assert.equal(context.getSceneProgress(conv).length, 1, 'historical scene records are retained');
    console.log('C3 scene integration: projected module scene executes once, disable prevents late effects and history remains.');
}

// ---------- prompt source stamp and late save rebind ----------
{
    const context = createHarness();
    const conv = addConversation(context);
    const module = installModule(context, makeModule('m-prompt'));
    const source = context.capturePromptBuildSource(conv);
    assert.equal(context.isPromptBuildSourceCurrent(source), true);
    context.state.settings.contentModuleBindings[0].enabled = false;
    context.ensureContentModuleSettings(context.state.settings);
    assert.equal(context.isPromptBuildSourceCurrent(source), false, 'disabling a module must invalidate the async prompt source');
    context.state.settings.contentModuleBindings[0].enabled = true;
    context.ensureContentModuleSettings(context.state.settings);
    context.activePromptBuildSequence = 5;
    const operation = context.createPromptBuildOperation(5, conv);
    operation.setSource(context.capturePromptBuildSource(conv));
    const saved = { id: 'a1', role: 'assistant', content: 'reply' };
    conv.messages.push(saved);
    const next = context.capturePromptBuildSource(conv);
    assert.equal(operation.rebindSourceAfterSave(next, saved), true, 'a normal ACK with unchanged module assembly may rebind');
    context.state.settings.contentModuleBindings[0].enabled = false;
    context.ensureContentModuleSettings(context.state.settings);
    const nextWithModuleChange = context.capturePromptBuildSource(conv);
    assert.equal(operation.rebindSourceAfterSave(nextWithModuleChange, saved), false, 'a module change must not be approved by an unrelated saved message');
    assert.ok(!context.getContentModuleRegexScripts(conv).length, 'disabled module regex must not remain in the request');
    void module;
    console.log('C3 prompt source: module stamp invalidates async builds and saved-message rebind cannot approve module changes.');
}

// ---------- MVU initvar boundary ----------
{
    const context = createHarness({ withMvu: true });
    const conv = addConversation(context);
    context.mvuIsObject = value => !!value && typeof value === 'object' && !Array.isArray(value);
    context.mvuOwn = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key);
    context.createEmptyMvuData = () => ({ stat_data: {}, schema: {}, initialized_lorebooks: {}, display_data: {} });
    context.normalizeMvuData = value => clone(value);
    context.deepMergeMvuObject = (target, source) => { Object.keys(source || {}).forEach(key => { target[key] = source[key]; }); return target; };
    context.mvuValidateJsonValue = value => ({ valid: true, data: value, diagnostics: [] });
    context.validateMvuData = value => ({ valid: true, data: clone(value), diagnostics: [] });
    context.mvuDiagnostic = code => ({ code, message: code });
    context.extractMvuTaggedBlocks = (text, tag) => {
        const match = new RegExp('<' + tag + '>([\\s\\S]*?)</' + tag + '>').exec(String(text || ''));
        return match ? [match[1]] : [];
    };
    context.parseMvuStructuredTextWithDiagnostics = text => {
        try { return { supported: true, value: JSON.parse(text), diagnostics: [] }; }
        catch (error) { return { supported: false, value: null, diagnostics: [] }; }
    };
    context.isMvuInitVarEntry = entry => String(entry && entry.content || '').indexOf('<initvar>') >= 0;
    context.getMvuEntryLabel = entry => String(entry && (entry.comment || entry.id || entry.uid) || 'entry');
    const dependency = installModule(context, makeModule('m-mvu'));
    context.state.settings.contentModules[0].items.worldBooks[0].entries[0].content = '<initvar>{"stat_data":{"mp":3}}</initvar>';
    context.setContentModuleGrant(context.state.settings, dependency.id, true);
    const rows = context.collectMvuWorldBookEntries(conv);
    assert.equal(rows.some(row => row.sourceName.indexOf('module:') === 0), true, 'module entries must participate in InitVar collection');
    assert.equal(context.getMvuInitialData(conv).stat_data.mp, 3);
    conv.mvu = { initial: { stat_data: { mp: 3 } }, current: { stat_data: { mp: 3 } } };
    context.state.settings.contentModuleBindings[0].enabled = false;
    context.ensureContentModuleSettings(context.state.settings);
    assert.equal(context.getMvuInitialData(conv).stat_data.mp, 3, 'disabling a module must not recompute a saved initial state');
    conv.mvu.initial = { stat_data: { mp: 1 } };
    context.state.settings.contentModuleBindings[0].enabled = true;
    context.ensureContentModuleSettings(context.state.settings);
    assert.equal(context.getMvuInitialData(conv).stat_data.mp, 1, 'an existing saved initial state wins over a later module install');
    console.log('C3 MVU boundary: module InitVar is read only when no saved initial exists; disabling does not rewrite history.');
}

// ---------- strict list limits, duplicate IDs, previous versions and package size ----------
{
    const context = createHarness();
    addConversation(context);
    const baseModule = makeModule('bounds-control');
    function rejectPackage(module) {
        const exported = context.exportContentModuleData(baseModule);
        exported.module = clone(module);
        assert.throws(() => context.importContentModuleData(clone(exported)), /content_module_import_invalid|content_module_items_invalid|content_module_asset|content_module_reference|content_module_dependency/);
    }
    function withItems(items) { return Object.assign({}, clone(baseModule), { assets: [], items }); }
    function emptyItems() { return { worldBooks: [], regexScripts: [], automationRules: [], scenePackages: [] }; }
    const validRule = id => ({ id, revision: 1, name: 'Rule ' + id, enabled: true, event: 'before-send', scope: 'global', targetId: '', order: 0, conditions: [], actions: [{ id: 'a', type: 'append-draft', text: 'x' }] });
    const validRegex = id => ({ id, findRegex: 'a', replaceString: 'b', placement: [2], flags: 'g' });
    const validScene = id => ({ id, revision: 1, name: 'Scene ' + id, enabled: true, scope: 'global', targetId: '', order: 0,
        events: [{ id: 'event', revision: 1, name: 'Event', order: 0, trigger: 'user-message-saved', once: true, conditions: [], text: 'x', mvu: [] }] });
    function expectInvalid(module) {
        const normalized = context.normalizeContentModule(clone(module), 0, Object.create(null));
        assert.equal(normalized.invalid, true, 'over-limit or malformed data must mark the whole module invalid');
        rejectPackage(module);
    }
    const tooManyBooks = emptyItems();
    tooManyBooks.worldBooks = Array.from({ length: context.CONTENT_MODULE_MAX_WORLD_BOOKS + 1 }, (_, index) => ({ id: 'book-' + index, name: 'Book', entries: [{ id: 'entry', content: 'x' }] }));
    expectInvalid(withItems(tooManyBooks));
    const tooManyEntries = emptyItems();
    tooManyEntries.worldBooks = [{ id: 'book', name: 'Book', entries: Array.from({ length: context.CONTENT_MODULE_MAX_WORLD_ENTRIES + 1 }, (_, index) => ({ id: 'entry-' + index, content: 'x' })) }];
    expectInvalid(withItems(tooManyEntries));
    const tooManyRegex = emptyItems();
    tooManyRegex.regexScripts = Array.from({ length: context.CONTENT_MODULE_MAX_REGEX + 1 }, (_, index) => validRegex('r-' + index));
    expectInvalid(withItems(tooManyRegex));
    const tooManyRules = emptyItems();
    tooManyRules.automationRules = Array.from({ length: context.CONTENT_MODULE_MAX_RULES + 1 }, (_, index) => validRule('rule-' + index));
    expectInvalid(withItems(tooManyRules));
    const tooManyScenes = emptyItems();
    tooManyScenes.scenePackages = Array.from({ length: context.CONTENT_MODULE_MAX_SCENES + 1 }, (_, index) => validScene('scene-' + index));
    expectInvalid(withItems(tooManyScenes));
    const tooManyAssets = clone(baseModule);
    tooManyAssets.assets = Array.from({ length: context.CONTENT_MODULE_MAX_ASSETS + 1 }, (_, index) => Object.assign({}, baseModule.assets[0], { id: 'asset-' + index }));
    expectInvalid(tooManyAssets);
    const totalBytesPng = new Uint8Array(800 * 1024);
    totalBytesPng.set([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    const totalBytesAsset = 'data:image/png;base64,' + Buffer.from(totalBytesPng).toString('base64');
    const overTotalAssets = clone(baseModule);
    overTotalAssets.assets = [0, 1, 2].map(index => ({ id: 'total-' + index, name: 'total.png', mime: 'image/png', bytes: 800 * 1024, dataUrl: totalBytesAsset }));
    expectInvalid(overTotalAssets);
    expectInvalid(Object.assign(clone(baseModule), { dependencies: Array.from({ length: context.CONTENT_MODULE_MAX_DEPENDENCIES + 1 }, (_, index) => ({ moduleId: 'dep-' + index, version: '1.0.0' })) }));
    expectInvalid(Object.assign(clone(baseModule), { hostQuickReplyRefs: Array.from({ length: context.CONTENT_MODULE_MAX_HOST_REFS + 1 }, (_, index) => ({ groupId: 'g', buttonId: 'b-' + index })) }));
    expectInvalid(Object.assign(clone(baseModule), { items: [] }));
    expectInvalid(Object.assign(clone(baseModule), { assets: 'not-an-array' }));
    const wrongRegexType = emptyItems();
    wrongRegexType.regexScripts = {};
    expectInvalid(withItems(wrongRegexType));
    const duplicateBooks = emptyItems();
    duplicateBooks.worldBooks = [{ id: 'same', name: 'A', entries: [{ id: 'e1', content: 'x' }] }, { id: 'same', name: 'B', entries: [{ id: 'e2', content: 'y' }] }];
    expectInvalid(withItems(duplicateBooks));
    const duplicateAssets = clone(baseModule);
    duplicateAssets.assets = [Object.assign({}, baseModule.assets[0]), Object.assign({}, baseModule.assets[0])];
    expectInvalid(duplicateAssets);
    const duplicateRules = emptyItems();
    duplicateRules.automationRules = [validRule('same'), validRule('same')];
    expectInvalid(withItems(duplicateRules));
    const duplicateRegex = emptyItems();
    duplicateRegex.regexScripts = [validRegex('same'), validRegex('same')];
    expectInvalid(withItems(duplicateRegex));
    const duplicateScenes = emptyItems();
    duplicateScenes.scenePackages = [validScene('same'), validScene('same')];
    expectInvalid(withItems(duplicateScenes));
    expectInvalid(Object.assign(clone(baseModule), { dependencies: [{ moduleId: 'same', version: '1.0.0' }, { moduleId: 'same', version: '1.0.0' }] }));
    expectInvalid(Object.assign(clone(baseModule), { hostQuickReplyRefs: [{ groupId: 'g', buttonId: 'b' }, { groupId: 'g', buttonId: 'b' }] }));
    const oversizedPrevious = clone(baseModule);
    oversizedPrevious.previousVersions = [{ version: '0.9.0', revision: 1, savedAt: 1, items: emptyItems(),
        assets: Array.from({ length: context.CONTENT_MODULE_MAX_ASSETS + 1 }, (_, index) => Object.assign({}, baseModule.assets[0], { id: 'prev-' + index })) }];
    expectInvalid(oversizedPrevious);
    const overTotalPrevious = clone(baseModule);
    overTotalPrevious.previousVersions = [{ version: '0.9.0', revision: 1, savedAt: 1, items: emptyItems(), assets: [0, 1, 2].map(index => ({ id: 'prev-total-' + index, name: 'prev.png', mime: 'image/png', bytes: 800 * 1024, dataUrl: totalBytesAsset })) }];
    expectInvalid(overTotalPrevious);
    const corruptPrevious = clone(baseModule);
    corruptPrevious.previousVersions = [{ version: '0.9.0', revision: 1, savedAt: 1, items: emptyItems(),
        assets: [{ id: 'bad', name: 'bad.png', mime: 'image/png', bytes: 4, dataUrl: 'data:image/png;base64,' + Buffer.from('<html>').toString('base64') }] }];
    expectInvalid(corruptPrevious);
    const validPrevious = clone(baseModule);
    validPrevious.previousVersions = [{
        version: '0.9.0', revision: 1, savedAt: 1,
        items: { worldBooks: [{ id: 'old-book', name: 'Old', entries: [{ id: 'old-entry', content: 'old' }] }], regexScripts: [], automationRules: [], scenePackages: [] },
        assets: [], dependencies: [], hostQuickReplyRefs: []
    }];
    const validNormalized = context.normalizeContentModule(validPrevious, 0, Object.create(null));
    assert.equal(validNormalized.invalid, undefined, 'a valid previous version must not be rejected');
    assert.equal(validNormalized.previousVersions.length, 1);
    assert.equal(validNormalized.previousVersions[0].items.worldBooks[0].entries[0].id, 'old-entry');

    let textRead = false;
    await assert.rejects(context.readContentModulePackage({ size: context.CONTENT_MODULE_MAX_PACKAGE_BYTES + 1, text() { textRead = true; return '{}'; } }), /content_module_package_too_large/);
    assert.equal(textRead, false, 'an oversized file must be rejected before file.text()');
    let measuredModule = context.exportContentModuleData(baseModule);
    assert.ok(Buffer.byteLength(JSON.stringify(measuredModule), 'utf8') < context.CONTENT_MODULE_MAX_PACKAGE_BYTES);
    const largePngBytes = new Uint8Array(1024 * 1024);
    largePngBytes.set([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    const largeAsset = 'data:image/png;base64,' + Buffer.from(largePngBytes).toString('base64');
    const largeRaw = makeModule('measured-large', {
        assets: [{ id: 'asset-a', name: 'a.png', mime: 'image/png', bytes: 0, dataUrl: largeAsset }, { id: 'asset-b', name: 'b.png', mime: 'image/png', bytes: 0, dataUrl: largeAsset }],
        items: { worldBooks: [{ id: 'book', name: 'Book', entries: Array.from({ length: context.CONTENT_MODULE_MAX_WORLD_ENTRIES }, (_, index) => ({ id: 'entry-' + index, content: 'x'.repeat(context.CONTENT_MODULE_MAX_ENTRY_TEXT) })) }], regexScripts: [], automationRules: [], scenePackages: [] }
    });
    const largeModule = context.normalizeContentModule(largeRaw, 0, Object.create(null));
    assert.equal(largeModule.invalid, undefined, 'the measured maximal module stays valid');
    const measuredCurrent = Buffer.byteLength(JSON.stringify(context.exportContentModuleData(largeModule)), 'utf8');
    const measuredPrevious = Buffer.byteLength(JSON.stringify(Object.assign(context.exportContentModuleData(largeModule), {
        module: Object.assign(clone(context.exportContentModuleData(largeModule).module), { previousVersions: [context.contentModuleSnapshotForRollback(largeModule)] })
    })), 'utf8');
    assert.ok(measuredCurrent < context.CONTENT_MODULE_MAX_PACKAGE_BYTES, 'measured current package bytes: ' + measuredCurrent);
    assert.ok(measuredPrevious < context.CONTENT_MODULE_MAX_PACKAGE_BYTES, 'measured package with one previous version: ' + measuredPrevious);
    console.log('C3 bounds: measured packages ' + measuredCurrent + '/' + measuredPrevious + ' bytes; oversized lists, wrong types, duplicate IDs and invalid previous versions reject the whole module.');
}

// ---------- cryptographic local grant and non-serialized readiness ----------
{
    const context = createHarness();
    const conv = addConversation(context);
    const module = installModule(context, makeModule('crypto-grant'));
    const grant = context.state.settings.contentModuleGrants[module.id];
    assert.match(grant.approved['1.0.0'], /^sha256:[0-9a-f]{64}$/, 'local grants use SHA-256, not a shortened weak digest');
    const forgedWeak = clone(context.state.settings);
    forgedWeak.contentModuleGrants[module.id] = { approved: { '1.0.0': 'c1:1:2:3' } };
    context.ensureContentModuleSettings(forgedWeak);
    assert.equal(forgedWeak.contentModuleGrants[module.id], undefined, 'legacy weak-hash grants are discarded');

    const declared = makeModule('declared-hash');
    declared.assets[0].hash = 'sha256:' + '0'.repeat(64);
    const declaredModule = installModule(context, declared);
    assert.notEqual(declaredModule.assets[0].hash, declared.assets[0].hash, 'a package-declared asset hash is never trusted');
    assert.match(declaredModule.assets[0].hash, /^sha256:[0-9a-f]{64}$/);
    const beforeFingerprint = context.contentModuleFingerprint(declaredModule);
    const tampered = clone(declaredModule);
    tampered.assets[0].dataUrl = tampered.assets[0].dataUrl.slice(0, -8) + 'AAAAAAA=';
    assert.notEqual(context.contentModuleFingerprint(tampered), beforeFingerprint, 'asset byte changes are covered by the fingerprint');
    const sourceChanged = clone(declaredModule);
    sourceChanged.source = 'another source';
    assert.notEqual(context.contentModuleFingerprint(sourceChanged), beforeFingerprint, 'source changes are covered by the fingerprint');
    const orderChanged = clone(module);
    orderChanged.items.worldBooks[0].entries.unshift({ id: 'entry-0', content: 'first now' });
    assert.notEqual(context.contentModuleFingerprint(orderChanged), context.contentModuleFingerprint(module), 'execution order changes are covered by the fingerprint');

    const forgedReady = clone(context.state.settings);
    forgedReady.__contentModuleReady = true;
    forgedReady.contentModules[0].assets = Array.from({ length: context.CONTENT_MODULE_MAX_ASSETS + 1 }, (_, index) => Object.assign({}, forgedReady.contentModules[0].assets[0], { id: 'forged-' + index }));
    context.ensureContentModuleSettings(forgedReady);
    assert.equal(forgedReady.contentModules[0].invalid, true, 'a serialized __contentModuleReady flag cannot skip validation');
    assert.equal(Object.hasOwn(forgedReady, '__contentModuleReady'), false, 'the untrusted serialized flag is removed from settings');
    const markedOriginal = clone(context.state.settings);
    context.markContentModuleSettingsReady(markedOriginal);
    const separateClone = clone(markedOriginal);
    separateClone.__contentModuleReady = true;
    separateClone.contentModules[0].assets = Array.from({ length: context.CONTENT_MODULE_MAX_ASSETS + 1 }, (_, index) => Object.assign({}, separateClone.contentModules[0].assets[0], { id: 'marked-' + index }));
    context.ensureContentModuleSettings(separateClone);
    assert.equal(separateClone.contentModules[0].invalid, true, 'readiness is identity-bound and does not transfer to a serialized clone');
    const liveSettings = context.state.settings;
    liveSettings.contentModules[0].assets = Array.from({ length: context.CONTENT_MODULE_MAX_ASSETS + 1 }, (_, index) => Object.assign({}, liveSettings.contentModules[0].assets[0], { id: 'live-' + index }));
    context.ensureContentModuleSettings(liveSettings);
    assert.equal(liveSettings.contentModules[0].invalid, true, 'an explicit apply to the same live settings object must not reuse the read cache');
    void conv;
    console.log('C3 permission: SHA-256 content grants, declared-hash rejection, byte/source/order coverage and forged readiness rejection passed.');
}

// ---------- failed candidate writes keep the installed version, assets, bindings and grants ----------
{
    const context = createHarness();
    addConversation(context);
    const module = installModule(context, makeModule('durable-update'));
    const before = context.getContentModuleSnapshot();
    context.harness.failSettingsSave = true;
    await assert.rejects(context.saveContentModulesChange(candidate => {
        candidate.contentModules[0].version = '2.0.0';
        candidate.contentModules[0].revision = 1;
        candidate.contentModules[0].assets[0].dataUrl = candidate.contentModules[0].assets[0].dataUrl.slice(0, -8) + 'AAAAAAA=';
    }), /settings-quota/);
    assert.equal(context.getContentModuleSnapshot(), before, 'a failed write keeps the current version, assets, bindings and local grants');
    assert.equal(context.getContentModuleById(module.id).version, '1.0.0');
    assert.equal(context.contentModuleFingerprint(context.getContentModuleById(module.id)), context.contentModuleFingerprint(module));
    assert.equal(context.isContentModuleAuthorized(context.getContentModuleById(module.id)), true);
    context.harness.failSettingsSave = false;
    assert.equal(await context.retryContentModuleChange(), true, 'the failed candidate can be retried without a reload');
    assert.equal(context.getContentModuleById(module.id).version, '2.0.0');
    context.harness.failSettingsSave = true;
    await assert.rejects(context.saveContentModulesChange(candidate => {
        candidate.contentModules[0].version = '3.0.0';
        candidate.contentModules[0].revision = 2;
    }), /settings-quota/);
    const staleDraft = context.failedContentModuleDraft;
    assert.ok(staleDraft);
    context.harness.failSettingsSave = false;
    context.failedContentModuleDraft = null;
    await context.saveContentModulesChange(candidate => {
        candidate.contentModules[0].version = '1.1.0';
        candidate.contentModules[0].revision = 1;
    });
    context.failedContentModuleDraft = staleDraft;
    await assert.rejects(context.retryContentModuleChange(), /content_module_settings_changed/);
    assert.equal(context.getContentModuleById(module.id).version, '1.1.0', 'a stale retry must not overwrite a later successful update');
    const rollbackContext = createHarness();
    addConversation(rollbackContext);
    const rollbackModule = installModule(rollbackContext, makeModule('rollback-candidate'));
    const originalFingerprint = rollbackContext.contentModuleFingerprint(rollbackModule);
    const originalSnapshot = rollbackContext.contentModuleSnapshotForRollback(rollbackModule);
    await rollbackContext.saveContentModulesChange(candidate => {
        const current = candidate.contentModules[0];
        current.version = '1.0.1';
        current.revision = 1;
        current.items.regexScripts.push({ id: 'rx-2', findRegex: 'a', replaceString: 'b', placement: [2], flags: 'g' });
        current.previousVersions = [originalSnapshot];
    });
    assert.equal(rollbackContext.isContentModuleAuthorized(rollbackContext.getContentModuleById(rollbackModule.id)), false);
    await rollbackContext.saveContentModulesChange(candidate => {
        const current = candidate.contentModules[0];
        const previous = current.previousVersions[0];
        current.items = previous.items;
        current.assets = previous.assets;
        current.dependencies = previous.dependencies;
        current.hostQuickReplyRefs = previous.hostQuickReplyRefs;
        current.version = previous.version;
        current.revision = (Number(current.revision) || 0) + 1;
        current.previousVersions = [];
    });
    assert.equal(rollbackContext.contentModuleFingerprint(rollbackContext.getContentModuleById(rollbackModule.id)), originalFingerprint, 'rollback normalization must reproduce the originally approved content');
    assert.equal(rollbackContext.isContentModuleAuthorized(rollbackContext.getContentModuleById(rollbackModule.id)), true, 'rollback may reuse only the explicitly approved original content');
    console.log('C3 durable candidates: failed writes preserve installed data and a stale retry cannot overwrite a newer success.');
}

// ---------- candidate mutations after the first normalization pass ----------
{
    const context = createHarness();
    addConversation(context);
    const installed = installModule(context, makeModule('candidate-revalidate'));
    const baseline = context.getContentModuleSnapshot();
    const baselineIds = context.getContentModules().map(module => module.id);
    const baselineModules = clone(context.state.settings.contentModules);

    await assert.rejects(context.saveContentModulesChange(candidate => {
        candidate.contentModules[0].assets[0].dataUrl = 'data:image/png;base64,' + Buffer.from('<html>').toString('base64');
    }), /content_module_invalid/);
    assert.equal(context.getContentModuleSnapshot(), baseline, 'an invalid candidate changed after the first normalization pass must not install');
    assert.deepEqual(context.getContentModules().map(module => module.id), baselineIds);
    assert.deepEqual(clone(context.state.settings.contentModules), baselineModules);
    context.failedContentModuleDraft = null;

    await assert.rejects(context.saveContentModulesChange(candidate => {
        const duplicate = clone(candidate.contentModules[0]);
        duplicate.name = 'duplicate';
        candidate.contentModules.push(duplicate);
    }), /content_module_invalid/);
    assert.equal(context.getContentModuleSnapshot(), baseline, 'a duplicate module ID added by the mutator must not install');
    assert.equal(context.getContentModules().length, 1);
    assert.deepEqual(context.getContentModules().map(module => module.id), baselineIds, 'reads must not slice or renumber the rejected duplicate candidate');
    context.failedContentModuleDraft = null;

    const fresh = context.normalizeContentModule(makeModule('candidate-new'), 1, Object.create(null));
    await context.saveContentModulesChange(candidate => { candidate.contentModules.push(fresh); });
    assert.equal(context.getContentModules().length, 2, 'a valid new module still installs');
    assert.ok(context.getContentModuleById('candidate-new'));
    await context.saveContentModulesChange(candidate => {
        const current = candidate.contentModules.find(module => module.id === installed.id);
        current.version = '1.0.1';
        current.revision = 1;
    });
    assert.equal(context.getContentModuleById(installed.id).version, '1.0.1', 'a valid update still installs');
    context.setContentModuleGrant(context.state.settings, installed.id, true);
    const sourceModule = context.getContentModuleById(installed.id);
    const sourceBindings = context.getContentModuleBindings().map(binding => binding.moduleId);
    const copy = context.cloneContentModuleForCopy(sourceModule);
    assert.notEqual(copy.id, sourceModule.id, 'a copy must receive a new module ID');
    assert.deepEqual(clone(copy.previousVersions), [], 'a copy must not inherit old version state');
    await context.saveContentModulesChange(candidate => { candidate.contentModules.push(copy); });
    assert.equal(context.isContentModuleAuthorized(context.getContentModuleById(sourceModule.id)), true, 'the source module keeps its local grant');
    assert.equal(context.isContentModuleAuthorized(context.getContentModuleById(copy.id)), false, 'the copy must not borrow the source grant');
    assert.deepEqual(context.getContentModuleBindings().map(binding => binding.moduleId), sourceBindings, 'the copy must not inherit or pollute bindings');
    console.log('C3 candidate revalidation: mutations after the first normalization pass are revalidated; invalid or duplicate candidates keep the installed modules, while valid create/update paths still succeed.');
}

// ---------- real persistState path with StorageService.saveAll rejection ----------
{
    const context = createPersistHarness();
    const conv = addConversation(context);
    const module = installModule(context, makeModule('real-persist'));
    assert.equal(context.isContentModuleAuthorized(context.getContentModuleById(module.id)), true);
    const before = context.getContentModuleSnapshot();
    context.failSave = true;
    await assert.rejects(context.saveContentModulesChange(candidate => {
        candidate.contentModules[0].version = '2.0.0';
        candidate.contentModules[0].revision = 1;
        candidate.contentModules[0].assets[0].dataUrl = candidate.contentModules[0].assets[0].dataUrl.slice(0, -8) + 'AAAAAAA=';
        candidate.contentModuleBindings = [];
        delete candidate.contentModuleGrants[candidate.contentModules[0].id];
    }), /settings-quota/);
    assert.equal(context.getContentModuleSnapshot(), before, 'real persistState rejection keeps version, asset bytes, bindings and grants');
    assert.equal(context.getContentModuleById(module.id).version, '1.0.0');
    assert.equal(context.isContentModuleAuthorized(context.getContentModuleById(module.id)), true);
    context.failSave = false;
    context.failedContentModuleDraft = null;
    await context.saveContentModulesChange(candidate => {
        candidate.contentModules[0].version = '1.0.1';
        candidate.contentModules[0].revision = 1;
    });
    assert.equal(context.getContentModuleById(module.id).version, '1.0.1');
    assert.ok(context.saved && context.saved.settings.contentModules[0].version === '1.0.1');
    void conv;
    console.log('C3 real persistence: persistState + StorageService.saveAll rejection preserves installed module data; success switches only after the write.');
}

// ---------- sync policy ----------
{
    const context = createHarness();
    vm.runInContext(read('sync/19-cloud-sync-settings-policy.js'), context, { filename: 'sync-policy.js' });
    const portable = context.getCloudSyncPortableSettings({
        contentModules: [{ id: 'm1' }], contentModuleBindings: [{ id: 'b1' }],
        contentModuleConversationDisabled: { c1: ['m1'] }, contentModuleGrants: { m1: { approved: { '1.0.0': 'sha256:' + 'a'.repeat(64) }, send: { '1.0.0': 'sha256:' + 'b'.repeat(64) } } }
    });
    assert.deepEqual(clone(portable.contentModules), [{ id: 'm1' }]);
    assert.deepEqual(clone(portable.contentModuleBindings), [{ id: 'b1' }]);
    assert.deepEqual(clone(portable.contentModuleConversationDisabled), { c1: ['m1'] });
    assert.equal(portable.contentModuleGrants, undefined, 'local module grants must never enter cloud snapshots');
    console.log('C3 sync policy: definitions/bindings are portable and local content grants are excluded.');
}

console.log('C3 runtime passed: content module model, strict package validation, host authoring, multi-scope dedupe, inheritance, worldbook/regex/automation/scene/MVU integration, prompt stamps and sync exclusion.');
