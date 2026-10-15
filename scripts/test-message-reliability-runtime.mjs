import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { performance } from 'node:perf_hooks';

const source = (name) => fs.readFileSync(new URL(`../src/app/${name}`, import.meta.url), 'utf8');
const copy = (value) => JSON.parse(JSON.stringify(value));
const files = [
    'conversation/32-message-identity.js', 'conversation/32-response-versions.js', 'state/35-persist-records.js', 'state/35-state-persistence.js', 'state/35-persist-snapshot-helpers.js',
    'state/35-conversation-mutation-persistence.js', 'summary/41-summary-validity.js',
    'prompt/41-prompt-history-messages.js', 'summary/54-summarization-runtime.js',
    'summary/54-summarization-auto-threshold.js', 'summary/54-summarization-auto-selection.js',
    'summary/54-summarization-auto-runtime.js', 'generation/52-generation-message-lifecycle.js',
    'prompt/41-second-stage-message-lookup.js', 'generation/50-generation-transport-module.js', 'generation/50-generation-integrations.js',
    'generation/52-generation-runtime.js', 'generation/52-generation-second-stage-runtime.js',
    'chat/67-message-action-helpers.js', 'chat/67-message-edit-helpers.js',
    'chat/67-message-actions-ui.js', 'chat/67-message-regeneration-runtime.js'
];

function harness(messages = [
    { role: 'user', content: 'Question' },
    { id: 'main', role: 'assistant', content: 'Original', cot: 'Old reasoning', speaker: 'Alice', usage: { completionTokens: 4 }, extension: { keep: true } },
    { id: 'second', role: 'assistant', stage: 'second', parentId: 'main', content: '<options>original</options>' }
], sourceOverrides = {}) {
    let id = 0;
    const streams = [], summaries = [], alerts = [], writes = [], bubbles = [];
    const conv = { id: 'a', messages: copy(messages), summaries: [], updated: 1 };
    const ctx = {
        console: { ...console, error() {} },
        setTimeout, clearTimeout, AbortController,
        state: { conversations: { a: conv }, conversationOrder: ['a'], activeConvId: 'a', settings: { contextLength: 100, summaryEnabled: false }, isGenerating: false },
        appStore: { notify() {} }, dom: {},
        document: { getElementById: () => null },
        makeId: () => `generated-${++id}`, t: (key) => key,
        defaultAuthorNote: () => ({ enabled: false, content: '', role: 'system', position: 'in_chat', depth: 4, interval: 1 }),
        alert: (message) => alerts.push(message),
        renderMessagesOnly() {}, renderTokenBar() {}, updateInputState() {},
        removeGenerationStreamingBubble(stage) { bubbles.push(stage); }, updateStreamingBubble() {},
        appendFinalAssistantMessage() {},
        isGroupChat: () => false,
        getCurrentGeneratingSpeakerName: () => 'Alice',
        isolatePrimaryStageContent: (value) => value,
        buildMessagesForAPI: (value) => value.messages.map(copy),
        buildMessagesForSecondStage: (_first, value) => value.messages.map(copy),
        capturePromptBuildSource(target) {
            return { conversation: target, conversationId: target.id, messages: target.messages.map((message) => ({ id: message.id, revision: ctx.getMessageRevision(message) })) };
        },
        isPromptBuildSourceCurrent(source) {
            if (!source || !source.conversation || source.conversation.id !== source.conversationId) return false;
            return source.conversation.messages.length === source.messages.length && source.messages.every((message, index) => {
                const current = source.conversation.messages[index] || {};
                return current.id === message.id && ctx.getMessageRevision(current) === message.revision;
            });
        },
        DEFAULT_TWO_STAGE_PROMPT: 'options',
        normalizeSecondStageOptions: (value) => typeof value === 'string' && /^<options>.+<\/options>$/.test(value) ? value : '',
        buildSecondStageCorrectionMessages: (messages) => messages.concat([{ role: 'user', content: 'RETRY_INVALID_FORMAT' }]),
        streamChatWithMessages(messages, onToken, onComplete, onError, options = {}) {
            ctx.state.isGenerating = true;
            const completion = {};
            if (options.generationContext) Object.defineProperty(completion, '_generationRuntime', { value: options.generationContext });
            streams.push({
                messages: copy(messages),
                onToken,
                onComplete: (content, cot, usage, metadata = completion) => {
                    if (options.generationContext && !Object.prototype.hasOwnProperty.call(metadata, '_generationRuntime')) {
                        Object.defineProperty(metadata, '_generationRuntime', { value: options.generationContext });
                    }
                    return onComplete(content, cot, usage, metadata);
                },
                onError,
                options,
                settings: copy(options.settings || ctx.state.settings),
                runtime: options.generationContext || null,
            });
        },
        generateSummary(messages, callback) { summaries.push({ messages: copy(messages), callback }); },
        getSafeSettingsForPersist: () => copy(ctx.state.settings),
        getCloudSyncPortableSettings: (value) => copy(value),
        getConversationIdsWithMissingFallback: (order, conversations) => [...new Set([...order, ...Object.keys(conversations)])].filter((key) => conversations[key]),
        getValidConversationIdOrFallback: (active, order, conversations) => conversations[active] ? active : order.find((key) => conversations[key]),
        scheduleCloudSyncUpload() { ctx.uploads++; },
        uploads: 0,
        saveMode: 'ok',
        StorageService: {
            _cloneForPersist: copy,
            async saveAll(snapshot) {
                writes.push(copy(snapshot));
                if (ctx.saveMode === 'fail') throw new Error('quota failure');
                if (ctx.saveMode === 'refused') return { refusedEmpty: true };
                if (ctx.saveMode === 'landed-pending') {
                    ctx.durable = copy(snapshot);
                    await new Promise((resolve, reject) => { ctx.resolveSave = resolve; ctx.rejectSave = reject; });
                    return;
                }
                if (ctx.saveMode === 'pending') await new Promise((resolve, reject) => { ctx.resolveSave = resolve; ctx.rejectSave = reject; });
                ctx.durable = copy(snapshot);
            }
        }
    };
    const streamStub = ctx.streamChatWithMessages;
    vm.createContext(ctx);
    files.forEach((file) => vm.runInContext(sourceOverrides[file] || source(file), ctx, { filename: file }));
    ctx.streamChatWithMessages = streamStub;
    ctx.normalizeConversationMessageIdentity(conv);
    ctx.rememberCloudSyncConversationBaseline();
    return { ctx, conv, streams, summaries, alerts, writes, bubbles };
}

function verified(ctx, conv, start, end) {
    const regular = ctx.getSummaryRegularMessages(conv);
    return { id: `summary-${start}-${end}`, text: 'Summary', summaryVersion: 2, coveredStart: start, coveredEnd: end, sourceMessages: ctx.captureSummarySources(regular.slice(start, end + 1)) };
}

async function flush(ctx) {
    await new Promise((resolve) => setImmediate(resolve));
    if (ctx._persistTimeout) {
        clearTimeout(ctx._persistTimeout);
        ctx._persistTimeout = null;
    }
    await ctx._persistWriteChain;
}

async function waitFor(predicate, message) {
    const deadline = Date.now() + 2000;
    while (!predicate() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 5));
    assert.ok(predicate(), message);
}

function completionMetadata(values, generationContext) {
    const completion = { ...values };
    Object.defineProperty(completion, '_generationRuntime', { value: generationContext });
    return completion;
}

function startGeneration(ctx, conv) {
    let resolveAck, rejectAck;
    const acknowledged = new Promise((resolve, reject) => { resolveAck = resolve; rejectAck = reject; });
    const stream = ctx.streamChat(() => {}, (content, cot, usage, completion) => {
        Promise.resolve(ctx.handlePrimaryAssistantComplete(content, cot, usage, conv, completion)).then(resolveAck, rejectAck);
    }, rejectAck, conv);
    return { acknowledged, stream };
}

function beginAckRace({ ctx, conv, streams, summaries }, kind) {
    let completion;
    if (kind === 'summary') {
        assert.equal(ctx.performSummarization(conv.messages.slice(0, 2), 0, 1, (error) => { completion = error; }), true);
        return { respond: () => summaries[0].callback(null, 'Late summary'), error: () => completion };
    }
    if (kind === 'main') ctx.regenerateMessage(1);
    else {
        ctx.state.settings.twoStageIncludeRecentContext = true;
        ctx.runSecondStageGeneration(conv.messages[1], (error) => { completion = error; }, kind === 'options' ? conv.messages[2] : null);
    }
    return {
        respond: () => streams[0].onComplete(kind === 'main' ? 'Late candidate' : '<options>late candidate</options>', '', null, {}),
        error: () => completion
    };
}

function containsLateCandidate(snapshot, kind) {
    const conv = snapshot.conversations && snapshot.conversations.a;
    if (!conv) return false;
    return kind === 'summary'
        ? (conv.summaries || []).some((summary) => summary.text === 'Late summary')
        : conv.messages.some((message) => message.content === (kind === 'main' ? 'Late candidate' : '<options>late candidate</options>'));
}

function applyAckRaceChange(ctx, conv, pristine, change) {
    if (change === 'removed') {
        delete ctx.state.conversations.a;
        ctx.state.conversationOrder = ['b'];
        ctx.state.activeConvId = 'b';
    } else if (change === 'replaced') {
        const remote = copy(pristine);
        remote.messages[1].content = 'Legitimate remote answer';
        remote.updated = 700;
        ctx.normalizeConversationMessageIdentity(remote);
        ctx.state.conversations.a = remote;
    } else {
        conv.messages[0].content = 'User source edited during save';
        conv.updated = 800;
        ctx.normalizeConversationMessageIdentity(conv);
    }
}

function addAckRaceOtherConversation(ctx) {
    ctx.state.conversations.b = { id: 'b', messages: [{ id: 'b-user', role: 'user', content: 'Unrelated chat' }], summaries: [] };
    ctx.state.conversationOrder.push('b');
    ctx.rememberCloudSyncConversationBaseline();
}

function storageHarness(previous) {
    const canonicalWrites = [], localWrites = [], protectedMirrors = [], markerWrites = [];
    const localData = new Map();
    let canonical = copy(previous);
    const staleBackends = [
        { backend: 'opfs', data: copy(previous) },
        { backend: 'legacy-idb', data: { ...copy(previous), lastSaved: previous.lastSaved - 1 } },
    ];
    const ctx = {
        console: { ...console, warn() {}, error() {} },
        setTimeout: () => 0,
        failMarkerWrites: false,
        localStorage: {
            getItem(key) { return localData.get(key) || null; },
            setItem(key, value) {
                if (key === ctx.STORAGE_CLEAR_KEY) {
                    if (ctx.failMarkerWrites) throw new Error('Clear marker write failed');
                    markerWrites.push(String(value));
                }
                if (key === ctx.STORAGE_KEY) localWrites.push(JSON.parse(value));
                localData.set(key, String(value));
            },
            removeItem(key) { localData.delete(key); },
        },
        IDBStorage: { async saveAll(snapshot) { canonicalWrites.push(copy(snapshot)); canonical = copy(snapshot); } },
    };
    vm.createContext(ctx);
    for (const file of ['storage/20-storage.js', 'storage/20-storage-service-helpers.js', 'storage/20-storage-service-save-helpers.js', 'storage/20-storage-service-save-canonical.js', 'storage/20-storage-service-local-api.js', 'storage/20-storage-service-save.js']) {
        vm.runInContext(source(file), ctx, { filename: file });
    }
    localData.set(ctx.STORAGE_KEY, JSON.stringify(previous));
    const service = {
        ...ctx.createStorageServiceLocalSnapshotAPI(),
        _cloneForPersist: ctx.storageCloneForPersist,
        _isDangerouslyEmptySnapshot: ctx.isDangerouslyEmptyStorageSnapshot,
        _hasUserData: ctx.storageHasUserData,
        _isValidSnapshot: ctx.storageIsValidSnapshot,
        _snapshotTime: ctx.storageSnapshotTime,
        _idbAvailable: true,
        _opfsMirrorAvailable: false,
        _lastSaveSnapshot: copy(previous),
        async _readNewestStoredSnapshotNoSync() {
            return this._pickNewest([
                { backend: 'idb', data: copy(canonical) },
                { backend: 'localStorage', data: this._readLocalSnapshot() },
                ...staleBackends.map(copy),
            ]);
        },
        _saveLocalHistorySnapshot() {},
        async _syncSnapshotToAvailableBackends(snapshot) { protectedMirrors.push(copy(snapshot)); },
    };
    service.saveAll = (snapshot, options) => ctx.saveStorageServiceData(service, snapshot, options);
    return { ctx, service, canonicalWrites, localWrites, protectedMirrors, markerWrites };
}

