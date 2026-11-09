import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, 'src/app', file), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));

function baseSettings() {
    return {
        lang: 'zh-CN',
        quickReplyGroups: [{
            id: 'group-1', name: 'Group', enabled: true, scope: 'global', targetId: '', order: 0,
            buttons: [{ id: 'button-1', name: 'Button', content: 'quick body {{char}}', action: 'insert', enabled: true, order: 0 }]
        }],
        automationRules: [],
        automationRuleGrants: {},
        automationSendGrants: {},
        automationRecentRuns: []
    };
}

function makeRule(overrides) {
    return Object.assign({
        id: 'rule-1', revision: 1, name: 'Rule 1', enabled: true, event: 'user-message-saved',
        scope: 'global', targetId: '', order: 0, conditions: [], actions: []
    }, overrides);
}

function createHarness() {
    let idCounter = 0;
    const order = [];
    const context = {
        console,
        JSON, Object, Array, String, Number, Math, Date, Promise, Set, Map,
        setTimeout, clearTimeout,
        Event: class TestEvent { constructor(type) { this.type = type; } },
        appStore: { notify() {} },
        makeId: () => 'generated-' + (++idCounter),
        t: key => key,
        replacePlaceholders: text => text,
        state: {
            settings: baseSettings(),
            conversations: {},
            conversationOrder: [],
            activeConvId: null,
            isGenerating: false
        },
        dom: { messageInput: { value: '', style: { height: 'auto' }, dispatchEvent(event) { this.lastEvent = event.type; } } },
        composerSendInProgress: false,
        pendingGroupMention: null,
        parseGroupMention: () => null,
        clearPendingGroupMention() {},
        isGroupChat: () => false,
        getActiveConv() { return context.state.conversations[context.state.activeConvId]; },
        isLiveConversation(conv) { return !!conv && context.state.conversations[conv.id] === conv; },
        getMessageRevision(message) {
            return JSON.stringify([message && message.id, message && message.content, message && message.stage || '',
                message && message.selectedResponseVersionId || '', message && message.interrupted === true]);
        },
        ensureQuickReplyGroups(settings) {
            settings = settings || context.state.settings;
            if (!Array.isArray(settings.quickReplyGroups)) settings.quickReplyGroups = [];
            return settings.quickReplyGroups;
        },
        expandQuickReplyText(text) { return String(text || ''); },
        mergeQuickReplyIntoComposerText(existing, addition, mode) {
            existing = String(existing || '');
            addition = String(addition || '');
            if (!existing.trim() || mode === 'replace') return addition;
            return existing.replace(/\s*$/, '') + '\n' + addition;
        },
        getComposerDraft(conv) {
            if (!conv._testDraft) conv._testDraft = { text: '', images: [], revision: 0, notice: '', pending: 0 };
            return conv._testDraft;
        },
        renderComposerImages() {},
        quickReplyConversationBusy(conv) { return !!(context.state.isGenerating || context.harness.groupAutoActive || conv && conv._messageCommitInProgress); },
        isGroupAutoRoundsActive() { return !!context.harness.groupAutoActive; },
        sendMessage: async () => { context.harness.sent.push('send'); },
        persistState: async (immediate, options) => {
            options = options || {};
            if (context.harness.failPersist) throw new Error('persist-failure');
            if (options.beforePersist) options.beforePersist();
            let snapshot = { settings: clone(context.state.settings), conversations: clone(context.state.conversations) };
            if (options.transformSnapshot) snapshot = options.transformSnapshot(snapshot);
            if (options.onPersistSuccess) options.onPersistSuccess();
            if (options.commitPendingSnapshot) options.commitPendingSnapshot(snapshot);
            return true;
        },
        reportPersistPostSaveError() {},
        getMvuMainMessages(conv) {
            return (conv && conv.messages || []).filter(message => message && message.role === 'assistant' && message.stage !== 'second');
        },
        getMvuDataForMessage(conv, message) {
            return message && message.mvuData ? clone(message.mvuData) : { stat_data: { hp: 5 } };
        },
        getMvuInitialData() { return { stat_data: { hp: 1 } }; },
        validateMvuData(value) { return { valid: true, data: clone(value), diagnostics: [] }; },
        captureMvuSources(conv) { return { id: conv.id, stamp: 'stamp-' + conv.id }; },
        cloneMvuRuntimeValue(value) { return clone(value); },
        ensureConversationMvu(conv, options) {
            conv.mvu = conv.mvu || {};
            if (options && options.initial) conv.mvu.initial = clone(options.initial);
        },
        commitMvuCandidate(target, candidate) {
            if (candidate && candidate.mvu) target.mvu = clone(candidate.mvu);
            return true;
        },
        validateMvuSources(conv, sources) { return !!conv && !!sources && conv.id === sources.id; },
        replaceMvuDataForMessage: async (conv, message, value, options) => {
            context.harness.mvuReplaceCalls.push({ convId: conv.id, messageId: message && message.id, value: clone(value), options });
        },
        persistConversationMutation: async (conv, rollback, candidate, commit) => {
            context.harness.mvuMutations.push(clone(candidate));
            if (commit(conv, true) === false) throw new Error('stale-mvu-target');
            commit(conv, false);
        },
        captureComposerMessage: () => context.harness.capture,
        persistConversationMessageMutation: async (conv, mutate) => {
            if (context.harness.saveFailure) throw new Error('save-failure');
            const candidate = clone(conv);
            const result = mutate(candidate);
            context.harness.saveCalls.push('save');
            Object.assign(conv, candidate);
            return result;
        },
        prepareGroupSpeakerForUserMessage() {},
        clearCommittedComposerMessage(conv, capture) {
            order.push('clear');
            if (capture && capture.draft) { capture.draft.text = ''; capture.draft.images = []; capture.draft.revision++; }
        },
        requestFullRender() { order.push('render'); },
        updateInputState() {},
        streamChat() { order.push('stream'); },
        getGroupSendBlockReason: () => '',
        cancelGroupAutoRounds() {},
        alert(message) { context.harness.alerts.push(String(message)); },
        removeGenerationStreamingBubble() {},
        isolatePrimaryStageContentWithSettings: text => String(text || ''),
        getCurrentGeneratingSpeakerName: () => 'A',
        finishAssistantMessage: async () => ({ id: 'assistant-1', content: 'reply' }),
        runSecondStageGeneration() { order.push('second-stage'); },
        completeGroupSpeakerTurn() {},
        renderTokenBar() {},
        autoSummarize() {},
        advanceGroupAutoRounds() { order.push('group-rounds'); },
        settleAutomationAfterTurn(conv) { order.push('settle'); if (typeof context.__settle === 'function') context.__settle(conv); },
        failGroupAutoRounds() {},
        renderMessagesOnly() {},
        resetMessageComposerInput() { context.dom.messageInput.value = ''; },
        getNextGroupSpeaker() { return null; },
        getGroupSpeakerForUserMessage() { return { speaker: null }; }
    };
    context.harness = {
        order,
        alerts: [],
        sent: [],
        saveCalls: [],
        mvuReplaceCalls: [],
        mvuMutations: [],
        groupAutoActive: false,
        saveFailure: false,
        failPersist: false,
        dispatchCalls: [],
        capture: null,
        settleCalls: []
    };
    vm.createContext(context);
    const sources = [
        'conversation/32-message-identity.js',
        'automation/32-automation-rules.js',
        'automation/32-automation-conditions.js',
        'automation/52-automation-runtime.js',
        'quick-replies/32-quick-replies.js',
        'events/70-send-message-helpers.js',
        'events/70-events-init.js',
        'generation/52-generation-runtime.js'
    ];
    vm.runInContext(sources.map(read).join('\n') + `
this.__automationInternals = {
    setChain(chain) { automationActiveChain = chain; },
    getPending() { return automationPendingSends; },
    setRuleGrant(ruleId, revision, allowSend) {
        setAutomationRuleGrant(state.settings, ruleId, revision, allowSend);
    }
};
`, context, { filename: 'automation-runtime-harness.js' });
    context.__realSendMessage = context.sendMessage;
    const realSettle = context.settleAutomationAfterTurn;
    context.settleAutomationAfterTurn = function(conv) {
        order.push('settle');
        context.harness.settleCalls.push(conv && conv.id);
        return realSettle.apply(null, arguments);
    };
    return context;
}

