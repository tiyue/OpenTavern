import { assert } from '../support.mjs';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';


async function assertFrontendFileProtocolOPFSSilence() {
  const opfsSources = await Promise.all([
    '../../../src/app/storage/20-storage-opfs-location.js',
    '../../../src/app/storage/20-storage-opfs-unsupported.js',
    '../../../src/app/storage/20-storage-opfs-root.js',
    '../../../src/app/storage/20-storage-opfs-probe.js',
    '../../../src/app/storage/20-storage-opfs-environment.js',
    '../../../src/app/storage/20-storage-opfs-read-write-helpers.js',
    '../../../src/app/storage/20-storage-opfs-read-write.js',
    '../../../src/app/storage/20-storage-opfs-info.js',
    '../../../src/app/storage/20-storage-opfs-clear.js',
    '../../../src/app/storage/20-storage-opfs-io.js',
    '../../../src/app/storage/20-storage-opfs.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));
  const warnings = [];
  const errors = [];
  const context = {
    window: { location: { protocol: 'file:' }, isSecureContext: false },
    navigator: {
      storage: {
        getDirectory() {
          throw new Error('OPFS should be skipped on file://.');
        },
        estimate() {
          throw new Error('OPFS estimate should be skipped on file://.');
        },
      },
    },
    console: {
      ...console,
      warn: (...args) => warnings.push(args.join(' ')),
      error: (...args) => errors.push(args.join(' ')),
    },
    Date,
    Error,
    JSON,
  };

  vm.runInNewContext(`${opfsSources.join('\n')}\nthis.__opfs = OPFSStorage;`, context);

  assert(await context.__opfs.loadAll() === null, 'OPFS load should return null on file://.');
  await context.__opfs.saveAll({ lastSaved: Date.now(), conversations: {} });
  const info = await context.__opfs.getStorageInfo();
  await context.__opfs.clear();

  assert(info && info.backend === 'opfs' && info.used === 0, 'OPFS info should be empty on file://.');
  assert(info.fileProtocol === true, 'OPFS info should expose file protocol mode.');
  assert(info.opfsSkipped === true && info.opfsSkippedReason === 'file-protocol', 'OPFS info should expose file protocol skip state.');
  assert(warnings.length === 0, `OPFS file:// path should not warn: ${warnings.join('\n')}`);
  assert(errors.length === 0, `OPFS file:// path should not error: ${errors.join('\n')}`);
}

async function assertFrontendOPFSReadWriteHelpers() {
  const sources = await Promise.all([
    '../../../src/app/storage/20-storage-opfs-unsupported.js',
    '../../../src/app/storage/20-storage-opfs-read-write-helpers.js',
    '../../../src/app/storage/20-storage-opfs-read-write.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));
  const writes = [];
  const context = {
    console: { error() {}, warn() {} },
    Date: { now: () => 777 },
    JSON,
    Promise,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__load = loadAllOPFSStorage;\nthis.__save = saveAllOPFSStorage;\nthis.__write = doSaveAllOPFSStorage;`, context);

  const storage = {
    _fileName: 'opentavern-data.json',
    _writeLock: null,
    _isFileProtocol() { return false; },
    async _getRoot() {
      return {
        async getFileHandle(name, options) {
          if (options && options.create) {
            return {
              async createWritable() {
                return {
                  async write(value) { writes.push(value); },
                  async close() { writes.push('closed'); },
                };
              },
            };
          }
          return {
            async getFile() {
              return { async text() { return JSON.stringify({ conversations: { c1: {} } }); } };
            },
          };
        },
      };
    },
    async _doSaveAll(data) {
      writes.push(`save:${data.id}`);
    },
  };

  const loaded = await context.__load(storage);
  assert(loaded.conversations.c1 && loaded.lastSaved === 777, 'OPFS read helper should parse stored data and backfill lastSaved.');

  await context.__write(storage, { id: 'direct' });
  assert(writes.includes(JSON.stringify({ id: 'direct' })) && writes.includes('closed'), 'OPFS write helper should serialize data and close the writable stream.');

  writes.length = 0;
  let releaseFirst = null;
  storage._doSaveAll = async function(data) {
    writes.push(`save:${data.id}`);
    if (data.id === 1) {
      await new Promise((resolve) => { releaseFirst = resolve; });
    }
  };
  const first = context.__save(storage, { id: 1 });
  const second = context.__save(storage, { id: 2 });
  await Promise.resolve();
  assert(writes.join(',') === 'save:1', 'OPFS save helper should wait for the current write before starting the next one.');
  releaseFirst();
  await first;
  await second;
  assert(writes.join(',') === 'save:1,save:2', 'OPFS save helper should serialize queued writes.');
}

async function assertFrontendStorageRecoveryScanner() {
  const sources = await Promise.all([
    '../../../src/app/storage/23-storage-recovery-candidates.js',
    '../../../src/app/storage/23-storage-recovery-backends.js',
    '../../../src/app/storage/23-storage-recovery-scan.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));
  const recoveryStorageKey = 'opentavern-recovery-test-storage';
  const recoveryBackupPrefix = 'opentavern-recovery-test-backup-';
  const localStorageMock = {
    [recoveryStorageKey]: JSON.stringify({ settings: { model: 'local' }, lastSaved: 600 }),
    [`${recoveryBackupPrefix}one`]: JSON.stringify({ conversations: { backup: {} }, lastSaved: 300 }),
    getItem(key) { return Object.prototype.hasOwnProperty.call(this, key) ? this[key] : null; },
  };
  const warnings = [];
  const context = {
    STORAGE_KEY: recoveryStorageKey,
    STORAGE_BACKUP_PREFIX: recoveryBackupPrefix,
    storageIsFileProtocol() { return false; },
    OPFSStorage: { async loadAll() { return { lastSaved: 100 }; } },
    IDBStorage: { async loadAll(options) {
      assert(options.fresh === true && options.retries === 2, 'Recovery scanner should request a fresh IndexedDB snapshot.');
      return { characters: { card: {} }, lastSaved: 200 };
    } },
    async readLegacyIndexedDB() { return { conversations: { legacy: {} }, lastSaved: 150 }; },
    localStorage: localStorageMock,
    console: { warn: (...args) => warnings.push(args.join(' ')) },
    JSON,
    Object,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__scan = scanAllStorageBackends;\nthis.__recoverable = hasRecoverableStorageData;`, context);
  const candidates = await context.__scan();
  assert(candidates.length === 5, 'Storage recovery scanner should collect OPFS, IDB, localStorage, backup, and legacy candidates.');
  assert(candidates.slice(0, 3).every((item) => item.hasUserData), 'Storage recovery scanner should prioritize candidates with user data.');
  assert(candidates[0].lastSaved === 300 && candidates[1].lastSaved === 200 && candidates[2].lastSaved === 150, 'Storage recovery scanner should sort user-data candidates by freshness.');
  assert(candidates[3].backend === 'localStorage' && candidates[3].lastSaved === 600, 'Storage recovery scanner should keep settings-only local snapshots after user-data candidates.');
  assert(candidates[4].backend === 'OPFS' && candidates[4].hasUserData === false, 'Storage recovery scanner should keep metadata-only OPFS snapshots as lower-priority candidates.');
  assert(context.__recoverable({ settings: { model: 'only-settings' } }) === true, 'Recovery scanner should treat settings-only snapshots as recoverable.');
  assert(warnings.length === 0, `Storage recovery scanner should not warn on successful scans: ${warnings.join('\n')}`);
}

async function assertFrontendLegacyIDBRecoveryReader() {
  const sources = await Promise.all([
    '../../../src/app/storage/23-storage-legacy-idb-requests.js',
    '../../../src/app/storage/23-storage-legacy-idb-snapshot.js',
    '../../../src/app/storage/23-storage-legacy-idb.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  const events = [];
  let activeDb = null;
  function storeNames(names) {
    const list = names.slice();
    list.contains = (name) => list.includes(name);
    return list;
  }
  function asyncRequest(result) {
    const request = {};
    Promise.resolve().then(() => {
      request.result = result;
      if (request.onsuccess) request.onsuccess({ target: request });
    });
    return request;
  }
  function fakeDb(stores) {
    const names = storeNames(Object.keys(stores));
    return {
      objectStoreNames: names,
      close() { events.push('close'); },
      transaction(requestedStores, mode) {
        events.push(`tx:${mode}:${requestedStores.join(',')}`);
        return {
          objectStore(name) {
            return {
              get(key) {
                return asyncRequest(stores[name] && Object.prototype.hasOwnProperty.call(stores[name], key) ? stores[name][key] : null);
              },
              getAll() {
                return asyncRequest(Array.isArray(stores[name]) ? stores[name] : []);
              },
            };
          },
        };
      },
    };
  }

  const context = {
    indexedDB: {
      open(name) {
        events.push(`open:${name}`);
        const request = {};
        Promise.resolve().then(() => {
          if (request.onsuccess) request.onsuccess({ target: { result: activeDb } });
        });
        return request;
      },
    },
    Date: { now: () => 999 },
    Promise,
    Array,
    Object,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__read = readLegacyIndexedDB;\nthis.__build = buildLegacyIDBRecoverySnapshot;`, context);

  activeDb = fakeDb({
    settings: { main: { model: 'legacy-model' } },
    conversations: [{ id: 'c1', messages: [{ content: 'legacy chat' }] }, { title: 'missing id' }],
    worldBooks: [{ id: 'wb1', entries: [{ content: 'legacy world' }] }],
    metadata: { main: {
      conversationOrder: ['c1'],
      activeConvId: 'c1',
      characters: { arona: { name: 'Arona' } },
      charactersMigrated: true,
      lastSaved: 123,
    } },
  });
  const restored = await context.__read();
  assert(restored.settings.model === 'legacy-model', 'Legacy IDB reader should restore settings.');
  assert(restored.conversations.c1.messages[0].content === 'legacy chat', 'Legacy IDB reader should restore conversations by id.');
  assert(restored.worldBooks.wb1.entries[0].content === 'legacy world', 'Legacy IDB reader should restore world books by id.');
  assert(restored.characters.arona.name === 'Arona' && restored.charactersMigrated === true, 'Legacy IDB reader should restore character metadata.');
  assert(restored.lastSaved === 123 && restored._loadedFrom === 'legacy-idb', 'Legacy IDB reader should preserve metadata and source markers.');
  assert(events.includes('open:OpenTavernDB') && events.some((event) => event.startsWith('tx:readonly')) && events.includes('close'), 'Legacy IDB reader should open, transact, and close the old database.');

  events.length = 0;
  activeDb = fakeDb({ misc: [] });
  assert(await context.__read() === null, 'Legacy IDB reader should return null when no recoverable legacy stores exist.');
  assert(events.includes('close'), 'Legacy IDB reader should close databases without recoverable stores.');

  const fallback = context.__build(null, [{ id: 'c2' }], [], null);
  assert(fallback.conversations.c2.id === 'c2' && fallback.lastSaved === 999, 'Legacy IDB snapshot builder should map records by id and default timestamps.');
}

async function assertFrontendIDBStorageHelpers() {
  const sources = await Promise.all([
    '../../../src/app/storage/20-storage-idb-open-helpers.js',
    '../../../src/app/storage/20-storage-idb-connection.js',
    '../../../src/app/storage/20-storage-idb-helpers.js',
    '../../../src/app/storage/20-storage-idb-operations.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  let openCalls = 0;
  const createdStores = [];
  const fakeDb = {
    objectStoreNames: {
      contains(name) {
        return createdStores.includes(name);
      },
    },
    createObjectStore(name) {
      createdStores.push(name);
    },
  };
  const indexedDBMock = {
    open(name, version) {
      openCalls += 1;
      const req = { name, version };
      Promise.resolve().then(() => {
        if (req.onupgradeneeded) req.onupgradeneeded({ target: { result: fakeDb } });
        if (req.onsuccess) req.onsuccess({ target: { result: fakeDb } });
      });
      return req;
    },
  };
  const context = {
    indexedDB: indexedDBMock,
    window: { indexedDB: indexedDBMock },
    Date,
    Error,
    Promise,
    setTimeout,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__open = openIDBStorage;\nthis.__normalize = normalizeIDBStorageData;\nthis.__retry = withRetryIDBStorage;\nthis.__tx = runIDBStorageTransaction;`, context);

  const normalized = context.__normalize({ data: { conversations: {} } });
  assert(normalized.conversations && Number.isFinite(normalized.lastSaved), 'IDB normalize should unwrap stored snapshot data and add lastSaved.');

  let openResets = 0;
  const openStorage = {
    _dbName: 'OpenTavernSnapshotDB',
    _storeName: 'snapshots',
    _dbPromise: null,
    _db: null,
    _resetConnection() {
      openResets += 1;
      this._db = null;
      this._dbPromise = null;
    },
  };
  const openedDb = await context.__open(openStorage, {});
  const cachedDb = await context.__open(openStorage, {});
  assert(openedDb === fakeDb && cachedDb === fakeDb && openStorage._db === fakeDb, 'IDB open helper should cache successful database connections.');
  assert(openCalls === 1 && createdStores.join(',') === 'snapshots', 'IDB open helper should create the configured store once on upgrade.');
  fakeDb.onversionchange();
  assert(openResets === 1 && openStorage._db === null && openStorage._dbPromise === null, 'IDB open helper should reset cached connections on version changes.');

  let attempts = 0;
  let resets = 0;
  const storage = {
    async _open(options) {
      attempts += 1;
      if (attempts === 1) throw new Error('first failure');
      return { ok: true, fresh: !!options.fresh };
    },
    _resetConnection() { resets += 1; },
    async _delay() {},
  };
  const result = await context.__retry(storage, async (db) => db, { retries: 1 });
  assert(result.ok === true && result.fresh === true, 'IDB retry should reopen with a fresh connection after failure.');
  assert(attempts === 2 && resets === 1, 'IDB retry should reset once and retry exactly once.');

  let txArgs = null;
  const txResult = await context.__tx({
    transaction(storeName, mode) {
      txArgs = { storeName, mode };
      return {
        error: null,
        objectStore(name) {
          return { value: `store:${name}` };
        },
      };
    },
  }, { _storeName: 'snapshots' }, 'readonly', function(tx, resolve) {
    resolve(tx.objectStore('snapshots').value);
  });
  assert(txArgs.storeName === 'snapshots' && txArgs.mode === 'readonly' && txResult === 'store:snapshots', 'IDB transaction helper should run actions against the configured store and mode.');
}

async function assertFrontendStorageStatusRenderHelpers() {
  const sources = await Promise.all([
    '../../../src/app/storage/21-storage-opfs-status-text.js',
    '../../../src/app/storage/21-storage-usage-format.js',
    '../../../src/app/storage/21-storage-status-render.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  const warnings = [];
  const context = {
    StorageService: { getBackend: () => 'idb' },
    storageIsFileProtocol: () => false,
    showOrHideStorageWarning(percent) { warnings.push(percent); },
    t: (key) => key === 'storage_high_warning' ? 'high storage' : key,
    document: {
      getElementById(id) {
        return id === 'settingsModal'
          ? { classList: { removed: [], remove(name) { this.removed.push(name); } } }
          : null;
      },
    },
    Math,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__usage = applyStorageUsageElements;\nthis.__title = buildStorageStatusTitle;\nthis.__status = applyStorageStatusInfo;\nthis.__bind = bindStorageStatusClick;`, context);

  const usageEl = { textContent: '', style: {} };
  const bar = { style: {} };
  context.__usage({ backend: 'idb', used: 90, quota: 100, opfsAvailable: false }, 'idb', usageEl, bar);
  assert(bar.style.width === '90%' && bar.style.background === '#f87171' && usageEl.style.color === '#f87171', 'Storage usage renderer should mark high storage pressure.');
  assert(warnings[0] === 90 && usageEl.textContent.includes('IndexedDB'), 'Storage usage renderer should update warning and usage text.');

  context.__usage(null, 'localStorage', usageEl, bar);
  assert(usageEl.textContent.includes('localStorage') && bar.style.width === '0%', 'Storage usage renderer should show fallback backend text without info.');

  const title = context.__title({ backend: 'idb', used: 1048576, opfsAvailable: true, persisted: false }, 'idb');
  assert(title.includes('IndexedDB') && title.includes('1.0 MB') && title.includes('非持久授权'), 'Storage status title should include backend, app usage, and persistence state.');

  const badge = { style: {}, title: '' };
  context.__status(badge, { backend: 'idb', used: 95, quota: 100, opfsAvailable: false }, 'idb');
  assert(badge.style.color === '#f87171' && badge.title.includes('high storage'), 'Storage status badge should show high-pressure styling and warning title.');

  const clickEvents = [];
  const clickable = {
    addEventListener(type, handler) {
      clickEvents.push(type);
      this.handler = handler;
    },
  };
  context.__bind(clickable);
  context.__bind(clickable);
  assert(clickEvents.length === 1 && clickable._storageClickBound === true, 'Storage status click helper should bind only once.');
}
export { assertFrontendFileProtocolOPFSSilence, assertFrontendOPFSReadWriteHelpers, assertFrontendStorageRecoveryScanner, assertFrontendLegacyIDBRecoveryReader, assertFrontendIDBStorageHelpers, assertFrontendStorageStatusRenderHelpers };