// Deterministic old-data migration, distinct revisions, duplicate identities and unknown fields.
{
    const { ctx, conv } = harness();
    const a = copy(conv), b = copy(conv);
    delete a.messages[0].id; delete b.messages[0].id;
    ctx.normalizeConversationMessageIdentity(a); ctx.normalizeConversationMessageIdentity(b);
    assert.deepEqual(a, b);
    const once = copy(a); ctx.normalizeConversationMessageIdentity(a); assert.deepEqual(a, once);
    const oldRevision = a.messages[0].revision;
    a.messages[0].content += ' changed'; ctx.normalizeConversationMessageIdentity(a);
    assert.notEqual(a.messages[0].revision, oldRevision);
    assert.equal(a.messages[0].id, once.messages[0].id);
    const duplicates = { id: 'd', messages: [{ id: 'x', role: 'assistant', content: 'one' }, { id: 'x', role: 'assistant', content: 'two' }, { id: 's', role: 'assistant', stage: 'second', parentId: 'x', content: 'linked' }], summaries: [{ text: 'old', summaryVersion: 2, sourceMessages: [{ id: 'x', revision: 'x' }, { id: 's', revision: 's' }] }] };
    ctx.normalizeConversationMessageIdentity(duplicates);
    assert.equal(new Set(duplicates.messages.map((m) => m.id)).size, 3);
    assert.equal(duplicates.messages[2].parentId, duplicates.messages[1].id);
    assert.equal(duplicates.summaries[0].sourceAmbiguous, true);
    assert.equal(ctx.getSummaryValidity(duplicates.summaries[0], duplicates), 'invalid');
}

// Coverage is derived from actual unchanged sources, never from persisted labels or numbers.
{
    const { ctx, conv } = harness(Array.from({ length: 12 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `m${i}` })));
    conv.summaries = [verified(ctx, conv, 2, 5), verified(ctx, conv, 4, 7), { text: 'Legacy', coveredStart: 0, coveredEnd: 11, validity: 'valid' }];
    assert.equal(ctx.getRegularPromptMessages(conv).map((m) => m.content).join(','), 'm0,m1,m8,m9,m10,m11');
    assert.equal(ctx.getSummaryValidity(conv.summaries[2], conv), 'unverified');
    ctx.applyMessageEditContent(conv, 3, 'm3', 'Edited');
    assert.equal(ctx.getSummaryValidity(conv.summaries[0], conv), 'invalid');
    assert.equal(ctx.getSummaryValidity(conv.summaries[1], conv), 'valid');
    assert.equal(ctx.getRegularPromptMessages(conv).map((m) => m.content).join(','), 'm0,m1,m2,Edited,m8,m9,m10,m11');
    conv.messages.splice(0, 1);
    assert.equal(ctx.getSummaryValidity(conv.summaries[1], conv), 'valid', 'Deleting before a range must not cover a different message.');
    conv.messages.splice(5, 0, { id: 'inserted', role: 'user', content: 'New source' });
    assert.equal(ctx.getSummaryValidity(conv.summaries[1], conv), 'invalid');
    const remaining = conv.messages.length;
    ctx.getValidConversationSummaries(conv);
    assert.equal(conv.messages.length, remaining, 'Validity checks never delete raw history.');
}

// Summary requests bind to their origin, freeze input, reject illegal sources and remain locked until save.
for (const outcome of ['success', 'edited', 'removed', 'replaced', 'empty', 'network', 'fail', 'refused']) {
    const { ctx, conv, summaries } = harness();
    const subset = conv.messages.slice(0, 2);
    let completion;
    assert.equal(ctx.performSummarization(subset, 0, 1, (error) => { completion = error; }), true);
    let duplicate;
    ctx.performSummarization(subset, 0, 1, (error) => { duplicate = error; });
    assert.ok(duplicate); assert.equal(summaries.length, 1);
    if (outcome === 'edited') ctx.applyMessageEditContent(conv, 0, 'Question', 'changed');
    if (outcome === 'removed') delete ctx.state.conversations.a;
    if (outcome === 'replaced') ctx.state.conversations.a = copy(conv);
    if (['fail', 'refused'].includes(outcome)) ctx.saveMode = outcome;
    const other = { id: 'b', messages: [], summaries: [] };
    ctx.state.conversations.b = other; ctx.state.activeConvId = 'b';
    await summaries[0].callback(outcome === 'network' ? new Error('HTTP 500') : null, outcome === 'empty' ? '' : 'Valid result');
    assert.equal(other.summaries.length, 0);
    assert.equal(summaries[0].messages[0].content, 'Question');
    if (outcome === 'success') {
        assert.equal(completion, null); assert.equal(conv.summaries.length, 1);
        assert.equal(ctx.getSummaryValidity(conv.summaries[0], conv), 'valid');
        assert.equal(ctx.durable.conversations.a.summaries.length, 1);
    } else {
        assert.ok(completion, outcome);
        if (ctx.state.conversations.a === conv) assert.equal(conv.summaries.length, 0, outcome);
        assert.equal(ctx.uploads, 0, 'Rejected summaries must not enqueue upload.');
    }
    await flush(ctx);
}
{
    const { ctx, conv, summaries } = harness();
    for (const [subset, start, end] of [[conv.messages, -1, 1], [conv.messages, 0.5, 1], [conv.messages, 0, 9], [[], 0, 1], [[{ role: 'user', content: 'different' }, conv.messages[1]], 0, 1]]) {
        let error; assert.equal(ctx.performSummarization(subset, start, end, (e) => { error = e; }), false); assert.ok(error);
    }
    assert.equal(summaries.length, 0);
    ctx.saveMode = 'pending';
    let completion;
    ctx.performSummarization(conv.messages.slice(0, 2), 0, 1, (e) => { completion = e; });
    const pending = summaries[0].callback(null, 'Pending write');
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(completion, undefined);
    let busy; ctx.performSummarization(conv.messages.slice(0, 2), 0, 1, (e) => { busy = e; });
    assert.ok(busy); assert.equal(summaries.length, 1);
    ctx.saveMode = 'ok'; ctx.resolveSave(); await pending;
    assert.equal(completion, null);
    await summaries[0].callback(null, 'Duplicate callback');
    assert.equal(conv.summaries.length, 1);
    await flush(ctx);
}

// Regeneration must leave old data intact until validation and durable write succeed.
for (const outcome of ['network', 'empty', 'fail', 'refused', 'interrupted', 'length', 'content_filter', 'edited', 'removed', 'replaced', 'success']) {
    const { ctx, conv, streams, alerts } = harness();
    const before = copy(conv.messages);
    ctx.regenerateMessage(1);
    assert.deepEqual(copy(conv.messages), before, 'Request start must not delete primary or second-stage data.');
    assert.equal(streams[0].messages.length, 1, 'Regeneration excludes the old response only in its request copy.');
    if (outcome === 'network') streams[0].onError(new Error('HTTP 500'));
    else {
        if (['fail', 'refused'].includes(outcome)) ctx.saveMode = outcome;
        if (outcome === 'edited') ctx.applyMessageEditContent(conv, 0, 'Question', 'Edited question');
        if (outcome === 'removed') delete ctx.state.conversations.a;
        if (outcome === 'replaced') ctx.state.conversations.a = copy(conv);
        ctx.state.conversations.b = { id: 'b', messages: [], summaries: [] };
        ctx.state.activeConvId = 'b';
        const completion = ['interrupted', 'length', 'content_filter'].includes(outcome)
            ? { interrupted: true, finishReason: outcome === 'interrupted' ? null : outcome, completionReason: outcome }
            : {};
        await streams[0].onComplete(outcome === 'empty' ? '' : 'New response', 'New reasoning', { completionTokens: 9 }, completion);
        assert.equal(ctx.state.conversations.b.messages.length, 0, 'A late reply cannot write into the active different conversation.');
    }
    if (outcome === 'success') {
        assert.equal(conv.messages[1].content, 'New response');
        assert.equal(conv.messages.length, 2, 'Old second-stage data must not masquerade as options for new main content.');
        assert.equal(ctx.getResponseVersions(conv.messages[1]).length, 2);
        assert.equal(ctx.durable.conversations.a.messages[1].content, 'New response');
        const reloaded = copy(ctx.durable.conversations.a);
        ctx.state.conversations.a = reloaded; ctx.state.activeConvId = 'a';
        await ctx.switchResponseVersion(1, -1);
        assert.equal(reloaded.messages[1].content, 'Original');
        assert.equal(reloaded.messages[1].cot, 'Old reasoning');
        assert.equal(reloaded.messages[1].speaker, 'Alice');
        assert.equal(reloaded.messages[1].usage.completionTokens, 4);
        assert.equal(reloaded.messages[2].content, '<options>original</options>');
        assert.deepEqual(copy(reloaded.messages[1].extension), { keep: true });
        ctx.applyMessageEditContent(reloaded, 1, 'Original', 'Edited version');
        assert.equal(ctx.getResponseVersions(reloaded.messages[1]).length, 3, 'Editing an existing version must not destroy that version.');
        await ctx.switchResponseVersion(1, -2);
        assert.equal(reloaded.messages[1].content, 'Original');
    } else if (['interrupted', 'length', 'content_filter'].includes(outcome)) {
        assert.equal(conv.messages[1].content, 'Original'); assert.equal(conv.messages[2].content, before[2].content);
        assert.equal(ctx.getResponseVersions(conv.messages[1])[1].interrupted, true);
        if (outcome !== 'interrupted') assert.ok(alerts.some((message) => message.includes(outcome)), `${outcome}: the preserved incomplete reason must remain understandable.`);
    } else {
        assert.equal(conv.messages[1].content, 'Original'); assert.equal(conv.messages[2].content, before[2].content);
        assert.equal(ctx.getResponseVersions(conv.messages[1]).length, 0);
        assert.equal(ctx.uploads, 0);
    }
    await flush(ctx);
}

// Failed candidate cannot be resurrected by a later settings snapshot waiting in the serialized queue.
{
    const { ctx, conv, streams, writes } = harness();
    ctx.regenerateMessage(1); ctx.saveMode = 'pending';
    const operation = streams[0].onComplete('Candidate', '', null, {});
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(conv.messages[1].content, 'Original', 'Unacknowledged candidates must not enter the rendered or prompt history.');
    assert.equal(ctx.getActiveConv().messages[2].content, '<options>original</options>');
    assert.equal(writes[0].conversations.a._messageCommitInProgress, undefined);
    ctx.state.settings.language = 'en';
    const later = ctx.persistState(true);
    ctx.saveMode = 'ok'; ctx.rejectSave(new Error('quota'));
    await operation; await later;
    assert.equal(conv.messages[1].content, 'Original');
    assert.equal(ctx.durable.conversations.a.messages[1].content, 'Original');
    assert.equal(writes[1].conversations.a.messages[2].content, '<options>original</options>');
    assert.equal(ctx.durable.settings.language, 'en');
    assert.equal(ctx.uploads, 1, 'Only the later durable language change should schedule an upload, with the original response restored.');
    await flush(ctx);
}

// A slow successful write commits both the live response and later captured snapshots.
{
    const { ctx, conv, streams, alerts } = harness();
    const regenerationErrors = [];
    const reportRegenerationError = ctx.handlePrimaryRegenerationError;
    ctx.handlePrimaryRegenerationError = (error, generationContext) => {
        regenerationErrors.push(error);
        return reportRegenerationError(error, generationContext);
    };
    ctx.regenerateMessage(1); ctx.saveMode = 'pending';
    assert.equal(ctx.isGenerationRuntimeOwned(streams[0].options.generationContext), true, 'The active regeneration runtime must own its request.');
    assert.equal(streams[0].options.promptBuildOperation.isCurrent(), true, 'The active regeneration operation must remain current.');
    const operation = streams[0].onComplete('Durable candidate', '', null, {});
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(conv.messages[1].content, 'Original');
    conv.updated = 987654321;
    ctx.state.settings.language = 'en';
    const later = ctx.persistState(true);
    ctx.saveMode = 'ok'; ctx.resolveSave(); await operation; await later;
    assert.deepEqual(regenerationErrors.map((error) => error && error.message), [], `Unexpected regeneration failure: ${alerts.join('|')}`);
    assert.equal(conv.messages[1].content, 'Durable candidate');
    assert.equal(ctx.durable.conversations.a.messages[1].content, 'Durable candidate');
    assert.equal(ctx.durable.conversations.a.updated, 987654321, 'Later unrelated updates must retain their timestamp.');
    await flush(ctx);
}

