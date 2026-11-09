import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, 'src/app', file), 'utf8');
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

function baseSettings() {
    return {
        lang: 'zh-CN',
        scenePackages: [],
        scenePackageGrants: {},
        sceneRecentRuns: []
    };
}

function makePackage(overrides) {
    return Object.assign({
        id: 'scene-package-1', revision: 1, name: 'Story', enabled: true, scope: 'global', targetId: '', order: 0,
        events: [{
            id: 'scene-event-1', revision: 1, name: 'Opening', order: 0, trigger: 'opening', once: true,
            conditions: [], text: 'Opening text', mvu: []
        }]
    }, overrides || {});
}

function createHarness() {
    let idCounter = 0;
    const context = {
        console, JSON, Object, Array, String, Number, Math, Date, Promise, Set, Map,
        setTimeout, clearTimeout,
        appStore: { notify() {} },
        makeId: () => 'generated-' + (++idCounter),
        t: key => key,
        reportPersistPostSaveError() {},
        state: { settings: baseSettings(), conversations: {}, conversationOrder: [], activeConvId: null, isGenerating: false },
        getActiveConv() { return context.state.conversations[context.state.activeConvId]; },
        renderMessagesOnly() {},
        renderTokenBar() {},
        capturePromptBuildSource(conv) { return { conversation: conv, conversationId: conv.id, messages: conv.messages.map(message => ({ id: message.id, revision: context.getMessageRevision(message) })) }; },
        validateMvuData(value) {
            if (!value || typeof value !== 'object' || Array.isArray(value) || !value.stat_data || typeof value.stat_data !== 'object') {
                return { valid: false, data: value, diagnostics: [{ message: 'invalid-stat-data' }] };
            }
            return { valid: true, data: clone(value), diagnostics: [] };
        },
        cloneMvuRuntimeValue: clone,
        getMvuMessageVersionId(message) { return message && message.selectedResponseVersionId || 'base:' + String(message && message.id || ''); },
        getMvuMainMessages(conv) { return (conv && conv.messages || []).filter(message => message && message.role === 'assistant' && message.stage !== 'second'); },
        getMvuInitialData() { return { stat_data: { hp: 1 } }; },
        getMvuDataForMessage(conv, message) {
            if (message && message.mvuManualData) return clone(message.mvuManualData);
            let data = conv && conv.mvu && conv.mvu.current ? clone(conv.mvu.current) : { stat_data: {} };
            for (const item of (conv && conv.messages || [])) {
                if (item && item.role === 'assistant' && item.stage !== 'second' && item.mvuManualData) data = clone(item.mvuManualData);
            }
            return data;
        }
    };
    context.harness = { failConversationSave: false, failSettingsSave: false, conversationSaves: [], gate: null, settingsSaves: 0 };
    context.persistState = async (_immediate, options) => {
        options = options || {};
        if (context.harness.failSettingsSave) throw new Error('settings-quota');
        if (options.beforePersist) options.beforePersist();
        let snapshot = { settings: clone(context.state.settings), conversations: clone(context.state.conversations) };
        if (options.transformSnapshot) snapshot = options.transformSnapshot(snapshot);
        if (options.onPersistSuccess) options.onPersistSuccess();
        if (options.commitPendingSnapshot) options.commitPendingSnapshot(snapshot);
        context.harness.settingsSaves++;
        return true;
    };
    context.persistConversationMessageMutation = async (conv, mutate, options) => {
        const candidate = Object.assign({}, conv, {
            messages: clone(conv.messages), summaries: clone(conv.summaries || []),
            mvu: conv.mvu ? clone(conv.mvu) : undefined
        });
        const result = mutate(candidate);
        if (options && typeof options.validate === 'function' && !options.validate()) throw new Error('stale-scene-source');
        if (context.harness.gate) await context.harness.gate;
        if (options && typeof options.validate === 'function' && !options.validate()) throw new Error('stale-scene-source');
        if (context.harness.failConversationSave) throw new Error('conversation-quota');
        conv.messages = clone(candidate.messages);
        conv.summaries = clone(candidate.summaries);
        conv.updated = Date.now();
        if (candidate.mvu) conv.mvu = clone(candidate.mvu);
        const last = conv.messages.slice().reverse().find(message => message && message.mvuManualData);
        if (last) conv.mvu.current = clone(last.mvuManualData);
        context.harness.conversationSaves.push(clone(conv.messages));
        return result;
    };
    context.clearMvuManualOverride = message => {
        if (message) ['mvuManualData', 'mvuManualVersionId', 'mvuManualSwipeId'].forEach(key => delete message[key]);
        return message;
    };
    context.getResponseVersions = () => [];
    context.prepareResponseVersions = () => null;
    context.rememberUserReplyVersions = () => {};
    context.selectUserMessageContent = (msg, content) => { msg.content = content; msg.revision = context.getMessageRevision(msg); };
    context.refreshSummaryValidity = () => {};
    context.removeLinkedSecondStageMessages = (conv, msg) => {
        conv.messages = conv.messages.filter(message => !(message.stage === 'second' && message.parentId === msg.id));
    };
    context.resetConversationAfterMessageMutation = () => {};
    context.refreshMvuCandidate = candidate => {
        if (candidate && candidate.mvu) candidate.mvu.current = clone(context.getMvuDataForMessage(candidate));
        return candidate;
    };
    vm.createContext(context);
    const sources = [
        'conversation/32-message-identity.js',
        'conversation/59-conversation-timestamp-helpers.js',
        'automation/32-automation-rules.js',
        'automation/32-automation-conditions.js',
        'scenarios/32-scene-packages.js',
        'scenarios/52-scene-runtime.js',
        'automation/52-automation-runtime.js',
        'chat/67-message-edit-helpers.js',
        'events/70-send-message-helpers.js'
    ];
    vm.runInContext(sources.map(read).join('\n'), context, { filename: 'scene-runtime-harness.js' });
    return context;
}

function addConversation(context, overrides) {
    const conv = Object.assign({
        id: 'conv-1', title: 'Story', character: { name: 'Alice' }, messages: [], summaries: [], created: Date.now() - 3600000, updated: Date.now() - 3600000,
        mvu: { initial: { stat_data: { hp: 1 } }, current: { stat_data: { hp: 1 } } }
    }, overrides || {});
    context.state.conversations[conv.id] = conv;
    context.state.conversationOrder = [conv.id];
    context.state.activeConvId = conv.id;
    return conv;
}

function setPackages(context, packages) {
    context.state.settings.scenePackages = packages.map((pkg, index) => Object.assign({ order: index }, pkg));
    context.ensureSceneSettings(context.state.settings);
}

function grantAll(context) {
    (context.state.settings.scenePackages || []).forEach(pkg => context.setScenePackageGrant(context.state.settings, pkg.id, pkg.revision, true));
}

function userMessage(id, content, at) {
    return { id, role: 'user', content, created: at || Date.now() - 600000 };
}

function assistantMessage(id, content, at) {
    return { id, role: 'assistant', content, created: at || Date.now() - 300000 };
}

async function assertPackageModelAndStrictInput() {
    const context = createHarness();
    setPackages(context, [makePackage({
        events: [{
            id: 'e1', revision: 1, name: 'Opening', order: 0, trigger: 'opening', once: true,
            conditions: [
                { id: 'c1', source: 'message-count', op: 'gte', value: 1 },
                { id: 'c2', source: 'away-minutes', op: 'gte', value: 0 },
                { id: 'c3', source: 'mvu', op: 'equals', path: 'stat_data.hp', valueType: 'number', value: 1 }
            ],
            text: 'A new story begins.', mvu: [{ id: 'm1', path: 'stat_data.hp', valueType: 'number', value: 2 }]
        }]
    })]);
    const pkg = context.getScenePackages()[0];
    assert.equal(pkg.events[0].trigger, 'opening');
    assert.equal(pkg.events[0].conditions[1].valueType, 'number');
    assert.equal(pkg.events[0].mvu[0].path, 'stat_data.hp');
    assert.throws(() => context.validateScenePackage(makePackage({ events: [{ id: 'e', name: 'x', trigger: 'never', once: true, conditions: [], text: 'x', mvu: [] }] })), /scene_event_invalid|scene_event_trigger_invalid/);
    assert.throws(() => context.validateScenePackage(makePackage({ events: [{ id: 'e', name: 'x', trigger: 'opening', once: true, conditions: [{ id: 'c', source: 'mvu', op: 'equals', path: '__proto__.x', valueType: 'string', value: 'x' }], text: 'x', mvu: [] }] })), /scene_conditions_invalid/);
    assert.throws(() => context.validateScenePackage(makePackage({ events: [{ id: 'e', name: 'x', trigger: 'opening', once: true, conditions: [], text: 'x', mvu: [{ id: 'm', path: 'constructor', valueType: 'number', value: 1 }] }] })), /scene_mvu_invalid/);
    const tooMany = makePackage();
    tooMany.events = Array.from({ length: context.SCENE_MAX_EVENTS + 1 }, (_, index) => ({ id: 'e' + index, name: 'e', trigger: 'user-message-saved', once: true, conditions: [], text: 'x', mvu: [] }));
    setPackages(context, [tooMany]);
    assert.equal(context.getScenePackages()[0].invalid, true, 'Over-limit event definitions must be isolated.');
    setPackages(context, [makePackage({ events: [{ id: 'e', name: 'x', trigger: 'user-message-saved', once: true, conditions: [{ id: 'c', source: 'event-text', op: 'contains', value: '   ' }], text: 'x', mvu: [] }] })]);
    assert.equal(context.getScenePackages()[0].enabled, false, 'Blank string conditions must not become executable.');
}

