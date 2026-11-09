import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = (name) => fs.readFileSync(new URL(`../src/app/${name}`, import.meta.url), 'utf8');
const copy = (value) => JSON.parse(JSON.stringify(value));
const flushMicrotasks = () => new Promise((resolve) => setImmediate(resolve));
const unhandledRejections = [];
const recordUnhandledRejection = (reason) => unhandledRejections.push(reason);
process.on('unhandledRejection', recordUnhandledRejection);

// 受控时钟：生产代码只使用全局 setTimeout/clearTimeout，测试不引入任何生产测试开关。
function createClock() {
    let now = 0;
    let sequence = 0;
    const timers = new Map();
    const setTimeoutFn = (callback, delay, ...args) => {
        const id = ++sequence;
        timers.set(id, { id, at: now + Math.max(0, Number(delay) || 0), callback, args });
        return id;
    };
    const clearTimeoutFn = (id) => {
        timers.delete(id);
    };
    async function advance(ms) {
        const target = now + Math.max(0, Number(ms) || 0);
        while (true) {
            await flushMicrotasks();
            let next = null;
            for (const timer of timers.values()) {
                if (timer.at > target) continue;
                if (!next || timer.at < next.at || (timer.at === next.at && timer.id < next.id)) next = timer;
            }
            if (!next) break;
            timers.delete(next.id);
            now = Math.max(now, next.at);
            next.callback(...next.args);
        }
        now = target;
        await flushMicrotasks();
    }
    return {
        setTimeout: setTimeoutFn,
        clearTimeout: clearTimeoutFn,
        advance,
        now: () => now,
        pending: () => timers.size,
    };
}

const IDB_FILES = [
    'storage/20-storage-idb-open-helpers.js',
    'storage/20-storage-idb-connection.js',
    'storage/20-storage-idb-helpers.js',
    'storage/20-storage-idb-operations.js',
    'storage/20-storage-idb.js',
];

const PERSISTENCE_FILES = [
    ...IDB_FILES,
    'conversation/32-message-identity.js',
    'conversation/19-conversation-order-helpers.js',
    'summary/41-summary-validity.js',
    'state/35-persist-records.js',
    'state/35-state-persistence.js',
    'state/35-persist-snapshot-helpers.js',
    'state/35-conversation-mutation-persistence.js',
    'summary/54-summarization-runtime.js',
    'summary/58-summary-manager-generation-ui.js',
    'events/70-send-message-helpers.js',
    'events/70-events-init.js',
];

function createIDBContext(clock, indexedDB) {
    const context = {
        indexedDB,
        window: { indexedDB },
        console: { warn() {}, error() {} },
        Date,
        Error,
        Promise,
        JSON,
        Object,
        Array,
        Map,
        Set,
        Number,
        String,
        setTimeout: clock.setTimeout,
        clearTimeout: clock.clearTimeout,
    };
    vm.createContext(context);
    for (const file of IDB_FILES) vm.runInContext(source(file), context, { filename: file });
    vm.runInContext(`this.api = {
        openIDBStorage, resetIDBStorageConnection, resetIDBStorageConnectionIfCurrent,
        delayIDBStorage, withRetryIDBStorage, normalizeIDBStorageData, getIDBStorageInfo,
        runIDBStorageTransaction, loadAllIDBStorage, saveAllIDBStorage, clearIDBStorage,
        IDBStorage, IDB_STORAGE_OPEN_TIMEOUT_MS, IDB_STORAGE_TRANSACTION_TIMEOUT_MS
    };`, context);
    return context.api;
}

function createIDBStorage(api) {
    return {
        _dbName: 'OpenTavernSnapshotDB',
        _storeName: 'snapshots',
        _key: 'main',
        _dbPromise: null,
        _db: null,
        _resetConnection() { return api.resetIDBStorageConnection(this); },
        _open(options = {}) { return api.openIDBStorage(this, options); },
        _normalize(data) { return api.normalizeIDBStorageData(data); },
        _delay(ms) { return api.delayIDBStorage(ms); },
        _withRetry(operation, options) { return api.withRetryIDBStorage(this, operation, options); },
        loadAll(options) { return api.loadAllIDBStorage(this, options); },
        saveAll(data, options) { return api.saveAllIDBStorage(this, data, options); },
        clear() { return api.clearIDBStorage(this); },
        getStorageInfo() { return api.getIDBStorageInfo(this); },
    };
}

function createOpenFixture(clock) {
    const opened = [];
    const closed = [];
    const createdStores = [];
    let mode = 'hang';
    function makeDb(label) {
        return {
            label,
            closed: false,
            objectStoreNames: { contains: (name) => createdStores.includes(name) },
            createObjectStore(name) { createdStores.push(name); },
            close() {
                if (this.closed) return;
                this.closed = true;
                closed.push(label);
                const handler = this.onclose;
                if (typeof handler === 'function') Promise.resolve().then(() => handler({ target: this }));
            },
            onversionchange: null,
            onclose: null,
            onerror: null,
            transaction() { throw new Error('transaction not used by open fixture'); },
        };
    }
    const indexedDB = {
        open(name, version) {
            const request = { name, version, error: null };
            const requestedMode = mode;
            opened.push(request);
            Promise.resolve().then(() => {
                if (requestedMode === 'hang') return;
                if (requestedMode === 'blocked') {
                    if (request.onblocked) request.onblocked({ target: request });
                    return;
                }
                if (requestedMode === 'error') {
                    request.error = new Error('open failed');
                    if (request.onerror) request.onerror({ target: request });
                    return;
                }
                const db = makeDb(`db-${opened.length}`);
                request.result = db;
                if (request.onupgradeneeded) request.onupgradeneeded({ target: { result: db } });
                if (request.onsuccess) request.onsuccess({ target: { result: db } });
            });
            return request;
        },
    };
    return { indexedDB, opened, closed, createdStores, makeDb, setMode(value) { mode = value; } };
}