function addConversation(context, overrides) {
    const conv = Object.assign({ id: 'conv-1', title: 'Conversation', character: { name: 'Alice' }, messages: [], summaries: [] }, overrides || {});
    context.state.conversations[conv.id] = conv;
    context.state.conversationOrder = [conv.id];
    context.state.activeConvId = conv.id;
    return conv;
}

function setRules(context, rules) {
    context.state.settings.automationRules = rules.map((rule, index) => Object.assign({ order: index }, rule));
    context.ensureAutomationSettings(context.state.settings);
}

function grantAll(context, allowSend = true) {
    (context.state.settings.automationRules || []).forEach(rule => {
        context.setAutomationRuleGrant(context.state.settings, rule.id, rule.revision, !!allowSend);
    });
}

function runRecordCount(context, eventName, ruleId) {
    return context.getAutomationRecentRuns().filter(entry => entry.event === eventName && entry.ruleId === ruleId).length;
}

async function assertRuleModelAndValidation() {
    const context = createHarness();
    const rule = makeRule({
        conditions: [{ id: 'c1', source: 'event-text', op: 'contains', value: 'hello' }],
        actions: [
            { id: 'a1', type: 'append-draft', text: 'append' },
            { id: 'a2', type: 'mvu-set', path: 'stat_data.hp', valueType: 'number', value: 7 }
        ]
    });
    setRules(context, [rule]);
    const normalized = context.getAutomationRules()[0];
    assert.equal(normalized.id, 'rule-1');
    assert.equal(normalized.conditions[0].source, 'event-text');
    assert.equal(normalized.actions[1].value, 7, 'MVU numeric action values must be typed.');
    assert.throws(() => context.validateAutomationRule(makeRule({ conditions: [{ id: 'c', source: 'mvu', op: 'equals', path: '__proto__.x', valueType: 'string', value: 'x' }] })), /automation_mvu_path_invalid/);
    assert.throws(() => context.validateAutomationRule(makeRule({ conditions: [{ id: 'c', source: 'mvu', op: 'equals', path: 'constructor', valueType: 'string', value: 'x' }] })), /automation_mvu_path_invalid/);
    assert.throws(() => context.validateAutomationRule(makeRule({ event: 'before-send', actions: [{ id: 'a', type: 'mvu-set', path: 'stat_data.hp', valueType: 'number', value: 1 }] })), /automation_action_event_invalid/);
    assert.throws(() => context.validateAutomationRule(makeRule({ actions: [{ id: 'a', type: 'send-message' }], scope: 'character', targetId: '' })), /automation_target_required/);
    const tooMany = makeRule({ actions: [] });
    tooMany.conditions = Array.from({ length: context.AUTOMATION_MAX_CONDITIONS + 1 }, (_, index) => ({ id: 'c' + index, source: 'event-text', op: 'contains', value: 'x' }));
    assert.throws(() => context.validateAutomationRule(tooMany), /automation_conditions_invalid/);
    const unknownEvent = makeRule({ event: 'not-an-event' });
    setRules(context, [unknownEvent]);
    assert.equal(context.getAutomationRules()[0].enabled, false, 'Unknown loaded events must be disabled.');
    setRules(context, [makeRule({ conditions: [{ id: 'bad-number', source: 'message-count', op: 'gte', value: 'invalid-number' }], actions: [{ id: 'a', type: 'append-draft', text: 'x' }] })]);
    assert.equal(context.getAutomationRules()[0].invalid, true, 'Invalid numeric input must be isolated instead of coerced to zero.');
    assert.equal(context.getAutomationRules()[0].enabled, false);
    grantAll(context, true);
    assert.equal(context.isAutomationRuleAuthorized(context.getAutomationRules()[0]), false, 'Invalid definitions must never become authorized.');
    setRules(context, [makeRule({ conditions: [{ id: 'bad-type', source: 'mvu', op: 'equals', path: 'stat_data.hp', valueType: 'not-a-type', value: 1 }], actions: [{ id: 'a', type: 'append-draft', text: 'x' }] })]);
    assert.equal(context.getAutomationRules()[0].enabled, false, 'Unknown value types must not fall back to a usable rule.');
    setRules(context, [makeRule({ conditions: [{ id: 'blank', source: 'event-text', op: 'contains', value: '   ' }], actions: [{ id: 'a', type: 'append-draft', text: 'x' }] })]);
    assert.equal(context.getAutomationRules()[0].enabled, false, 'Blank string conditions must be isolated.');
    const grantContext = createHarness();
    setRules(grantContext, [makeRule({ id: 'grant', actions: [{ id: 'a', type: 'append-draft', text: 'one' }] })]);
    grantAll(grantContext, false);
    assert.equal(grantContext.isAutomationRuleAuthorized(grantContext.getAutomationRuleById('grant')), true);
    grantContext.getAutomationRuleById('grant').name = 'renamed';
    grantContext.getAutomationRuleById('grant').enabled = false;
    grantContext.ensureAutomationSettings(grantContext.state.settings);
    assert.equal(grantContext.isAutomationRuleAuthorized(grantContext.getAutomationRuleById('grant')), true, 'Name, order and enable toggles must not revoke a content-bound grant.');
    grantContext.getAutomationRuleById('grant').enabled = true;
    grantContext.ensureAutomationSettings(grantContext.state.settings);
    assert.equal(grantContext.isAutomationRuleAuthorized(grantContext.getAutomationRuleById('grant')), true);
    grantContext.getAutomationRuleById('grant').actions[0].text = 'two';
    grantContext.ensureAutomationSettings(grantContext.state.settings);
    assert.equal(grantContext.isAutomationRuleAuthorized(grantContext.getAutomationRuleById('grant')), false, 'Executable content changes must revoke the local grant.');
}