function assertImportExportAndGrantFingerprint() {
    const context = createHarness();
    setPackages(context, [makePackage()]);
    grantAll(context);
    let pkg = context.getScenePackages()[0];
    assert.equal(context.isScenePackageAuthorized(pkg), true);
    pkg = context.getScenePackages()[0];
    pkg.name = 'Renamed';
    pkg.events[0].order = 4;
    pkg.enabled = false;
    context.ensureSceneSettings(context.state.settings);
    pkg = context.getScenePackages()[0];
    assert.equal(context.isScenePackageAuthorized(pkg), true, 'Name, order and enable toggles must not revoke a content-bound grant.');
    pkg = context.getScenePackages()[0];
    pkg.enabled = true;
    pkg.events[0].text = 'Changed text';
    context.ensureSceneSettings(context.state.settings);
    pkg = context.getScenePackages()[0];
    assert.equal(context.isScenePackageAuthorized(pkg), false, 'Changed narrative content must revoke the local grant.');
    const exported = context.exportScenePackagesData();
    assert.equal(exported.type, 'opentavern-scene-packages');
    assert.equal(exported.packages[0].events[0].text, 'Changed text');
    assert.equal('scenePackageGrants' in exported, false, 'Export must not carry local grants.');
    const imported = context.importScenePackagesData(exported);
    assert.equal(imported[0].enabled, false, 'Imported packages must be disabled.');
    assert.notEqual(imported[0].id, pkg.id, 'Imported packages must receive fresh IDs.');
    assert.notEqual(imported[0].events[0].id, pkg.events[0].id, 'Imported events must receive fresh IDs.');
    assert.equal(context.isScenePackageAuthorized(imported[0]), false, 'Import must never grant local execution.');
    assert.throws(() => context.importScenePackagesData({ type: 'opentavern-scene-packages', packages: [Object.assign({}, exported.packages[0], { extra: true })] }), /scene_import_invalid/);
    assert.throws(() => context.importScenePackagesData({ type: 'opentavern-scene-packages', packages: [Object.assign({}, exported.packages[0], { events: [{ id: 'e', name: 'x', trigger: 'opening', once: true, conditions: [], text: 'x'.repeat(context.SCENE_MAX_TEXT + 1), mvu: [] }] })] }), /scene_import_invalid/);
}

async function assertOpeningAndOrdering() {
    const context = createHarness();
    const conv = addConversation(context, { messages: [userMessage('u1', 'Start', Date.now() - 3600000)] });
    setPackages(context, [
        makePackage({
            id: 'pkg-opening', name: 'Opening', events: [{
                id: 'opening', name: 'Opening', order: 0, trigger: 'opening', once: true,
                conditions: [
                    { id: 'c1', source: 'message-count', op: 'equals', value: 1 },
                    { id: 'c2', source: 'away-minutes', op: 'gte', value: 0 },
                    { id: 'c3', source: 'mvu', op: 'equals', path: 'stat_data.hp', valueType: 'number', value: 1 }
                ],
                text: 'OPENING', mvu: [{ id: 'm', path: 'stat_data.hp', valueType: 'number', value: 2 }]
            }]
        }),
        makePackage({
            id: 'pkg-repeat', name: 'Repeat', events: [
                { id: 'repeat', name: 'First repeat', order: 0, trigger: 'user-message-saved', once: false, conditions: [{ id: 'c', source: 'message-count', op: 'gte', value: 2 }], text: 'REPEAT', mvu: [{ id: 'm', path: 'stat_data.hp', valueType: 'number', value: 3 }] },
                { id: 'second', name: 'Second', order: 1, trigger: 'user-message-saved', once: true, conditions: [{ id: 'c', source: 'mvu', op: 'equals', path: 'stat_data.hp', valueType: 'number', value: 3 }], text: 'SECOND', mvu: [{ id: 'm', path: 'stat_data.hp', valueType: 'number', value: 4 }] }
            ]
        })
    ]);
    grantAll(context);
    const payload = { eventId: 'u1-saved', role: 'user', text: 'Start', messageId: 'u1', messageRevision: context.getMessageRevision(conv.messages[0]) };
    const first = await context.runSceneDispatchEvent('user-message-saved', conv, payload);
    assert.equal(first.executed, 1, 'Opening must run on the first saved user message.');
    assert.equal(context.getSceneProgress(conv).length, 1);
    assert.equal(conv.messages[conv.messages.length - 1].content, 'OPENING');
    assert.equal(conv.messages[conv.messages.length - 1].mvuManualData.stat_data.hp, 2);
    const duplicate = await context.runSceneDispatchEvent('user-message-saved', conv, payload);
    assert.equal(duplicate.executed, 0, 'Repeated delivery of the same source must not duplicate opening.');
    assert.equal(context.getSceneProgress(conv).length, 1);
    conv.messages.push(userMessage('u2', 'Continue'));
    const secondPayload = { eventId: 'u2-saved', role: 'user', text: 'Continue', messageId: 'u2', messageRevision: context.getMessageRevision(conv.messages[conv.messages.length - 1]) };
    const second = await context.runSceneDispatchEvent('user-message-saved', conv, secondPayload);
    assert.equal(second.executed, 2, 'Repeatable and dependent one-shot events must run in stable order.');
    const contents = context.getSceneProgress(conv).map(entry => entry.text);
    assert.equal(JSON.stringify(contents), JSON.stringify(['OPENING', 'REPEAT', 'SECOND']));
    assert.equal(conv.messages.filter(message => message.content === 'REPEAT').length, 1);
    const repeatAgain = await context.runSceneDispatchEvent('user-message-saved', conv, secondPayload);
    assert.equal(repeatAgain.executed, 0, 'A repeatable event must run at most once per source message.');
    conv.messages.push(userMessage('u3', 'Again'));
    const third = await context.runSceneDispatchEvent('user-message-saved', conv, { eventId: 'u3-saved', role: 'user', text: 'Again', messageId: 'u3', messageRevision: context.getMessageRevision(conv.messages[conv.messages.length - 1]) });
    assert.equal(third.executed, 1, 'A repeatable event may run for a new source message.');
    assert.equal(context.getSceneProgress(conv).filter(entry => entry.text === 'REPEAT').length, 2);
}

async function assertAssistantOrderAndSerialMvu() {
    const context = createHarness();
    const conv = addConversation(context, { messages: [userMessage('u1', 'Ask'), assistantMessage('a1', 'Reply')] });
    setPackages(context, [makePackage({
        id: 'pkg-a', events: [
            { id: 'a', name: 'A', order: 0, trigger: 'assistant-message-saved', once: true, conditions: [], text: 'A', mvu: [{ id: 'm', path: 'stat_data.hp', valueType: 'number', value: 2 }] },
            { id: 'b', name: 'B', order: 1, trigger: 'assistant-message-saved', once: true, conditions: [{ id: 'c', source: 'mvu', op: 'equals', path: 'stat_data.hp', valueType: 'number', value: 2 }], text: 'B', mvu: [{ id: 'm', path: 'stat_data.hp', valueType: 'number', value: 3 }] }
        ]
    })]);
    grantAll(context);
    const payload = { eventId: 'a1-saved', role: 'assistant', text: 'Reply', messageId: 'a1', messageRevision: context.getMessageRevision(conv.messages[1]) };
    const result = await context.runSceneDispatchEvent('assistant-message-saved', conv, payload);
    assert.equal(result.executed, 2);
    assert.equal(JSON.stringify(context.getSceneProgress(conv).map(entry => entry.text)), JSON.stringify(['A', 'B']));
    assert.equal(conv.messages.filter(message => message.content === 'B')[0].mvuManualData.stat_data.hp, 3, 'The second event must see the ACKed state of the first.');
}

async function assertFailureAtomicityAndRetry() {
    const context = createHarness();
    const conv = addConversation(context, { messages: [userMessage('u1', 'Start')] });
    setPackages(context, [makePackage({ events: [{ id: 'opening', name: 'Opening', order: 0, trigger: 'opening', once: true, conditions: [], text: 'ATOMIC', mvu: [{ id: 'm', path: 'stat_data.hp', valueType: 'number', value: 9 }] }] })]);
    grantAll(context);
    const payload = { eventId: 'u1-saved', role: 'user', text: 'Start', messageId: 'u1', messageRevision: context.getMessageRevision(conv.messages[0]) };
    context.harness.failConversationSave = true;
    const failed = await context.runSceneDispatchEvent('user-message-saved', conv, payload);
    assert.equal(failed.failed, 1);
    assert.equal(conv.messages.length, 1, 'A failed scene save must not append narrative text.');
    assert.equal(conv.messages[0].mvuManualData, undefined, 'A failed scene save must not apply variables.');
    assert.equal(context.getSceneProgress(conv).length, 0, 'A failed scene save must not record one-shot progress.');
    assert.ok(context.getSceneRecentRuns().some(entry => entry.status === 'failed'));
    assert.ok(context.getSceneFailure(conv.id), 'A failed scene must remain visible and retryable.');
    const failedSource = conv.messages[0];
    const failedContent = failedSource.content;
    failedSource.content = 'Edited before retry';
    await assert.rejects(context.retrySceneFailure(conv.id), /scene_target_changed/, 'Retry must reject an edited original source instead of treating it as a new unconditional run.');
    failedSource.content = failedContent;
    failedSource.revision = context.getMessageRevision(failedSource);
    context.harness.failConversationSave = false;
    const retried = await context.retrySceneFailure(conv.id);
    assert.equal(retried.changed, true);
    assert.equal(conv.messages[conv.messages.length - 1].content, 'ATOMIC');
    assert.equal(context.getSceneProgress(conv).length, 1);
    assert.equal(context.getSceneFailure(conv.id), null);
}

// 失败重试必须携带原失败候选：同一定义修订与可执行内容、来源锚点、真实前缀和原活动基线。
// 换正文（无论是否递增 revision）、前缀编辑、版本切换都拒绝；来源之后的普通追加不误判。
async function createFailedMessageScene() {
    const context = createHarness();
    const conv = addConversation(context, { messages: [assistantMessage('prior', 'Earlier original history'), userMessage('source', 'Original source')] });
    setPackages(context, [makePackage({
        id: 'retry-package', name: 'Retry', scope: 'conversation', targetId: conv.id,
        events: [{ id: 'retry-event', revision: 1, name: 'Retry event', order: 0, trigger: 'user-message-saved', once: true, conditions: [], text: 'ORIGINAL_FAILED_SCENE', mvu: [] }]
    })]);
    grantAll(context);
    context.harness.failConversationSave = true;
    const failed = await context.runSceneDispatchEvent('user-message-saved', conv, {
        eventId: 'source-saved', role: 'user', text: 'Original source', messageId: 'source', messageRevision: context.getMessageRevision(conv.messages[1])
    });
    assert.equal(failed.failed, 1, 'Positive control: the failed candidate must reach the real save.');
    assert.equal(context.getSceneProgress(conv).length, 0);
    context.harness.failConversationSave = false;
    return { context, conv };
}