function createTransactionFixture() {
    const canonical = new Map();
    const events = [];
    const transactions = [];
    let modes = [];
    let abortThrows = false;
    let nativeAbortError = null;
    let writes = 0;
    function makeTransaction(mode) {
        const tx = { mode, error: null, aborted: false, completed: false, abortCalls: 0, oncomplete: null, onerror: null, onabort: null };
        const txMode = modes.length ? modes.shift() : 'ok';
        tx.abort = () => {
            tx.abortCalls += 1;
            events.push(`abort:${txMode}`);
            if (abortThrows) {
                const error = new Error('Transaction already completed');
                error.name = 'InvalidStateError';
                throw error;
            }
            tx.aborted = true;
            const handler = tx.onabort;
            if (handler) Promise.resolve().then(() => handler({ target: tx }));
        };
        const store = {
            get(key) {
                const request = {};
                if (txMode === 'ok') {
                    Promise.resolve().then(() => {
                        request.result = canonical.has(key) ? canonical.get(key) : null;
                        if (request.onsuccess) request.onsuccess({ target: request });
                    });
                }
                return request;
            },
            put(value, key) {
                if (txMode === 'commit-no-callback') {
                    writes += 1;
                    canonical.set(key, value);
                    tx.completed = true;
                    events.push('commit');
                    return;
                }
                if (txMode === 'native-abort') {
                    writes += 1;
                    Promise.resolve().then(() => {
                        const source = nativeAbortError || new Error('IndexedDB transaction aborted');
                        tx.error = Object.assign(new Error(source.message), { name: source.name, code: source.code });
                        if (tx.onabort) tx.onabort({ target: tx });
                    });
                    return;
                }
                if (txMode !== 'ok') return;
                writes += 1;
                Promise.resolve().then(() => {
                    if (tx.aborted) return;
                    canonical.set(key, value);
                    tx.completed = true;
                    events.push('commit');
                    if (tx.oncomplete) tx.oncomplete({ target: tx });
                });
            },
            delete(key) {
                if (txMode !== 'ok') return;
                Promise.resolve().then(() => {
                    if (tx.aborted) return;
                    canonical.delete(key);
                    tx.completed = true;
                    events.push('commit');
                    if (tx.oncomplete) tx.oncomplete({ target: tx });
                });
            },
        };
        tx.objectStore = () => store;
        transactions.push(tx);
        return tx;
    }
    const db = {
        objectStoreNames: { contains: () => true },
        createObjectStore() {},
        close() {},
        onversionchange: null,
        onclose: null,
        onerror: null,
        transaction(name, mode) { return makeTransaction(mode); },
    };
    return {
        db,
        canonical,
        events,
        transactions,
        get writes() { return writes; },
        setModes(values) { modes = values.slice(); },
        setAbortThrows(value) { abortThrows = value; },
        setNativeAbortError(error) { nativeAbortError = error; },
    };
}

function createServiceFixture() {
    const transactions = createTransactionFixture();
    const openRequests = [];
    const db = Object.assign({}, transactions.db);
    const indexedDB = {
        open(name, version) {
            const request = { name, version };
            openRequests.push(request);
            Promise.resolve().then(() => {
                request.result = db;
                if (request.onsuccess) request.onsuccess({ target: { result: db } });
            });
            return request;
        },
    };
    return Object.assign({}, transactions, { db, indexedDB, openRequests });
}

const dummyIndexedDB = { open() { throw new Error('not used'); } };

// Open never calls back: bounded rejection, stale handle closed, newer connection fenced.
{
    const clock = createClock();
    const fixture = createOpenFixture(clock);
    const api = createIDBContext(clock, fixture.indexedDB);
    const storage = createIDBStorage(api);

    let firstError = null;
    const firstSettled = storage._open().then(() => null, (error) => { firstError = error; return null; });
    await clock.advance(api.IDB_STORAGE_OPEN_TIMEOUT_MS);
    await firstSettled;
    assert.match(firstError.message, /open timed out/);
    assert.equal(storage._dbPromise, null, 'A timed-out open must be reopenable.');

    const staleDb = fixture.makeDb('stale');
    fixture.opened[0].onsuccess({ target: { result: staleDb } });
    await flushMicrotasks();
    assert.equal(staleDb.closed, true, 'A late open handle after timeout must be closed.');
    assert.equal(storage._db, null, 'A late open handle must not become current.');

    fixture.setMode('success');
    const db1 = await storage._open();
    assert.equal(storage._db, db1);
    assert.ok(fixture.createdStores.includes('snapshots'), 'Normal upgrade must create the configured store.');
    const healthyPromise = storage._dbPromise;

    fixture.opened[0].onerror();
    fixture.opened[0].onblocked();
    await flushMicrotasks();
    assert.equal(storage._db, db1, 'A stale open error must not reset the newer healthy database.');
    assert.equal(storage._dbPromise, healthyPromise, 'A stale open error must not clear the newer cached promise.');

    const db2 = await storage._open({ fresh: true });
    assert.notEqual(db2, db1);
    assert.equal(db1.closed, true);
    await flushMicrotasks();
    assert.equal(storage._db, db2);

    db1.onclose({ target: db1 });
    db1.onversionchange({ target: db1 });
    await flushMicrotasks();
    assert.equal(storage._db, db2, 'A stale close/versionchange handler must not reset the newer healthy database.');
    assert.equal(await storage._open(), db2);

    db2.onclose({ target: db2 });
    assert.equal(storage._db, null, 'The current database close must reset its own connection.');
    assert.equal(storage._dbPromise, null);
}