function assertImportAndExport() {
    const context = createHarness();
    setRules(context, [makeRule({ actions: [{ id: 'a', type: 'send-message' }] })]);
    context.setAutomationRuleGrant(context.state.settings, 'rule-1', 1, true);
    const exported = context.exportAutomationRulesData();
    assert.equal(exported.type, 'opentavern-automation-rules');
    assert.equal(exported.rules[0].enabled, true, 'Export must keep the definition, including the enabled flag.');
    const imported = context.importAutomationRulesData({ type: 'opentavern-automation-rules', rules: [Object.assign({}, exported.rules[0], { enabled: true })] });
    assert.equal(imported.length, 1);
    assert.equal(imported[0].enabled, false, 'Imported rules must be disabled.');
    assert.notEqual(imported[0].id, 'rule-1', 'Imported rules must receive fresh stable IDs.');
    assert.equal(context.isAutomationRuleAuthorized(imported[0]), false, 'Import must not grant local permission.');
    assert.equal(context.getAutomationRuleGrant('rule-1').fingerprint.length > 0, true, 'Local grants must bind the executable content fingerprint.');
    assert.throws(() => context.importAutomationRulesData({ type: 'opentavern-automation-rules', rules: [Object.assign({}, exported.rules[0], { actions: [{ id: 'x', type: 'eval' }] })] }), /automation_import_invalid|automation_actions_invalid/);
}

function assertConditions() {
    const context = createHarness();
    const conv = addConversation(context, {
        title: '北境之旅',
        group: { members: [{ character: { name: 'Alice' }, order: 0 }, { character: { name: 'Bob' }, order: 1 }] },
        messages: [
            { id: 'm1', role: 'user', content: '你好' },
            { id: 'm2', role: 'assistant', content: '欢迎', mvuData: { stat_data: { hp: 5, tag: 'cold' } } }
        ]
    });
    const contextData = context.buildAutomationEventContext(conv, 'assistant-message-saved', {
        eventId: 'e1', role: 'assistant', text: '欢迎来到北境',
        worldbookEntries: [{ worldBookId: 'book-1', uid: '7', automationId: 'auto-cold' }],
        getMvuData: () => ({ stat_data: { hp: 5, tag: 'cold' } })
    });
    assert.equal(contextData.messageCount, 2);
    assert.equal(contextData.characterNames.length, 2);
    const evaluate = (condition) => context.evaluateAutomationConditions([condition], contextData).matched;
    assert.equal(evaluate({ id: '1', source: 'conversation-title', op: 'contains', value: '北境' }), true);
    assert.equal(evaluate({ id: '2', source: 'character-name', op: 'equals', value: 'Bob' }), true);
    assert.equal(evaluate({ id: '3', source: 'event-role', op: 'equals', value: 'assistant' }), true);
    assert.equal(evaluate({ id: '4', source: 'event-text', op: 'contains', value: '北境' }), true);
    assert.equal(evaluate({ id: '5', source: 'message-count', op: 'gte', value: 2 }), true);
    assert.equal(evaluate({ id: '6', source: 'mvu', op: 'equals', path: 'stat_data.hp', valueType: 'number', value: 5 }), true);
    assert.equal(evaluate({ id: '7', source: 'mvu', op: 'equals', path: 'stat_data.hp', valueType: 'string', value: '5' }), false, 'Strict types must reject string/number mismatch.');
    assert.equal(evaluate({ id: '8', source: 'worldbook-entry', op: 'equals', value: 'auto-cold' }), true);
    assert.equal(evaluate({ id: '9', source: 'worldbook-entry', op: 'equals', value: 'book-1:7' }), true);
    assert.equal(evaluate({ id: '10', source: 'worldbook-entry', op: 'equals', value: 'missing' }), false);
    const multi = [{ worldBookId: 'book', uid: '1', automationId: 'foo-bar' }, { worldBookId: 'book', uid: '2', automationId: 'other' }];
    assert.equal(context.automationEntryIdentityMatches(multi, 'foo', 'not-contains'), false, 'Any real substring match must defeat not-contains.');
    assert.equal(context.automationEntryIdentityMatches(multi, 'missing', 'not-contains'), true);
    assert.equal(context.automationEntryIdentityMatches(multi, 'foo', 'contains'), true);
    assert.equal(context.automationEntryIdentityMatches(multi, 'other', 'not-equals'), false, 'Any equal identity must defeat not-equals.');
    assert.equal(context.automationEntryIdentityMatches(multi, 'missing', 'not-equals'), true);
    assert.throws(() => context.readAutomationMvuValue({ stat_data: {} }, 'stat_data.__proto__.x'), /automation_mvu_path_invalid/);
    const reasons = context.evaluateAutomationConditions([
        { id: 'pass', source: 'event-role', op: 'equals', value: 'assistant' },
        { id: 'fail', source: 'event-text', op: 'contains', value: '雪' }
    ], contextData);
    assert.equal(reasons.matched, false);
    assert.equal(reasons.reasons.find(item => item.id === 'pass').matched, true);
    assert.equal(reasons.reasons.find(item => item.id === 'fail').matched, false);
}