// Reproduce the pre-fix ACK regression in an isolated VM without modifying production files.
{
    const persistence = source('state/35-state-persistence.js');
    const start = persistence.indexOf('                // A late result may already be durable');
    const end = persistence.indexOf('                if (options.cloudSyncEncryptionDisableTransaction)', start);
    assert.ok(start >= 0 && end > start, 'The regression fixture must remove only the late-write correction block.');
    const previousBehavior = persistence.slice(0, start) + persistence.slice(end);
    const test = harness(undefined, { 'state/35-state-persistence.js': previousBehavior });
    const { ctx, conv, writes, alerts } = test;
    const pristine = copy(conv);
    addAckRaceOtherConversation(ctx);
    const mutation = beginAckRace(test, 'main');
    ctx.saveMode = 'landed-pending';
    const operation = mutation.respond();
    await new Promise((resolve) => setImmediate(resolve));
    applyAckRaceChange(ctx, conv, pristine, 'replaced');
    ctx.saveMode = 'ok'; ctx.resolveSave(); await operation;
    assert.ok(alerts.some((message) => message.includes('generation_target_changed')));
    assert.equal(writes.length, 1);
    assert.equal(ctx.durable.conversations.a.messages[1].content, 'Late candidate',
        'The pre-fix behavior reports a stale ACK but leaves the rejected candidate on disk.');
    assert.equal(ctx.state.conversations.a.messages[1].content, 'Legitimate remote answer');
    await flush(ctx);
    console.log('Reproduced pre-fix late ACK: memory rejected the candidate while disk retained it (isolated VM).');
}

// A candidate already on disk cannot revive after replacement, deletion or a source edit at ACK time.
for (const kind of ['main', 'summary', 'second', 'options']) {
    for (const change of ['replaced', 'removed', 'source-edited']) {
        for (const queued of [false, true]) {
            const test = harness();
            const { ctx, conv, writes, alerts } = test;
            const pristine = copy(conv);
            addAckRaceOtherConversation(ctx);
            const baseline = ctx._cloudSyncConversationSignature;
            const mutation = beginAckRace(test, kind);
            ctx.saveMode = 'landed-pending';
            const operation = mutation.respond();
            await new Promise((resolve) => setImmediate(resolve));
            assert.ok(containsLateCandidate(ctx.durable, kind), `${kind}: fixture must land the candidate before ACK.`);
            if (kind === 'summary') {
                assert.equal(conv.summaries.length, 0, 'Pending summary writes must not enter live history.');
                assert.equal(ctx.getValidConversationSummaries(conv).length, 0, 'Pending summaries must not advance valid coverage.');
                assert.equal(ctx.getRegularPromptMessages(conv).length, 2, 'Pending summaries must not hide original prompt messages.');
            }
            if (kind === 'second') assert.equal(conv.messages.length, pristine.messages.length,
                'Unacknowledged normal second-stage candidates must not enter the live message array.');
            let later;
            if (queued) {
                ctx.state.settings.language = 'en';
                ctx.state.conversations.b.messages[0].content = 'Unrelated queued chat edit';
                later = ctx.persistState(true);
            }
            applyAckRaceChange(ctx, conv, pristine, change);
            ctx.saveMode = 'ok'; ctx.resolveSave(); await operation;
            if (later) await later;
            assert.ok(mutation.error() || alerts.some((message) => message.includes('generation_target_changed')),
                `${kind}/${change}: stale ACK must be reported as failure.`);
            assert.equal(containsLateCandidate(ctx.durable, kind), false, `${kind}/${change}: refresh must not recover a rejected candidate.`);
            assert.ok(writes.length >= (queued ? 3 : 2), 'Corrective storage must complete even without a later settings save.');
            assert.deepEqual(copy(ctx.durable.conversations), copy(ctx.state.conversations), `${kind}/${change}: the final durable snapshot must match the current legitimate chats.`);
            assert.deepEqual(copy(ctx.durable.conversationOrder), ctx.getPersistableConversationOrder(ctx.state.conversationOrder, ctx.state.conversations));
            assert.equal(ctx.durable.activeConvId, ctx.getPersistableActiveConversationId(ctx.state.activeConvId, ctx.state.conversationOrder, ctx.state.conversations));
            if (queued) {
                assert.equal(ctx.durable.settings.language, 'en', 'Repairing a queued conversation must not discard unrelated queued settings.');
                assert.equal(ctx.durable.conversations.b.messages[0].content, 'Unrelated queued chat edit');
            } else {
                assert.equal(ctx.uploads, 0, 'Rejected candidates and corrective writes must not schedule a cloud upload.');
                assert.equal(ctx._cloudSyncConversationSignature, baseline, 'A stale ACK must not advance the cloud baseline.');
            }
            await flush(ctx);
        }
    }
}

// A newer staged candidate owns its conversation slot, but must not preserve other stale slots.
for (const summaryTargetId of ['a', 'b']) {
    const test = harness();
    const { ctx, conv, streams, summaries, alerts } = test;
    const pristine = copy(conv);
    addAckRaceOtherConversation(ctx);
    ctx.state.conversations.b.messages.push({ id: 'b-answer', role: 'assistant', content: 'Unrelated answer' });
    ctx.normalizeConversationMessageIdentity(ctx.state.conversations.b);
    ctx.rememberCloudSyncConversationBaseline();
    ctx.regenerateMessage(1); ctx.saveMode = 'landed-pending';
    const oldOperation = streams[0].onComplete('Late candidate', '', null, {});
    await new Promise((resolve) => setImmediate(resolve));
    assert.ok(containsLateCandidate(ctx.durable, 'main'));
    if (summaryTargetId === 'a') applyAckRaceChange(ctx, conv, pristine, 'replaced');
    const summaryTarget = ctx.state.conversations[summaryTargetId];
    ctx.state.settings.language = 'en';
    let summaryCompletion;
    assert.equal(ctx.performSummarization(summaryTarget.messages.slice(0, 2), 0, 1,
        (error) => { summaryCompletion = error; }, summaryTarget), true);
    const newOperation = summaries[0].callback(null, 'Independent newer summary');
    assert.equal(summaryTarget.summaries.length, 0, 'The newer queued candidate must also remain staged.');
    if (summaryTargetId === 'b') applyAckRaceChange(ctx, conv, pristine, 'replaced');
    ctx.saveMode = 'ok'; ctx.resolveSave(); await oldOperation; await newOperation;
    assert.ok(alerts.some((message) => message.includes('generation_target_changed')));
    assert.equal(summaryCompletion, null, 'A valid independently staged summary must not be discarded by an older failed write.');
    assert.equal(ctx.state.conversations[summaryTargetId].summaries.length, 1);
    assert.equal(ctx.durable.conversations[summaryTargetId].summaries[0].text, 'Independent newer summary',
        'Successful acknowledgment of the newer candidate must reflect what was actually stored.');
    assert.equal(ctx.getSummaryValidity(ctx.durable.conversations[summaryTargetId].summaries[0], ctx.durable.conversations[summaryTargetId]), 'valid');
    assert.equal(ctx.durable.conversations.a.messages[1].content, 'Legitimate remote answer',
        'Only the independently protected candidate slot may bypass correction; other stale slots must be repaired.');
    assert.equal(containsLateCandidate(ctx.durable, 'main'), false);
    assert.equal(ctx.durable.settings.language, 'en');
    assert.deepEqual(copy(ctx.getCloudSyncSignatureConversations(ctx.durable.conversations)), copy(ctx.getCloudSyncSignatureConversations(ctx.state.conversations)),
        'All durable business fields must agree; post-commit render caches are transient.');
    await flush(ctx);
}

// Sources may change while a candidate waits behind another save, before saveAll starts.
for (const kind of ['summary', 'main', 'second', 'options']) {
    for (const change of ['replaced', 'removed', 'source-edited']) {
        const test = harness();
        const { ctx, conv, writes, alerts } = test;
        const pristine = copy(conv);
        addAckRaceOtherConversation(ctx);
        ctx.saveMode = 'pending';
        const blocker = ctx.persistState(true, { skipCloudSyncAutoUpload: true });
        await new Promise((resolve) => setImmediate(resolve));
        const mutation = beginAckRace(test, kind);
        const operation = mutation.respond();
        applyAckRaceChange(ctx, conv, pristine, change);
        ctx.saveMode = 'ok'; ctx.resolveSave(); await blocker; await operation;
        assert.equal(writes.filter((snapshot) => containsLateCandidate(snapshot, kind)).length, 0,
            `${kind}/${change}: an invalid queued source must be rejected before the candidate reaches saveAll.`);
        assert.ok(mutation.error() || alerts.some((message) => message.includes('generation_target_changed')));
        assert.equal(ctx.uploads, 0);
        await flush(ctx);
    }
}

// A failed corrective write must remain an explicit storage error, not a false durable success.
for (const kind of ['summary', 'main', 'second', 'options']) {
    for (const recovery of ['fail', 'refused']) {
        const test = harness();
        const { ctx, conv, writes, alerts } = test;
        const pristine = copy(conv);
        addAckRaceOtherConversation(ctx);
        const baseline = ctx._cloudSyncConversationSignature;
        const mutation = beginAckRace(test, kind);
        ctx.saveMode = 'landed-pending';
        const operation = mutation.respond();
        await new Promise((resolve) => setImmediate(resolve));
        applyAckRaceChange(ctx, conv, pristine, 'replaced');
        ctx.saveMode = recovery; ctx.resolveSave(); await operation;
        const errors = [mutation.error() && mutation.error().message, ...alerts].filter(Boolean).join('\n');
        assert.match(errors, /recovery failed/, `${kind}/${recovery}: a failed correction must be visible to the caller.`);
        assert.equal(writes.length, 2, 'A correction must actually be attempted before reporting its failure.');
        assert.ok(containsLateCandidate(ctx.durable, kind), 'The test must not pretend a failed correction removed already-written data.');
        assert.equal(ctx.state.conversations.a.messages[1].content, 'Legitimate remote answer');
        assert.equal(ctx.uploads, 0);
        assert.equal(ctx._cloudSyncConversationSignature, baseline);
        assert.equal(conv._messageCommitInProgress, undefined, 'Failed correction must release the conversation save lock.');
        await flush(ctx);
    }
}

// Empty snapshots remain protected except for exact rollback of the currently stored rejected write.
// This exercises the real save pipeline and predicates with a fake canonical driver, not browser backends.
for (const rollback of ['ordinary', 'mismatched', 'exact']) {
    const previous = {
        conversations: { a: { id: 'a', messages: [{ role: 'assistant', content: 'Rejected stored candidate' }] } },
        conversationOrder: ['a'], activeConvId: 'a', characters: {}, worldBooks: {},
        settings: { language: 'zh-CN' }, lastSaved: 100,
    };
    const empty = { conversations: {}, conversationOrder: [], activeConvId: null, characters: {}, worldBooks: {}, settings: { language: 'en' }, lastSaved: 101 };
    const { ctx, service, canonicalWrites, localWrites, protectedMirrors, markerWrites } = storageHarness(previous);
    const options = { preserveRuntimeSnapshot: true };
    if (rollback !== 'ordinary') {
        options.rejectedSnapshot = copy(previous);
        if (rollback === 'mismatched') options.rejectedSnapshot.lastSaved = 99;
    }
    const input = copy(empty);
    const result = await ctx.saveStorageServiceData(service, empty, options);
    assert.deepEqual(empty, input, 'The guard must not mutate the caller snapshot.');
    assert.deepEqual(service._lastSaveSnapshot, previous, 'Canonical save with preserved runtime ownership must not overwrite the live cache.');
    if (rollback === 'exact') {
        assert.equal(result.refusedEmpty, false, 'Only an exact match with the latest rejected stored snapshot permits empty recovery.');
        assert.deepEqual(canonicalWrites, [input]);
        assert.deepEqual(localWrites, [input]);
        assert.deepEqual(copy(result.runtimeSnapshot), input);
        assert.equal(protectedMirrors.length, 0);
        assert.equal(markerWrites.length, 1, 'Successful exact empty recovery must persist its existing clear marker.');
        assert.equal(service._clearMarkerTime(), result.runtimeSnapshot.lastSaved);
        const reloaded = await service._readNewestStoredSnapshotNoSync();
        assert.deepEqual(copy(reloaded.data), input, 'A stale OPFS or legacy user-data snapshot must not override the acknowledged empty recovery.');
    } else {
        assert.equal(result.refusedEmpty, true, `${rollback}: existing user data remains protected from an empty overwrite.`);
        assert.equal(canonicalWrites.length, 0);
        assert.equal(localWrites.length, 0);
        assert.deepEqual(protectedMirrors, [previous]);
        assert.deepEqual(copy(result.runtimeSnapshot), previous);
        assert.equal(markerWrites.length, 0, 'Ordinary or mismatched empty writes must not create a clear marker.');
    }
}