// Normal blocked and error opens reject promptly; a late success still closes its handle.
for (const mode of ['blocked', 'error']) {
    const clock = createClock();
    const fixture = createOpenFixture(clock);
    fixture.setMode(mode);
    const api = createIDBContext(clock, fixture.indexedDB);
    const storage = createIDBStorage(api);
    await assert.rejects(storage._open(), mode === 'blocked' ? /blocked/ : /open failed/);
    assert.equal(storage._dbPromise, null);
    const lateDb = fixture.makeDb(`late-${mode}`);
    fixture.opened[0].onsuccess({ target: { result: lateDb } });
    await flushMicrotasks();
    assert.equal(lateDb.closed, true);
    assert.equal(storage._db, null);
}

// A superseded pending open must not attach over a newer fresh connection.
{
    const clock = createClock();
    const fixture = createOpenFixture(clock);
    const api = createIDBContext(clock, fixture.indexedDB);
    const storage = createIDBStorage(api);
    let oldError = null;
    const oldOpen = storage._open().then(() => null, (error) => { oldError = error; return null; });
    fixture.setMode('success');
    const newerDb = await storage._open({ fresh: true });
    const supersededDb = fixture.makeDb('superseded');
    fixture.opened[0].onsuccess({ target: { result: supersededDb } });
    await oldOpen;
    assert.match(oldError.message, /superseded/);
    assert.equal(supersededDb.closed, true, 'A superseded open handle must be closed.');
    assert.equal(storage._db, newerDb, 'A superseded open must not overwrite the newer connection.');
    assert.equal(await storage._open(), newerDb);
}

// A stale open timeout must settle only its own request; a newer cached connection stays intact.
{
    const clock = createClock();
    const fixture = createOpenFixture(clock);
    const api = createIDBContext(clock, fixture.indexedDB);
    const storage = createIDBStorage(api);
    let oldError = null;
    const oldOpen = storage._open().then(() => null, (error) => { oldError = error; return null; });
    fixture.setMode('success');
    const newerDb = await storage._open({ fresh: true });
    const newerPromise = storage._dbPromise;
    await clock.advance(api.IDB_STORAGE_OPEN_TIMEOUT_MS);
    await oldOpen;
    assert.match(oldError.message, /open timed out/);
    assert.equal(storage._db, newerDb, 'A stale timeout must not detach a newer connection.');
    assert.equal(storage._dbPromise, newerPromise, 'A stale timeout must not clear a newer cached open promise.');
}

// An older open failure through withRetry must not clear a newer pending open promise.
{
    const clock = createClock();
    const api = createIDBContext(clock, dummyIndexedDB);
    let rejectOldOpen = null;
    const oldOpen = new Promise((_, reject) => { rejectOldOpen = reject; });
    const newerOpen = new Promise(() => {});
    let resets = 0;
    const storage = {
        _db: null,
        _dbPromise: newerOpen,
        _open() { return oldOpen; },
        _resetConnection() {
            resets += 1;
            this._db = null;
            this._dbPromise = null;
        },
        _delay() { return Promise.resolve(); },
    };
    const running = api.withRetryIDBStorage(storage, async () => 'ok', { retries: 1 });
    const rejected = assert.rejects(running, /old open failed/);
    rejectOldOpen(new Error('old open failed'));
    await rejected;
    assert.equal(storage._dbPromise, newerOpen, 'An old open failure must not clear a newer pending open promise.');
    assert.equal(resets, 0, 'An old open failure must not reset a newer pending connection state.');
}

// Readonly get never calls back: bounded failure, then reconnect and retry.
{
    const clock = createClock();
    const fixture = createTransactionFixture();
    fixture.canonical.set('main', { data: { conversations: { c1: { messages: [{ content: 'stored' }] } }, lastSaved: 123 } });
    fixture.setModes(['hang', 'ok']);
    const api = createIDBContext(clock, dummyIndexedDB);
    const storage = createIDBStorage(api);
    let opens = 0;
    storage._open = async () => { opens += 1; return fixture.db; };

    const loading = storage.loadAll({ throwOnError: true });
    await clock.advance(api.IDB_STORAGE_TRANSACTION_TIMEOUT_MS + 40 + api.IDB_STORAGE_TRANSACTION_TIMEOUT_MS + 100);
    const data = await loading;
    assert.equal(opens, 2, 'A hung read must retry with a fresh open.');
    assert.equal(data.conversations.c1.messages[0].content, 'stored');
    assert.equal(fixture.transactions[0].abortCalls, 1, 'The timed-out read transaction must be aborted.');
}

// All readonly attempts hang: throwOnError rejects with the read timeout instead of hanging.
{
    const clock = createClock();
    const fixture = createTransactionFixture();
    fixture.setModes(['hang', 'hang']);
    const api = createIDBContext(clock, dummyIndexedDB);
    const storage = createIDBStorage(api);
    storage._open = async () => fixture.db;
    const loading = storage.loadAll({ throwOnError: true });
    const rejected = assert.rejects(loading, /IndexedDB read timed out/);
    await clock.advance(20000);
    await rejected;
    assert.equal(fixture.transactions.length, 2);
    assert.equal(fixture.transactions.every((tx) => tx.abortCalls === 1), true);
}