async function assertSixEventsAndDedupe() {
    const context = createHarness();
    const conv = addConversation(context, { messages: [{ id: 'a0', role: 'assistant', content: 'greeting' }] });
    context.state.settings.quickReplyGroups[0].buttons[0].content = 'QR body';
    const events = ['conversation-created', 'conversation-entered', 'user-message-saved', 'assistant-message-saved'];
    setRules(context, events.map((event, index) => makeRule({
        id: 'rule-' + event, revision: 1, name: event, event: event,
        actions: [{ id: 'a-' + event, type: 'append-draft', text: event }]
    })).concat([
        makeRule({ id: 'rule-before-send', name: 'before', event: 'before-send', actions: [{ id: 'a-before', type: 'append-draft', text: 'before' }] }),
        makeRule({ id: 'rule-worldbook', name: 'worldbook', event: 'worldbook-activated', actions: [{ id: 'a-worldbook', type: 'prompt-fragment', role: 'system', text: 'world fragment' }] })
    ]));
    grantAll(context, false);
    for (const event of events) await context.dispatchAutomationEvent(event, conv, { eventId: 'event-' + event, text: event });
    const capture = { text: 'user text', attachments: [], draft: { text: 'user text', images: [], revision: 1 }, revision: 1 };
    const before = await context.runAutomationBeforeSend(conv, capture);
    assert.equal(before.blocked, false);
    assert.ok(capture.text.includes('before'), 'Before-send draft action must affect the candidate only.');
    context.dispatchAutomationWorldbookEvent(conv, [{ _sourceWorldBookId: 'book', uid: 1, automationId: 'auto' }]);
    const fragments = context.takeAutomationPromptFragments(conv);
    assert.equal(fragments.length, 1, 'World book prompt fragments must be available to the current request.');
    assert.equal(fragments[0].content, 'world fragment');
    assert.equal(context.takeAutomationPromptFragments(conv).length, 0, 'Prompt fragments must be consumed exactly once.');
    await new Promise(resolve => setTimeout(resolve, 0));
    for (const event of events) assert.equal(runRecordCount(context, event, 'rule-' + event), 1, event + ' must trigger exactly once.');
    assert.equal(runRecordCount(context, 'before-send', 'rule-before-send'), 1);
    assert.equal(runRecordCount(context, 'worldbook-activated', 'rule-worldbook'), 1);
    const beforeCount = runRecordCount(context, 'user-message-saved', 'rule-user-message-saved');
    await context.dispatchAutomationEvent('user-message-saved', conv, { eventId: 'event-user-message-saved', text: 'again' });
    assert.equal(runRecordCount(context, 'user-message-saved', 'rule-user-message-saved'), beforeCount, 'Repeated dispatch of the same eventId and revision must be deduped.');
    const rule = context.getAutomationRuleById('rule-user-message-saved');
    rule.revision += 1;
    await context.dispatchAutomationEvent('user-message-saved', conv, { eventId: 'event-user-message-saved', text: 'again' });
    assert.equal(runRecordCount(context, 'user-message-saved', 'rule-user-message-saved'), beforeCount + 1, 'A new rule revision must be allowed to run once.');
}

async function assertBeforeSendBlockAndFragments() {
    const context = createHarness();
    const conv = addConversation(context);
    setRules(context, [
        makeRule({ id: 'set', event: 'before-send', actions: [{ id: 's', type: 'append-draft', text: 'X' }] }),
        makeRule({ id: 'fragment', event: 'before-send', actions: [{ id: 'f', type: 'prompt-fragment', role: 'user', text: 'fragment text' }] }),
        makeRule({ id: 'block', event: 'before-send', actions: [{ id: 'b', type: 'block-send', reason: 'blocked!' }] })
    ]);
    grantAll(context, false);
    const capture = { text: 'original', attachments: [], draft: { text: 'original', images: [], revision: 1 }, revision: 1 };
    const result = await context.runAutomationBeforeSend(conv, capture);
    assert.equal(result.blocked, true);
    assert.equal(result.reason, 'blocked!');
    assert.equal(capture.text, 'original', 'Blocked sends must not apply candidate draft changes.');
    assert.equal(context.takeAutomationPromptFragments(conv).length, 0, 'Blocked sends must not keep prompt fragments.');
    setRules(context, [
        makeRule({ id: 'set', event: 'before-send', actions: [{ id: 's', type: 'append-draft', text: 'X' }] }),
        makeRule({ id: 'fragment', event: 'before-send', actions: [{ id: 'f', type: 'prompt-fragment', role: 'user', text: 'fragment text' }] })
    ]);
    grantAll(context, false);
    const attachment = { type: 'image', source: 'user', mime: 'image/png', dataUrl: 'data:image/png;base64,AAAA', bytes: 3 };
    const capture2 = { text: 'original', attachments: [attachment], draft: { text: 'original', images: [attachment], revision: 1 }, revision: 1 };
    const result2 = await context.runAutomationBeforeSend(conv, capture2);
    assert.equal(result2.blocked, false);
    assert.equal(capture2.text, 'original\nX');
    assert.equal(capture2.draft.text, 'original\nX');
    assert.equal(capture2.attachments.length, 1, 'Before-send draft actions must preserve attachments.');
    assert.equal(capture2.attachments[0].dataUrl, attachment.dataUrl);
    const fragments = context.takeAutomationPromptFragments(conv, { fragmentToken: result2.token });
    assert.equal(fragments.length, 1);
    assert.equal(fragments[0].role, 'user');
    assert.equal(fragments[0].content, 'fragment text');
}

