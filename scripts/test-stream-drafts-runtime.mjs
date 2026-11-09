import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/app/generation/50-stream-drafts.js', import.meta.url), 'utf8');
const drain = () => new Promise(resolve => setImmediate(resolve));

function createTimerHarness() {
    const timers = [];
    let nextId = 0;
    return {
        setTimeout(fn, ms) {
            const timer = { id: ++nextId, fn, ms, active: true };
            timers.push(timer);
            return timer.id;
        },
        clearTimeout(id) {
            const timer = timers.find(item => item.id === id);
            if (timer) timer.active = false;
        },
        fire(ms) {
            const due = timers.filter(item => item.active && item.ms === ms);
            due.forEach(item => { item.active = false; item.fn(); });
            return due.length;
        },
        fireFirst(ms) {
            const timer = timers.find(item => item.active && item.ms === ms);
            if (!timer) return false;
            timer.active = false;
            timer.fn();
            return true;
        },
        has(ms) {
            return timers.some(item => item.active && item.ms === ms);
        }
    };
}

function createStorageHarness() {
    const opens = [];
    const persisted = new Map();
    const indexedDB = {
        open(name, version) {
            const request = { name, version, result: undefined, error: null, onupgradeneeded: null, onsuccess: null, onerror: null, onblocked: null };
            opens.push(request);
            return request;
        }
    };
    function createDb() {
        const db = { closed: 0, transactions: [], close() { this.closed += 1; } };
        db.transaction = function(storeName, mode) {
            const tx = { storeName, mode, error: null, oncomplete: null, onerror: null, onabort: null, aborted: 0, request: null };
            tx.abort = function() { this.aborted += 1; };
            const store = {
                put(value) { tx.request = { result: value && value.id, error: null }; return tx.request; },
                delete() { tx.request = { result: undefined, error: null }; return tx.request; },
                getAll() { tx.request = { result: Array.from(persisted.values()), error: null }; return tx.request; }
            };
            tx.objectStore = () => store;
            db.transactions.push(tx);
            return tx;
        };
        return db;
    }
    return { indexedDB, opens, persisted, createDb };
}

function loadStreamDraftContext(options) {
    const context = vm.createContext({
        Map, Promise, console, state: options.state, indexedDB: options.indexedDB,
        setTimeout: options.setTimeout, clearTimeout: options.clearTimeout,
        makeId: options.makeId, fingerprintMessageText: value => value,
        getMessageRevision: message => message.content,
        isLiveConversation: value => options.state.conversations[value.id] === value,
        getActiveConv: () => options.activeConv,
        renderMessagesOnly() {}, renderConversationListOnly() {},
        persistConversationMessageMutation: options.persistConversationMessageMutation
    });
    vm.runInContext(source, context);
    return context;
}