// Readwrite never completes: abort before settlement, late callbacks ignored, abort failure conservative.
for (const abortThrows of [false, true]) {
    const clock = createClock();
    const fixture = createTransactionFixture();
    fixture.setModes(['hang']);
    fixture.setAbortThrows(abortThrows);
    const api = createIDBContext(clock, dummyIndexedDB);
    const storage = createIDBStorage(api);
    let outcome = null;
    const pending = api.runIDBStorageTransaction(fixture.db, storage, 'readwrite', (tx, resolve) => {
        tx.oncomplete = () => resolve('committed');
        tx.objectStore('snapshots').put({ data: { conversations: { stale: {} } } }, 'main');
    }, { timeout: 'IndexedDB save timed out' }).then(
        (value) => { outcome = { ok: true, value }; },
        (error) => { outcome = { ok: false, error }; }
    );
    await clock.advance(api.IDB_STORAGE_TRANSACTION_TIMEOUT_MS);
    await pending;
    assert.equal(outcome.ok, false);
    assert.match(outcome.error.message, /save timed out/);
    const tx = fixture.transactions[0];
    assert.equal(tx.abortCalls, 1, 'The timed-out write must request abort before returning failure.');
    assert.equal(tx.oncomplete, null, 'Timed-out transaction handlers must be detached.');
    tx.oncomplete && tx.oncomplete();
    tx.onerror && tx.onerror();
    tx.onabort && tx.onabort();
    await flushMicrotasks();
    assert.equal(fixture.canonical.has('main'), false, 'A late completion must not be reported as success.');
    assert.equal(outcome.ok, false);
}

// A committed write whose completion callback never fires and whose abort reports completion is verified once.
{
    const clock = createClock();
    const fixture = createTransactionFixture();
    const indexedDB = {
        open() {
            const request = {};
            Promise.resolve().then(() => {
                request.result = fixture.db;
                if (request.onsuccess) request.onsuccess({ target: { result: fixture.db } });
            });
            return request;
        },
    };
    const api = createIDBContext(clock, indexedDB);
    const storage = createIDBStorage(api);
    const candidate = {
        conversations: { c1: { id: 'c1', messages: [{ content: 'committed-before-callback' }] } },
        lastSaved: 50,
    };
    fixture.setModes(['commit-no-callback', 'ok']);
    fixture.setAbortThrows(true);
    const saving = storage.saveAll(candidate);
    await clock.advance(api.IDB_STORAGE_TRANSACTION_TIMEOUT_MS);
    await saving;
    assert.equal(fixture.transactions[0].abortCalls, 1);
    assert.equal(fixture.writes, 1, 'A committed ambiguous write must be confirmed instead of retried.');
    assert.equal(fixture.transactions.length, 2, 'Ambiguous completion must use exactly one bounded readback.');
    assert.equal(fixture.transactions[1].mode, 'readonly');
    assert.equal(fixture.canonical.get('main').data.lastSaved, 50);
    assert.equal(fixture.canonical.get('main').data.conversations.c1.messages[0].content, 'committed-before-callback');

    fixture.setAbortThrows(false);
    fixture.setModes(['ok']);
    const newer = {
        conversations: { c1: { id: 'c1', messages: [{ content: 'newest' }] } },
        lastSaved: 60,
    };
    await storage.saveAll(newer);
    assert.equal(fixture.writes, 2);
    assert.equal(fixture.canonical.get('main').data.lastSaved, 60, 'A later accepted write must remain newest.');
    assert.equal(fixture.canonical.get('main').data.conversations.c1.messages[0].content, 'newest');
}

// A native abort event is already a known rollback: preserve its concrete error and never abort again.
for (const nativeError of [
    Object.assign(new Error('Disk quota exceeded'), { name: 'QuotaExceededError', code: 22 }),
    Object.assign(new Error('The transaction was aborted'), { name: 'AbortError', code: 20 }),
]) {
    const clock = createClock();
    const fixture = createTransactionFixture();
    const indexedDB = {
        open() {
            const request = {};
            Promise.resolve().then(() => {
                request.result = fixture.db;
                if (request.onsuccess) request.onsuccess({ target: { result: fixture.db } });
            });
            return request;
        },
    };
    const api = createIDBContext(clock, indexedDB);
    const storage = createIDBStorage(api);
    const candidate = {
        conversations: { c1: { id: 'c1', messages: [{ content: 'rejected' }] } },
        lastSaved: 70,
    };
    fixture.setModes(['native-abort', 'native-abort']);
    fixture.setAbortThrows(true);
    fixture.setNativeAbortError(nativeError);
    const saving = storage.saveAll(candidate);
    const rejected = assert.rejects(saving, (error) => {
        assert.equal(error.name, nativeError.name, 'A known native abort must preserve the transaction error name.');
        assert.equal(error.code, nativeError.code, 'A known native abort must preserve the transaction error code.');
        assert.equal(error.message, nativeError.message, 'A known native abort must preserve the transaction error message.');
        assert.equal(error.idbAbortUncertain, undefined, 'A known native abort is not uncertain.');
        assert.equal(error.idbSaveUncertain, undefined, 'A known native abort must not be rewritten as an uncertain save.');
        return true;
    });
    await clock.advance(100);
    await rejected;
    assert.equal(fixture.transactions.length, 2, 'A known native abort keeps the existing single retry.');
    assert.equal(fixture.transactions.every((tx) => tx.mode === 'readwrite'), true, 'A known native abort must not trigger uncertainty readback.');
    assert.equal(fixture.transactions.every((tx) => tx.abortCalls === 0), true, 'A finished transaction must not be aborted again.');
    assert.equal(fixture.writes, 2);
    assert.equal(fixture.canonical.has('main'), false, 'A known native abort must leave the previous snapshot untouched.');
}

// Clear uses the same bounded transaction contract.
{
    const clock = createClock();
    const fixture = createTransactionFixture();
    fixture.setModes(['hang', 'hang']);
    const api = createIDBContext(clock, dummyIndexedDB);
    const storage = createIDBStorage(api);
    storage._open = async () => fixture.db;
    const clearing = storage.clear();
    await clock.advance(20000);
    await clearing;
    assert.equal(fixture.transactions.length, 2);
    assert.equal(fixture.transactions.every((tx) => tx.abortCalls === 1), true);
}