async function assertSendMessageIntegration() {
    const context = createHarness();
    const conv = addConversation(context);
    const dispatchEvents = [];
    const realDispatch = context.dispatchAutomationEvent;
    context.dispatchAutomationEvent = function(eventName) {
        dispatchEvents.push(eventName);
        context.harness.order.push('dispatch:' + eventName);
        return realDispatch.apply(null, arguments);
    };
    context.harness.capture = { text: 'hello', attachments: [], draft: { text: 'hello', images: [], revision: 1 }, revision: 1 };
    await context.__realSendMessage();
    assert.deepEqual(dispatchEvents, ['before-send', 'user-message-saved']);
    assert.ok(context.harness.order.indexOf('clear') >= 0 && context.harness.order.indexOf('clear') < context.harness.order.indexOf('dispatch:user-message-saved'),
        'User-saved rules must run after the committed composer is cleared.');

    context.harness.saveFailure = true;
    dispatchEvents.length = 0;
    context.harness.capture = { text: 'hello again', attachments: [], draft: { text: 'hello again', images: [], revision: 2 }, revision: 2 };
    await context.__realSendMessage();
    assert.deepEqual(dispatchEvents, ['before-send'], 'A failed user-message save must not emit the saved event.');
    assert.ok(context.harness.alerts.some(message => message.includes('generation_save_failed')));
}

async function assertDraftActionsAndAutoSend() {
    const context = createHarness();
    const conv = addConversation(context);
    context.harness.capture = { text: 'hello', attachments: [], draft: { text: 'hello', images: [], revision: 1 }, revision: 1 };
    setRules(context, [
        makeRule({ id: 'auto', event: 'user-message-saved', actions: [
            { id: 'd', type: 'set-draft', text: 'auto text' },
            { id: 's', type: 'send-message' }
        ] })
    ]);
    grantAll(context, true);
    await context.__realSendMessage();
    assert.equal(conv._testDraft.text, 'auto text', 'A saved-event draft action must survive the original composer clear.');
    const pending = context.__automationInternals.getPending();
    assert.equal(pending.length, 1, 'Auto-send must be queued, not started before the original turn settles.');
    assert.deepEqual(context.harness.sent, [], 'Auto-send must not preempt the original generation.');
    context.sendMessage = async () => { context.harness.sent.push('send'); return { started: true }; };
    context.state.isGenerating = true;
    context.settleAutomationAfterTurn(conv);
    assert.deepEqual(context.harness.sent, [], 'Auto-send must wait while generation is busy.');
    context.state.isGenerating = false;
    context.settleAutomationAfterTurn(conv);
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.deepEqual(context.harness.sent, ['send'], 'Auto-send must reuse the normal send flow after settlement.');

    context.cancelAutomationRuntime('reset', conv.id);
    conv._testDraft.text = 'user typed';
    conv._testDraft.revision++;
    setRules(context, [makeRule({ id: 'send-only', actions: [{ id: 's', type: 'send-message' }] })]);
    grantAll(context, true);
    await context.dispatchAutomationEvent('user-message-saved', conv, { eventId: 'send-only', role: 'user', text: 'x' });
    assert.equal(context.__automationInternals.getPending().length, 0, 'Send-only rules must not take ownership of an existing user draft.');

    conv._testDraft.text = '';
    conv._testDraft.revision++;
    setRules(context, [makeRule({ id: 'late', actions: [{ id: 's', type: 'send-message', text: 'rule text' }] })]);
    grantAll(context, true);
    await context.dispatchAutomationEvent('user-message-saved', conv, { eventId: 'late', role: 'user', text: 'x' });
    context.settleAutomationAfterTurn(conv);
    const lateDraft = context.getComposerDraft(conv);
    lateDraft.text = 'late manual text';
    lateDraft.revision++;
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.deepEqual(context.harness.sent, ['send'], 'Typing after settlement must cancel the scheduled rule send.');
    assert.equal(lateDraft.text, 'late manual text', 'Late manual input must be preserved.');
}

async function assertMvuWritesAreAuthorizedAndVersionBound() {
    const context = createHarness();
    const conv = addConversation(context, { messages: [{ id: 'm1', role: 'assistant', content: 'reply', mvuData: { stat_data: { hp: 5 } } }] });
    setRules(context, [makeRule({ id: 'mvu', event: 'user-message-saved', actions: [{ id: 'v', type: 'mvu-set', path: 'stat_data.hp', valueType: 'number', value: 9 }] })]);
    await context.dispatchAutomationEvent('user-message-saved', conv, { eventId: 'mvu-event', role: 'user', text: 'x' });
    assert.equal(context.harness.mvuReplaceCalls.length, 0, 'Unauthorized rules must not write variables.');
    assert.ok(context.getAutomationRecentRuns().some(entry => entry.ruleId === 'mvu' && entry.actions.some(action => action.type === 'mvu-set' && action.status === 'failed')));
    context.__automationInternals.setRuleGrant('mvu', 1, false);
    await context.dispatchAutomationEvent('user-message-saved', conv, { eventId: 'mvu-event-2', role: 'user', text: 'x' });
    assert.equal(context.harness.mvuReplaceCalls.length, 1, 'Authorized rules may write variables.');
    assert.equal(context.harness.mvuReplaceCalls[0].options.expectedStamp, 'stamp-conv-1', 'MVU writes must bind to the captured variable revision.');
    assert.equal(context.harness.mvuReplaceCalls[0].value.stat_data.hp, 9);
    await assert.rejects(context.runAutomationMvuWrite(makeRule({ id: 'mvu', revision: 99, actions: [{ id: 'v', type: 'mvu-set', path: 'stat_data.hp', valueType: 'number', value: 1 }] }), conv, 'user-message-saved', { path: 'stat_data.hp', valueType: 'number', value: 1 }), /automation_revision_changed/);
    const emptyConv = addConversation(context, { id: 'conv-empty', messages: [] });
    context.__automationInternals.setRuleGrant('mvu', 1, false);
    await context.runAutomationMvuWrite(context.getAutomationRuleById('mvu'), emptyConv, 'user-message-saved', { path: 'stat_data.hp', valueType: 'number', value: 9 });
    assert.ok(emptyConv.mvu && emptyConv.mvu.initial.stat_data.hp === 9, 'A new conversation must write through the initial MVU candidate.');
}