async function assertFailureRetryKeepsOriginalBaseline() {
    // 1) 定义、来源与前缀未变时显式重试一次成功，随后失败清除且不能重复。
    {
        const { context, conv } = await createFailedMessageScene();
        const retried = await context.retrySceneFailure(conv.id);
        assert.equal(retried.changed, true);
        assert.equal(context.getSceneProgress(conv).length, 1);
        assert.equal(context.getSceneFailure(conv.id), null);
        await assert.rejects(context.retrySceneFailure(conv.id), /scene_retry_missing/);
        assert.equal(context.getSceneProgress(conv).length, 1);
    }

    // 2) 同包/事件 ID 换正文并递增修订（且新内容已有本机授权）时，旧失败不能冒充原候选执行。
    {
        const { context, conv } = await createFailedMessageScene();
        const pkg = context.getScenePackageById('retry-package');
        pkg.events[0].text = 'NEW_DEFINITION_AFTER_FAILURE';
        pkg.revision += 1;
        context.setScenePackageGrant(context.state.settings, pkg.id, pkg.revision, true);
        assert.equal(context.isScenePackageAuthorized(context.getScenePackageById(pkg.id)), true, 'Control: the changed definition carries its own local consent.');
        await assert.rejects(context.retrySceneFailure(conv.id), /scene_target_changed/);
        assert.equal(context.getSceneProgress(conv).length, 0);
        assert.equal(conv.messages.some(message => message.content === 'NEW_DEFINITION_AFTER_FAILURE'), false);
        assert.ok(context.getSceneFailure(conv.id), 'The stale failure stays visible instead of running something else.');
    }

    // 3) 定义比对不能只信 revision：revision 不变但正文变化同样拒绝。
    {
        const { context, conv } = await createFailedMessageScene();
        const pkg = context.getScenePackageById('retry-package');
        pkg.events[0].text = 'CHANGED_SAME_REVISION';
        context.setScenePackageGrant(context.state.settings, pkg.id, pkg.revision, true);
        assert.equal(context.isScenePackageAuthorized(context.getScenePackageById(pkg.id)), true);
        await assert.rejects(context.retrySceneFailure(conv.id), /scene_target_changed/);
        assert.equal(context.getSceneProgress(conv).length, 0);
        assert.equal(conv.messages.some(message => message.content === 'CHANGED_SAME_REVISION'), false);
    }

    // 4) 直连来源正文不变但早先历史前缀被编辑：整个失败基线失效。
    {
        const { context, conv } = await createFailedMessageScene();
        conv.messages[0].content = 'Edited earlier history';
        assert.equal(conv.messages[1].content, 'Original source', 'Control: the direct anchor text is unchanged.');
        await assert.rejects(context.retrySceneFailure(conv.id), /scene_target_changed/);
        assert.equal(context.getSceneProgress(conv).length, 0);
    }

    // 5) 来源之后的普通历史追加不属于前缀变化，不能误判。
    {
        const { context, conv } = await createFailedMessageScene();
        conv.messages.push(userMessage('later', 'Later turn'));
        const retried = await context.retrySceneFailure(conv.id);
        assert.equal(retried.changed, true);
        assert.equal(context.getSceneProgress(conv).length, 1);
    }

    // 6) 真实用户版本切换（正文与版本身份都变化）拒绝旧失败基线。
    {
        const context = createVersionHarness();
        const conv = addConversation(context, { messages: [{ id: 'u1', role: 'user', content: '原用户正文' }] });
        setPackages(context, [makePackage({
            id: 'retry-version-package', name: 'Retry version', scope: 'conversation', targetId: conv.id,
            events: [{ id: 'retry-version-event', revision: 1, name: 'Retry version event', order: 0, trigger: 'user-message-saved', once: true, conditions: [], text: 'VERSION_FAILED_SCENE', mvu: [] }]
        })]);
        grantAll(context);
        context.harness.failConversationSave = true;
        const failed = await context.runSceneDispatchEvent('user-message-saved', conv, {
            eventId: 'u1-saved', role: 'user', text: '原用户正文', messageId: 'u1', messageRevision: context.getMessageRevision(conv.messages[0])
        });
        assert.equal(failed.failed, 1);
        context.harness.failConversationSave = false;
        context.selectUserMessageContent(conv.messages[0], '另一版用户正文');
        await assert.rejects(context.retrySceneFailure(conv.id), /scene_target_changed/);
        assert.equal(context.getSceneProgress(conv).length, 0);
    }

    // 7) 入队后、真正执行前的前缀变化：排队任务重新检查并拒绝。
    {
        const { context, conv } = await createFailedMessageScene();
        let release;
        context.harness.gate = new Promise(resolve => { release = resolve; });
        const blocker = context.enqueueSceneDispatch(conv, () => context.harness.gate);
        const retry = context.retrySceneFailure(conv.id);
        await new Promise(resolve => setTimeout(resolve, 0));
        conv.messages[0].content = 'Edited while the retry was queued';
        release();
        context.harness.gate = null;
        await blocker;
        await assert.rejects(retry, /scene_target_changed/);
        assert.equal(context.getSceneProgress(conv).length, 0);
        assert.equal(conv.messages.some(message => message.content === 'ORIGINAL_FAILED_SCENE'), false);
    }

    // 8) 保存候选窗口内的前缀变化：提交前校验仍拒绝，正文与变量都不落盘。
    {
        const { context, conv } = await createFailedMessageScene();
        let release;
        context.harness.gate = new Promise(resolve => { release = resolve; });
        const retry = context.retrySceneFailure(conv.id);
        await new Promise(resolve => setTimeout(resolve, 0));
        conv.messages[0].content = 'Edited during the retry save';
        release();
        context.harness.gate = null;
        await assert.rejects(retry, /stale-scene-source/);
        assert.equal(context.getSceneProgress(conv).length, 0);
        assert.equal(conv.messages.some(message => message.content === 'ORIGINAL_FAILED_SCENE'), false);
    }
}

async function assertSourceInvalidationAndBranch() {
    const context = createHarness();
    const greeting = assistantMessage('greeting', 'Welcome', Date.now() - 5000000);
    const conv = addConversation(context, { messages: [greeting, userMessage('u1', 'Start', Date.now() - 4000000)] });
    setPackages(context, [makePackage({ events: [{ id: 'opening', name: 'Opening', order: 0, trigger: 'opening', once: true, conditions: [], text: 'OPEN', mvu: [{ id: 'm', path: 'stat_data.hp', valueType: 'number', value: 5 }] }] })]);
    grantAll(context);
    await context.runSceneDispatchEvent('user-message-saved', conv, { eventId: 'u1-saved', role: 'user', text: 'Start', messageId: 'u1', messageRevision: context.getMessageRevision(conv.messages[1]) });
    assert.equal(context.getSceneProgress(conv).length, 1);
    const source = conv.messages.find(message => message.id === 'u1');
    const oldContent = source.content;
    source.content = 'Edited source';
    source.revision = context.getMessageRevision(source);
    assert.equal(context.getSceneProgress(conv).length, 0, 'Editing the trigger source must invalidate progress.');
    source.content = oldContent;
    source.revision = context.getMessageRevision(source);
    assert.equal(context.getSceneProgress(conv).length, 1, 'Restoring the source revision must restore replay validity.');
    const sceneIndex = conv.messages.findIndex(message => message.content === 'OPEN');
    await context.persistConversationMessageMutation(conv, candidate => context.applyMessageEditContent(candidate, sceneIndex, 'OPEN', 'Edited scene text'));
    assert.equal(context.getSceneProgress(conv).length, 0, 'Editing scene narrative must clear its progress record.');
    assert.equal(conv.messages.find(message => message.content === 'Edited scene text').sceneEvent, undefined);
    assert.equal(conv.messages.find(message => message.content === 'Edited scene text').mvuManualData, undefined, 'Editing scene narrative must clear its variable snapshot.');
    const branch = context.createUserMessageEditBranch(conv, 'u1', 'Branch edit');
    assert.equal(branch.messages.some(message => message.content === 'OPEN'), false, 'A branch must not clone future scene narrative after the fork.');
    assert.equal(branch.messages.some(message => message.id === 'u1' && message.content === 'Branch edit'), true);
}