// If the marker cannot be saved, even a canonical empty write must not be reported refresh-safe.
{
    const previous = { conversations: { a: { messages: [{ content: 'Rejected candidate' }] } }, settings: { language: 'zh-CN' }, lastSaved: 100 };
    const empty = { conversations: {}, characters: {}, worldBooks: {}, settings: { language: 'en' }, lastSaved: 101 };
    const { ctx, service, canonicalWrites, markerWrites } = storageHarness(previous);
    ctx.failMarkerWrites = true;
    await assert.rejects(service.saveAll(empty, { preserveRuntimeSnapshot: true, rejectedSnapshot: copy(previous) }), /marker write failed/i,
        'Failure to persist the exclusion marker must remain a storage error.');
    assert.equal(canonicalWrites.length, 1, 'This fixture must fail after the canonical empty snapshot was physically written.');
    assert.equal(markerWrites.length, 0);
    assert.equal(service._clearMarkerTime(), 0);
    const reloaded = await service._readNewestStoredSnapshotNoSync();
    assert.ok(reloaded.data.conversations.a, 'Without the marker the old fallback really can win; the caller must not claim refresh safety.');
}

// Legitimate old backups and ordinary writes become newer than the retained exclusion marker.
for (const restoredKind of ['nonempty-backup', 'older-empty', 'settings-only']) {
    const previous = { conversations: { a: { messages: [{ content: 'Rejected candidate' }] } }, settings: { language: 'zh-CN' }, lastSaved: 100 };
    const empty = { conversations: {}, characters: {}, worldBooks: {}, settings: { language: 'en' }, lastSaved: 101 };
    const { ctx, service, canonicalWrites, markerWrites } = storageHarness(previous);
    await service.saveAll(empty, { preserveRuntimeSnapshot: true, rejectedSnapshot: copy(previous) });
    const marker = service._clearMarkerTime();
    const accepted = restoredKind === 'nonempty-backup'
        ? { conversations: { restored: { messages: [{ role: 'user', content: 'Explicitly restored older backup' }] } }, settings: { language: 'zh-CN' }, lastSaved: 50 }
        : restoredKind === 'older-empty' ? { ...copy(empty), lastSaved: 40 }
        : { settings: { language: 'en', contextLength: 24 }, lastSaved: 30 };
    const caller = copy(accepted);
    const result = await service.saveAll(accepted, { preserveRuntimeSnapshot: true, preserveLastSaved: true });
    assert.equal(result.refusedEmpty, false);
    assert.deepEqual(accepted, caller, 'Timestamp promotion must not mutate an imported or queued caller snapshot.');
    assert.equal(result.runtimeSnapshot.lastSaved, marker + 1, 'Physical timestamps must exceed the marker even for a preserved old backup timestamp.');
    assert.deepEqual(copy(result.runtimeSnapshot), { ...caller, lastSaved: marker + 1 });
    assert.deepEqual(canonicalWrites[1], copy(result.runtimeSnapshot));
    assert.equal(service._clearMarkerTime(), marker, 'Accepted new writes must retain the old exclusion marker.');
    assert.equal(markerWrites.length, 1);
    const reloaded = await service._readNewestStoredSnapshotNoSync();
    assert.deepEqual(copy(reloaded.data), copy(result.runtimeSnapshot), `${restoredKind}: stale fallback user data must not win on reload.`);
}

// Real persist queue: snapshots captured before recovery still need a physical timestamp above its marker.
{
    const previous = { conversations: { a: { messages: [{ content: 'Rejected candidate' }] } }, settings: { language: 'zh-CN' }, lastSaved: 100 };
    const empty = { conversations: {}, characters: {}, worldBooks: {}, settings: { language: 'en' }, lastSaved: 101 };
    const storage = storageHarness(previous);
    const test = harness();
    const { ctx } = test;
    ctx.state.conversations = {};
    ctx.state.conversationOrder = [];
    ctx.state.activeConvId = null;
    ctx.StorageService = storage.service;
    let release;
    let holdFirst = true;
    storage.service.saveAll = async (snapshot, options) => {
        if (holdFirst) { holdFirst = false; await new Promise((resolve) => { release = resolve; }); }
        return storage.ctx.saveStorageServiceData(storage.service, snapshot, options);
    };
    const first = ctx.persistState(true, { throwOnError: true, lastSaved: 50, preserveLastSaved: true, skipCloudSyncAutoUpload: true });
    await new Promise((resolve) => setImmediate(resolve));
    ctx.state.settings.language = 'en';
    const queued = ctx.persistState(true, { throwOnError: true, lastSaved: 10, preserveLastSaved: true, skipCloudSyncAutoUpload: true });
    await storage.ctx.saveStorageServiceData(storage.service, empty, { preserveRuntimeSnapshot: true, rejectedSnapshot: copy(previous) });
    const marker = storage.service._clearMarkerTime();
    release(); await first; await queued;
    assert.equal(storage.canonicalWrites.length, 3);
    assert.equal(storage.canonicalWrites[1].lastSaved, marker + 1);
    assert.equal(storage.canonicalWrites[2].lastSaved, marker + 1, 'Already queued older snapshots cannot remain below the clear marker.');
    assert.equal(storage.canonicalWrites[2].settings.language, 'en');
    assert.equal(storage.service._clearMarkerTime(), marker);
    const reloaded = await storage.service._readNewestStoredSnapshotNoSync();
    assert.equal(reloaded.data.lastSaved, marker + 1);
    assert.equal(storage.ctx.storageHasUserData(reloaded.data), false, 'Queued settings-only state must remain the selected current snapshot, not stale user data.');
    await flush(ctx);
}

// Imported history without a selected current version and unknown records must remain recoverable.
{
    const { ctx, conv, streams } = harness();
    const previous = ctx.captureResponseVersion(conv, conv.messages[1]);
    previous.message.content = 'Earlier';
    const unknown = { id: 'future-format', payload: { keep: true } };
    const illegalStage = { ...copy(previous), id: 'illegal-stage', message: { ...copy(previous.message), stage: 'second' } };
    const noSecondId = copy(previous); noSecondId.id = 'illegal-child'; delete noSecondId.secondMessages[0].id;
    const noVersionId = { ...copy(previous), id: '' };
    conv.messages[1].responseVersions = [previous, unknown, illegalStage, noSecondId, noVersionId];
    assert.equal(ctx.getResponseVersions(conv.messages[1]).length, 1);
    assert.ok(ctx.renderResponseVersionControls(conv.messages[1], 1).includes('2/2'));
    ctx.regenerateMessage(1);
    await streams[0].onComplete('Partial', '', null, { interrupted: true });
    assert.equal(conv.messages[1].content, 'Original', 'Stopping cannot choose an earlier stored version instead of the actual current response.');
    assert.equal(conv.messages[1].responseVersions.length, 7);
    assert.deepEqual(copy(conv.messages[1].responseVersions[1]), unknown);
    await ctx.switchResponseVersion(1, -1);
    assert.equal(conv.messages[1].content, 'Earlier');
    assert.equal(conv.messages[1].responseVersions.length, 7, 'Switching must not discard unrecognized records.');
    await ctx.switchResponseVersion(1, 1);
    assert.equal(conv.messages[1].content, 'Original');
    await flush(ctx);
}

for (const recent of [false, true]) {
    const { ctx, conv, streams } = harness();
    ctx.state.settings.twoStageIncludeRecentContext = recent;
    ctx.regenerateMessage(2);
    ctx.applyMessageEditContent(conv, 0, 'Question', 'Changed during request');
    await streams[0].onComplete('<options>new based on old input</options>', '', null, {});
    assert.equal(conv.messages[2].content, recent ? '<options>original</options>' : '<options>new based on old input</options>');
    await flush(ctx);
}
{
    const { ctx, conv, streams } = harness();
    ctx.runSecondStageGeneration(conv.messages[1], (error) => { ctx.secondDone = error; });
    ctx.saveMode = 'pending';
    const operation = streams[0].onComplete('<options>new normal</options>', '', null, {});
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(conv.messages.length, 3, 'A pending normal second-stage write must not append its candidate into live history.');
    const restored = copy(conv); ctx.state.conversations.a = restored;
    ctx.saveMode = 'ok'; ctx.resolveSave(); await operation;
    assert.ok(ctx.secondDone, 'Cloud replacement during save cannot be reported as successful stage completion.');
    assert.equal(restored.messages.length, 3);
    await flush(ctx);
}

// Real response parsing must distinguish completion, truncation, provider errors and cancellation.
function responseFromChunks(chunks) {
    let index = 0;
    return new Response(new ReadableStream({ start(controller) {
        while (index < chunks.length) controller.enqueue(chunks[index++]);
        controller.close();
    } }));
}

function splitSseBytes(text, cuts) {
    const bytes = new TextEncoder().encode(text);
    let start = 0;
    const boundaries = cuts.filter((cut) => cut < bytes.length).concat(bytes.length);
    return boundaries.map((end) => bytes.slice(start, start = end)).filter((chunk) => chunk.length);
}

function streamHarness() {
    const { ctx } = harness();
    Object.assign(ctx, {
        TextDecoder,
        normalizeStreamIdleTimeoutSec: () => 0,
    });
    vm.runInContext(source('generation/50-generation-cot-utils.js'), ctx);
    vm.runInContext(source('generation/50-generation-usage.js'), ctx);
    vm.runInContext(source('generation/50-generation-stream-state.js'), ctx);
    vm.runInContext(source('generation/50-generation-transport-module.js'), ctx);
    vm.runInContext(source('generation/50-generation-response-stream.js'), ctx);
    ctx.state.abortController = new AbortController();
    ctx.state.isGenerating = true;
    ctx.state.abortController._generationStartedAt = Date.now();
    return ctx;
}

function wiredGenerationHarness() {
    const runtime = harness();
    const { ctx } = runtime;
    Object.assign(ctx, {
        TextDecoder,
        normalizeStreamIdleTimeoutSec: () => 0,
        normalizeApiEndpoint: (value) => value,
        shouldUseOllamaCompat: () => false,
        normalizeMessagesForOllamaCompatibility: (messages) => messages,
    });
    for (const file of [
        'generation/50-generation-cot-utils.js',
        'generation/50-generation-usage.js',
        'generation/50-generation-api-request.js',
        'generation/50-generation-stream-state.js',
        'generation/50-generation-transport-module.js',
        'generation/50-generation-response-stream.js',
        'generation/50-generation-integrations.js',
    ]) vm.runInContext(source(file), ctx, { filename: file });
    ctx.updateStreamingBubble = () => {};
    return runtime;
}