// The real storage save pipeline keeps localStorage as the emergency canonical fallback.
{
    const clock = createClock();
    const fixture = createTransactionFixture();
    const indexedDB = {
        open() {
            const request = {};
            Promise.resolve().then(() => {
                request.result = fixture.db;
                if (request.onsuccess) request.onsuccess({ target: { result: fixture.db } });
            });
            return request;
        },
    };
    const api = createIDBContext(clock, indexedDB);
    const idbStorage = createIDBStorage(api);
    const localData = new Map();
    let failLocalWrites = false;
    const context = {
        STORAGE_KEY: 'opentavern-test-storage',
        STORAGE_BACKUP_PREFIX: 'opentavern-test-backup-',
        STORAGE_CLEAR_KEY: 'opentavern-test-clear',
        IDBStorage: idbStorage,
        OPFSStorage: { async loadAll() { return null; }, async saveAll() {} },
        localStorage: {
            getItem(key) { return localData.has(key) ? localData.get(key) : null; },
            setItem(key, value) {
                if (failLocalWrites) throw new Error('localStorage quota');
                localData.set(key, String(value));
            },
            removeItem(key) { localData.delete(key); },
        },
        console: { warn() {}, error() {} },
        Date,
        JSON,
        Object,
        Array,
        Promise,
        Number,
        String,
        setTimeout: clock.setTimeout,
        clearTimeout: clock.clearTimeout,
    };
    vm.createContext(context);
    for (const file of ['storage/20-storage.js', 'storage/20-storage-service-save-helpers.js', 'storage/20-storage-service-save-canonical.js', 'storage/20-storage-service-save.js']) {
        vm.runInContext(source(file), context, { filename: file });
    }
    const service = {
        _idbAvailable: true,
        _idbFailed: false,
        _primaryBackend: 'idb',
        _lastUsedBackend: null,
        _lastSaveSnapshot: null,
        _opfsMirrorAvailable: false,
        _cloneForPersist: copy,
        _isQuotaError: () => false,
        _handleQuotaExceeded() {},
        _isDangerouslyEmptySnapshot: () => false,
        _hasUserData: () => true,
        _isValidSnapshot: () => true,
        _clearMarkerTime: () => 0,
        async _readNewestStoredSnapshotNoSync() { return null; },
        _saveLocalHistorySnapshot() {},
        _tryWriteLocalSnapshot(data) {
            try {
                context.localStorage.setItem(context.STORAGE_KEY, JSON.stringify(data));
                return true;
            } catch (_) {
                return false;
            }
        },
        async _syncSnapshotToAvailableBackends() {},
        _isSafari: () => false,
    };
    const first = { settings: { lang: 'A' }, conversations: { c1: { id: 'c1', messages: [{ content: 'A' }] } }, lastSaved: 10 };
    fixture.setModes(['hang', 'hang']);
    const saving = context.saveStorageServiceData(service, first);
    await clock.advance(20000);
    const result = await saving;
    assert.equal(result.refusedEmpty, false);
    assert.equal(JSON.parse(localData.get(context.STORAGE_KEY)).conversations.c1.messages[0].content, 'A');
    assert.equal(service._lastUsedBackend, 'localStorage', 'A timed-out IDB save must fall back to localStorage.');

    failLocalWrites = true;
    fixture.setModes(['hang', 'hang']);
    const second = { settings: { lang: 'B' }, conversations: { c1: { id: 'c1', messages: [{ content: 'B' }] } }, lastSaved: 20 };
    const failing = context.saveStorageServiceData(service, second);
    const rejected = assert.rejects(failing, /IndexedDB save timed out/);
    await clock.advance(20000);
    await rejected;

    // A committed write with a lost completion callback and a failing emergency fallback is confirmed by readback.
    fixture.setAbortThrows(true);
    fixture.setModes(['commit-no-callback', 'ok']);
    const committed = { settings: { lang: 'C' }, conversations: { c1: { id: 'c1', messages: [{ content: 'C' }] } }, lastSaved: 30 };
    const committing = context.saveStorageServiceData(service, committed);
    await clock.advance(api.IDB_STORAGE_TRANSACTION_TIMEOUT_MS);
    const committedResult = await committing;
    assert.equal(committedResult.refusedEmpty, false);
    assert.equal(service._lastUsedBackend, 'idb', 'A verified committed write must stay canonical despite fallback failure.');
    assert.equal(fixture.writes, 1, 'A verified committed write must not be retried.');
    assert.equal(fixture.canonical.get('main').data.settings.lang, 'C');
    assert.equal(JSON.parse(localData.get(context.STORAGE_KEY)).settings.lang, 'A', 'The failed emergency writer must not overwrite stored user data.');

    fixture.setAbortThrows(false);
    fixture.setModes(['ok']);
    const newest = { settings: { lang: 'D' }, conversations: { c1: { id: 'c1', messages: [{ content: 'D' }] } }, lastSaved: 40 };
    await context.saveStorageServiceData(service, newest);
    assert.equal(fixture.writes, 2);
    assert.equal(fixture.canonical.get('main').data.settings.lang, 'D', 'A later accepted snapshot must remain newest.');
    assert.equal(service._lastSaveSnapshot.settings.lang, 'D');

    // If neither the readback nor the emergency fallback can confirm, fail honestly without clearing the committed record.
    fixture.setAbortThrows(true);
    fixture.setModes(['commit-no-callback', 'hang']);
    const unverified = { settings: { lang: 'E' }, conversations: { c1: { id: 'c1', messages: [{ content: 'E' }] } }, lastSaved: 50 };
    const unverifiedSave = context.saveStorageServiceData(service, unverified);
    const uncertainRejected = assert.rejects(unverifiedSave, /uncertain/i);
    await clock.advance(api.IDB_STORAGE_TRANSACTION_TIMEOUT_MS * 2 + 100);
    await uncertainRejected;
    assert.equal(fixture.writes, 3);
    assert.equal(fixture.canonical.get('main').data.settings.lang, 'E', 'The committed candidate must remain physically present, not be treated as empty.');
    assert.equal(JSON.parse(localData.get(context.STORAGE_KEY)).settings.lang, 'A', 'A failed fallback must not rewrite stored user data.');

    // A known native quota abort is preserved for the existing quota handler instead of becoming uncertainty.
    const quotaHandled = [];
    service._isQuotaError = (error) => !!(error && error.name === 'QuotaExceededError');
    service._handleQuotaExceeded = (error, data) => quotaHandled.push({ name: error.name, lastSaved: data.lastSaved });
    fixture.setAbortThrows(true);
    fixture.setModes(['native-abort', 'native-abort']);
    fixture.setNativeAbortError(Object.assign(new Error('Disk quota exceeded'), { name: 'QuotaExceededError', code: 22 }));
    const quotaSave = context.saveStorageServiceData(service, {
        settings: { lang: 'F' },
        conversations: { c1: { id: 'c1', messages: [{ content: 'F' }] } },
        lastSaved: 60,
    });
    const quotaRejected = assert.rejects(quotaSave, (error) => error && error.name === 'QuotaExceededError' && error.code === 22);
    await clock.advance(200);
    await quotaRejected;
    assert.equal(quotaHandled.length, 1, 'A known native quota abort must keep existing quota handling.');
    assert.equal(quotaHandled[0].lastSaved, 60);
    assert.equal(JSON.parse(localData.get(context.STORAGE_KEY)).settings.lang, 'A', 'A quota abort must not rewrite stored user data.');
}

