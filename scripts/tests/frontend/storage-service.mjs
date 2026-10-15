import { assert } from '../support.mjs';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';


async function assertFrontendStorageServiceSaveHelpers() {
  const sources = await Promise.all([
    '../../../src/app/storage/20-storage-service-save-helpers.js',
    '../../../src/app/storage/20-storage-service-save-canonical.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));
  const removedKeys = [];
  const localStorageMock = {
    setItem(key, value) { this[key] = String(value); },
    removeItem(key) { removedKeys.push(key); delete this[key]; },
  };
  let mirroredSnapshot = null;
  let idbSavedData = null;
  let idbSavedOptions = null;
  const context = {
    STORAGE_BACKUP_PREFIX: 'backup-',
    localStorage: localStorageMock,
    IDBStorage: {
      async saveAll(data, options) {
        idbSavedData = data;
        idbSavedOptions = options;
      },
    },
    OPFSStorage: {
      saveAll(data) {
        mirroredSnapshot = data;
        return Promise.resolve();
      },
    },
    console: { warn() {}, error() {} },
    Date: { now: () => 999 },
    JSON,
    Object,
    Array,
    Promise,
    setTimeout() {},
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__empty = isDangerouslyEmptyStorageSnapshot;\nthis.__history = saveStorageServiceLocalHistorySnapshot;\nthis.__mirror = mirrorStorageServiceSnapshotToOPFS;\nthis.__tryIdb = trySaveStorageServiceIDBCanonical;\nthis.__markLocal = markStorageServiceLocalStorageCanonical;`, context);

  assert(context.__empty({ conversations: {}, characters: {}, worldBooks: {} }) === true, 'Storage save helper should treat an empty snapshot as dangerous.');
  assert(context.__empty({ conversations: { c1: { messages: [{ content: 'hi' }] } }, characters: {}, worldBooks: {} }) === false, 'Storage save helper should allow snapshots with chat messages.');
  assert(context.__empty({ conversations: {}, characters: { arona: {} }, worldBooks: {} }) === false, 'Storage save helper should allow snapshots with character cards.');
  assert(context.__empty({ conversations: {}, characters: {}, worldBooks: { wb: {} } }) === false, 'Storage save helper should allow snapshots with world books.');

  const service = {
    _isValidSnapshot(data) { return !!data && !!data.conversations; },
    _snapshotTime(data) { return data.lastSaved; },
    _opfsMirrorAvailable: true,
    _isSafari() { return false; },
    _cloneForPersist(data) { return JSON.parse(JSON.stringify(data)); },
  };
  for (let i = 0; i < 7; i += 1) {
    context.__history(service, { conversations: { [`c${i}`]: { id: `c${i}` } }, lastSaved: i + 1 });
  }
  const backupKeys = Object.keys(localStorageMock).filter((key) => key.startsWith(context.STORAGE_BACKUP_PREFIX));
  assert(backupKeys.length === 5 && removedKeys.includes('backup-1') && removedKeys.includes('backup-2'), 'Storage save helper should keep only the newest five local history snapshots.');

  const mirrorInput = { conversations: { c1: { id: 'c1' } } };
  context.__mirror(service, mirrorInput);
  await Promise.resolve();
  assert(mirroredSnapshot.conversations.c1.id === 'c1' && mirroredSnapshot !== mirrorInput, 'Storage save helper should clone snapshots before OPFS mirroring.');

  const idbService = {
    _idbAvailable: true,
    _idbFailed: true,
  };
  const idbResult = await context.__tryIdb(idbService, mirrorInput);
  assert(idbResult.saved === true && idbResult.error === null, 'Storage save helper should report successful IDB canonical saves.');
  assert(idbSavedData === mirrorInput && idbSavedOptions.fresh === true, 'Storage save helper should preserve IDB retry freshness.');
  assert(idbService._idbFailed === false && idbService._idbFailureReason === null && idbService._primaryBackend === 'idb' && idbService._lastUsedBackend === 'idb', 'Storage save helper should refresh IDB backend state after successful saves.');

  const localService = {};
  assert(context.__markLocal(localService, true) === true && localService._primaryBackend === 'localStorage' && localService._lastUsedBackend === 'localStorage', 'Storage save helper should mark localStorage as canonical fallback when needed.');
}

async function assertFrontendStorageServiceQuotaBackupHelpers() {
  const sources = await Promise.all([
    '../../../src/app/conversation/19-conversation-order-helpers.js',
    '../../../src/app/storage/20-storage-service-quota-backup.js',
    '../../../src/app/storage/20-storage-service-maintenance.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));
  const exports = [];
  const alerts = [];
  const context = {
    state: {
      settings: { model: 'quota-model', apiKey: 'secret' },
      conversations: {
        c1: { messages: [{ content: 'quota chat' }] },
        orphan: { messages: [{ content: 'missing order' }] },
      },
      conversationOrder: ['c1'],
      activeConvId: 'c1',
      worldBooks: { wb1: { entries: [] } },
      characters: { arona: { name: 'Arona', first_mes: 'Sensei!' } },
    },
    getSafeSettingsForPersist() {
      return { model: 'quota-model', apiKey: '' };
    },
    downloadJsonFile(data, filename) {
      exports.push({ data, filename });
    },
    alert(message) {
      alerts.push(message);
    },
    console: { error() {} },
    Date,
    JSON,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__name = buildStorageQuotaBackupName;\nthis.__snapshot = buildStorageQuotaBackupSnapshot;\nthis.__handle = handleStorageQuotaExceeded;`, context);

  assert(context.__name(new Date('2026-01-02T03:04:05.006Z')) === 'opentavern-backup-quota-2026-01-02T03-04-05-006Z.json', 'Storage quota backup helper should build filesystem-safe filenames.');

  const snapshot = context.__snapshot();
  assert(snapshot.settings.apiKey === '' && snapshot.conversations.c1.messages[0].content === 'quota chat', 'Storage quota backup helper should include safe settings and chats.');
  assert(snapshot.conversationOrder.join(',') === 'c1,orphan', 'Storage quota backup helper should include conversations missing from conversation order.');
  assert(snapshot.activeConvId === 'c1', 'Storage quota backup helper should preserve valid active conversation ids.');
  assert(snapshot.characters.arona.first_mes === 'Sensei!' && snapshot.worldBooks.wb1, 'Storage quota backup helper should include character cards and world books.');

  context.state.activeConvId = 'missing';
  assert(context.__snapshot().activeConvId === 'c1', 'Storage quota backup helper should recover invalid active conversation ids.');

  const service = { _lastQuotaAlert: 0 };
  context.__handle(service, new Error('quota'), null);
  context.__handle(service, new Error('quota'), null);
  assert(exports.length === 1 && exports[0].filename.startsWith('opentavern-backup-quota-'), 'Storage quota handler should export one backup and throttle repeated alerts.');
  assert(exports[0].data.characters.arona.name === 'Arona' && alerts.length === 1, 'Storage quota handler should export character cards and alert once.');
}

async function assertFrontendStorageServicePageLifecycleHelpers() {
  const source = await readFile(new URL('../../../src/app/storage/20-storage-service-page-lifecycle.js', import.meta.url), 'utf8');
  const events = [];
  let pagehideHandler = null;
  let visibilityHandler = null;
  const context = {
    window: {
      addEventListener(type, handler) {
        events.push(`window:${type}`);
        if (type === 'pagehide') pagehideHandler = handler;
      },
    },
    document: {
      hidden: false,
      addEventListener(type, handler) {
        events.push(`document:${type}`);
        if (type === 'visibilitychange') visibilityHandler = handler;
      },
    },
    persistState(force) {
      events.push(`persist:${force}`);
    },
    console: { log(message) { events.push(`log:${message}`); } },
  };

  vm.runInNewContext(`${source}\nthis.__bind = bindStorageServicePageLifecycleHandlers;\nthis.__pagehide = persistStorageServicePageHide;\nthis.__visibility = persistStorageServiceVisibilityState;`, context);

  const snapshot = { conversations: { c1: {} }, lastSaved: 1 };
  const service = {
    _lastSaveSnapshot: snapshot,
    _tryWriteLocalSnapshot(data) {
      events.push(`local:${data.lastSaved}`);
    },
  };

  context.__bind(service);
  assert(typeof pagehideHandler === 'function' && typeof visibilityHandler === 'function', 'Storage page lifecycle helper should register pagehide and visibility handlers.');

  pagehideHandler();
  assert(events.includes('local:1') && events.includes('persist:true'), 'Storage page lifecycle helper should flush the latest snapshot and persist on pagehide.');

  const persistCount = events.filter((event) => event === 'persist:true').length;
  context.document.hidden = false;
  visibilityHandler();
  assert(events.filter((event) => event === 'persist:true').length === persistCount, 'Storage page lifecycle helper should ignore visible visibilitychange events.');

  context.document.hidden = true;
  visibilityHandler();
  assert(events.filter((event) => event === 'persist:true').length === persistCount + 1, 'Storage page lifecycle helper should persist when the document becomes hidden.');

  service._lastSaveSnapshot = null;
  context.__pagehide(service);
  assert(events.filter((event) => event.startsWith('local:')).length === 1, 'Storage page lifecycle helper should not write local snapshots when no snapshot is available.');
}

async function assertFrontendStorageServiceClearBackendHelpers() {
  const sources = await Promise.all([
    '../../../src/app/storage/20-storage-service-clear-backend-helpers.js',
    '../../../src/app/storage/20-storage-service-clear-backends.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));
  const events = [];
  const indexedDBMock = {
    deleteDatabase(name) {
      events.push(`legacy:${name}`);
      const request = {};
      setTimeout(() => request.onsuccess && request.onsuccess(), 0);
      return request;
    },
  };
  const context = {
    OPFSStorage: {
      async saveAll(data) { events.push(`opfs-save:${data.lastSaved}`); },
      async clear() { events.push('opfs-clear'); },
    },
    IDBStorage: {
      async clear() { events.push('idb-clear'); },
    },
    indexedDB: indexedDBMock,
    window: { indexedDB: indexedDBMock },
    console: { warn() {} },
    Promise,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__opfs = clearStorageServiceOPFS;\nthis.__idb = clearStorageServiceIDB;\nthis.__legacy = clearStorageServiceLegacyIDB;`, context);

  const cleared = {};
  await context.__opfs({ _opfsMirrorAvailable: true, _isSafari: () => false }, { lastSaved: 12 }, cleared);
  await context.__idb(cleared);
  await context.__legacy(cleared);

  assert(events.join('|') === 'opfs-save:12|opfs-clear|idb-clear|legacy:OpenTavernDB', 'Storage clear backend helpers should clear all available backends in order.');
  assert(cleared.opfs === true && cleared.idb === true && cleared.legacyIdb === true, 'Storage clear backend helpers should mark cleared backends.');
}

async function assertFrontendStorageServiceLoadHelpers() {
  const sources = await Promise.all([
    '../../../src/app/storage/20-storage-service-backend-sync.js',
    '../../../src/app/storage/20-storage-service-load-readers.js',
    '../../../src/app/storage/20-storage-service-load-candidates.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  const events = [];
  const context = {
    storageIsFileProtocol() { return false; },
    navigator: { storage: { getDirectory() {} } },
    IDBStorage: {
      async loadAll() {
        events.push('idb-load');
        return { conversations: { idb: {} }, lastSaved: 200 };
      },
      async saveAll() { events.push('idb-save'); },
    },
    OPFSStorage: {
      async loadAll() {
        events.push('opfs-load');
        return { conversations: { opfs: {} }, lastSaved: 100 };
      },
      async saveAll() { events.push('opfs-save'); },
    },
    async readLegacyIndexedDB() {
      events.push('legacy-load');
      return { conversations: { legacy: {} }, lastSaved: 400 };
    },
    console: { warn() {} },
    JSON,
    Object,
    Array,
    Promise,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__collect = collectStorageServiceSnapshotCandidates;\nthis.__sync = syncStorageServiceSnapshotToAvailableBackends;`, context);

  const service = {
    _idbAvailable: true,
    _opfsMirrorAvailable: true,
    _opfsReadableAvailable: false,
    _isValidSnapshot(data) { return !!(data && data.conversations); },
    _cloneForPersist(data) { return JSON.parse(JSON.stringify(data)); },
    _readLocalSnapshot() { return { conversations: { local: {} }, lastSaved: 300 }; },
    _tryWriteLocalSnapshot() { events.push('local-write'); },
    _isSafari() { return false; },
  };

  const candidates = await context.__collect(service, {});
  assert(candidates.map((item) => item.backend).join(',') === 'opfs,idb,localStorage,legacy-idb', 'Storage load helper should collect all available snapshot candidates in priority order.');
  assert(service._idbFailed === false && service._idbFailureReason === null, 'Storage load helper should clear IDB failure state after a successful read.');

  events.length = 0;
  await context.__sync(service, { conversations: { c1: {} }, lastSaved: 500 }, 'idb');
  assert(!events.includes('idb-save') && events.includes('local-write') && events.includes('opfs-save'), 'Storage backend sync helper should skip the source backend and mirror to the remaining available backends.');
}

async function assertFrontendStorageServiceInfoHelpers() {
  const sources = await Promise.all([
    '../../../src/app/storage/20-storage-service-info-readers.js',
    '../../../src/app/storage/20-storage-service-info-fallback.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));
  const context = {
    navigator: {
      storage: {
        async estimate() { return { usage: 4096, quota: 8192 }; },
        async persisted() { return true; },
      },
    },
    window: { indexedDB: {} },
    storageIsFileProtocol: () => true,
    Blob,
    JSON,
    Object,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__app = readStorageServiceAppUsage;\nthis.__quota = readStorageServiceBrowserQuota;\nthis.__fallback = getStorageServiceFallbackInfo;`, context);

  const service = {
    _lastSaveSnapshot: null,
    _idbAvailable: false,
    _idbFailureReason: 'idb down',
    _opfsSkipped: false,
    _opfsSkippedReason: null,
    _opfsFailureReason: 'opfs down',
    getBackend() { return 'localStorage'; },
    _isValidSnapshot(data) { return !!(data && data.conversations); },
    async _readNewestStoredSnapshotNoSync() {
      return { data: { conversations: { c1: { messages: [{ content: 'hi' }] } }, characters: {}, worldBooks: {} } };
    },
  };
  assert(await context.__app(service) > 0, 'Storage info reader should measure the newest stored app snapshot when no current snapshot is cached.');
  const quota = await context.__quota();
  assert(quota.originUsed === 4096 && quota.quota === 8192 && quota.persisted === true, 'Storage info reader should expose browser quota and persistence metadata.');

  const fallback = context.__fallback(service);
  assert(fallback.fileProtocol === true && fallback.opfsSkippedReason === 'file-protocol' && fallback.opfsFailureReason === null, 'Storage info fallback should describe file:// OPFS skip without a failure reason.');
  assert(fallback.idbAvailable === true && fallback.idbLastError === 'idb down', 'Storage info fallback should include IDB availability and last error.');
}

async function assertFrontendStorageServicePipeline() {
  const sources = await Promise.all([
    '../../../src/app/conversation/19-conversation-order-helpers.js',
    '../../../src/app/storage/20-storage-service-helpers.js',
    '../../../src/app/storage/20-storage-service-quota-backup.js',
    '../../../src/app/storage/20-storage-service-maintenance.js',
    '../../../src/app/storage/20-storage-service-info-readers.js',
    '../../../src/app/storage/20-storage-service-info-fallback.js',
    '../../../src/app/storage/20-storage-service-info.js',
    '../../../src/app/storage/20-storage-service-clear-local.js',
    '../../../src/app/storage/20-storage-service-clear-backend-helpers.js',
    '../../../src/app/storage/20-storage-service-clear-backends.js',
    '../../../src/app/storage/20-storage-service-clear.js',
    '../../../src/app/storage/20-storage-service-backend-sync.js',
    '../../../src/app/storage/20-storage-service-load-readers.js',
    '../../../src/app/storage/20-storage-service-load-candidates.js',
    '../../../src/app/storage/20-storage-service-load.js',
    '../../../src/app/storage/20-storage-service-save-helpers.js',
    '../../../src/app/storage/20-storage-service-save-canonical.js',
    '../../../src/app/storage/20-storage-service-save.js',
    '../../../src/app/storage/20-storage-service-opfs-init-helpers.js',
    '../../../src/app/storage/20-storage-service-opfs-init.js',
    '../../../src/app/storage/20-storage-service-page-lifecycle.js',
    '../../../src/app/storage/20-storage-service-init.js',
    '../../../src/app/storage/20-storage-service-state.js',
    '../../../src/app/storage/20-storage-service-helper-api.js',
    '../../../src/app/storage/20-storage-service-local-api.js',
    '../../../src/app/storage/20-storage-service-operations-api.js',
    '../../../src/app/storage/20-storage-service-api.js',
    '../../../src/app/storage/20-storage-service.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  const backingStore = new Map();
  const localStorageMock = {
    getItem(key) { return Object.prototype.hasOwnProperty.call(this, key) ? this[key] : null; },
    setItem(key, value) { this[key] = String(value); },
    removeItem(key) { delete this[key]; },
  };
  const context = {
    STORAGE_KEY: 'opentavern-test-storage',
    STORAGE_BACKUP_PREFIX: 'opentavern-test-backup-',
    STORAGE_CLEAR_KEY: 'opentavern-test-clear',
    IDBStorage: {
      async loadAll() {
        return backingStore.has('idb') ? JSON.parse(JSON.stringify(backingStore.get('idb'))) : null;
      },
      async saveAll(data) {
        backingStore.set('idb', JSON.parse(JSON.stringify(data)));
      },
    },
    OPFSStorage: {
      async loadAll() { return null; },
      async saveAll() {},
    },
    localStorage: localStorageMock,
    location: { protocol: 'http:' },
    navigator: { storage: {} },
    window: {},
    console: {
      log() {},
      warn() {},
      error() {},
    },
    Date,
    JSON,
    Object,
    Array,
    Number,
    setTimeout,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__StorageService = StorageService;`, context);
  const service = context.__StorageService;
  service._idbAvailable = true;

  const userData = {
    settings: { model: 'storage-model', lang: 'en' },
    conversations: { c1: { id: 'c1', title: 'Stored chat', messages: [{ role: 'user', content: 'hello' }] } },
    conversationOrder: ['c1'],
    activeConvId: 'c1',
    characters: { arona: { id: 'arona', name: 'Arona', first_mes: 'Sensei!' } },
    worldBooks: {},
    lastSaved: 1000,
  };

  await service.saveAll(userData);
  assert(backingStore.get('idb').characters.arona.first_mes === 'Sensei!', 'StorageService saveAll did not persist character cards to IDB.');
  assert(JSON.parse(localStorageMock[context.STORAGE_KEY]).conversations.c1.messages[0].content === 'hello', 'StorageService saveAll did not persist localStorage snapshot.');

  const loaded = await service.loadAll({ sync: false, includeLegacy: false });
  assert(loaded.settings.model === 'storage-model', 'StorageService loadAll did not restore settings.');
  assert(loaded.conversations.c1.title === 'Stored chat', 'StorageService loadAll did not restore chats.');
  assert(loaded.characters.arona.name === 'Arona', 'StorageService loadAll did not restore character cards.');
  assert(service._lastSaveSnapshot && service._lastSaveSnapshot.lastSaved === 1000, 'StorageService loadAll should remember the loaded snapshot timestamp for cloud freshness checks.');

  await service.saveAll({
    settings: {},
    conversations: { empty: { id: 'empty', messages: [] } },
    conversationOrder: ['empty'],
    activeConvId: 'empty',
    characters: {},
    worldBooks: {},
    lastSaved: 2000,
  });
  assert(backingStore.get('idb').conversations.c1, 'StorageService empty-start protection overwrote existing user data.');

  backingStore.delete('idb');
  service._idbAvailable = false;
  await service.saveAll({
    settings: { model: 'local-only' },
    conversations: {},
    characters: { local: { id: 'local', name: 'Local Card' } },
    worldBooks: {},
    lastSaved: 3000,
  });
  assert(service.getBackend() === 'localStorage', 'StorageService should use localStorage when IDB is unavailable.');
  assert(JSON.parse(localStorageMock[context.STORAGE_KEY]).characters.local.name === 'Local Card', 'StorageService localStorage fallback did not persist character cards.');

  localStorageMock['opentavern-stale-key'] = 'remove-me';
  localStorageMock['external-app-key'] = 'keep-me';
  const cleared = await service.clearAllData();
  const clearedSnapshot = JSON.parse(localStorageMock[context.STORAGE_KEY]);
  assert(cleared.opfs === true && cleared.ls === true, 'StorageService clearAllData should clear available backends and local snapshots.');
  assert(Object.keys(clearedSnapshot.conversations).length === 0 && clearedSnapshot.charactersMigrated === true, 'StorageService clearAllData should leave an empty recovery snapshot.');
  assert(!Object.prototype.hasOwnProperty.call(localStorageMock, 'opentavern-stale-key') && localStorageMock['external-app-key'] === 'keep-me', 'StorageService clearAllData should remove OpenTavern localStorage keys without clearing unrelated keys.');
}

async function assertFrontendStorageServiceFileProtocolStatus() {
  const sources = await Promise.all([
    '../../../src/app/conversation/19-conversation-order-helpers.js',
    '../../../src/app/storage/20-storage-service-helpers.js',
    '../../../src/app/storage/20-storage-service-quota-backup.js',
    '../../../src/app/storage/20-storage-service-maintenance.js',
    '../../../src/app/storage/20-storage-service-info-readers.js',
    '../../../src/app/storage/20-storage-service-info-fallback.js',
    '../../../src/app/storage/20-storage-service-info.js',
    '../../../src/app/storage/20-storage-service-clear-local.js',
    '../../../src/app/storage/20-storage-service-clear-backend-helpers.js',
    '../../../src/app/storage/20-storage-service-clear-backends.js',
    '../../../src/app/storage/20-storage-service-clear.js',
    '../../../src/app/storage/20-storage-service-backend-sync.js',
    '../../../src/app/storage/20-storage-service-load-readers.js',
    '../../../src/app/storage/20-storage-service-load-candidates.js',
    '../../../src/app/storage/20-storage-service-load.js',
    '../../../src/app/storage/20-storage-service-save-helpers.js',
    '../../../src/app/storage/20-storage-service-save-canonical.js',
    '../../../src/app/storage/20-storage-service-save.js',
    '../../../src/app/storage/20-storage-service-opfs-init-helpers.js',
    '../../../src/app/storage/20-storage-service-opfs-init.js',
    '../../../src/app/storage/20-storage-service-page-lifecycle.js',
    '../../../src/app/storage/20-storage-service-init.js',
    '../../../src/app/storage/20-storage-service-state.js',
    '../../../src/app/storage/20-storage-service-helper-api.js',
    '../../../src/app/storage/20-storage-service-local-api.js',
    '../../../src/app/storage/20-storage-service-operations-api.js',
    '../../../src/app/storage/20-storage-service-api.js',
    '../../../src/app/storage/20-storage-service.js',
    '../../../src/app/storage/21-storage-opfs-status-text.js',
    '../../../src/app/storage/21-storage-usage-format.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  const warnings = [];
  const errors = [];
  const infos = [];
  let opfsTouched = false;
  const localStorageMock = {
    getItem(key) { return Object.prototype.hasOwnProperty.call(this, key) ? this[key] : null; },
    setItem(key, value) { this[key] = String(value); },
    removeItem(key) { delete this[key]; },
  };
  const context = {
    STORAGE_KEY: 'opentavern-test-storage',
    STORAGE_BACKUP_PREFIX: 'opentavern-test-backup-',
    STORAGE_CLEAR_KEY: 'opentavern-test-clear',
    IDBStorage: {
      async _open() {},
      async loadAll() {
        return {
          settings: { lang: 'zh-CN' },
          conversations: {},
          characters: {},
          worldBooks: {},
          lastSaved: 1,
        };
      },
      async saveAll() {},
    },
    OPFSStorage: {
      async _getRoot() {
        opfsTouched = true;
        throw new Error('OPFS should be skipped on file://.');
      },
      async loadAll() {
        opfsTouched = true;
        throw new Error('OPFS load should be skipped on file://.');
      },
      async saveAll() {
        opfsTouched = true;
        throw new Error('OPFS save should be skipped on file://.');
      },
    },
    localStorage: localStorageMock,
    navigator: {
      userAgent: 'TestBrowser',
      vendor: 'TestVendor',
      storage: {
        async estimate() { return { usage: 0, quota: 1000000 }; },
        async persisted() { return true; },
        async getDirectory() {
          opfsTouched = true;
          throw new Error('navigator.storage.getDirectory should be skipped on file://.');
        },
      },
    },
    window: {
      location: { protocol: 'file:' },
      indexedDB: {},
      addEventListener() {},
      isSecureContext: false,
    },
    document: { addEventListener() {} },
    console: {
      log() {},
      info: (...args) => infos.push(args.join(' ')),
      warn: (...args) => warnings.push(args.join(' ')),
      error: (...args) => errors.push(args.join(' ')),
    },
    Blob,
    Date,
    Error,
    JSON,
    Object,
    Array,
    Number,
    String,
    setTimeout,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__StorageService = StorageService;\nthis.__backend = getStorageBackendLabel;\nthis.__formatMB = formatStorageMB;\nthis.__getOPFSStatusText = getOPFSStatusText;\nthis.__buildStorageUsageText = buildStorageUsageText;\nthis.__buildStorageHintText = buildStorageHintText;`, context);
  const service = context.__StorageService;
  await service.init();
  const info = await service.getStorageInfo();
  const opfsText = context.__getOPFSStatusText(info);
  const usageText = context.__buildStorageUsageText(info);
  const hintText = context.__buildStorageHintText(info, service.getBackend());

  assert(context.__backend('legacy-idb') === '旧版 IndexedDB' && context.__backend('unknown') === 'localStorage', 'Storage backend labels should preserve known and fallback labels.');
  assert(context.__formatMB(1048576) === '1.0', 'Storage MB formatter should format bytes as one-decimal megabytes.');
  assert(service._opfsSkipped === true, 'StorageService should mark OPFS as skipped on file://.');
  assert(service._opfsFailed === false, 'StorageService should not mark file:// OPFS skip as a failure.');
  assert(info.fileProtocol === true, 'Storage info should expose file protocol mode.');
  assert(info.opfsSkipped === true && info.opfsSkippedReason === 'file-protocol', 'Storage info should expose OPFS skip reason.');
  assert(!info.opfsFailureReason, 'file:// OPFS skip should not populate failure reason.');
  assert(!opfsTouched, 'StorageService should not touch OPFS APIs on file://.');
  assert(opfsText.includes('\u672c\u5730\u6587\u4ef6\u6a21\u5f0f'), 'OPFS status should describe local file mode.');
  assert(hintText.includes('\u672c\u5730\u6587\u4ef6\u6a21\u5f0f\u5df2\u8df3\u8fc7 OPFS'), 'Storage hint should describe OPFS as skipped in local file mode.');
  assert(!opfsText.includes('\u4e0d\u53ef\u7528'), 'OPFS status should not say unavailable for file://.');
  assert(!usageText.includes('\u4e0d\u53ef\u7528'), 'Storage usage text should not say unavailable for file://.');
  assert(!hintText.includes('\u4e0d\u53ef\u7528'), 'Storage hint should not say unavailable for file://.');
  assert(!hintText.includes('\u6b63\u5728\u4f7f\u7528 OPFS'), 'Storage hint should not claim OPFS is active on file://.');
  assert(!infos.some((msg) => /OPFS unavailable|file:\/\/ mode/i.test(msg)), 'file:// path should not log OPFS unavailable info.');
  assert(warnings.length === 0, `file:// path should not warn: ${warnings.join('\n')}`);
  assert(errors.length === 0, `file:// path should not error: ${errors.join('\n')}`);
}
export { assertFrontendStorageServiceSaveHelpers, assertFrontendStorageServiceQuotaBackupHelpers, assertFrontendStorageServicePageLifecycleHelpers, assertFrontendStorageServiceClearBackendHelpers, assertFrontendStorageServiceLoadHelpers, assertFrontendStorageServiceInfoHelpers, assertFrontendStorageServicePipeline, assertFrontendStorageServiceFileProtocolStatus };