for (const parser of ['sse', 'json']) {
    const { ctx, conv, writes, alerts } = wiredGenerationHarness();
    ctx.state.settings.apiEndpoint = 'https://chat.example/v1/chat/completions';
    ctx.state.settings.apiKey = 'chat-key';
    ctx.state.settings.model = 'chat-model';
    ctx.state.settings.maxTokens = 128;
    ctx.state.settings.temperature = 0.2;
    ctx.state.settings.topP = 0.9;
    ctx.state.settings.streamEnabled = parser === 'sse';
    ctx.state.settings.twoStageEnabled = true;
    const before = copy(conv.messages);
    const illegalUsage = '{"completion_tokens":{"toString":"not callable","valueOf":"not callable"}}';
    const illegalBody = parser === 'sse'
        ? `data: {"choices":[{"delta":{"content":"illegal"}}],"usage":${illegalUsage}}\n`
        : `{"choices":[{"message":{"content":"illegal"}}],"usage":${illegalUsage}}`;
    ctx.fetch = async () => parser === 'sse'
        ? responseFromChunks([new TextEncoder().encode(illegalBody)])
        : new Response(illegalBody);
    let errorCalls = 0;
    let secondStageCalls = 0;
    const reportError = ctx.handlePrimaryRegenerationError;
    const startSecondStage = ctx.runSecondStageGeneration;
    ctx.handlePrimaryRegenerationError = (error) => {
        errorCalls += 1;
        return reportError(error);
    };
    ctx.runSecondStageGeneration = (...args) => {
        secondStageCalls += 1;
        return startSecondStage(...args);
    };
    await ctx.startPrimaryMessageRegeneration(conv, conv.messages[1], true);
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(errorCalls, 1, `${parser}: wired protocol failures must report exactly one terminal error.`);
    assert.equal(secondStageCalls, 0, `${parser}: protocol failures must not start second-stage generation.`);
    assert.equal(writes.length, 0, `${parser}: protocol failures must not replace response versions.`);
    assert.deepEqual(copy(conv.messages), before, `${parser}: protocol failures must preserve existing messages and versions.`);
    assert.equal(ctx.state.isGenerating, false, `${parser}: wired protocol failures must release generation state.`);
    assert.equal(ctx.state.abortController, null, `${parser}: wired protocol failures must clear the generation controller.`);

    ctx.state.settings.twoStageEnabled = false;
    const versionsBeforeRecovery = ctx.getResponseVersions(conv.messages[1]).length;
    let recoveryFetches = 0;
    ctx.fetch = async () => parser === 'sse'
        ? responseFromChunks([new TextEncoder().encode('data: {"choices":[{"delta":{"content":"recovered"},"finish_reason":"stop"}]}\ndata: [DONE]\n')])
        : new Response(JSON.stringify({ choices: [{ message: { content: 'recovered' }, finish_reason: 'stop' }] }));
    ctx.fetch = new Proxy(ctx.fetch, { apply(target, thisArg, args) {
        recoveryFetches += 1;
        return Reflect.apply(target, thisArg, args);
    } });
    await ctx.startPrimaryMessageRegeneration(conv, conv.messages[1], true);
    for (let attempt = 0; attempt < 20 && writes.length === 0; attempt += 1) {
        await new Promise((resolve) => setImmediate(resolve));
    }
    await flush(ctx);
    assert.equal(recoveryFetches, 1, `${parser}: recovery must issue exactly one request.`);
    assert.equal(errorCalls, 1, `${parser}: recovery must not report another terminal error: ${alerts.join('|')}`);
    assert.equal(writes.length, 1, `${parser}: recovery must save exactly one response version.`);
    assert.equal(conv.messages[1].content, 'Originalrecovered', `${parser}: the next request must continue after protocol failure.`);
    const versionsAfterRecovery = ctx.getResponseVersions(conv.messages[1]);
    assert.ok(versionsAfterRecovery.length > versionsBeforeRecovery, `${parser}: recovery should add its response version.`);
    assert.equal(versionsAfterRecovery.filter((version) => version.message.content === 'Originalrecovered').length, 1, `${parser}: recovery should save exactly one new response version.`);
    assert.equal(ctx.state.isGenerating, false, `${parser}: recovery must release generation state.`);
    assert.equal(ctx.state.abortController, null, `${parser}: recovery must clear the generation controller.`);
}

for (const expected of [
    { name: 'done', ending: 'data: [DONE]\n', interrupted: false, finishReason: null, completionReason: 'done' },
    { name: 'finish', ending: 'data: {"choices":[{"finish_reason":"stop"}]}\n', interrupted: false, finishReason: 'stop', completionReason: 'stop' },
    { name: 'length', ending: 'data: {"choices":[{"finish_reason":"length"}]}\ndata: [DONE]\n', interrupted: true, finishReason: 'length', completionReason: 'length' },
    { name: 'content-filter', ending: 'data: {"choices":[{"finish_reason":"content_filter"}]}\n', interrupted: true, finishReason: 'content_filter', completionReason: 'content_filter' },
    { name: 'unknown-finish', ending: 'data: {"choices":[{"finish_reason":"vendor_specific"}]}\n', interrupted: true, finishReason: 'vendor_specific', completionReason: 'vendor_specific' },
    { name: 'malformed', ending: 'data: invalid JSON\ndata: [DONE]\n', interrupted: false, finishReason: null, completionReason: 'done' },
    { name: 'eof', ending: '', interrupted: true, finishReason: null, completionReason: 'eof' },
]) {
    const ctx = streamHarness();
    const text = 'data: {"choices":[{"delta":{"content":"未完成正文"}}],"usage":{"completion_tokens":2}}\n' + expected.ending;
    const response = responseFromChunks(splitSseBytes(text, [1, 7, 18, 31, text.length]));
    let callbacks = 0;
    const completed = await new Promise((resolve, reject) => ctx.streamChatCompletionResponse(response, false, () => {}, (content, _cot, usage, metadata) => {
        callbacks += 1;
        resolve({ content, usage, metadata });
    }, reject));
    assert.equal(completed.content, '未完成正文', `${expected.name}: split UTF-8/SSE bytes must not lose content.`);
    assert.equal(completed.usage.completionTokens, 2, `${expected.name}: usage must survive the final frame.`);
    assert.deepEqual(copy(completed.metadata), {
        interrupted: expected.interrupted,
        finishReason: expected.finishReason,
        completionReason: expected.completionReason,
    }, `${expected.name}: SSE completion metadata must preserve its actual reason.`);
    assert.equal(callbacks, 1, `${expected.name}: completion must settle once.`);
}

for (const outcome of ['abort', 'timeout']) {
    const ctx = streamHarness();
    ctx.state.abortController.abort();
    ctx.state.abortController._generationIdleTimedOut = outcome === 'timeout';
    const response = responseFromChunks([new TextEncoder().encode('data: {"choices":[{"delta":{"content":"partial"}}]}\n')]);
    const completed = await new Promise((resolve, reject) => ctx.streamChatCompletionResponse(response, false, () => {}, (content, _cot, _usage, metadata) => resolve({ content, metadata }), reject));
    assert.deepEqual(copy(completed.metadata), {
        interrupted: true,
        finishReason: null,
        completionReason: outcome,
    }, `${outcome}: cancellation metadata must distinguish abort from idle timeout.`);
}

for (const expected of [
    { name: 'reader abort without signal', aborted: false, timedOut: false, completionReason: 'abort' },
    { name: 'reader abort with signal', aborted: true, timedOut: false, completionReason: 'abort' },
    { name: 'reader idle timeout', aborted: true, timedOut: true, completionReason: 'timeout' },
]) {
    const ctx = streamHarness();
    if (expected.aborted) ctx.state.abortController.abort();
    ctx.state.abortController._generationIdleTimedOut = expected.timedOut;
    const abortError = Object.assign(new Error('body read aborted'), { name: 'AbortError' });
    const response = { body: { getReader: () => ({ read: () => Promise.reject(abortError) }) } };
    let completions = 0;
    let errors = 0;
    const completed = await new Promise((resolve, reject) => ctx.streamChatCompletionResponse(response, false, () => {}, (_content, _cot, _usage, metadata) => {
        completions += 1;
        resolve(metadata);
    }, (error) => {
        errors += 1;
        reject(error);
    }));
    assert.deepEqual(copy(completed), {
        interrupted: true,
        finishReason: null,
        completionReason: expected.completionReason,
    }, `${expected.name}: reader interruption must be incomplete even before the signal is marked.`);
    assert.equal(completions, 1, `${expected.name}: completion must settle once.`);
    assert.equal(errors, 0, `${expected.name}: reader interruption must not use the transport error callback.`);
}

const donePrefix = 'data: {"choices":[{"delta":{"content":"完整正文"},"finish_reason":"stop"}],"usage":{"prompt_tokens":5,"completion_tokens":3,"total_tokens":8}}\n';
const doneFrame = 'data: [DONE]\n';
const trailingError = 'data: {"error":{"message":"AFTER_DONE"}}\n';
for (const divided of [false, true]) {
    const ctx = streamHarness();
    const text = donePrefix + doneFrame + trailingError;
    const bytes = new TextEncoder().encode(text);
    const doneCut = new TextEncoder().encode(donePrefix + doneFrame).length;
    const chunks = divided ? [bytes.slice(0, doneCut), bytes.slice(doneCut)] : [bytes];
    let completions = 0;
    let errors = 0;
    const completed = await new Promise((resolve, reject) => ctx.streamChatCompletionResponse(responseFromChunks(chunks), false, () => {}, (content, _cot, usage, metadata) => {
        completions += 1;
        resolve({ content, usage, metadata });
    }, (error) => {
        errors += 1;
        reject(error);
    }));
    assert.equal(completed.content, '完整正文', `DONE trailing frames ${divided ? 'across chunks' : 'in one chunk'} must not change parsed content.`);
    assert.equal(completed.usage.promptTokens, 5, `DONE trailing frames ${divided ? 'across chunks' : 'in one chunk'} must retain root prompt usage before DONE.`);
    assert.equal(completed.usage.completionTokens, 3, `DONE trailing frames ${divided ? 'across chunks' : 'in one chunk'} must retain root completion usage before DONE.`);
    assert.equal(completed.usage.totalTokens, 8, `DONE trailing frames ${divided ? 'across chunks' : 'in one chunk'} must retain root total usage before DONE.`);
    assert.equal(completed.usage.source, 'api', `DONE trailing frames ${divided ? 'across chunks' : 'in one chunk'} must retain API usage identity.`);
    assert.deepEqual(copy(completed.metadata), {
        interrupted: false,
        finishReason: 'stop',
        completionReason: 'stop',
    }, `DONE trailing frames ${divided ? 'across chunks' : 'in one chunk'} must retain finish_reason before DONE.`);
    assert.equal(completions, 1, 'DONE must settle completion exactly once.');
    assert.equal(errors, 0, 'Frames after DONE must be ignored regardless of chunk boundaries.');
}

for (const divided of [false, true]) {
    const ctx = streamHarness();
    const errorFrame = 'data: {"error":{"message":"upstream_overloaded"}}\n';
    const text = errorFrame + doneFrame;
    const bytes = new TextEncoder().encode(text);
    const errorCut = new TextEncoder().encode(errorFrame).length;
    const chunks = divided ? [bytes.slice(0, errorCut), bytes.slice(errorCut)] : [bytes];
    let completions = 0;
    const errors = [];
    await new Promise((resolve) => ctx.streamChatCompletionResponse(responseFromChunks(chunks), false, () => {}, () => { completions += 1; resolve(); }, (error) => {
        errors.push(error);
        resolve();
    }));
    assert.equal(completions, 0, `Provider error before DONE ${divided ? 'across chunks' : 'in one chunk'} must not report ordinary success.`);
    assert.equal(errors.length, 1, `Provider error before DONE ${divided ? 'across chunks' : 'in one chunk'} must settle exactly once.`);
    assert.match(errors[0].message, /upstream_overloaded/, 'Provider error frames must preserve an understandable reason.');
}

{
    const ctx = streamHarness();
    const errorFrame = 'data: {"error":{"message":"error_only"}}\n';
    let completions = 0;
    const errors = [];
    await new Promise((resolve) => ctx.streamChatCompletionResponse(responseFromChunks(splitSseBytes(errorFrame, [3, errorFrame.length])), false, () => {}, () => { completions += 1; resolve(); }, (error) => {
        errors.push(error);
        resolve();
    }));
    assert.equal(completions, 0, 'An error-only stream must not report ordinary success.');
    assert.equal(errors.length, 1, 'An error-only stream must settle exactly once.');
    assert.match(errors[0].message, /error_only/, 'An error-only stream must preserve the provider reason.');
}

for (const finishReason of [undefined, 'stop', 'length', 'content_filter', 'vendor_specific']) {
    const ctx = streamHarness();
    const choice = { message: { content: '未闭合正文', reasoning_content: 'JSON 推理' } };
    if (finishReason !== undefined) choice.finish_reason = finishReason;
    const response = new Response(JSON.stringify({
        choices: [choice],
        usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
    }));
    let callbacks = 0;
    const completed = await new Promise((resolve, reject) => ctx.readChatCompletionResponse(response, true, (content, cot, usage, metadata) => {
        callbacks += 1;
        resolve({ content, cot, usage, metadata });
    }, reject, ctx.state.abortController));
    const incomplete = ['length', 'content_filter', 'vendor_specific'].includes(finishReason);
    assert.equal(completed.content, '未闭合正文', `JSON ${finishReason || 'missing'} must retain response content.`);
    assert.equal(completed.cot, 'JSON 推理', `JSON ${finishReason || 'missing'} must retain thinking content.`);
    assert.equal(completed.usage.promptTokens, 5, `JSON ${finishReason || 'missing'} must read standard root prompt usage.`);
    assert.equal(completed.usage.completionTokens, 3, `JSON ${finishReason || 'missing'} must read standard root completion usage.`);
    assert.equal(completed.usage.totalTokens, 8, `JSON ${finishReason || 'missing'} must read standard root total usage.`);
    assert.equal(completed.usage.source, 'api', `JSON ${finishReason || 'missing'} must retain API usage identity.`);
    assert.deepEqual(copy(completed.metadata), {
        interrupted: incomplete,
        finishReason: finishReason || null,
        completionReason: finishReason || 'json',
    }, `JSON ${finishReason || 'missing'} must use the same completion semantics as SSE.`);
    assert.equal(callbacks, 1, `JSON ${finishReason || 'missing'} must settle once.`);
}