function createPersistenceHarness() {
    const clock = createClock();
    const fixture = createServiceFixture();
    const alerts = [];
    const requests = [];
    const summaries = [];
    const saves = [];
    const events = [];
    const renders = [];
    let inputText = 'Hello';
    let attachments = [{ name: 'photo.png' }];
    let durable = null;
    let localSnapshot = null;
    let storageMode = 'idb';
    let releaseStorage = null;
    const conv = {
        id: 'a',
        title: 'Chat',
        messages: [
            { id: 'u1', role: 'user', content: 'Question' },
            { id: 'm1', role: 'assistant', content: 'Original' },
        ],
        summaries: [],
        updated: 1,
    };
    const state = {
        conversations: { a: conv },
        conversationOrder: ['a'],
        activeConvId: 'a',
        settings: { model: 'mock', lang: 'en' },
        isGenerating: false,
    };
    const dom = {
        summaryGenerateBtn: { disabled: false },
        summaryManagerStatus: { textContent: '' },
        summaryManagerModal: {
            hidden: true,
            classList: {
                add() { dom.summaryManagerModal.hidden = true; },
                remove() { dom.summaryManagerModal.hidden = false; },
                contains() { return dom.summaryManagerModal.hidden; },
            },
        },
    };
    let generated = 0;
    const context = {
        console: { warn() {}, error() {}, log() {} },
        state,
        dom,
        document: { getElementById: () => null },
        appStore: { notify() {} },
        Date,
        Error,
        Promise,
        JSON,
        Object,
        Array,
        Map,
        Set,
        Number,
        String,
        setTimeout: clock.setTimeout,
        clearTimeout: clock.clearTimeout,
        t: (key) => key,
        makeId: () => `id-${++generated}`,
        alert: (message) => alerts.push(message),
        getSafeSettingsForPersist: () => copy(state.settings),
        getCloudSyncPortableSettings: (value) => copy(value),
        scheduleCloudSyncUpload() {},
        updateStorageInfo() {},
        captureComposerMessage: () => ({ draft: {}, revision: 1, text: inputText, attachments: copy(attachments) }),
        clearCommittedComposerMessage: () => { inputText = ''; attachments = []; },
        prepareGroupSpeakerForUserMessage() {},
        updateInputState() {},
        requestFullRender() {},
        renderMessagesOnly() {},
        updateStreamingBubble() {},
        streamChat: (...args) => requests.push(args),
        handlePrimaryAssistantComplete() {},
        getCurrentGeneratingSpeakerName: () => 'Alice',
        isGroupChat: () => false,
        generateSummary: (messages, callback) => summaries.push({ messages: copy(messages), callback }),
        getSummaryManagerRegularMessages: (target) => target.messages.filter((message) => message.role !== 'system'),
        getActiveSummarySelection: (regular) => ({ subset: regular.slice(), startIdx: 0, endIdx: regular.length - 1 }),
        renderSummaryManagerList: () => renders.push('list'),
        renderTokenBar: () => renders.push('tokens'),
        requestRender: () => renders.push('render'),
        indexedDB: fixture.indexedDB,
        window: { indexedDB: fixture.indexedDB },
    };
    vm.createContext(context);
    vm.runInContext('var composerSendInProgress = false;', context);
    for (const file of PERSISTENCE_FILES) vm.runInContext(source(file), context, { filename: file });
    const idbStorage = createIDBStorage(context.api || {
        openIDBStorage: context.openIDBStorage,
        resetIDBStorageConnection: context.resetIDBStorageConnection,
        normalizeIDBStorageData: context.normalizeIDBStorageData,
        delayIDBStorage: context.delayIDBStorage,
        withRetryIDBStorage: context.withRetryIDBStorage,
        loadAllIDBStorage: context.loadAllIDBStorage,
        saveAllIDBStorage: context.saveAllIDBStorage,
        clearIDBStorage: context.clearIDBStorage,
        getIDBStorageInfo: context.getIDBStorageInfo,
    });
    context.StorageService = {
        _cloneForPersist: copy,
        _isQuotaError: () => false,
        _lastSaveSnapshot: null,
        async saveAll(snapshot) {
            saves.push(copy(snapshot));
            events.push(`save:${snapshot.settings && snapshot.settings.lang}`);
            if (storageMode === 'never') {
                await new Promise((resolve, reject) => { releaseStorage = (error) => error ? reject(error) : resolve(); });
                durable = copy(snapshot);
                return { runtimeSnapshot: copy(snapshot), refusedEmpty: false };
            }
            try {
                await idbStorage.saveAll(snapshot);
                durable = copy(snapshot);
                localSnapshot = copy(snapshot);
                events.push('idb-commit');
                return { runtimeSnapshot: copy(snapshot), refusedEmpty: false };
            } catch (error) {
                if (storageMode === 'fallback') {
                    localSnapshot = copy(snapshot);
                    events.push('fallback');
                    return { runtimeSnapshot: copy(snapshot), refusedEmpty: false };
                }
                throw error;
            }
        },
    };
    context.normalizeConversationMessageIdentity(conv);
    context.rememberCloudSyncConversationBaseline();
    return {
        clock,
        fixture,
        context,
        conv,
        state,
        alerts,
        requests,
        summaries,
        saves,
        events,
        renders,
        dom,
        get inputText() { return inputText; },
        get attachments() { return attachments; },
        get durable() { return durable; },
        get localSnapshot() { return localSnapshot; },
        setStorageMode(value) { storageMode = value; },
        releaseStorage(error) { if (releaseStorage) releaseStorage(error); },
        hasPendingStorage() { return typeof releaseStorage === 'function'; },
    };
}