// ===== 既有恢复/去重/ACK 删除合同 =====
let id = 0;
let fail = false;
let deleteFails = false;
let deleteCalls = 0;
const records = new Map();
const conv = { id: 'c', messages: [{ id: 'u', role: 'user', content: 'hello' }], title: 'chat' };
const state = { conversations: { c: conv }, isGenerating: false };
const stubTimers = createTimerHarness();
const context = loadStreamDraftContext({
    state, activeConv: conv, indexedDB: undefined,
    setTimeout: stubTimers.setTimeout, clearTimeout: stubTimers.clearTimeout,
    makeId: () => 'id-' + ++id,
    persistConversationMessageMutation: async (target, change, options) => {
        const candidate = JSON.parse(JSON.stringify(target)); change(candidate);
        if (fail) throw new Error('quota');
        assert.equal(options.validate(target), true); target.messages = candidate.messages;
    }
});
context.streamDraftStorage = async (method, value) => {
    if (fail) throw new Error('quota');
    if (method === 'put') records.set(value.id, JSON.parse(JSON.stringify(value)));
    if (method === 'delete') { deleteCalls += 1; if (deleteFails) throw new Error('delete failed'); records.delete(value); }
    if (method === 'getAll') return Array.from(records.values());
};
const generation = { conversation: conv, stage: 'main' };
context.queueStreamDraft(generation, 'partial reply', 'thinking');
await context.flushStreamDraftWrites(); assert.equal(records.size, 1); assert.equal(conv.messages.length, 1);
const record = records.values().next().value;
fail = true; await assert.rejects(context.recoverStreamDraft(record), /quota/);
assert.equal(records.size, 1); assert.equal(conv.messages.length, 1);
fail = false; deleteFails = true; await assert.rejects(context.recoverStreamDraft(record), /delete failed/);
assert.equal(conv.messages.length, 2); assert.equal(conv.messages[1].interrupted, true);
deleteFails = false; await context.recoverStreamDraft(record);
assert.equal(conv.messages.length, 2, 'A delete retry must not duplicate the recovered reply.'); assert.equal(records.size, 0);
const next = { conversation: conv }; context.queueStreamDraft(next, 'stale draft', ''); await context.flushStreamDraftWrites();
const stale = records.values().next().value; conv.messages[0].content = 'edited';
await assert.rejects(context.recoverStreamDraft(stale), /原消息已变化/); assert.equal(records.size, 1);
await context.finishStreamDraft(next); assert.equal(records.size, 0);
context.queueStreamDraft(next, 'late token', ''); await context.flushStreamDraftWrites(); assert.equal(records.size, 0);

const persistedDraft = { conversation: conv, stage: 'main' };
context.queueStreamDraft(persistedDraft, 'persisted draft', '');
await context.flushStreamDraftWrites(); assert.equal(records.size, 1);
context.queueStreamDraft(persistedDraft, 'persisted draft v2', '');
fail = true; await assert.rejects(context.flushStreamDraftWrites(), /quota/);
fail = false;
const deletesBefore = deleteCalls;
await context.finishStreamDraft(persistedDraft);
assert.equal(deleteCalls, deletesBefore, '写入失败后的 ACK 清理不得删除可恢复记录。');
assert.equal(records.size, 1, '已落盘的可恢复记录必须在清理失败后保留。');
await context.flushStreamDraftWrites();
await context.finishStreamDraft(persistedDraft);
assert.equal(records.size, 0);

const hanging = { conversation: conv, stage: 'main' };
context.queueStreamDraft(hanging, 'hanging draft', '');
const realStub = context.streamDraftStorage;
context.streamDraftStorage = () => new Promise(() => {});
context.flushStreamDraftWrites();
const hangingFinish = context.finishStreamDraft(hanging);
let hangingSettled = false;
hangingFinish.then(() => { hangingSettled = true; });
await drain();
assert.equal(hangingSettled, false, '清理不能无限等待挂起队列。');
assert.equal(stubTimers.fireFirst(5000), true, '清理必须有固定内部期限。');
await drain();
assert.equal(hangingSettled, true, '清理必须在内部期限内结算。');
context.streamDraftStorage = realStub;

// ===== 真实 streamDraftStorage：打开/事务有界失败、迟到连接与重开 =====
const storageHarness = createStorageHarness();
const storageTimers = createTimerHarness();
const storageContext = loadStreamDraftContext({
    state, activeConv: conv,
    indexedDB: storageHarness.indexedDB,
    setTimeout: storageTimers.setTimeout, clearTimeout: storageTimers.clearTimeout,
    makeId: () => 'draft-' + ++id,
    persistConversationMessageMutation: async () => {}
});

let openError = null;
const blocked = storageContext.streamDraftStorage('put', { id: 'blocked', content: 'x' });
blocked.catch(error => { openError = error; });
await drain();
assert.equal(storageHarness.opens.length, 1);
assert.equal(storageTimers.has(5000), true, '打开必须有固定内部期限。');
storageTimers.fire(5000);
await drain();
assert.match(openError.message, /打开超时/);
const lateDb = storageHarness.createDb();
storageHarness.opens[0].result = lateDb;
storageHarness.opens[0].onsuccess();
assert.equal(lateDb.closed, 1, '超时后迟到的连接只关闭。');
assert.equal(lateDb.transactions.length, 0, '超时后的迟到连接不得继续写入。');