for (const expected of [
    { name: 'JSON abort', timedOut: false, completionReason: 'abort' },
    { name: 'JSON idle timeout', timedOut: true, completionReason: 'timeout' },
]) {
    const ctx = streamHarness();
    ctx.state.abortController.abort();
    ctx.state.abortController._generationIdleTimedOut = expected.timedOut;
    const response = new Response(JSON.stringify({
        choices: [{ message: { content: 'JSON partial' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
    }));
    let completions = 0;
    let errors = 0;
    const metadata = await new Promise((resolve, reject) => ctx.readChatCompletionResponse(response, false, (_content, _cot, _usage, completion) => {
        completions += 1;
        resolve(completion);
    }, (error) => {
        errors += 1;
        reject(error);
    }, ctx.state.abortController));
    assert.deepEqual(copy(metadata), {
        interrupted: true,
        finishReason: 'stop',
        completionReason: expected.completionReason,
    }, `${expected.name}: JSON cancellation metadata must use the initiated controller.`);
    assert.equal(completions, 1, `${expected.name}: completion must settle once.`);
    assert.equal(errors, 0, `${expected.name}: cancellation must not use the transport error callback.`);
}

{
    const ctx = streamHarness();
    const response = new Response(JSON.stringify({ error: { message: 'upstream_overloaded' } }));
    let completions = 0;
    const errors = [];
    await new Promise((resolve) => ctx.readChatCompletionResponse(response, false, () => { completions += 1; resolve(); }, (error) => {
        errors.push(error);
        resolve();
    }, ctx.state.abortController));
    assert.equal(completions, 0, 'JSON provider errors must not report ordinary success.');
    assert.equal(errors.length, 1, 'JSON provider errors must settle exactly once.');
    assert.match(errors[0].message, /upstream_overloaded/, 'JSON provider errors must preserve the provider reason.');
}

{
    const ctx = streamHarness();
    const callbackError = new Error('token callback failed');
    const response = responseFromChunks([new TextEncoder().encode('data: {"choices":[{"delta":{"content":"partial"}}]}\ndata: [DONE]\n')]);
    let completions = 0;
    const errors = [];
    await new Promise((resolve) => ctx.streamChatCompletionResponse(response, false, () => { throw callbackError; }, () => {
        completions += 1;
        resolve();
    }, (error) => {
        errors.push(error);
        resolve();
    }));
    assert.equal(completions, 0, 'A business callback exception must not be swallowed as a malformed frame.');
    assert.deepEqual(errors, [callbackError], 'A business callback exception must reach the error boundary once.');
}

for (const parser of ['sse', 'json']) {
    for (const asynchronous of [false, true]) {
        const ctx = streamHarness();
        const callbackError = new Error(`complete callback failed: ${parser}/${asynchronous}`);
        let completions = 0;
        let errors = 0;
        const onComplete = () => {
            completions += 1;
            if (asynchronous) return Promise.reject(callbackError);
            throw callbackError;
        };
        const onError = () => { errors += 1; };
        const settlement = parser === 'sse'
            ? ctx.streamChatCompletionResponse(responseFromChunks(splitSseBytes('data: {"choices":[{"delta":{"content":"complete body"},"finish_reason":"stop"}]}\ndata: [DONE]\n', [17, 61])), false, () => {}, onComplete, onError)
            : ctx.readChatCompletionResponse(new Response(JSON.stringify({ choices: [{ message: { content: 'complete body' }, finish_reason: 'stop' }] })), false, onComplete, onError, ctx.state.abortController);
        let observedError;
        try {
            await settlement;
        } catch (error) {
            observedError = error;
        }
        assert.equal(completions, 1, `${parser}/${asynchronous}: the complete callback is attempted once.`);
        assert.equal(errors, 0, `${parser}/${asynchronous}: a failed complete callback must not become a second terminal callback.`);
        assert.equal(observedError, callbackError, `${parser}/${asynchronous}: a failed complete callback must remain observable to its caller.`);
    }
}

for (const asynchronous of [false, true]) {
    const ctx = streamHarness();
    const callbackError = new Error(`EOF complete callback failed: ${asynchronous}`);
    let completions = 0;
    let errors = 0;
    const onComplete = () => {
        completions += 1;
        if (asynchronous) return Promise.reject(callbackError);
        throw callbackError;
    };
    const settlement = ctx.streamChatCompletionResponse(responseFromChunks([
        new TextEncoder().encode('data: {"choices":[{"delta":{"content":"eof body"},"finish_reason":"stop"}]}\n'),
    ]), false, () => {}, onComplete, () => { errors += 1; });
    assert.equal(typeof settlement.then, 'function', 'EOF completion must return its callback settlement.');
    await assert.rejects(settlement, (error) => error === callbackError, 'EOF completion failures must remain observable.');
    assert.equal(completions, 1, 'EOF completion must be attempted once.');
    assert.equal(errors, 0, 'EOF completion failures must not become a second terminal callback.');
}

for (const parser of ['sse', 'json']) {
    const ctx = streamHarness();
    const illegalUsage = '{"completion_tokens":{"toString":"not callable","valueOf":"not callable"}}';
    const body = parser === 'sse'
        ? `data: {"choices":[{"delta":{"content":"illegal"}}],"usage":${illegalUsage}}\n`
        : `{"choices":[{"message":{"content":"illegal"}}],"usage":${illegalUsage}}`;
    const response = parser === 'sse'
        ? responseFromChunks([new TextEncoder().encode(body)])
        : new Response(body);
    let completions = 0;
    const errors = [];
    let settlementError;
    try {
        await (parser === 'sse'
            ? ctx.streamChatCompletionResponse(response, false, () => {}, () => { completions += 1; }, (error) => errors.push(error))
            : ctx.readChatCompletionResponse(response, false, () => { completions += 1; }, (error) => errors.push(error), ctx.state.abortController));
    } catch (error) {
        settlementError = error;
    }
    assert.equal(settlementError, undefined, `${parser}: protocol handling failures should settle through onError.`);
    assert.equal(completions, 0, `${parser}: illegal usage must not report completion.`);
    assert.equal(errors.length, 1, `${parser}: illegal usage must report exactly one terminal error.`);
    assert.equal(ctx.state.isGenerating, false, `${parser}: illegal usage must release generation state.`);
    assert.equal(ctx.state.abortController, null, `${parser}: illegal usage must clear the generation controller.`);

    const recoveryResponse = parser === 'sse'
        ? responseFromChunks([new TextEncoder().encode('data: {"choices":[{"delta":{"content":"recovered"},"finish_reason":"stop"}]}\ndata: [DONE]\n')])
        : new Response(JSON.stringify({ choices: [{ message: { content: 'recovered' }, finish_reason: 'stop' }] }));
    const recovered = await new Promise((resolve, reject) => (parser === 'sse'
        ? ctx.streamChatCompletionResponse(recoveryResponse, false, () => {}, (content) => resolve({ content }), reject)
        : ctx.readChatCompletionResponse(recoveryResponse, false, (content) => resolve({ content }), reject, ctx.state.abortController)));
    assert.equal(recovered.content, 'recovered', `${parser}: the next request must continue after protocol failure.`);
    assert.equal(ctx.state.isGenerating, false, `${parser}: recovery must release generation state.`);
    assert.equal(ctx.state.abortController, null, `${parser}: recovery must clear the generation controller.`);
}

for (const mode of ['same', 'split']) {
    const ctx = streamHarness();
    const illegalUsage = '{"completion_tokens":{"toString":"not callable","valueOf":"not callable"}}';
    const protocolFrame = `data: {"choices":[{"delta":{"content":"illegal"}}],"usage":${illegalUsage}}\n`;
    const trailingFrame = 'data: {"choices":[{"delta":{"content":"AFTER_ERROR"}}]}\ndata: [DONE]\n';
    const chunks = mode === 'same'
        ? [new TextEncoder().encode(protocolFrame + trailingFrame)]
        : [new TextEncoder().encode(protocolFrame), new TextEncoder().encode(trailingFrame)];
    const source = responseFromChunks(chunks);
    const sourceBody = source.body;
    let readCalls = 0;
    const response = {
        body: {
            getReader: () => {
                const reader = sourceBody.getReader();
                return {
                    read: () => {
                        readCalls += 1;
                        return reader.read();
                    },
                };
            },
        },
    };
    let tokens = 0;
    let completions = 0;
    const errors = [];
    const settlement = ctx.streamChatCompletionResponse(response, false, () => {
        tokens += 1;
    }, () => {
        completions += 1;
    }, (error) => {
        errors.push(error);
    });
    assert.equal(typeof settlement.then, 'function', `${mode}: stream termination must return its settlement.`);
    assert.equal(await settlement, undefined, `${mode}: protocol failure must settle without completion.`);
    assert.equal(tokens, 0, `${mode}: content after protocol failure must not reach onToken.`);
    assert.equal(errors.length, 1, `${mode}: protocol failure must report exactly one terminal error.`);
    assert.equal(completions, 0, `${mode}: protocol failure must not report completion.`);
    assert.equal(readCalls, 1, `${mode}: stream scanning must stop before reading later chunks.`);
    assert.equal(ctx.state.isGenerating, false, `${mode}: protocol failure must release generation state.`);
    assert.equal(ctx.state.abortController, null, `${mode}: protocol failure must clear the generation controller.`);
}

// Unsupported middle-history regeneration, format rejection, two-stage atomic versions and option-only versions.
{
    const { ctx, conv, streams } = harness();
    conv.messages.push({ id: 'later', role: 'user', content: 'later' });
    const before = copy(conv.messages); ctx.regenerateMessage(1);
    assert.deepEqual(copy(conv.messages), before); assert.equal(streams.length, 0);
}
for (const format of ['bad', 'valid', 'custom']) {
    const { ctx, conv, streams, alerts } = harness();
    ctx.state.settings.twoStageEnabled = true;
    if (format === 'custom') ctx.state.settings.twoStageSystemPrompt = 'custom status';
    ctx.regenerateMessage(1);
    await streams[0].onComplete('New main', '', null, {});
    assert.equal(conv.messages[1].content, 'Original');
    const response = format === 'valid' ? '<options>new</options>' : format === 'custom' ? '<div>custom status</div>' : 'not options';
    await streams[1].onComplete(response, 'second reasoning', { completionTokens: 3 }, {});
    if (format === 'bad') {
        // 默认提示词：有文本但没有完整选项 -> 追加一次格式纠正请求，且无效回复不得保存。
        assert.equal(streams.length, 3, '默认格式无效必须追加一次纠正请求');
        assert.equal(streams[2].messages.at(-1).role, 'user', '纠正请求最后一条必须是 user 格式指令');
        assert.equal(streams[2].messages.at(-1).content, 'RETRY_INVALID_FORMAT', '纠正请求必须基于原本上下文并带有格式无效提醒');
        assert.equal(conv.messages[1].content, 'Original', '判定需要纠正前不得保存无效回复');
        assert.equal(conv.messages.length, 3, '无效回复不得作为第二阶段保存');
        await streams[2].onComplete('still not options', '', null, {});
        assert.equal(streams.length, 3, '最多只追加一次纠正请求');
        assert.equal(conv.messages[1].content, 'Original', '二次仍无效必须保留原正文');
        assert.ok(alerts.length >= 1, '二次仍无效走原有失败保护');
    } else {
        assert.equal(streams.length, 2, '有效输出或自定义提示词不得追加纠正请求');
        assert.equal(conv.messages[1].content, 'New main', alerts.join('\n')); assert.equal(conv.messages[2].content, response);
        assert.equal(conv.messages[2].parentRevision, ctx.getMessageRevision(conv.messages[1]));
        assert.equal(ctx.getResponseVersions(conv.messages[1])[0].secondMessages[0].content, '<options>original</options>');
    }
    await flush(ctx);
}
{
    const { ctx, conv, streams } = harness();
    ctx.regenerateMessage(2);
    await streams[0].onComplete('<options>new only</options>', '', null, {});
    assert.equal(conv.messages[1].content, 'Original'); assert.equal(conv.messages[2].content, '<options>new only</options>');
    assert.equal(ctx.getResponseVersions(conv.messages[1]).length, 2);
    await ctx.switchResponseVersion(1, -1);
    assert.equal(conv.messages[2].content, '<options>original</options>');
    await flush(ctx);
}
{
    const { ctx, conv, streams, alerts } = harness();
    ctx.state.settings.twoStageEnabled = true;
    ctx.startPrimaryMessageRegeneration(conv, conv.messages[1], false);
    await streams[0].onComplete('截断的新回复', '', null, {});
    assert.equal(streams.length, 2, '完整主回复应进入候选二阶段请求。');
    await streams[1].onComplete('<options>截断候选', '', null, {
        interrupted: true,
        finishReason: 'length',
        completionReason: 'length',
    });
    assert.equal(conv.messages[1].content, 'Original', '失败的候选二阶段不得替换原完整回复。');
    assert.equal(conv.messages[2].content, '<options>original</options>', '失败的候选二阶段不得替换原选项。');
    assert.equal(ctx.getResponseVersions(conv.messages[1]).length, 0, '失败重生成不得提交未完成候选版本。');
    assert.ok(alerts.some((message) => message.includes('length')), '候选二阶段截断原因必须保留。');
}

// Default second-stage options: exactly one correction request, and no retry for empty, interrupted, custom or changed sources.
{
    const { ctx, conv, streams } = harness();
    ctx.state.settings.twoStageEnabled = true;
    ctx.runSecondStageGeneration(conv.messages[1], (error) => { ctx.secondDone = error; });
    await streams[0].onComplete('', '', null, {});
    assert.equal(streams.length, 1, '空响应不得追加纠正请求');
    assert.ok(ctx.secondDone, '空响应走原有失败保护');
}
{
    const { ctx, conv, streams } = harness();
    ctx.state.settings.twoStageEnabled = true;
    ctx.runSecondStageGeneration(conv.messages[1], (error) => { ctx.secondDone = error; });
    await streams[0].onComplete('模型续写了正文', '', null, { interrupted: true });
    assert.equal(streams.length, 1, '中断不得追加纠正请求');
    assert.ok(ctx.secondDone, '中断走原有失败保护');
}
for (const finishReason of ['length', 'content_filter']) {
    const { ctx, conv, streams, alerts } = harness();
    ctx.state.settings.twoStageEnabled = true;
    ctx.runSecondStageGeneration(conv.messages[1], (error) => { ctx.secondDone = error; });
    await streams[0].onComplete('<options>truncated candidate', '', null, {
        interrupted: true,
        finishReason,
        completionReason: finishReason,
    });
    assert.equal(streams.length, 1, `${finishReason}: truncation must not be treated as a correctable format failure.`);
    assert.ok(ctx.secondDone, `${finishReason}: truncation must use the existing second-stage failure protection.`);
    assert.equal(conv.messages[2].content, '<options>original</options>', `${finishReason}: the old options must remain selected.`);
    assert.ok(alerts.some((message) => message.includes(finishReason)), `${finishReason}: the incomplete reason must remain understandable.`);
}
{
    const { ctx, conv, streams } = harness();
    ctx.state.settings.twoStageEnabled = true;
    ctx.state.settings.twoStageSystemPrompt = 'custom status';
    ctx.runSecondStageGeneration(conv.messages[1], (error) => { ctx.secondDone = error; });
    await streams[0].onComplete('自定义状态栏正文', '', null, {});
    assert.equal(streams.length, 1, '自定义提示词不得追加纠正请求');
    assert.equal(ctx.secondDone, null);
    assert.equal(conv.messages.at(-1).content, '自定义状态栏正文');
}
{
    const { ctx, conv, streams } = harness();
    ctx.state.settings.twoStageEnabled = true;
    ctx.runSecondStageGeneration(conv.messages[1], (error) => { ctx.secondDone = error; });
    const request = streams[0];
    conv.messages[1].content = 'Edited while pending';
    await request.onComplete('模型续写了正文', '', null, {});
    assert.equal(streams.length, 1, '来源修订变化后不得再次请求');
    assert.ok(ctx.secondDone, '来源变化走目标失效保护');
    assert.equal(conv.messages.length, 3, '目标失效时不得保存无效回复');
}
{
    const { ctx, conv, streams } = harness();
    ctx.state.settings.twoStageEnabled = true;
    let doneCount = 0;
    ctx.runSecondStageGeneration(conv.messages[1], (error) => { doneCount += 1; ctx.secondDone = error; });
    await streams[0].onComplete('续写正文，没有选项', '', null, {});
    assert.equal(streams.length, 2, '默认格式无效应追加一次纠正请求');
    assert.equal(doneCount, 0, '发出纠正请求时不得结束流程');
    await streams[1].onComplete('<options>corrected</options>', '', null, {});
    assert.equal(doneCount, 1, 'onDone 只能结束一次');
    assert.equal(ctx.secondDone, null);
    assert.equal(conv.messages.at(-1).content, '<options>corrected</options>');
    assert.equal(conv.messages.filter((message) => message.content === '续写正文，没有选项').length, 0, '无效续写不得被保存');
}
{
    const { ctx, conv, streams } = harness();
    let doneCalls = 0;
    const callbackError = new Error('second-stage completion callback failed');
    ctx.runSecondStageGeneration(conv.messages[1], () => {
        doneCalls += 1;
        throw callbackError;
    });
    await assert.rejects(
        () => streams[0].onComplete('<options>callback result</options>', '', null, {}),
        (error) => error === callbackError,
        'A successful second-stage completion callback exception must remain observable.'
    );
    assert.equal(doneCalls, 1, 'A completion callback exception must not re-enter onDone as a failure.');
    assert.equal(streams.length, 1, 'A completion callback exception must not generate another request.');
}

// A normal turn must keep one operation identity and one complete settings snapshot through save, stage two and one correction.
{
    const { ctx, conv, streams } = wiredGenerationHarness();
    ctx.streamChatWithMessages = (messages, onToken, onComplete, onError, options = {}) => {
            streams.push({
                messages: copy(messages), onToken, onError, options,
                settings: copy(options.settings || ctx.state.settings),
                maxTokens: options.maxTokens == null ? (options.settings || ctx.state.settings).maxTokens : options.maxTokens,
                onComplete: (content, cot, usage, metadata = {}) => {
                if (options.generationContext) Object.defineProperty(metadata, '_generationRuntime', { value: options.generationContext });
                return onComplete(content, cot, usage, metadata);
            },
        });
    };
    Object.assign(ctx.state.settings, {
        apiEndpoint: 'https://old.example/v1/chat/completions', apiKey: 'old-key', model: 'old-model', maxTokens: 4096,
        temperature: 0.2, topP: 0.8, streamEnabled: false, summaryEnabled: false,
        twoStageEnabled: true, twoStageSystemPrompt: '', twoStageIncludeRecentContext: false,
    });
    const turn = startGeneration(ctx, conv);
    await waitFor(() => streams.length === 1, 'The normal main request must start once.');
    const operation = streams[0].options.promptBuildOperation;
    const runtime = streams[0].options.generationContext;
    assert.equal(streams[0].settings.apiEndpoint, 'https://old.example/v1/chat/completions');
    assert.equal(streams[0].settings.model, 'old-model');
    assert.equal(streams[0].settings.maxTokens, 4096);
    Object.assign(ctx.state.settings, {
        apiEndpoint: 'https://new.example/v1/chat/completions', apiKey: 'new-key', model: 'new-model', maxTokens: 32,
        twoStageSystemPrompt: 'custom next prompt', twoStageIncludeRecentContext: true,
    });
    await streams[0].onComplete('Main body', '', null, completionMetadata({ interrupted: false, finishReason: 'stop', completionReason: 'stop' }, runtime));
    await waitFor(() => streams.length === 2, 'The saved main message must start second stage.');
    const savedMain = conv.messages.find((message) => message.stage === 'main' && message.content === 'Main body');
    assert.equal(conv.messages.filter((message) => message.stage === 'main' && message.content === 'Main body').length, 1);
    assert.equal(streams[1].settings.apiEndpoint, 'https://old.example/v1/chat/completions');
    assert.equal(streams[1].settings.model, 'old-model');
    assert.equal(streams[1].maxTokens, 1024, 'Second stage may only override the existing budget to at most 1024.');
    assert.equal(streams[1].settings.twoStageSystemPrompt, '', 'Second stage must retain the operation prompt snapshot.');
    assert.equal(streams[1].options.corrected, false);
    assert.equal(streams[1].options.promptBuildOperation, operation, 'Main and second stage must share one operation identity.');

    await streams[1].onComplete('invalid continuation', '', null, completionMetadata({ interrupted: false, finishReason: 'stop', completionReason: 'stop' }, runtime));
    await waitFor(() => streams.length === 3, 'Default second stage must request exactly one correction.');
    assert.equal(streams[2].settings.apiEndpoint, 'https://old.example/v1/chat/completions');
    assert.equal(streams[2].settings.model, 'old-model');
    assert.equal(streams[2].maxTokens, 1024);
    assert.equal(streams[2].settings.twoStageSystemPrompt, '', 'Correction must retain the same prompt snapshot.');
    assert.equal(streams[2].options.corrected, true, 'Correction must be explicitly marked.');
    assert.equal(streams[2].options.promptBuildOperation, operation, 'Correction must retain the same operation identity.');
    await streams[2].onComplete('<options><option><title>Next</title><description>Continue safely.</description></option></options>', '', null, completionMetadata({ interrupted: false, finishReason: 'stop', completionReason: 'stop' }, runtime));
    await turn.acknowledged;
    await waitFor(() => conv.messages.some((message) => message.stage === 'second') && !ctx.state.isGenerating && ctx.state._generationRuntime == null, 'The real turn must save second stage and release its runtime.');
    assert.equal(streams.length, 3, 'Correction must not retry again.');
    assert.equal(conv.messages.filter((message) => message.stage === 'second' && message.parentId === savedMain.id).length, 1);
    assert.equal(operation.settled, true, 'The completed turn must settle its operation.');
    assert.equal(operation.hasCurrentOwnership(), false, 'A settled operation must not retain current ownership.');
    assert.equal(runtime.settings.model, 'old-model', 'The shared runtime snapshot must not follow live settings.');
    assert.equal(!JSON.stringify(conv.messages).includes('old-key') && !JSON.stringify(conv.messages).includes('new-key'), true, 'Messages must not expose runtime settings.');

    conv.messages.push({ id: 'next-user', role: 'user', content: 'Next operation' });
    ctx.normalizeConversationMessageIdentity(conv);
    const nextTurn = startGeneration(ctx, conv);
    await waitFor(() => streams.length === 4, 'The next operation must issue a new main request.');
    assert.equal(streams[3].settings.apiEndpoint, 'https://new.example/v1/chat/completions');
    assert.equal(streams[3].settings.model, 'new-model');
    assert.equal(streams[3].settings.maxTokens, 32);
    const nextRuntime = streams[3].options.generationContext;
    await streams[3].onComplete('Next body', '', null, completionMetadata({ interrupted: false, finishReason: 'stop', completionReason: 'stop' }, nextRuntime));
    await waitFor(() => streams.length === 5, 'The next operation must use the new custom second-stage prompt.');
    assert.equal(streams[4].settings.model, 'new-model');
    assert.equal(streams[4].maxTokens, 32, 'Second stage must preserve the operation budget when it is below 1024.');
    assert.equal(streams[4].settings.twoStageSystemPrompt, 'custom next prompt');
    await streams[4].onComplete('<div>custom result</div>', '', null, completionMetadata({ interrupted: false, finishReason: 'stop', completionReason: 'stop' }, nextRuntime));
    await nextTurn.acknowledged;
    await waitFor(() => conv.messages.some((message) => message.stage === 'second' && message.content === '<div>custom result</div>') && !ctx.state.isGenerating && ctx.state._generationRuntime == null, 'The next turn must save custom second stage and release its runtime.');
    assert.equal(streams.length, 5, 'A custom prompt must not trigger correction.');
}

// A late operation cannot save its old body into a changed source or settle a newer operation's state.
{
    const { ctx, conv, streams, bubbles } = wiredGenerationHarness();
    ctx.streamChatWithMessages = (messages, onToken, onComplete, onError, options = {}) => streams.push({
        messages: copy(messages), onToken, onError, options,
        onComplete: (content, cot, usage, metadata = {}) => {
            if (options.generationContext) Object.defineProperty(metadata, '_generationRuntime', { value: options.generationContext });
            return onComplete(content, cot, usage, metadata);
        },
    });
    ctx.state.settings.twoStageEnabled = false;
    const oldTurn = startGeneration(ctx, conv);
    await waitFor(() => streams.length === 1, 'The old request must start.');
    conv.messages[0].content = 'Edited source';
    ctx.normalizeConversationMessageIdentity(conv);
    const oldRuntime = streams[0].options.generationContext;
    await streams[0].onComplete('Late old body', '', null, completionMetadata({ interrupted: false, finishReason: 'stop', completionReason: 'stop' }, oldRuntime));
    await oldTurn.acknowledged;
    assert.equal(conv.messages.some((message) => message.content === 'Late old body'), false, 'A changed source must reject the late old body.');

    const newTurn = startGeneration(ctx, conv);
    await waitFor(() => streams.length === 2, 'The new operation must start.');
    ctx.state.isGenerating = true;
    ctx.state._generationRuntime = streams[1].options.generationContext;
    ctx.state.abortController = { marker: 'new-controller' };
    const staleTimer = { marker: 'new-timer' };
    ctx.state._generationIdleTimer = staleTimer;
    const staleRuntime = streams[0].options.generationContext;
    await ctx.handlePrimaryAssistantComplete('Stale body', '', null, conv, completionMetadata({ interrupted: false, finishReason: 'stop', completionReason: 'stop' }, staleRuntime));
    assert.equal(ctx.state.isGenerating, true, 'A stale completion must not clear the newer generation state.');
    assert.equal(ctx.state.abortController && ctx.state.abortController.marker, 'new-controller', 'A stale completion must not clear the newer controller.');
    assert.equal(ctx.state._generationIdleTimer, staleTimer, 'A stale completion must not clear the newer idle timer.');
    assert.deepEqual(bubbles, [], 'A stale completion must not remove the newer streaming bubble.');
    assert.equal(conv.messages.some((message) => message.content === 'Stale body'), false, 'A stale completion must not commit an old body.');
    ctx.state.abortController = null;
    const newRuntime = streams[1].options.generationContext;
    await streams[1].onComplete('New body', '', null, completionMetadata({ interrupted: false, finishReason: 'stop', completionReason: 'stop' }, newRuntime));
    await newTurn.acknowledged;
    assert.equal(conv.messages.some((message) => message.content === 'New body'), true);
}

// Regeneration and continuation must freeze one operation/settings snapshot across main, second stage and one correction.
for (const continuation of [false, true]) {
    const { ctx, conv, streams, writes } = wiredGenerationHarness();
    ctx.streamChatWithMessages = (messages, onToken, onComplete, onError, options = {}) => streams.push({
        messages: copy(messages), onToken, onError, options,
        settings: copy(options.settings || ctx.state.settings),
        maxTokens: options.maxTokens == null ? (options.settings || ctx.state.settings).maxTokens : options.maxTokens,
        onComplete: (content, cot, usage, metadata = {}) => {
            if (options.generationContext) Object.defineProperty(metadata, '_generationRuntime', { value: options.generationContext });
            return onComplete(content, cot, usage, metadata);
        },
    });
    Object.assign(ctx.state.settings, {
        apiEndpoint: 'https://old.example/v1/chat/completions', apiKey: 'old-key', model: 'old-model', maxTokens: 4096,
        streamEnabled: false, summaryEnabled: false, twoStageEnabled: true,
        twoStageSystemPrompt: '', twoStageIncludeRecentContext: false,
    });
    conv.stLocalVars = { macro: 'original' };
    let requestConversation;
    const realBuild = ctx.buildMessagesForAPI;
    ctx.buildMessagesForAPI = (value) => { requestConversation = value; return realBuild(value); };
    const originalTargetContent = conv.messages[1].content;
    ctx.startPrimaryMessageRegeneration(conv, conv.messages[1], continuation);
    await waitFor(() => streams.length === 1, 'Regeneration/continuation main request must start once.');
    assert.equal(streams[0].settings.model, 'old-model');
    assert.equal(streams[0].settings.maxTokens, 4096);
    assert.notEqual(requestConversation.stLocalVars, conv.stLocalVars, 'The request copy must own its writable macro state.');
    const operation = streams[0].options.promptBuildOperation;
    const runtime = streams[0].options.generationContext;
    assert.ok(operation && runtime, 'Regeneration must use the shared prompt operation and generation runtime.');

    Object.assign(ctx.state.settings, {
        apiEndpoint: 'https://new.example/v1/chat/completions', apiKey: 'new-key', model: 'new-model', maxTokens: 32,
        twoStageSystemPrompt: 'custom next prompt', twoStageIncludeRecentContext: true,
    });
    const mainContent = continuation ? '\nContinued' : 'New main';
    await streams[0].onComplete(mainContent, '', null, completionMetadata({ interrupted: false, finishReason: 'stop', completionReason: 'stop' }, runtime));
    await waitFor(() => streams.length === 2, 'Regeneration/continuation must start its second stage.');
    assert.equal(streams[1].settings.apiEndpoint, 'https://old.example/v1/chat/completions');
    assert.equal(streams[1].settings.model, 'old-model');
    assert.equal(streams[1].maxTokens, 1024);
    assert.equal(streams[1].options.promptBuildOperation, operation, 'Second stage must share the regeneration operation.');
    assert.equal(streams[1].options.generationContext, runtime, 'Second stage must share the regeneration runtime snapshot.');

    Object.assign(ctx.state.settings, {
        apiEndpoint: 'https://newer.example/v1/chat/completions', apiKey: 'newer-key', model: 'newer-model', maxTokens: 7,
        twoStageSystemPrompt: 'newer prompt', twoStageIncludeRecentContext: false,
    });
    await streams[1].onComplete('invalid continuation', '', null, completionMetadata({ interrupted: false, finishReason: 'stop', completionReason: 'stop' }, runtime));
    await waitFor(() => streams.length === 3, 'Default regeneration second stage must request exactly one correction.');
    assert.equal(streams[2].settings.apiEndpoint, 'https://old.example/v1/chat/completions');
    assert.equal(streams[2].settings.model, 'old-model');
    assert.equal(streams[2].maxTokens, 1024);
    assert.equal(streams[2].options.corrected, true);
    assert.equal(streams[2].options.promptBuildOperation, operation, 'Correction must share the regeneration operation.');
    assert.equal(streams[2].options.generationContext, runtime, 'Correction must share the regeneration runtime snapshot.');

    await streams[2].onComplete('<options><option><title>Next</title><description>Continue safely.</description></option></options>', '', null, completionMetadata({ interrupted: false, finishReason: 'stop', completionReason: 'stop' }, runtime));
    await waitFor(() => writes.length > 0 && !ctx.state.isGenerating, 'Regeneration success must wait for the real response-version write.');
    assert.equal(conv.messages[1].content, continuation ? originalTargetContent + '\nContinued' : 'New main');
    assert.equal(ctx.getResponseVersions(conv.messages[1]).length, 2, 'The saved candidate must be selectable as a response version.');
    assert.equal(conv.messages.filter((message) => message.stage === 'second').length, 1);
    assert.equal(operation.settled, true, 'A legally committed regeneration must settle its operation.');
    assert.equal(ctx.state._generationRuntime, null);
    assert.equal(!JSON.stringify(conv.messages).includes('old-key') && !JSON.stringify(conv.messages).includes('new-key') && !JSON.stringify(conv.messages).includes('newer-key'), true,
        'Runtime settings and keys must not enter message JSON.');
    assert.equal(conv.stLocalVars.macro, 'original', 'The request copy must not mutate the real conversation macro state.');
    await flush(ctx);
}

// A late old regeneration must not save into a newer operation or clear its controller, timer, state or bubble.
for (const lateKind of ['complete', 'error']) {
    const { ctx, conv, streams, writes, bubbles } = wiredGenerationHarness();
    ctx.streamChatWithMessages = (messages, onToken, onComplete, onError, options = {}) => streams.push({
        messages: copy(messages), onToken, onError, options,
        settings: copy(options.settings || ctx.state.settings),
        onComplete: (content, cot, usage, metadata = {}) => {
            if (options.generationContext) Object.defineProperty(metadata, '_generationRuntime', { value: options.generationContext });
            return onComplete(content, cot, usage, metadata);
        },
    });
    ctx.state.settings.twoStageEnabled = false;
    ctx.startPrimaryMessageRegeneration(conv, conv.messages[1], false);
    await waitFor(() => streams.length === 1, 'The old regeneration must start.');
    const oldRuntime = streams[0].options.generationContext;
    ctx.startPrimaryMessageRegeneration(conv, conv.messages[1], false);
    await waitFor(() => streams.length === 2, 'The newer regeneration must start.');
    const newRuntime = streams[1].options.generationContext;
    ctx.state.isGenerating = true;
    ctx.state._generationRuntime = newRuntime;
    ctx.state.abortController = { marker: 'new-controller' };
    const newTimer = { marker: 'new-timer' };
    ctx.state._generationIdleTimer = newTimer;
    if (lateKind === 'complete') {
        await streams[0].onComplete('Late old body', '', null, completionMetadata({ interrupted: false, finishReason: 'stop', completionReason: 'stop' }, oldRuntime));
    } else {
        await streams[0].onError(new Error('late old failure'));
    }
    assert.equal(conv.messages.some((message) => message.content === 'Late old body'), false, 'A late old result must not save into the conversation.');
    assert.equal(ctx.state.isGenerating, true, 'A late old callback must not clear the newer generation state.');
    assert.equal(ctx.state.abortController && ctx.state.abortController.marker, 'new-controller', 'A late old callback must not clear the newer controller.');
    assert.equal(ctx.state._generationIdleTimer, newTimer, 'A late old callback must not clear the newer idle timer.');
    assert.deepEqual(bubbles, [], 'A late old callback must not remove the newer streaming bubble.');
    assert.equal(writes.length, 0, 'A late old callback must not write a stale response version.');
}

// Large-history smoke: no silent clipping and deterministic migration cost is measured.
for (const outcome of ['fail', 'success', 'stop', 'storage-fail', 'edit']) {
    const { ctx, conv, streams } = harness();
    const before = copy(conv.messages);
    ctx.startPrimaryMessageRegeneration(conv, conv.messages[1], true);
    assert.ok(streams[0].messages.some(message => message.content === 'Original'), 'Continuation must send the original main reply.');
    assert.equal(streams[0].messages.at(-1).role, 'system');
    if (outcome === 'fail') streams[0].onError(new Error('failed'));
    else {
        if (outcome === 'storage-fail') ctx.saveMode = 'fail';
        if (outcome === 'edit') conv.messages[1].content = 'Edited while pending';
        await streams[0].onComplete('\nContinued', '', null, { interrupted: outcome === 'stop' });
    }
    if (outcome === 'success') {
        assert.equal(conv.messages[1].content, 'Original\nContinued');
        assert.equal(conv.messages[1].extension.keep, true);
        await ctx.switchResponseVersion(1, -1);
        assert.equal(conv.messages[1].content, 'Original'); assert.equal(conv.messages[2].content, '<options>original</options>');
    } else if (outcome === 'stop') {
        assert.equal(conv.messages[1].content, 'Original');
        assert.equal(ctx.getResponseVersions(conv.messages[1]).at(-1).message.content, 'Original\nContinued');
        assert.equal(ctx.getResponseVersions(conv.messages[1]).at(-1).interrupted, true);
    } else if (outcome === 'edit') assert.equal(conv.messages[1].content, 'Edited while pending');
    else assert.deepEqual(copy(conv.messages), before);
    await flush(ctx);
}

{
    const { ctx, conv, streams } = harness();
    const alice = { name: 'Alice', description: 'Alice frozen profile' };
    conv.group = { members: [{ character: { name: 'Bob' } }, { character: { name: 'Charlie' } }] };
    ctx.isGroupChat = c => !!c.group && c.group.members.length > 1;
    ctx.getGroupMembers = c => c.group.members;
    ctx.getNextGroupSpeaker = c => c.group.members[0].character;
    ctx.getMessageSpeakerCharacter = () => alice;
    let requestConversation;
    ctx.buildMessagesForAPI = c => { requestConversation = c; return c.messages.map(copy); };
    await ctx.startPrimaryMessageRegeneration(conv, conv.messages[1], true);
    assert.equal(requestConversation._nextGroupSpeaker.name, 'Alice');
    assert.equal(requestConversation.group.members.at(-1).character.description, 'Alice frozen profile');
    assert.equal(conv.group.members.length, 2, 'Only the continuation request receives the historical member.');
    assert.notEqual(requestConversation.group, conv.group);
    streams[0].onError(new Error('finished'));
    await flush(ctx);
}

{
    const started = performance.now();
    const { ctx, conv } = harness(Array.from({ length: 10000 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `history-${i} ${'text '.repeat(100)}` })));
    conv.summaries = Array.from({ length: 50 }, (_, i) => verified(ctx, conv, i * 100, i * 100 + 99));
    assert.equal(ctx.getValidConversationSummaries(conv).length, 50);
    assert.equal(ctx.getRegularPromptMessages(conv).length, 5000, 'Only verified coverage is removed before applying a context window.');
    const visible = ctx.getRegularPromptMessages(conv, 100);
    assert.equal(visible.length, 100, 'The existing context window still applies after verified summary coverage.');
    assert.equal(conv.messages.length, 10000);
    console.log(`Large-history smoke passed: 10,000 messages / 50 summaries in ${Math.round(performance.now() - started)} ms.`);
}

console.log('Message reliability checks passed: migration, summary provenance, request origins, durable rollback, response versions and two-stage recovery.');