// Pre-fix reproduction: a non-settling persistence promise leaves send busy with zero requests.
{
    const harness = createPersistenceHarness();
    harness.setStorageMode('never');
    const sending = harness.context.sendMessage();
    await flushMicrotasks();
    await flushMicrotasks();
    assert.equal(harness.context.composerSendInProgress, true);
    await harness.clock.advance(60000);
    assert.equal(harness.requests.length, 0, 'Pre-fix reproduction: no model request while persistence is pending.');
    assert.equal(harness.inputText, 'Hello', 'Pre-fix reproduction: input remains while persistence is pending.');
    assert.equal(harness.conv.messages.some((message) => message.content === 'Hello'), false);
    harness.releaseStorage(new Error('pre-fix cleanup'));
    await sending;
    assert.equal(harness.context.composerSendInProgress, false);
    console.log('Reproduced pre-fix unbounded persistence: send retained input/lock and issued zero model requests.');
}

// Pre-fix reproduction: a successful summary never commits while persistence is pending.
{
    const harness = createPersistenceHarness();
    harness.setStorageMode('never');
    harness.context.doGenerateSummary();
    const summaryRun = harness.summaries[0].callback(null, 'Pending summary');
    await flushMicrotasks();
    await harness.clock.advance(60000);
    assert.equal(harness.conv.summaries.length, 0);
    assert.equal(harness.dom.summaryGenerateBtn.disabled, true);
    harness.releaseStorage(new Error('pre-fix cleanup'));
    await summaryRun;
    assert.equal(harness.conv.summaries.length, 0);
    assert.equal(harness.dom.summaryGenerateBtn.disabled, false);
    console.log('Reproduced pre-fix unbounded persistence: summary stayed pending and never committed.');
}

// Send with all canonical backends failing: bounded failure, input/attachments retained, lock released.
{
    const harness = createPersistenceHarness();
    harness.fixture.setModes(['hang', 'hang']);
    const sending = harness.context.sendMessage();
    await flushMicrotasks();
    assert.equal(harness.context.composerSendInProgress, true);
    await harness.clock.advance(20000);
    await sending;
    assert.equal(harness.context.composerSendInProgress, false, 'Send must release its lock after bounded storage failure.');
    assert.equal(harness.inputText, 'Hello', 'Send failure must retain the unsent text.');
    assert.deepEqual(harness.attachments, [{ name: 'photo.png' }], 'Send failure must retain attachments.');
    assert.equal(harness.requests.length, 0, 'Send failure must not issue a model request.');
    assert.equal(harness.conv.messages.some((message) => message.content === 'Hello'), false, 'Send failure must not commit a user bubble.');
    assert.equal(harness.conv._messageCommitInProgress, undefined);
    assert.ok(harness.alerts.some((message) => /timed out/i.test(message)));
    assert.equal(harness.fixture.transactions.filter((tx) => tx.abortCalls === 1).length, 2);

    harness.fixture.setModes(['ok']);
    await harness.context.sendMessage();
    assert.equal(harness.inputText, '', 'Healthy retry must clear the committed composer text.');
    assert.equal(harness.requests.length, 1, 'Healthy retry must issue exactly one model request.');
    assert.equal(harness.conv.messages.some((message) => message.content === 'Hello'), true);
    assert.equal(harness.context.composerSendInProgress, false);
    assert.equal(harness.durable.conversations.a.messages.some((message) => message.content === 'Hello'), true);
}