async function assertCancellationAndDefinitionConflict() {
    const context = createHarness();
    const conv = addConversation(context, { messages: [userMessage('u1', 'Start')] });
    setPackages(context, [makePackage({ events: [{ id: 'opening', name: 'Opening', order: 0, trigger: 'opening', once: true, conditions: [], text: 'CANCEL', mvu: [] }] })]);
    grantAll(context);
    let release;
    context.harness.gate = new Promise(resolve => { release = resolve; });
    const dispatch = context.runSceneDispatchEvent('user-message-saved', conv, { eventId: 'u1-saved', role: 'user', text: 'Start', messageId: 'u1', messageRevision: context.getMessageRevision(conv.messages[0]) });
    await new Promise(resolve => setTimeout(resolve, 0));
    context.cancelSceneRuntime('stop', conv.id);
    release();
    context.harness.gate = null;
    const result = await dispatch;
    assert.equal(result.failed, 1);
    assert.equal(conv.messages.length, 1, 'Cancellation must not append a scene message.');
    assert.ok(context.getSceneRecentRuns().some(entry => entry.status === 'cancelled'));

    const revokeContext = createHarness();
    const revokeConv = addConversation(revokeContext, { messages: [userMessage('u1', 'Start')] });
    setPackages(revokeContext, [makePackage({ events: [{ id: 'opening', name: 'Opening', order: 0, trigger: 'opening', once: true, conditions: [], text: 'REVOKED', mvu: [] }] })]);
    grantAll(revokeContext);
    let revokeRelease;
    revokeContext.harness.gate = new Promise(resolve => { revokeRelease = resolve; });
    const revokeDispatch = revokeContext.runSceneDispatchEvent('user-message-saved', revokeConv, { eventId: 'u1-saved', role: 'user', text: 'Start', messageId: 'u1', messageRevision: revokeContext.getMessageRevision(revokeConv.messages[0]) });
    await new Promise(resolve => setTimeout(resolve, 0));
    revokeContext.setScenePackageGrant(revokeContext.state.settings, 'scene-package-1', 1, false);
    revokeRelease();
    revokeContext.harness.gate = null;
    const revoked = await revokeDispatch;
    assert.equal(revoked.failed, 1);
    assert.equal(revokeConv.messages.length, 1, 'Revoking the local grant before ACK must prevent the scene commit.');

    const saveContext = createHarness();
    setPackages(saveContext, [makePackage()]);
    const baseline = saveContext.getScenePackagesSnapshot();
    saveContext.harness.failSettingsSave = true;
    await assert.rejects(saveContext.saveScenePackagesChange(candidate => {
        candidate.scenePackages.push(makePackage({ id: 'saved-package' }));
    }), /settings-quota/);
    assert.ok(saveContext.failedSceneDraft);
    const draft = saveContext.failedSceneDraft;
    saveContext.failedSceneDraft = null;
    saveContext.harness.failSettingsSave = false;
    saveContext.state.settings.scenePackages = [makePackage({ id: 'concurrent-package', name: 'Concurrent' })];
    saveContext.state.settings.scenePackageGrants = {};
    await assert.rejects(saveContext.saveScenePackagesChange(candidate => {
        candidate.scenePackages = clone(draft.candidate.scenePackages);
        candidate.scenePackageGrants = clone(draft.candidate.scenePackageGrants);
    }, { baseline }), /scene_settings_changed/);
    assert.equal(saveContext.getScenePackages()[0].id, 'concurrent-package', 'A failed retry must not overwrite a concurrent definition.');
}

async function assertPreflightReadOnly() {
    const context = createHarness();
    const conv = addConversation(context, { messages: [userMessage('u1', 'Start'), assistantMessage('a1', 'Reply')] });
    const pkg = makePackage({ events: [{ id: 'e', name: 'Preview', order: 0, trigger: 'assistant-message-saved', once: true, conditions: [{ id: 'c', source: 'event-text', op: 'contains', value: 'Reply' }], text: 'PREVIEW', mvu: [{ id: 'm', path: 'stat_data.hp', valueType: 'number', value: 2 }] }] });
    setPackages(context, [pkg]);
    grantAll(context);
    const before = JSON.stringify({ messages: conv.messages, settings: context.state.settings });
    const payload = { eventId: 'preflight', role: 'assistant', text: 'Reply', messageId: 'a1', messageRevision: context.getMessageRevision(conv.messages[1]) };
    const eventContext = context.buildSceneEventContext(conv, 'assistant-message-saved', payload);
    const evaluated = context.evaluateSceneConditions(context.getScenePackages()[0].events[0].conditions, eventContext);
    assert.equal(evaluated.matched, true);
    assert.equal(JSON.stringify({ messages: conv.messages, settings: context.state.settings }), before, 'Preflight must not write messages, variables, settings or run records.');
}

async function assertDispatchIntegrationWithoutAutomationRules() {
    const context = createHarness();
    const conv = addConversation(context, { messages: [userMessage('u1', 'Start')] });
    setPackages(context, [makePackage({ events: [{ id: 'opening', name: 'Opening', order: 0, trigger: 'opening', once: true, conditions: [], text: 'DISPATCH_OPENING', mvu: [] }] })]);
    grantAll(context);
    const result = await context.dispatchAutomationEvent('user-message-saved', conv, {
        eventId: 'u1-saved', role: 'user', text: 'Start', messageId: 'u1', messageRevision: context.getMessageRevision(conv.messages[0])
    });
    assert.equal(result.matched, 0, 'There are no ordinary automation rules in this scenario.');
    assert.equal(result.scene.executed, 1, 'Scene processing must run through the C1 dispatch even when the rule set is empty.');
    assert.equal(context.getSceneProgress(conv).length, 1);
    assert.equal(conv.messages.some(message => message.content === 'DISPATCH_OPENING'), true);
}

function createMvuHarness() {
    let idCounter = 0;
    const context = {
        console, TextEncoder, TextDecoder, JSON, Object, Array, String, Number, Math, Date, Promise, Set, Map,
        setTimeout, clearTimeout,
        makeId: () => 'mvu-generated-' + (++idCounter),
        t: key => key,
        state: {
            conversations: {}, conversationOrder: [], activeConvId: null, settings: { lang: 'zh-CN', scenePackages: [], scenePackageGrants: {}, sceneRecentRuns: [] }
        },
        appStore: { notify() {} },
        getActiveConv() { return context.state.conversations[context.state.activeConvId]; },
        isLiveConversation(conv) { return !!conv && context.state.conversations[conv.id] === conv; }
    };
    vm.createContext(context);
    const sources = [
        'conversation/32-message-identity.js',
        'automation/32-automation-rules.js',
        'automation/32-automation-conditions.js',
        'scenarios/32-scene-packages.js',
        'scenarios/52-scene-runtime.js',
        'mvu/40-mvu-data.js',
        'mvu/40-mvu-parser.js',
        'mvu/40-mvu-yaml-parser.js',
        'mvu/40-mvu-update-blocks.js',
        'mvu/40-mvu-patch-runtime.js',
        'mvu/40-mvu-schema-defaults.js',
        'mvu/40-mvu-template-expressions.js',
        'mvu/40-mvu-template-parser.js',
        'mvu/40-mvu-template.js',
        'mvu/40-mvu-initial-state.js',
        'mvu/40-mvu-runtime.js',
        'mvu/40-mvu-mutations.js'
    ];
    vm.runInContext(sources.map(read).join('\n'), context, { filename: 'scene-mvu-harness.js' });
    return context;
}

function assertRealMvuReplayIgnoresInvalidScene() {
    const context = createMvuHarness();
    const conv = {
        id: 'mvu-conv', character: { name: 'Alice', extensions: { mvu: { initvar: { energy: 1 } } } },
        messages: [
            { id: 'u1', role: 'user', content: 'Ask' },
            { id: 'a1', role: 'assistant', content: 'Reply <JSONPatch>[{"op":"delta","path":"/energy","value":2}]</JSONPatch>' }
        ],
        summaries: [], created: 1, updated: 1
    };
    context.state.conversations[conv.id] = conv;
    context.state.activeConvId = conv.id;
    context.normalizeConversationMessageIdentity(conv);
    const source = conv.messages[1];
    const pkg = makePackage({ events: [{ id: 'e', name: 'Scene', order: 0, trigger: 'assistant-message-saved', once: true, conditions: [], text: 'Scene text', mvu: [{ id: 'm', path: 'stat_data.energy', valueType: 'number', value: 10 }] }] });
    const event = pkg.events[0];
    const manual = { stat_data: { energy: 10 }, display_data: { energy: 10 } };
    const sceneMessage = context.buildSceneMessage(pkg, event, conv, 'assistant-message-saved', source, event.mvu, manual);
    conv.messages.push(sceneMessage);
    context.clearMvuRuntimeCache(conv);
    assert.equal(context.getMvuDataForMessage(conv, null).stat_data.energy, 10, 'A valid scene record must apply its ACKed variables.');
    source.content = 'Edited reply <JSONPatch>[{"op":"delta","path":"/energy","value":2}]</JSONPatch>';
    source.revision = context.getMessageRevision(source);
    const stable = JSON.stringify(conv.messages);
    context.clearMvuRuntimeCache(conv);
    assert.equal(context.getMvuDataForMessage(conv, null).stat_data.energy, 3, 'An invalid scene source must not apply stale scene variables.');
    assert.equal(JSON.stringify(conv.messages), stable, 'Pure replay must not mutate message history.');
    source.content = 'Reply <JSONPatch>[{"op":"delta","path":"/energy","value":2}]</JSONPatch>';
    source.revision = context.getMessageRevision(source);
    context.clearMvuRuntimeCache(conv);
    assert.equal(context.getMvuDataForMessage(conv, null).stat_data.energy, 10, 'Restoring the selected source version restores replay.');
    context.clearSceneMessageRecord(sceneMessage);
    context.clearMvuRuntimeCache(conv);
    assert.equal(context.getMvuDataForMessage(conv, null).stat_data.energy, 3, 'Clearing the scene marker invalidates its variable data.');
}