function assertDryRunAndQueueCancellation() {
    const context = createHarness();
    const conv = addConversation(context, { messages: [{ id: 'u1', role: 'user', content: 'hello world' }] });
    const rule = makeRule({ id: 'dry', event: 'user-message-saved', conditions: [{ id: 'c', source: 'event-text', op: 'contains', value: 'hello' }], actions: [{ id: 'a', type: 'mvu-set', path: 'stat_data.hp', valueType: 'number', value: 1 }] });
    setRules(context, [rule]);
    grantAll(context, false);
    const beforeRuns = context.getAutomationRecentRuns().length;
    const dryData = context.buildAutomationDryRunContext(rule);
    const evaluated = context.evaluateAutomationConditions(rule.conditions, dryData);
    assert.equal(evaluated.matched, true);
    assert.equal(context.getAutomationRecentRuns().length, beforeRuns, 'Dry-run must not dispatch events or record runs.');
    assert.equal(context.harness.mvuReplaceCalls.length, 0, 'Dry-run must not write variables.');

    context.__automationInternals.getPending().push({ conversationId: conv.id, ruleId: 'dry', revision: 1, eventName: 'user-message-saved', chain: { depth: 0, hits: {} }, at: Date.now() });
    context.cancelAutomationRuntime('switch', conv.id);
    assert.equal(context.__automationInternals.getPending().length, 0, 'Switching conversations must drop the old queue.');
}

async function assertStaleAutomationDispatchOwnership() {
    function createDispatchHarness() {
        const conv = { id: 'dispatch-conv', messages: [] };
        const messages = [{ role: 'user', content: 'stale fragment' }];
        Object.defineProperty(messages, '_automationStillCurrent', { value: () => false });
        let transportCalls = 0;
        const context = {
            console, Date, JSON, Object, Promise, setTimeout, clearTimeout,
            state: { settings: { apiEndpoint: 'https://synthetic.invalid/v1', apiKey: 'synthetic-key' }, isGenerating: false, abortController: null, _generationRuntime: null },
            appStore: { notify() {} },
            t: key => key,
            isLiveConversation: target => target === conv,
            getActiveConv: () => conv,
            fetch: async () => { transportCalls++; throw new Error('stale dispatch must not fetch'); },
            createGenerationTransport() { transportCalls++; throw new Error('stale dispatch must not create a transport'); }
        };
        vm.createContext(context);
        vm.runInContext(read('generation/50-generation-integrations.js'), context, { filename: 'generation-integrations-harness.js' });
        return { context, conv, messages, transportCalls: () => transportCalls };
    }

    const owned = createDispatchHarness();
    const ownedContext = { conversation: owned.conv, controller: { id: 'owned' } };
    owned.context.state._generationRuntime = ownedContext;
    owned.context.state.abortController = ownedContext.controller;
    owned.context.state.isGenerating = true;
    let ownedErrors = 0;
    await owned.context.streamChatWithMessages(owned.messages, () => {}, () => {}, () => { ownedErrors++; }, { generationContext: ownedContext, conversation: owned.conv });
    assert.equal(owned.transportCalls(), 0, 'A stale-fragment request must not dispatch a model request.');
    assert.equal(ownedErrors, 1, 'A stale request that owns the current runtime must report one error.');
    assert.equal(owned.context.state.isGenerating, false, 'An expired fragment must release the generation lock it still owns.');
    assert.equal(owned.context.state._generationRuntime, null);
    assert.equal(owned.context.state.abortController, null);

    const stale = createDispatchHarness();
    const oldContext = { conversation: stale.conv, controller: { id: 'old' } };
    const newerContext = { conversation: stale.conv, controller: { id: 'newer' } };
    stale.context.state._generationRuntime = newerContext;
    stale.context.state.abortController = newerContext.controller;
    stale.context.state.isGenerating = true;
    let staleErrors = 0;
    await stale.context.streamChatWithMessages(stale.messages, () => {}, () => {}, () => {
        staleErrors++;
        stale.context.state.isGenerating = false;
    }, { generationContext: oldContext, conversation: stale.conv });
    assert.equal(stale.transportCalls(), 0, 'An old rejected fragment must not dispatch a model request.');
    assert.equal(staleErrors, 0, 'An old rejected fragment must not call its error callback.');
    assert.equal(stale.context.state.isGenerating, true, 'An old rejected fragment must not release the newer generation lock.');
    assert.equal(stale.context.state._generationRuntime, newerContext, 'An old rejected fragment must not replace the newer runtime context.');
    assert.equal(stale.context.state.abortController, newerContext.controller, 'An old rejected fragment must not clear the newer abort controller.');
}