const retry = storageContext.streamDraftStorage('put', { id: 'retry', content: 'ok' });
await drain();
assert.equal(storageHarness.opens.length, 2, '打开失败后必须允许重开。');
const db = storageHarness.createDb();
storageHarness.opens[1].result = db;
storageHarness.opens[1].onsuccess();
await drain();
assert.equal(db.transactions.length, 1);
const putTx = db.transactions[0];
storageHarness.persisted.set('retry', { id: 'retry', content: 'ok' });
putTx.oncomplete();
assert.equal(await retry, 'retry');

let txTimeoutError = null;
const hung = storageContext.streamDraftStorage('delete', 'retry');
hung.catch(error => { txTimeoutError = error; });
await drain();
assert.equal(db.transactions.length, 2);
const hungTx = db.transactions[1];
assert.equal(storageTimers.has(5000), true, '事务必须有固定内部期限。');
storageTimers.fire(5000);
await drain();
assert.match(txTimeoutError.message, /事务超时/);
assert.equal(hungTx.aborted, 1, '事务超时后应尽可能中止迟到写入。');
assert.equal(hungTx.oncomplete, null);
assert.equal(hungTx.onerror, null);
assert.equal(hungTx.onabort, null);
assert.equal(storageHarness.persisted.size, 1, '超时不得当作已删除。');

let abortError = null;
const aborted = storageContext.streamDraftStorage('getAll');
aborted.catch(error => { abortError = error; });
await drain();
const abortTx = db.transactions[2];
abortTx.error = new Error('磁盘错误');
abortTx.onabort();
await drain();
assert.match(abortError.message, /磁盘错误/);
assert.equal(abortTx.aborted, 1);
assert.equal(abortTx.oncomplete, null);
assert.equal(abortTx.onerror, null);
assert.equal(abortTx.onabort, null);
assert.equal(storageHarness.persisted.size, 1);

// ===== ACK 清理遇到挂起打开：有界结算、不重复等待、之后可重试 =====
const finishHarness = createStorageHarness();
const finishTimers = createTimerHarness();
const finishContext = loadStreamDraftContext({
    state, activeConv: conv,
    indexedDB: finishHarness.indexedDB,
    setTimeout: finishTimers.setTimeout, clearTimeout: finishTimers.clearTimeout,
    makeId: () => 'finish-' + ++id,
    persistConversationMessageMutation: async () => {}
});
const finishGeneration = { conversation: conv, stage: 'main' };
finishContext.queueStreamDraft(finishGeneration, 'blocked tool turn', '');
const flushPromise = finishContext.flushStreamDraftWrites();
await drain();
assert.equal(finishHarness.opens.length, 1);
const finishPromise = finishContext.finishStreamDraft(finishGeneration);
await drain();
assert.equal(finishHarness.opens.length, 1, 'ACK 清理不得在挂起写队列后再次等待打开。');
finishTimers.fireFirst(5000);
await assert.rejects(flushPromise, /打开超时/);
await finishPromise;
assert.equal(finishHarness.opens.length, 1, 'ACK 清理失败后不得用另一次超时重试。');
assert.equal(finishTimers.has(5000), false, '队列失败后清理应清除自己的计时器。');
assert.equal(finishContext.streamDraftPending.has(finishGeneration._streamDraft.id), true, '失败后保留可恢复记录。');

const retryFlush = finishContext.flushStreamDraftWrites();
await drain();
assert.equal(finishHarness.opens.length, 2);
const finishDb = finishHarness.createDb();
finishHarness.opens[1].result = finishDb;
finishHarness.opens[1].onsuccess();
await drain();
finishDb.transactions[0].oncomplete();
await retryFlush;
assert.equal(finishDb.transactions.length, 1);

console.log('Stream draft recovery passed: separate persistence, save failure preservation, ACK/delete retry dedup, source guard, late-token rejection, bounded open/transaction failure, late-connection isolation, reopen retry and bounded ACK cleanup.');