function assertLongNarrativeAndSourceOwnership() {
    const context = createHarness();
    const source = userMessage('u1', 'Start');
    const conv = addConversation(context, { messages: [source] });
    const event = {
        id: 'long-event', revision: 1, name: 'Long', order: 0, trigger: 'user-message-saved', once: true,
        conditions: [
            { id: 'c1', source: 'message-count', op: 'gte', value: 1 },
            { id: 'c2', source: 'mvu', op: 'equals', path: 'stat_data.hp', valueType: 'number', value: 1 },
            { id: 'c3', source: 'event-text', op: 'contains', value: 'Start' }
        ],
        text: '长'.repeat(context.SCENE_MAX_TEXT),
        mvu: [
            { id: 'm1', path: 'stat_data.hp', valueType: 'number', value: 2 },
            { id: 'm2', path: 'stat_data.flag', valueType: 'boolean', value: true }
        ]
    };
    setPackages(context, [makePackage({ events: [event] })]);
    grantAll(context);
    let pkg = context.getScenePackages()[0];
    assert.equal(pkg.events[0].text.length, context.SCENE_MAX_TEXT, 'The full supported narrative length must remain stored.');
    const message = context.buildSceneMessage(pkg, pkg.events[0], conv, 'user-message-saved', source, pkg.events[0].mvu, { stat_data: { hp: 2, flag: true } });
    conv.messages.push(message);
    assert.equal(context.isSceneMessageRecordValid(conv, message), true, 'The supported maximum narrative length must not invalidate its own once record.');
    assert.equal(context.sceneOnceTriggered(conv, pkg.id, pkg.events[0].id), true);
    context.appendUserMessageToConversation(conv, 'later history');
    assert.equal(context.getSceneProgress(conv).length, 1, 'Appending ordinary history must not invalidate older progress.');
    source.content = 'Start edited';
    assert.equal(context.getSceneProgress(conv).length, 0, 'Editing an earlier source prefix must invalidate dependent progress.');
    source.content = 'Start';
    source.revision = context.getMessageRevision(source);
    assert.equal(context.getSceneProgress(conv).length, 1, 'Restoring the source prefix must restore progress.');

    pkg = context.getScenePackages()[0];
    pkg.name = 'Renamed package';
    pkg.events[0].order = 6;
    pkg.enabled = false;
    context.ensureSceneSettings(context.state.settings);
    pkg = context.getScenePackages()[0];
    assert.equal(context.getSceneProgress(conv).length, 1, 'Renaming, reordering or disabling the current definition must not erase ACKed history.');
    assert.equal(context.isScenePackageAuthorized(pkg), true, 'Name, order and enable toggles keep the content-bound local grant.');
    pkg = context.getScenePackages()[0];
    pkg.events[0].id = 'renamed-once-identity';
    context.ensureSceneSettings(context.state.settings);
    pkg = context.getScenePackages()[0];
    assert.equal(context.isScenePackageAuthorized(pkg), false, 'Changing the stable event identity must revoke the old local grant and its once namespace.');

    const selected = {
        id: 'a1', role: 'assistant', content: 'same text', selectedResponseVersionId: 'version-a',
        responseVersions: [
            { id: 'version-a', message: { id: 'a1', role: 'assistant', content: 'same text' } },
            { id: 'version-b', message: { id: 'a1', role: 'assistant', content: 'same text' } }
        ]
    };
    const versionContext = createHarness();
    const versionConv = addConversation(versionContext, { messages: [selected] });
    setPackages(versionContext, [makePackage({ events: [{ id: 'version-event', name: 'Version', order: 0, trigger: 'assistant-message-saved', once: true, conditions: [], text: 'VERSION', mvu: [] }] })]);
    grantAll(versionContext);
    const versionPackage = versionContext.getScenePackages()[0];
    const versionMessage = versionContext.buildSceneMessage(versionPackage, versionPackage.events[0], versionConv, 'assistant-message-saved', selected, [], {});
    versionConv.messages.push(versionMessage);
    assert.equal(versionContext.isSceneMessageRecordValid(versionConv, versionMessage), true);
    selected.selectedResponseVersionId = 'version-b';
    assert.equal(versionContext.getSceneProgress(versionConv).length, 0, 'Switching the selected reply version must invalidate the old source.');
    selected.selectedResponseVersionId = 'version-a';
    assert.equal(versionContext.getSceneProgress(versionConv).length, 1, 'Switching back to the ACKed selected version must restore progress.');
    versionConv.messages = versionConv.messages.filter(item => item.id !== 'a1');
    assert.equal(versionContext.getSceneProgress(versionConv).length, 0, 'Deleting the source message must invalidate progress.');

    const prefixContext = createHarness();
    const early = assistantMessage('early', 'Welcome');
    early.mvuManualData = { stat_data: { hp: 1 } };
    const ask = userMessage('u1', 'Ask');
    const prefixConv = addConversation(prefixContext, { messages: [early, ask] });
    setPackages(prefixContext, [makePackage({ events: [{ id: 'prefix-event', name: 'Prefix', order: 0, trigger: 'user-message-saved', once: false, conditions: [], text: 'PREFIX', mvu: [] }] })]);
    grantAll(prefixContext);
    const prefixPackage = prefixContext.getScenePackages()[0];
    const prefixMessage = prefixContext.buildSceneMessage(prefixPackage, prefixPackage.events[0], prefixConv, 'user-message-saved', ask, [], {});
    prefixConv.messages.push(prefixMessage);
    assert.equal(prefixContext.getSceneProgress(prefixConv).length, 1);
    early.mvuManualData = { stat_data: { hp: 7 } };
    assert.equal(prefixContext.getSceneProgress(prefixConv).length, 0, 'Changing original MVU state in the historical prefix must invalidate dependent progress.');
}

async function assertActivityBaselineConditions() {
    async function run(idleMinutes) {
        const context = createHarness();
        const older = { id: 'older', role: 'assistant', content: 'normal app message without timestamp' };
        const conv = addConversation(context, { messages: [older] });
        setPackages(context, [makePackage({ events: [
            { id: 'away-1', revision: 1, name: 'Away one', order: 0, trigger: 'user-message-saved', once: true, conditions: [{ id: 'away', source: 'away-minutes', op: 'gte', value: 30 }], text: 'AWAY1', mvu: [] },
            { id: 'away-2', revision: 1, name: 'Away two', order: 1, trigger: 'user-message-saved', once: true, conditions: [{ id: 'away', source: 'away-minutes', op: 'gte', value: 30 }], text: 'AWAY2', mvu: [] }
        ] })]);
        grantAll(context);
        conv.created = Date.now() - 4 * 3600000;
        conv.updated = Date.now() - idleMinutes * 60000;
        assert.equal(context.getMessageActivityTimestamp(conv.messages[0]), 0, 'Control: ordinary history carries no message timestamp.');
        await context.dispatchAutomationEvent('before-send', conv, { role: 'user', text: 'real new user body' });
        context.appendUserMessageToConversation(conv, 'real new user body');
        const source = conv.messages.at(-1);
        await context.dispatchAutomationEvent('user-message-saved', conv, {
            role: 'user', text: source.content, messageId: source.id, messageRevision: context.getMessageRevision(source)
        });
        return context.getSceneProgress(conv).length;
    }
    assert.equal(await run(90), 2, 'The same real 90 minute inactivity must apply to both ordered events.');
    assert.equal(await run(0.01), 0, 'A recently active old conversation must not trigger an away event.');
}

async function assertExplicitOpeningLifecycle() {
    function openingPackage(count) {
        return makePackage({ events: Array.from({ length: count }, (_, index) => ({
            id: 'opening-' + index, revision: 1, name: 'Opening ' + index, order: index, trigger: 'opening', once: true,
            conditions: [], text: 'OPENING_' + index, mvu: []
        })) });
    }
    const empty = createHarness();
    const emptyConv = addConversation(empty, { messages: [] });
    setPackages(empty, [openingPackage(1)]);
    grantAll(empty);
    const first = await empty.runSceneOpeningForConversation(emptyConv, { explicit: true });
    assert.equal(first.executed, 1, 'A new empty conversation must be able to start its real opening without a placeholder user message.');
    assert.equal(empty.getSceneProgress(emptyConv).length, 1);
    const second = await empty.runSceneOpeningForConversation(emptyConv, { explicit: true });
    assert.equal(second.executed, 0, 'A repeated explicit opening must not duplicate a one-shot opening.');
    assert.equal(empty.getSceneProgress(emptyConv).length, 1);

    const doubled = createHarness();
    const doubledConv = addConversation(doubled, { messages: [] });
    setPackages(doubled, [openingPackage(1)]);
    grantAll(doubled);
    const results = await Promise.all([
        doubled.runSceneOpeningForConversation(doubledConv, { explicit: true }),
        doubled.runSceneOpeningForConversation(doubledConv, { explicit: true })
    ]);
    assert.equal(results[0].executed + results[1].executed, 1, 'Double-clicking the explicit opening must not run the same batch twice.');
    assert.equal(doubled.getSceneProgress(doubledConv).length, 1);

    const capped = createHarness();
    const cappedConv = addConversation(capped, { messages: [] });
    capped.SCENE_MAX_STEPS_PER_DISPATCH = 2;
    setPackages(capped, [openingPackage(3)]);
    grantAll(capped);
    const cappedResult = await capped.runSceneOpeningForConversation(cappedConv, { explicit: true });
    assert.equal(cappedResult.executed, 2, 'The explicit opening entry must obey the same bounded event step limit.');

    const cancelled = createHarness();
    const cancelledConv = addConversation(cancelled, { messages: [] });
    setPackages(cancelled, [openingPackage(3)]);
    grantAll(cancelled);
    const original = cancelled.persistConversationMessageMutation;
    let commits = 0;
    cancelled.persistConversationMessageMutation = async (...args) => {
        const result = await original(...args);
        commits++;
        if (commits === 1) cancelled.cancelSceneRuntime('stopped', cancelledConv.id);
        return result;
    };
    await cancelled.runSceneOpeningForConversation(cancelledConv, { explicit: true });
    assert.equal(commits, 1, 'Cancellation after the first ACK must stop the rest of the opening batch.');

    const retried = createHarness();
    const retriedConv = addConversation(retried, { messages: [] });
    setPackages(retried, [openingPackage(1)]);
    grantAll(retried);
    retried.harness.failConversationSave = true;
    const failed = await retried.runSceneOpeningForConversation(retriedConv, { explicit: true });
    assert.equal(failed.failed, 1);
    assert.equal(retriedConv.messages.length, 0, 'A failed explicit opening must not append narrative or progress.');
    assert.ok(retried.getSceneFailure(retriedConv.id));
    retried.harness.failConversationSave = false;
    const recovered = await retried.retrySceneFailure(retriedConv.id);
    assert.equal(recovered.changed, true, 'An explicit empty-conversation opening must remain retryable from its original initial source.');
    assert.equal(retried.getSceneProgress(retriedConv).length, 1);

    const branchContext = createHarness();
    const branchSource = userMessage('u1', 'Start');
    const branchConv = addConversation(branchContext, { messages: [branchSource] });
    setPackages(branchContext, [openingPackage(1)]);
    grantAll(branchContext);
    await branchContext.runSceneOpeningForConversation(branchConv, { explicit: true });
    branchContext.appendUserMessageToConversation(branchConv, 'Later prompt');
    const branch = branchContext.createUserMessageEditBranch(branchConv, branchConv.messages.at(-1).id, 'Branch prompt');
    assert.equal(branchContext.getSceneProgress(branch).length, 1, 'A branch must keep opening progress that happened before its fork.');
    const beforeFork = branchContext.createUserMessageEditBranch(branchConv, 'u1', 'Earlier branch');
    assert.equal(beforeFork.messages.some(item => item.content === 'OPENING_0'), false, 'A branch before the opening must not inherit future opening progress.');
}