async function assertLoopAndRuleRevisionProtection() {
    const context = createHarness();
    const conv = addConversation(context);
    setRules(context, [makeRule({ id: 'loop', event: 'assistant-message-saved', actions: [{ id: 'a', type: 'append-draft', text: 'loop' }] })]);
    grantAll(context, false);
    context.__automationInternals.setChain({ depth: 1, hits: { loop: 1 } });
    await context.dispatchAutomationEvent('assistant-message-saved', conv, { eventId: 'loop-event', role: 'assistant', text: 'x' });
    context.__automationInternals.setChain(null);
    assert.equal(conv._testDraft ? conv._testDraft.text : '', '', 'Causal chain hits must block the same rule from running again.');
    assert.ok(context.getAutomationRecentRuns().some(entry => entry.ruleId === 'loop' && entry.status === 'skipped'));
    const rule = context.getAutomationRuleById('loop');
    rule.revision = 2;
    await assert.rejects(context.runAutomationMvuWrite(makeRule({ id: 'loop', revision: 1, actions: [{ id: 'v', type: 'mvu-set', path: 'stat_data.hp', valueType: 'number', value: 1 }] }), conv, 'assistant-message-saved', { path: 'stat_data.hp', valueType: 'number', value: 1 }), /automation_revision_changed|automation_mvu_unauthorized/);
}

async function assertGroupPriorityGuard() {
    const context = createHarness();
    const conv = addConversation(context, {
        group: { members: [{ character: { name: 'Alice' }, order: 0 }, { character: { name: 'Bob' }, order: 1 }] }
    });
    setRules(context, [makeRule({ id: 'group-send', event: 'user-message-saved', actions: [{ id: 'a', type: 'send-message', text: 'group' }] })]);
    grantAll(context, true);
    context.harness.groupAutoActive = true;
    await context.dispatchAutomationEvent('user-message-saved', conv, { eventId: 'group-event', role: 'user', text: 'x' });
    assert.equal(context.__automationInternals.getPending().length, 0, 'Automation sends must not queue during group auto rounds.');
    assert.ok(context.getAutomationRecentRuns().some(entry => entry.ruleId === 'group-send' && entry.actions.some(action => action.status === 'failed')));
}

async function assertCausalChainAndMvuSerialization() {
    const context = createHarness();
    const conv = addConversation(context, { messages: [{ id: 'm1', role: 'assistant', content: 'reply', mvuData: { stat_data: { hp: 5 } } }] });
    setRules(context, [makeRule({ id: 'chain-rule', event: 'assistant-message-saved', actions: [{ id: 'a', type: 'send-message', text: 'chained' }] })]);
    grantAll(context, true);
    context.state._generationRuntime = {
        conversation: conv,
        operation: { isCurrent: () => true },
        automationChain: { depth: 1, hits: { 'chain-rule': 1 }, steps: 1 }
    };
    await context.dispatchAutomationEvent('assistant-message-saved', conv, { eventId: 'chain-event', role: 'assistant', text: 'x' });
    context.state._generationRuntime = null;
    assert.equal(context.__automationInternals.getPending().length, 0, 'The same rule must not restart a new root inside one generation chain.');
    assert.ok(context.getAutomationRecentRuns().some(entry => entry.ruleId === 'chain-rule' && entry.status === 'skipped'));

    context.state._generationRuntime = {
        conversation: conv,
        operation: { isCurrent: () => true },
        automationChain: { depth: 2, hits: { other: 1 }, steps: 2 }
    };
    setRules(context, [makeRule({ id: 'depth-rule', event: 'assistant-message-saved', actions: [{ id: 'a', type: 'send-message', text: 'too deep' }] })]);
    grantAll(context, true);
    await context.dispatchAutomationEvent('assistant-message-saved', conv, { eventId: 'depth-event', role: 'assistant', text: 'x' });
    context.state._generationRuntime = null;
    assert.equal(context.__automationInternals.getPending().length, 0, 'The causal chain depth must bound the whole lineage.');

    const serialContext = createHarness();
    const serialConv = addConversation(serialContext, { messages: [{ id: 'm1', role: 'assistant', content: 'reply', mvuData: { stat_data: { hp: 5 } } }] });
    let active = 0, maxActive = 0;
    serialContext.replaceMvuDataForMessage = async () => {
        serialContext.harness.mvuReplaceCalls.push({});
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise(resolve => setTimeout(resolve, 5));
        active--;
    };
    setRules(serialContext, [makeRule({ id: 'serial', event: 'user-message-saved', actions: [
        { id: 'a', type: 'mvu-set', path: 'stat_data.hp', valueType: 'number', value: 1 },
        { id: 'b', type: 'mvu-set', path: 'stat_data.mp', valueType: 'number', value: 2 }
    ] })]);
    grantAll(serialContext, false);
    await serialContext.dispatchAutomationEvent('user-message-saved', serialConv, { eventId: 'serial-event', role: 'user', text: 'x' });
    assert.equal(maxActive, 1, 'Sequential MVU actions in one rule must not write the same baseline concurrently.');
    assert.equal(serialContext.harness.mvuReplaceCalls.length, 2);
}