// Summary model succeeds but persistence times out: previous summary/history retained, lock released, retry works.
{
    const harness = createPersistenceHarness();
    const previous = {
        id: 'previous',
        text: 'Previous summary',
        summaryVersion: 2,
        sourceMessages: harness.context.captureSummarySources(harness.conv.messages.slice(0, 2)),
        coveredStart: 0,
        coveredEnd: 1,
        created: 1,
    };
    harness.conv.summaries = [previous];
    harness.context.refreshSummaryValidity(harness.conv);
    harness.fixture.setModes(['hang', 'hang']);
    harness.context.doGenerateSummary();
    assert.equal(harness.dom.summaryGenerateBtn.disabled, true);
    const summaryRun = harness.summaries[0].callback(null, 'Fresh summary');
    await flushMicrotasks();
    await harness.clock.advance(20000);
    await summaryRun;
    assert.equal(harness.conv.summaries.length, 1, 'A failed summary save must preserve the previous summary.');
    assert.equal(harness.conv.summaries[0].id, 'previous');
    assert.equal(harness.conv.messages.length, 2, 'Summary failure must preserve source messages.');
    assert.equal(harness.dom.summaryGenerateBtn.disabled, false, 'Summary failure must release the generate button.');
    assert.equal(harness.dom.summaryManagerStatus.textContent, '');
    assert.equal(harness.context.summaryInFlightConversations.size, 0, 'Summary failure must release the in-flight lock.');
    assert.ok(harness.alerts.some((message) => /Summary error/.test(message)));

    harness.fixture.setModes(['ok']);
    harness.context.doGenerateSummary();
    const retryRun = harness.summaries[1].callback(null, 'Fresh summary');
    await flushMicrotasks();
    await harness.clock.advance(1000);
    await retryRun;
    assert.equal(harness.conv.summaries.length, 2, 'A healthy summary retry must commit the new summary.');
    assert.equal(harness.dom.summaryGenerateBtn.disabled, false);
    assert.ok(harness.renders.includes('list'));
    assert.equal(harness.durable.conversations.a.summaries.length, 2);
}

// A timed-out old candidate is aborted before the queue advances; a later accepted snapshot stays newest.
{
    const harness = createPersistenceHarness();
    harness.setStorageMode('fallback');
    harness.fixture.setModes(['hang', 'hang', 'ok']);
    harness.state.settings.lang = 'A';
    const first = harness.context.persistState(true);
    await flushMicrotasks();
    harness.state.settings.lang = 'B';
    const second = harness.context.persistState(true);
    await harness.clock.advance(20000);
    await first;
    await second;
    assert.equal(harness.fixture.transactions[0].abortCalls, 1, 'The old transaction must abort.');
    assert.ok(harness.fixture.events.some((event) => event.startsWith('abort:')), 'The old transaction must record its abort.');
    assert.ok(harness.events.indexOf('save:B') > harness.events.indexOf('fallback'), 'The later snapshot must only start after the old bounded failure settles.');
    assert.equal(harness.durable.settings.lang, 'B', 'The later accepted snapshot must remain the newest durable snapshot.');
    assert.equal(harness.localSnapshot.settings.lang, 'B', 'The localStorage fallback must end with the later accepted snapshot.');
    assert.equal(harness.context.StorageService._lastSaveSnapshot.settings.lang, 'B');
    assert.equal(harness.fixture.canonical.get('main').data.settings.lang, 'B');
}

// A failed older candidate must not overwrite a later accepted snapshot.
{
    const harness = createPersistenceHarness();
    harness.fixture.setModes(['hang', 'hang', 'ok']);
    harness.state.settings.lang = 'A';
    const first = harness.context.persistState(true);
    await flushMicrotasks();
    harness.state.settings.lang = 'B';
    const second = harness.context.persistState(true);
    await harness.clock.advance(20000);
    await first;
    await second;
    assert.equal(harness.fixture.transactions[0].abortCalls, 1);
    assert.equal(harness.durable.settings.lang, 'B');
    assert.equal(harness.fixture.canonical.get('main').data.settings.lang, 'B', 'The timed-out old candidate must not be the durable snapshot.');
    assert.equal(harness.context.StorageService._lastSaveSnapshot.settings.lang, 'B');
}

// Optional OPFS recovery read hang must not block other candidates or inject a late result.
{
    const clock = createClock();
    let releaseOPFS = null;
    const context = {
        storageIsFileProtocol: () => false,
        navigator: { storage: { getDirectory() {} } },
        OPFSStorage: {
            loadAll: () => new Promise((resolve) => { releaseOPFS = resolve; }),
        },
        IDBStorage: {
            async loadAll() { return { conversations: { idb: {} }, lastSaved: 200 }; },
            async saveAll() {},
        },
        async readLegacyIndexedDB() { return null; },
        console: { warn() {} },
        JSON,
        Object,
        Array,
        Promise,
        setTimeout: clock.setTimeout,
        clearTimeout: clock.clearTimeout,
    };
    vm.createContext(context);
    for (const file of ['storage/20-storage-service-backend-sync.js', 'storage/20-storage-service-load-readers.js', 'storage/20-storage-service-load-candidates.js']) {
        vm.runInContext(source(file), context, { filename: file });
    }
    const service = {
        _idbAvailable: true,
        _opfsReadableAvailable: false,
        _isValidSnapshot: (data) => !!(data && data.conversations),
        _cloneForPersist: copy,
        _readLocalSnapshot: () => ({ conversations: { local: {} }, lastSaved: 300 }),
        _tryWriteLocalSnapshot() {},
        _isSafari: () => false,
    };
    const collecting = context.collectStorageServiceSnapshotCandidates(service, {});
    await clock.advance(5000);
    const collected = await collecting;
    assert.equal(collected.map((item) => item.backend).join(','), 'idb,localStorage');
    releaseOPFS({ conversations: { lateOPFS: {} }, lastSaved: 999 });
    await flushMicrotasks();
    assert.equal(collected.some((item) => item.backend === 'opfs'), false, 'A late OPFS result must be discarded.');
}

await new Promise((resolve) => setTimeout(resolve, 50));
assert.equal(unhandledRejections.length, 0, `Unexpected unhandled rejection: ${unhandledRejections.map((reason) => reason && reason.message).join('; ')}`);
process.removeListener('unhandledRejection', recordUnhandledRejection);
console.log('Storage timeout checks passed: bounded open/read/write/clear, stale connection fencing, ambiguous-write readback, fallback, send and summary recovery.');