function assertRoleAnyCondition() {
    const context = createHarness();
    const conv = addConversation(context, { messages: [userMessage('u1', 'Start'), assistantMessage('a1', 'Reply')] });
    const anyRole = { id: 'role', source: 'event-role', op: 'equals', valueType: 'string', value: '' };
    const userContext = context.buildSceneEventContext(conv, 'user-message-saved', { role: 'user', text: 'body' });
    const assistantContext = context.buildSceneEventContext(conv, 'assistant-message-saved', { role: 'assistant', text: 'body' });
    for (const eventContext of [userContext, assistantContext]) {
        assert.equal(context.evaluateAutomationConditions([anyRole], eventContext).matched, true, 'The Any role option must match every concrete role in the shared condition engine.');
        assert.equal(context.evaluateSceneConditions([anyRole], eventContext).matched, true, 'The Any role option must match every concrete role in scene conditions.');
    }
    assert.equal(context.evaluateAutomationConditions([{ ...anyRole, value: 'user' }], userContext).matched, true);
    assert.equal(context.evaluateAutomationConditions([{ ...anyRole, value: 'user' }], assistantContext).matched, false, 'Exact role matching must stay exact.');
    assert.equal(context.evaluateAutomationConditions([{ ...anyRole, op: 'not-equals', value: 'user' }], userContext).matched, false);
    assert.equal(context.evaluateAutomationConditions([{ ...anyRole, op: 'not-equals', value: 'user' }], assistantContext).matched, true, 'Not-equals role semantics must stay exact.');
}

// 版本接口回归使用真实的用户/回复版本模块和剧情运行时，只桩掉 MVU 回放与可靠保存的落盘细节。
function createVersionHarness() {
    let idCounter = 0;
    const context = {
        console, JSON, Object, Array, String, Number, Math, Date, Promise, Set, Map, setTimeout, clearTimeout,
        appStore: { notify() {} },
        makeId: () => 'gen-' + (++idCounter),
        t: key => key,
        reportPersistPostSaveError() {},
        state: { settings: baseSettings(), conversations: {}, conversationOrder: [], activeConvId: null, isGenerating: false },
        getActiveConv() { return context.state.conversations[context.state.activeConvId]; },
        renderMessagesOnly() {}, renderTokenBar() {}, renderConversationListOnly() {},
        refreshSummaryValidity() {},
        resetConversationAfterMessageMutation() {},
        removeLinkedSecondStageMessages(conv, msg) { conv.messages = conv.messages.filter(message => !(message.stage === 'second' && message.parentId === msg.id)); },
        cloneMvuRuntimeValue: clone,
        mvuOwn(object, key) { return object != null && Object.prototype.hasOwnProperty.call(object, key); },
        canonicalMvuRuntimeValue(value) {
            return JSON.stringify(value, (key, current) => !current || typeof current !== 'object' || Array.isArray(current) ? current
                : Object.fromEntries(Object.keys(current).sort().map(name => [name, current[name]])));
        },
        validateMvuData(value) {
            if (!value || typeof value !== 'object' || Array.isArray(value) || !value.stat_data || typeof value.stat_data !== 'object') {
                return { valid: false, data: value, diagnostics: [{ message: 'invalid-stat-data' }] };
            }
            return { valid: true, data: clone(value), diagnostics: [] };
        },
        getMvuMessageVersionId(message) { return message && message.selectedResponseVersionId || 'base:' + String(message && message.id || ''); },
        getMvuMainMessages(conv) { return (conv && conv.messages || []).filter(message => message && message.role === 'assistant' && message.stage !== 'second'); },
        getMvuInitialData() { return { stat_data: { hp: 1 } }; },
        getMvuDataForMessage(conv, message) {
            if (message && message.mvuManualData) return clone(message.mvuManualData);
            let data = { stat_data: { hp: 1 } };
            for (const item of (conv && conv.messages || [])) {
                if (item && item.role === 'assistant' && item.stage !== 'second' && item.mvuManualData) data = clone(item.mvuManualData);
            }
            return data;
        },
        getMvuManualState(message) {
            if (!message || !message.mvuManualData) return null;
            if (message.mvuManualVersionId !== context.getMvuMessageVersionId(message)) return null;
            return clone(message.mvuManualData);
        },
        getMvuContextStamp(conv) {
            return JSON.stringify((conv && conv.messages || []).map(message => [message.id, context.getMessageRevision(message),
                message.selectedResponseVersionId || '', message.selectedUserVersionId || '', message.mvuManualVersionId || '',
                message.mvuManualData ? context.canonicalMvuRuntimeValue(message.mvuManualData) : '']));
        },
        refreshMvuCandidate(candidate) { return candidate; },
        commitMvuCandidate() { return true; },
        persistState: async () => true
    };
    context.harness = { conversationSaves: [], failConversationSave: false };
    context.persistConversationMessageMutation = async (conv, mutate, options) => {
        const candidate = Object.assign({}, conv, { messages: clone(conv.messages), summaries: clone(conv.summaries || []), mvu: conv.mvu ? clone(conv.mvu) : undefined });
        const result = mutate(candidate);
        if (options && typeof options.validate === 'function' && !options.validate()) throw new Error('stale-scene-source');
        if (context.harness.failConversationSave) throw new Error('conversation-quota');
        conv.messages = clone(candidate.messages);
        conv.summaries = clone(candidate.summaries);
        conv.updated = Date.now();
        context.harness.conversationSaves.push(clone(conv.messages));
        return result;
    };
    context.persistConversationMutation = async (target, rollback, candidate, commit) => {
        if (!commit(target, true) || !commit(target, false)) throw new Error('stale-candidate');
        context.harness.conversationSaves.push(clone(target.messages));
        return true;
    };
    vm.createContext(context);
    const sources = [
        'conversation/32-message-identity.js',
        'conversation/59-conversation-timestamp-helpers.js',
        'conversation/32-user-message-versions.js',
        'conversation/32-response-versions.js',
        'automation/32-automation-rules.js',
        'automation/32-automation-conditions.js',
        'mvu/40-mvu-mutations.js',
        'scenarios/32-scene-packages.js',
        'scenarios/52-scene-runtime.js',
        'chat/67-message-edit-helpers.js'
    ];
    vm.runInContext(sources.map(read).join('\n'), context, { filename: 'scene-version-harness.js' });
    return context;
}

// 真实剧情编辑 → 选回原版本：未物化的原始用户/助手版本与之后补齐的同一版本等价，
// 换成其他版本（即使正文相同）仍按身份/MVU 失效。
async function assertSceneVersionRestorationKeepsEffectiveSourceIdentity() {
    const context = createVersionHarness();
    const conv = addConversation(context, { messages: [{ id: 'u1', role: 'user', content: '原用户正文' }, { id: 'a1', role: 'assistant', content: '合成模型回复' }] });
    // 可靠保存会替换消息对象，始终按 ID 读取当前消息。
    const liveUser = () => conv.messages.find(message => message.id === 'u1');
    const liveSource = () => conv.messages.find(message => message.id === 'a1');
    const liveScene = () => conv.messages.find(message => message.stage === 'scene');
    setPackages(context, [makePackage({
        id: 'pkg-edit', name: 'Edit', events: [{
            id: 'failure-event', revision: 1, name: '失败场景', order: 0, trigger: 'assistant-message-saved', once: true,
            conditions: [], text: 'FAIL_SCENE', mvu: [{ id: 'hp', path: 'stat_data.hp', valueType: 'number', value: 9 }]
        }]
    })]);
    grantAll(context);
    const executed = await context.runSceneDispatchEvent('assistant-message-saved', conv, {
        eventId: 'a1-saved', role: 'assistant', text: '合成模型回复', messageId: 'a1', messageRevision: context.getMessageRevision(liveSource())
    });
    assert.equal(executed.executed, 1);
    assert.equal(context.getSceneProgress(conv).length, 1);
    const sceneMessage = liveScene();
    const sceneIndex = conv.messages.indexOf(sceneMessage);
    assert.equal(sceneMessage.mvuManualData.stat_data.hp, 9);
    assert.equal(liveUser().selectedUserVersionId, undefined, 'Control: the original user turn has no materialized version yet.');
    const effectiveUserVersionId = context.getUserMessageVersionState(liveUser()).current.id;

    context.applyMessageEditContent(conv, sceneIndex, 'FAIL_SCENE', '改写场景正文');
    assert.equal(context.getSceneProgress(conv).length, 0, 'Editing the scene narrative must invalidate its ACKed record.');
    const versions = context.getResponseVersions(liveScene());
    const original = versions.find(version => version.id === 'base:' + sceneMessage.id);
    assert.ok(original, 'The original scene version must be materialized with its stable identity.');
    assert.equal(original.userMessageId, 'u1');
    assert.equal(original.userVersionId, effectiveUserVersionId, 'The captured reply must link the effective user version identity.');

    await context.commitResponseVersion(conv, liveScene(), original, versions);
    assert.equal(context.getSceneProgress(conv).length, 1, 'Selecting the original scene version must restore progress when the same user version is materialized.');
    assert.equal(liveScene().mvuManualData.stat_data.hp, 9, 'Selecting the original scene version must restore its MVU snapshot.');
    assert.equal(liveUser().selectedUserVersionId, effectiveUserVersionId, 'Version restoration must materialize the same user version, not another one.');
    assert.equal(context.getMvuDataForMessage(conv, null).stat_data.hp, 9);
    assert.equal(conv.messages.filter(message => message.stage === 'scene').length, 1, 'Version restoration must not create new scene messages.');

    context.selectUserMessageContent(liveUser(), '另一版用户正文');
    assert.equal(context.getSceneProgress(conv).length, 0, 'Switching to another user version must invalidate dependent progress.');
    context.selectUserMessageContent(liveUser(), '原用户正文', effectiveUserVersionId);
    assert.equal(context.getSceneProgress(conv).length, 1, 'Switching back to the original user version must restore progress.');

    const preparedSource = context.prepareResponseVersions(conv, liveSource());
    liveSource().responseVersions = preparedSource.versions;
    liveSource().selectedResponseVersionId = preparedSource.current.id;
    assert.equal(preparedSource.current.id, 'base:a1', 'Materializing the untouched original reply must keep its un-materialized identity.');
    assert.equal(context.getSceneProgress(conv).length, 1, 'Materializing the same original reply version must not invalidate progress.');
    liveSource().responseVersions.push({ id: 'alt-reply', created: 1, secondMessages: [], message: { id: 'a1', role: 'assistant', content: '合成模型回复', mvuManualData: { stat_data: { hp: 5 } }, mvuManualVersionId: 'alt-reply' } });
    liveSource().selectedResponseVersionId = 'alt-reply';
    assert.equal(context.getSceneProgress(conv).length, 0, 'A different reply version with identical text must invalidate progress by identity/MVU.');
    liveSource().selectedResponseVersionId = 'base:a1';
    assert.equal(context.getSceneProgress(conv).length, 1, 'Switching back to the original reply version must restore progress.');
}