async function assertReworkRegressions() {
    const context = createHarness();
    const initial = { stat_data: { bag: [{ name: 'first', count: 1 }, { name: 'second', count: 2 }] } };
    const output = context.writeAutomationMvuValue(initial, 'stat_data.bag.0.count', 7);
    assert.ok(Array.isArray(output.stat_data.bag), 'Existing MVU arrays must keep their shape.');
    assert.equal(output.stat_data.bag[0].name, 'first');
    assert.equal(output.stat_data.bag[0].count, 7);
    assert.equal(output.stat_data.bag[1].count, 2);
    assert.equal(initial.stat_data.bag[0].count, 1, 'MVU writes must not mutate the captured source.');
    for (const [valueType, value, op] of [['number', 7, 'contains'], ['boolean', true, 'gt'], ['string', 'word', 'gte']]) {
        assert.throws(() => context.validateAutomationRule(makeRule({ conditions: [
            { id: 'typed', source: 'mvu', path: 'stat_data.value', valueType, value, op }
        ] })), /automation_conditions_invalid/, 'Condition operators must match the chosen primitive type.');
    }

    const draftContext = createHarness();
    const draftConv = addConversation(draftContext);
    draftContext.getComposerDraft(draftConv).text = 'actual unsent text';
    draftContext.getComposerDraft(draftConv).revision++;
    setRules(draftContext, [makeRule({ actions: [{ id: 'd', type: 'set-draft', text: 'automatic suggestion' }] })]);
    grantAll(draftContext, false);
    await draftContext.dispatchAutomationEvent('user-message-saved', draftConv, { eventId: 'draft-ownership' });
    assert.equal(draftContext.getComposerDraft(draftConv).text, 'actual unsent text', 'Saved-event draft actions must not overwrite manual typing.');

    const chainContext = createHarness();
    const chainConv = addConversation(chainContext);
    setRules(chainContext, [makeRule({ actions: [{ id: 'send', type: 'send-message', text: 'bounded follow-up' }] })]);
    grantAll(chainContext, true);
    const sendCalls = [];
    chainContext.sendMessage = async options => { sendCalls.push(options); return { started: true }; };
    await chainContext.dispatchAutomationEvent('user-message-saved', chainConv, { eventId: 'causal-propagation' });
    chainContext.settleAutomationAfterTurn(chainConv);
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(sendCalls.length, 1);
    assert.ok(sendCalls[0] && sendCalls[0].automationChain && sendCalls[0].automationChain.hits['rule-1'],
        'The scheduled send must pass the generating rule chain into the real send entry.');

    const expiredContext = createHarness();
    const expiredConv = addConversation(expiredContext, { messages: [{ id: 'a', role: 'assistant', content: 'saved reply' }] });
    setRules(expiredContext, [makeRule({ actions: [{ id: 'mvu', type: 'mvu-set', path: 'stat_data.hp', valueType: 'number', value: 7 }] })]);
    grantAll(expiredContext, false);
    expiredContext.AUTOMATION_MVU_WRITE_TIMEOUT_MS = 5;
    let capturedValidate, release;
    expiredContext.replaceMvuDataForMessage = async (_conv, _message, _value, options) => {
        capturedValidate = options.validate;
        await new Promise(resolve => { release = resolve; });
    };
    await expiredContext.dispatchAutomationEvent('user-message-saved', expiredConv, { eventId: 'expired-write' });
    try { assert.equal(capturedValidate(), false, 'A bounded-out MVU action must revoke the commit predicate.'); }
    finally { release(); await new Promise(resolve => setTimeout(resolve, 0)); }
}

async function assertFailedCandidateRetryKeepsBaseline() {
    const context = createHarness();
    const conv = addConversation(context);
    setRules(context, []);
    const baseline = context.getAutomationRulesSnapshot();
    context.harness.failPersist = true;
    await assert.rejects(context.saveAutomationRulesChange(candidate => {
        candidate.automationRules.push(makeRule({ id: 'saved-rule' }));
    }), /persist-failure/);
    assert.ok(context.failedAutomationDraft, 'A failed save must keep a retryable draft.');
    const draft = context.failedAutomationDraft;
    context.harness.failPersist = false;
    context.state.settings.automationRules = [makeRule({ id: 'concurrent-rule', name: 'concurrent' })];
    context.state.settings.automationRuleGrants = {};
    context.state.settings.automationSendGrants = {};
    context.failedAutomationDraft = null;
    await assert.rejects(context.saveAutomationRulesChange(candidate => {
        candidate.automationRules = clone(draft.candidate.automationRules);
        candidate.automationRuleGrants = clone(draft.candidate.automationRuleGrants);
        candidate.automationSendGrants = clone(draft.candidate.automationSendGrants);
    }, { baseline: baseline }), /automation_settings_changed/);
    assert.equal(context.state.settings.automationRules[0].id, 'concurrent-rule', 'A failed retry must not overwrite a concurrent successful definition.');
}

async function assertGenerationHookOrder() {
    const context = createHarness();
    const conv = addConversation(context);
    context.state.isGenerating = true;
    context.harness.order.length = 0;
    const realDispatch = context.dispatchAutomationEvent;
    context.dispatchAutomationEvent = function(eventName) {
        context.harness.order.push('dispatch:' + eventName);
        return realDispatch.apply(null, arguments);
    };
    setRules(context, [makeRule({ id: 'assistant', event: 'assistant-message-saved', actions: [{ id: 'a', type: 'append-draft', text: 'draft' }] })]);
    grantAll(context, false);
    context.finishAssistantMessage = async () => ({ id: 'main-1', content: 'reply text', stage: 'main' });
    context.state.settings.twoStageEnabled = false;
    await context.handlePrimaryAssistantComplete('reply text', '', null, conv, null, null);
    const dispatchIndex = context.harness.order.indexOf('dispatch:assistant-message-saved');
    assert.ok(dispatchIndex >= 0, 'Assistant saves must emit the saved event.');
    assert.ok(context.harness.order.indexOf('second-stage') < 0);
    context.harness.order.length = 0;
    context.completeGenerationTurn(conv, null);
    assert.ok(context.harness.order.indexOf('group-rounds') < context.harness.order.indexOf('settle'), 'Automation sends must settle after group auto rounds.');
}

await assertRuleModelAndValidation();
assertImportAndExport();
assertConditions();
await assertSixEventsAndDedupe();
await assertBeforeSendBlockAndFragments();
await assertSendMessageIntegration();
await assertDraftActionsAndAutoSend();
await assertMvuWritesAreAuthorizedAndVersionBound();
assertDryRunAndQueueCancellation();
await assertStaleAutomationDispatchOwnership();
await assertLoopAndRuleRevisionProtection();
await assertGroupPriorityGuard();
await assertCausalChainAndMvuSerialization();
await assertReworkRegressions();
await assertFailedCandidateRetryKeepsBaseline();
await assertGenerationHookOrder();

console.log('Tavern stage C1 runtime passed: rule model, strict input validation, content-bound grants, declarative conditions, six events, dedupe, before-send block/fragments/attachments, real composer clearing, send ownership, stale-dispatch runtime ownership, causal chain bounds, serialized MVU writes, group priority, MVU authorization/version binding, dry-run, loop limits, queue cancellation and failed-candidate baseline.');