// 无 selected ID 的可移植版本簿：同一有效原版本直接复用；base ID 已被其他正文/手动状态占用时，
// 旧版本完整保留，当前回复用唯一新 ID，但仍沿用未物化来源身份。
function assertPortableResponseVersionBookIdentity() {
    const context = createVersionHarness();
    function portableReply(convId, content) {
        const reply = { id: 'reply-source', role: 'assistant', content };
        return { conv: addConversation(context, { id: convId, messages: [{ id: 'user-source', role: 'user', content: 'Original user' }, reply] }), reply };
    }

    const same = portableReply('conv-same', 'Original response');
    same.reply.responseVersions = [{ id: 'base:reply-source', created: 1, message: { id: 'reply-source', role: 'assistant', content: 'Original response' }, secondMessages: [] }];
    const sameSnapshot = JSON.stringify(same.reply.responseVersions), sameStamp = context.getSceneSourceStamp(same.conv, same.reply);
    const samePrepared = context.prepareResponseVersions(same.conv, same.reply);
    assert.equal(samePrepared.versions.length, 1, 'An existing identical original version must be reused, not duplicated.');
    assert.equal(samePrepared.current.id, 'base:reply-source');
    assert.equal(JSON.stringify(same.reply.responseVersions), sameSnapshot, 'Preparing versions must stay a pure read.');
    same.reply.responseVersions = samePrepared.versions;
    same.reply.selectedResponseVersionId = samePrepared.current.id;
    assert.equal(context.getSceneSourceStamp(same.conv, same.reply), sameStamp, 'Reusing the original base version must preserve source identity.');

    const different = portableReply('conv-different', 'Original response');
    different.reply.responseVersions = [{ id: 'base:reply-source', created: 1, message: { id: 'reply-source', role: 'assistant', content: 'Older saved response' }, secondMessages: [] }];
    const differentSnapshot = JSON.stringify(different.reply.responseVersions), differentStamp = context.getSceneSourceStamp(different.conv, different.reply);
    const differentPrepared = context.prepareResponseVersions(different.conv, different.reply);
    assert.equal(JSON.stringify(different.reply.responseVersions), differentSnapshot, 'Preparing versions must stay a pure read.');
    assert.equal(differentPrepared.versions.length, 2, 'The existing historical version must be preserved alongside the current reply.');
    assert.equal(new Set(differentPrepared.versions.map(version => version.id)).size, 2, 'A different body must never reuse an existing base ID.');
    assert.equal(differentPrepared.versions[0].message.content, 'Older saved response', 'The old version body must not be rewritten.');
    assert.equal(differentPrepared.current.message.content, 'Original response');
    different.reply.responseVersions = differentPrepared.versions;
    different.reply.selectedResponseVersionId = differentPrepared.current.id;
    assert.equal(context.getSceneSourceStamp(different.conv, different.reply), differentStamp, 'The materialized original must keep its un-materialized source identity.');
    different.reply.responseVersions.push({ id: 'other-same-text', created: 2, message: { id: 'reply-source', role: 'assistant', content: 'Original response' }, secondMessages: [] });
    different.reply.selectedResponseVersionId = 'other-same-text';
    assert.notEqual(context.getSceneSourceStamp(different.conv, different.reply), differentStamp, 'A distinct same-text version is still a source change.');

    const manual = portableReply('conv-manual', 'Original response');
    manual.reply.mvuManualData = { stat_data: { hp: 9 } };
    manual.reply.mvuManualVersionId = 'base:reply-source';
    manual.reply.responseVersions = [{ id: 'base:reply-source', created: 1, message: { id: 'reply-source', role: 'assistant', content: 'Original response' }, secondMessages: [] }];
    const manualPrepared = context.prepareResponseVersions(manual.conv, manual.reply);
    assert.equal(new Set(manualPrepared.versions.map(version => version.id)).size, 2, 'An existing version without the live manual state must not be reused.');
    assert.equal(manualPrepared.current.message.mvuManualData.stat_data.hp, 9, 'The materialized current reply must keep its manual state.');
}

// 同一已确认手动 MVU 的回复被物化（base ID 已被旧正文占用而生成新 ID）时来源仍等价；
// 换成其他版本、手动内容变化或未确认的 manual 绑定必须失效。
async function assertManualVersionMaterializationKeepsEffectiveSource() {
    const context = createVersionHarness();
    function manualReply(id) {
        return {
            id, role: 'assistant', content: 'Current reply', mvuManualData: { stat_data: { hp: 9 } }, mvuManualVersionId: 'base:' + id,
            responseVersions: [{ id: 'base:' + id, created: 1, message: { id, role: 'assistant', content: 'Older reply' }, secondMessages: [] }]
        };
    }
    function pushSceneRecord(conv, reply, suffix) {
        const event = { id: 'manual-event-' + suffix, revision: 1, name: 'Manual source event', order: 0, trigger: 'assistant-message-saved', once: true, conditions: [], text: 'MANUAL_SOURCE_SCENE', mvu: [] };
        const pkg = { id: 'manual-package-' + suffix, revision: 1, name: 'Manual source package', enabled: true, scope: 'global', targetId: '', order: 0, events: [event] };
        conv.messages.push(context.buildSceneMessage(pkg, event, conv, event.trigger, reply, [], {}));
    }

    const reply = manualReply('manual-source');
    const conv = addConversation(context, { id: 'conv-manual-materialization', messages: [{ id: 'manual-user', role: 'user', content: 'Original user' }, reply] });
    const before = context.getSceneSourceStamp(conv, reply);
    pushSceneRecord(conv, reply, 'source');
    assert.equal(context.getSceneProgress(conv).length, 1, 'Control: the confirmed manual source and its scene record are valid.');
    const prepared = context.prepareResponseVersions(conv, reply);
    assert.notEqual(prepared.current.id, 'base:manual-source', 'Control: the historical base ID belongs to a different body.');
    await context.commitResponseVersion(conv, reply, prepared.current, prepared.versions);
    const saved = conv.messages.find(message => message.id === 'manual-source');
    assert.equal(saved.responseVersions.some(version => version.baseIdentity === true), true, 'Control: the materialized current reply keeps the un-materialized base identity marker.');
    assert.equal(saved.mvuManualData.stat_data.hp, 9);
    assert.equal(context.getSceneSourceStamp(conv, saved), before, 'Materializing the same confirmed manual version must preserve source identity.');
    assert.equal(context.getSceneProgress(conv).length, 1, 'Only version bookkeeping changed; the ACKed history must stay valid.');

    saved.responseVersions.push({ id: 'other-same-text', created: 2, secondMessages: [], message: { id: saved.id, role: 'assistant', content: saved.content } });
    saved.selectedResponseVersionId = 'other-same-text';
    assert.notEqual(context.getSceneSourceStamp(conv, saved), before, 'Selecting a different same-text version must change source identity.');
    assert.equal(context.getSceneProgress(conv).length, 0, 'A genuinely different reply version must invalidate progress.');
    saved.selectedResponseVersionId = prepared.current.id;
    assert.equal(context.getSceneProgress(conv).length, 1, 'Switching back to the materialized original version must restore progress.');

    const manualSnapshot = clone(saved.mvuManualData), confirmedManualVersionId = saved.mvuManualVersionId;
    saved.mvuManualData = { stat_data: { hp: 7 } };
    assert.notEqual(context.getSceneSourceStamp(conv, saved), before, 'Changing confirmed manual state must change source identity.');
    assert.equal(context.getSceneProgress(conv).length, 0, 'Changing confirmed manual state must invalidate progress.');
    saved.mvuManualData = manualSnapshot;
    assert.equal(context.getSceneProgress(conv).length, 1, 'Restoring the confirmed manual state must restore progress.');
    saved.mvuManualVersionId = 'stale-manual-version';
    assert.notEqual(context.getSceneSourceStamp(conv, saved), before, 'An unconfirmed manual version binding must change source identity.');
    assert.equal(context.getSceneProgress(conv).length, 0, 'An unconfirmed manual version binding must invalidate progress.');
    saved.mvuManualVersionId = confirmedManualVersionId;
    assert.equal(context.getSceneProgress(conv).length, 1, 'Restoring the confirmed manual binding must restore progress.');

    const unconfirmed = manualReply('manual-unconfirmed');
    const unconfirmedConv = addConversation(context, { id: 'conv-manual-unconfirmed', messages: [{ id: 'manual-unconfirmed-user', role: 'user', content: 'Original user' }, unconfirmed] });
    const confirmedStamp = context.getSceneSourceStamp(unconfirmedConv, unconfirmed);
    unconfirmed.responseVersions.push({
        id: 'fake-base-version', created: 2, baseIdentity: true, secondMessages: [],
        message: { id: unconfirmed.id, role: 'assistant', content: unconfirmed.content, mvuManualData: clone(unconfirmed.mvuManualData), mvuManualVersionId: 'fake-base-version' }
    });
    unconfirmed.selectedResponseVersionId = 'fake-base-version';
    assert.notEqual(context.getSceneSourceStamp(unconfirmedConv, unconfirmed), confirmedStamp, 'A baseIdentity marker alone must not make an unconfirmed manual binding equivalent.');
}

// 分支重新锚定只能更新原本有效的开场来源，不能把已因来源编辑失效的记录重新签名。
function assertReanchorKeepsInvalidRecordsInvalid() {
    function buildChain() {
        const context = createHarness();
        const conv = addConversation(context, { messages: [] });
        const events = ['opening', 'opening', 'user-message-saved'].map((trigger, index) => ({
            id: 'event-' + index, revision: 1, name: 'Event ' + index, order: index, trigger, once: true, conditions: [], text: 'Narrative ' + index, mvu: []
        }));
        const pkg = { id: 'package-history', revision: 1, name: 'History package', enabled: true, scope: 'conversation', targetId: conv.id, order: 0, events };
        for (const event of events.slice(0, 2)) conv.messages.push(context.buildSceneMessage(pkg, event, conv, event.trigger, context.buildSceneOpeningSource(conv), [], {}));
        const later = userMessage('history-user', 'After opening');
        conv.messages.push(later);
        conv.messages.push(context.buildSceneMessage(pkg, events[2], conv, events[2].trigger, later, [], {}));
        return { context, conv, later };
    }
    const valid = buildChain();
    assert.equal(valid.context.getSceneProgress(valid.conv).length, 3, 'Control: the complete original source chain is valid.');
    valid.conv.created = Date.now();
    valid.context.reanchorSceneOpeningRecords(valid.conv);
    assert.equal(valid.context.getSceneProgress(valid.conv).length, 3, 'Reanchoring keeps both openings and the later retained record valid.');

    const edited = buildChain();
    edited.later.content = 'Edited after opening';
    assert.equal(edited.context.getSceneProgress(edited.conv).length, 2, 'Editing the later source invalidates only its own record.');
    edited.conv.created = Date.now();
    edited.context.reanchorSceneOpeningRecords(edited.conv);
    const reanchored = edited.context.getSceneProgress(edited.conv);
    assert.equal(reanchored.length, 2, 'Reanchoring must not re-sign a record invalidated by a source edit.');
    assert.equal(reanchored.some(entry => entry.text === 'Narrative 2'), false);
    assert.equal(reanchored.filter(entry => entry.trigger === 'opening').length, 2, 'The two retained openings stay valid across reanchoring.');
    const openingStamp = edited.context.getSceneSourceStamp(edited.conv, edited.context.buildSceneOpeningSource(edited.conv));
    edited.conv.messages.filter(message => message.stage === 'scene' && message.sceneEvent.sourceKind === 'opening')
        .forEach(message => assert.equal(message.sceneEvent.sourceRevision, openingStamp, 'Retained openings move to the branch initial source.'));
}

function assertRealMvuSceneChainDoesNotReintroduceInvalidState() {
    const context = createMvuHarness();
    const conv = {
        id: 'mvu-chain', character: { name: 'Alice', extensions: { mvu: { initvar: { hp: 1 } } } },
        messages: [
            { id: 'u1', role: 'user', content: 'Ask' },
            { id: 'a1', role: 'assistant', content: 'Reply one' }
        ],
        summaries: [], created: 1, updated: 1
    };
    context.state.conversations[conv.id] = conv;
    context.state.activeConvId = conv.id;
    context.normalizeConversationMessageIdentity(conv);
    const firstSource = conv.messages[1];
    const firstPackage = makePackage({ id: 'pkg-a', events: [{ id: 'a', name: 'A', order: 0, trigger: 'assistant-message-saved', once: true, conditions: [], text: 'A', mvu: [{ id: 'm', path: 'stat_data.hp', valueType: 'number', value: 10 }] }] });
    const firstRecord = context.buildSceneMessage(firstPackage, firstPackage.events[0], conv, 'assistant-message-saved', firstSource, firstPackage.events[0].mvu, { stat_data: { hp: 10 }, display_data: { hp: 10 } });
    conv.messages.push(firstRecord);
    context.clearMvuRuntimeCache(conv);
    assert.equal(context.getMvuDataForMessage(conv, null).stat_data.hp, 10);
    const secondSource = { id: 'a2', role: 'assistant', content: 'Reply two' };
    conv.messages.push(secondSource);
    const secondPackage = makePackage({ id: 'pkg-b', events: [{ id: 'b', name: 'B', order: 0, trigger: 'assistant-message-saved', once: true, conditions: [], text: 'B', mvu: [{ id: 'm', path: 'stat_data.mp', valueType: 'number', value: 20 }] }] });
    const secondRecord = context.buildSceneMessage(secondPackage, secondPackage.events[0], conv, 'assistant-message-saved', secondSource, secondPackage.events[0].mvu, { stat_data: { hp: 10, mp: 20 }, display_data: { hp: 10, mp: 20 } });
    conv.messages.push(secondRecord);
    context.clearMvuRuntimeCache(conv);
    const chained = context.getMvuDataForMessage(conv, null);
    assert.equal(chained.stat_data.hp, 10, 'The first ACKed scene state must participate in the second.');
    assert.equal(chained.stat_data.mp, 20, 'The second ACKed scene state must apply.');
    const originalSelectedVersion = firstRecord.selectedResponseVersionId;
    const originalManualVersion = firstRecord.mvuManualVersionId;
    firstRecord.selectedResponseVersionId = 'restored-scene-version';
    firstRecord.mvuManualVersionId = 'restored-scene-version';
    assert.equal(context.getSceneProgress(conv).length, 2, 'Scene version bookkeeping alone must not invalidate later prefix progress.');
    firstRecord.selectedResponseVersionId = originalSelectedVersion;
    firstRecord.mvuManualVersionId = originalManualVersion;
    const savedFirst = JSON.parse(JSON.stringify(firstRecord.sceneEvent));
    context.clearSceneMessageRecord(firstRecord);
    context.clearMvuRuntimeCache(conv);
    const afterInvalid = context.getMvuDataForMessage(conv, null);
    assert.equal(afterInvalid.stat_data.hp, 1, 'Clearing the earlier scene must restore the real initial state.');
    assert.equal(afterInvalid.stat_data.mp, undefined, 'A later full manual snapshot must not reintroduce the invalid earlier scene state.');
    firstRecord.sceneEvent = savedFirst;
    firstRecord.revision = context.getMessageRevision(firstRecord);
    context.clearMvuRuntimeCache(conv);
    const restored = context.getMvuDataForMessage(conv, null);
    assert.equal(restored.stat_data.hp, 10, 'Restoring the earlier ACK must restore the whole chain.');
    assert.equal(restored.stat_data.mp, 20, 'Restoring the earlier ACK must restore the whole chain.');
    conv.mvu = { initial: { stat_data: { hp: 1, gold: 5 } } };
    context.clearMvuRuntimeCache(conv);
    const rebased = context.getMvuDataForMessage(conv, null);
    assert.equal(rebased.stat_data.gold, 5, 'A changed initial baseline must keep replay state instead of applying stale full snapshots.');
    assert.equal(rebased.stat_data.hp, 10);
    assert.equal(rebased.stat_data.mp, 20);
}

function assertGenerationSourceRebindIsScoped() {
    const context = createHarness();
    const conv = addConversation(context, { messages: [userMessage('u1', 'Ask')] });
    const operation = {
        source: context.capturePromptBuildSource(conv),
        hasCurrentOwnership() { return true; },
        rebindSourceAfterSave(nextSource, savedMessage) {
            if (!this.source || nextSource.conversation !== this.source.conversation || nextSource.messages.length !== this.source.messages.length + 1) return false;
            for (let index = 0; index < this.source.messages.length; index++) {
                if (this.source.messages[index].id !== nextSource.messages[index].id || this.source.messages[index].revision !== nextSource.messages[index].revision) return false;
            }
            const appended = nextSource.messages[nextSource.messages.length - 1];
            if (appended.id !== savedMessage.id || appended.revision !== context.getMessageRevision(savedMessage)) return false;
            this.source = nextSource;
            return true;
        }
    };
    context.state._generationRuntime = { conversation: conv, operation };
    assert.equal(context.refreshSceneGenerationSource(conv), false, 'A scene refresh without a concrete ACK must not be approved.');
    const saved = { id: 'scene-1', role: 'assistant', stage: 'scene', content: 'S' };
    conv.messages.push(saved);
    assert.equal(context.refreshSceneGenerationSource(conv, saved), true, 'An appended ACKed scene increment may extend the owned source.');
    conv.messages[0].content = 'Edited unrelated source';
    const later = { id: 'scene-2', role: 'assistant', stage: 'scene', content: 'S2' };
    conv.messages.push(later);
    assert.equal(context.refreshSceneGenerationSource(conv, later), false, 'An unrelated source change must not be approved as a scene increment.');
    context.state._generationRuntime = null;
    assert.equal(context.refreshSceneGenerationSource(conv, later), false, 'A stopped or replaced request must not refresh its source.');
}

await assertPackageModelAndStrictInput();
assertImportExportAndGrantFingerprint();
await assertOpeningAndOrdering();
await assertAssistantOrderAndSerialMvu();
await assertFailureAtomicityAndRetry();
await assertFailureRetryKeepsOriginalBaseline();
await assertSourceInvalidationAndBranch();
await assertCancellationAndDefinitionConflict();
await assertPreflightReadOnly();
await assertDispatchIntegrationWithoutAutomationRules();
assertRealMvuReplayIgnoresInvalidScene();
assertLongNarrativeAndSourceOwnership();
await assertActivityBaselineConditions();
await assertExplicitOpeningLifecycle();
assertRoleAnyCondition();
assertRealMvuSceneChainDoesNotReintroduceInvalidState();
await assertSceneVersionRestorationKeepsEffectiveSourceIdentity();
assertPortableResponseVersionBookIdentity();
await assertManualVersionMaterializationKeepsEffectiveSource();
assertReanchorKeepsInvalidRecordsInvalid();
assertGenerationSourceRebindIsScoped();

console.log('Tavern stage C2 runtime passed: strict package/event model, content-bound grants and event identity, import/export, bounded long narratives, prefix/version source ownership, append-preserving progress, explicit empty-conversation opening with cap/cancel/double-click, shared Any-role conditions, real activity baselines, opening and saved-message order, one-shot/repeatable, ACK-ordered MVU, atomic save failures with retry bound to the failed definition revisions/content, source anchor/prefix and activity baseline, source/branch invalidation, real user/reply version identity restoration including portable version books with missing selected IDs and confirmed manual MVU materialization, reanchor without re-signing invalid records, cancellation, failed-candidate baseline, read-only preflight and real MVU replay.');
