import { onRequest } from '../functions/api/sync.js';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function createMockD1() {
  const store = new Map();
  return {
    store,
    db: {
      async exec() {},
      prepare(sql) {
        return {
          _bind: [],
          bind(...args) {
            this._bind = args;
            return this;
          },
          async first() {
            const key = this._bind[0];
            const row = store.get(key);
            return row ? { data: row.data, updated_at: row.updated_at } : null;
          },
          async run() {
            const [key, data, updatedAt] = this._bind;
            store.set(key, { data, updated_at: updatedAt });
            return { success: true };
          },
        };
      },
    },
  };
}

function request(method, token, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return new Request('https://example.com/api/sync', {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function readJson(response) {
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function assertOk(response, label) {
  if (!response.ok) throw new Error(`${label} failed: ${await response.text()}`);
}

async function assertRejects(promise, message) {
  let rejected = false;
  try {
    await promise;
  } catch (_) {
    rejected = true;
  }
  assert(rejected, message);
}

function assertThrows(fn, message) {
  let thrown = false;
  try {
    fn();
  } catch (_) {
    thrown = true;
  }
  assert(thrown, message);
}

async function assertFrontendCloudSnapshot() {
  const compatSource = await readFile(new URL('../src/app/24-storage-compat.js', import.meta.url), 'utf8');
  const cloudSource = await readFile(new URL('../src/app/22-cloud-sync.js', import.meta.url), 'utf8');
  const context = {
    state: {
      settings: {
        model: 'frontend-model',
        lang: 'en',
        saveApiKey: true,
        apiKey: 'secret-api-key',
        summarizeApiKey: 'secret-summary-key',
        cloudSyncToken: 'secret-cloud-token',
        cloudSyncPassphrase: 'secret-passphrase',
        cloudSyncLastAt: 123456,
        cloudSyncLastStatus: 'last status',
      },
      conversations: {
        c1: { id: 'c1', messages: [{ role: 'user', content: 'frontend hello' }] },
      },
      conversationOrder: ['c1'],
      activeConvId: 'c1',
      characters: {
        arona: { id: 'arona', name: 'Arona', first_mes: 'Sensei!' },
      },
      worldBooks: {
        wb1: { id: 'wb1', entries: [{ id: 'e1', content: 'Kivotos' }] },
      },
      _charactersMigrated: true,
    },
    StorageService: { _lastSaveSnapshot: null },
    console,
    Date,
    JSON,
  };

  vm.runInNewContext(`${compatSource}\n${cloudSource}\nthis.__freshness = getCloudSyncFreshness;`, context);
  const snapshot = context.buildAppDataSnapshot();

  assert(snapshot.settings.model === 'frontend-model', 'Frontend cloud snapshot did not include settings.');
  assert(snapshot.settings.apiKey === '', 'Frontend cloud snapshot must strip the main API key.');
  assert(snapshot.settings.summarizeApiKey === '', 'Frontend cloud snapshot must strip the summary API key.');
  assert(snapshot.settings.cloudSyncToken === '', 'Frontend cloud snapshot must strip the cloud sync token.');
  assert(snapshot.settings.cloudSyncPassphrase === '', 'Frontend cloud snapshot must strip the cloud sync passphrase.');
  assert(snapshot.settings.cloudSyncLastAt === 0, 'Frontend cloud snapshot must strip transient cloud sync timestamps.');
  assert(snapshot.settings.cloudSyncLastStatus === '', 'Frontend cloud snapshot must strip transient cloud status.');
  assert(snapshot.conversations.c1.messages[0].content === 'frontend hello', 'Frontend cloud snapshot did not include chat history.');
  assert(snapshot.conversationOrder[0] === 'c1', 'Frontend cloud snapshot did not include conversation order.');
  assert(snapshot.activeConvId === 'c1', 'Frontend cloud snapshot did not include active conversation id.');
  assert(snapshot.characters.arona.first_mes === 'Sensei!', 'Frontend cloud snapshot did not include character cards.');
  assert(snapshot.worldBooks.wb1.entries[0].content === 'Kivotos', 'Frontend cloud snapshot did not include world books.');
  assert(snapshot.charactersMigrated === true, 'Frontend cloud snapshot did not include character migration state.');
  assert(Number.isFinite(snapshot.lastSaved), 'Frontend cloud snapshot did not include a timestamp.');
  context.state.conversations.c1.messages[0].content = 'mutated after snapshot';
  context.state.conversationOrder.push('later');
  context.state.characters.arona.first_mes = 'Changed!';
  context.state.worldBooks.wb1.entries[0].content = 'Changed world';
  assert(snapshot.conversations.c1.messages[0].content === 'frontend hello', 'Frontend cloud snapshot should not retain live conversation references.');
  assert(snapshot.conversationOrder.length === 1 && snapshot.conversationOrder[0] === 'c1', 'Frontend cloud snapshot should not retain the live conversation order array.');
  assert(snapshot.characters.arona.first_mes === 'Sensei!', 'Frontend cloud snapshot should not retain live character card references.');
  assert(snapshot.worldBooks.wb1.entries[0].content === 'Kivotos', 'Frontend cloud snapshot should not retain live world book references.');
  assert(context.__freshness({ lastSaved: 1000 }) === 'newer', 'Cloud freshness should treat a timestamped remote snapshot as newer when no local snapshot is known.');
  context.StorageService._lastSaveSnapshot = { lastSaved: 2500 };
  assert(context.__freshness({ lastSaved: 1000 }) === 'older', 'Cloud freshness should compare against the loaded local snapshot timestamp.');
  assert(context.__freshness({ lastSaved: 2000 }) === 'same', 'Cloud freshness should tolerate small timestamp drift.');
}

async function assertFrontendAppDialogHelpers() {
  const sources = await Promise.all([
    '../src/app/11-app-dialog-native.js',
    '../src/app/11-app-dialog-dom.js',
    '../src/app/11-app-dialog-events.js',
    '../src/app/11-app-dialog.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  function classList(initial = []) {
    const values = new Set(initial);
    return {
      values,
      add(...names) { names.forEach((name) => values.add(name)); },
      remove(...names) { names.forEach((name) => values.delete(name)); },
      contains(name) { return values.has(name); },
    };
  }
  function element(initialClasses = []) {
    return {
      classList: classList(initialClasses),
      style: {},
      textContent: '',
      className: '',
      onclick: null,
      focused: false,
      focus() { this.focused = true; },
    };
  }

  const nativeEvents = [];
  const timers = [];
  let keydownHandler = null;
  let elements = {};
  const context = {
    window: {
      alert(message) { nativeEvents.push(`alert:${message}`); },
      confirm(message) { nativeEvents.push(`confirm:${message}`); return false; },
    },
    document: {
      getElementById(id) { return elements[id] || null; },
      addEventListener(type, handler) { if (type === 'keydown') keydownHandler = handler; },
      removeEventListener(type, handler) { if (type === 'keydown' && keydownHandler === handler) keydownHandler = null; },
    },
    setTimeout(handler, delay) { timers.push({ handler, delay }); return `timer-${timers.length}`; },
    Promise,
    Object,
    String,
    Set,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__alert = showGlassAlert;\nthis.__confirm = showGlassConfirm;`, context);

  const nativeConfirmResult = await context.__confirm('Native confirm?');
  assert(nativeConfirmResult === false && nativeEvents.includes('confirm:Native confirm?'), 'App dialog should fall back to native confirm when the modal is missing.');

  elements = {
    appDialogModal: element(['hidden']),
    appDialogBackdrop: element(),
    appDialogTitle: element(),
    appDialogMessage: element(),
    appDialogIcon: element(),
    appDialogCancelBtn: element(),
    appDialogOkBtn: element(),
  };

  const confirmPromise = context.__confirm('Delete item?', { title: 'Delete', danger: true, okText: 'Delete now' });
  await Promise.resolve();
  assert(!elements.appDialogModal.classList.values.has('hidden'), 'App dialog confirm should show the modal.');
  assert(elements.appDialogTitle.textContent === 'Delete' && elements.appDialogMessage.textContent === 'Delete item?', 'App dialog should render title and message.');
  assert(elements.appDialogCancelBtn.style.display === '' && elements.appDialogOkBtn.textContent === 'Delete now', 'App dialog confirm should show cancel and custom ok text.');
  assert(elements.appDialogIcon.className.includes('bg-red-500/15'), 'App dialog danger mode should style the icon as danger.');
  elements.appDialogOkBtn.onclick();
  assert(await confirmPromise === true, 'App dialog ok button should resolve true.');
  assert(elements.appDialogModal.classList.values.has('hidden') && elements.appDialogOkBtn.onclick === null && keydownHandler === null, 'App dialog cleanup should hide and unbind controls.');

  const alertPromise = context.__alert('Heads up');
  await Promise.resolve();
  assert(elements.appDialogCancelBtn.style.display === 'none' && elements.appDialogIcon.textContent === '!', 'App dialog alert should hide cancel and use the alert icon.');
  keydownHandler({ key: 'Escape' });
  assert(await alertPromise === true, 'App dialog Escape should resolve alerts as acknowledged.');

  assert(typeof context.window.showGlassAlert === 'function' && typeof context.window.showGlassConfirm === 'function', 'App dialog should publish alert and confirm helpers on window.');
}

async function assertFrontendStateStoreDefaults() {
  const sources = await Promise.all([
    '../src/app/30-state-store.js',
    '../src/app/30-state-default-settings.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  const events = [];
  const context = {
    DEFAULT_TWO_STAGE_PROMPT: 'two stage default',
    defaultSillyTavernPreset() { return { prompts: [] }; },
    console: { error() {} },
    JSON,
    Set,
    Array,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__store = createReactiveStore;\nthis.__defaults = defaultSettings;`, context);

  const defaults = context.__defaults();
  assert(defaults.cloudSyncEndpoint === '/api/sync', 'Default settings should include the cloud sync endpoint.');
  assert(defaults.cloudSyncEnabled === false && defaults.cloudSyncAutoUpload === false, 'Cloud sync should be disabled by default.');
  assert(defaults.sillyTavernPreset.prompts.length === 0, 'Default settings should include a SillyTavern preset object.');

  const store = context.__store({ settings: { lang: 'en' } });
  const unsubscribeKey = store.subscribe('settings', (key) => events.push(`key:${key}`));
  const unsubscribeGlobal = store.subscribe((keys) => events.push(`global:${keys.join(',')}`));
  store.notify('settings');
  unsubscribeKey();
  unsubscribeGlobal();
  store.notify('settings');

  assert(store.state.settings.lang === 'en', 'State store should expose cloned state.');
  assert(events.join('|') === 'key:settings|global:settings', 'State store notifications or unsubscribe behavior changed.');
}

async function assertFrontendStatePersistenceHelpers() {
  const source = await readFile(new URL('../src/app/35-state-persistence.js', import.meta.url), 'utf8');

  const saved = [];
  const events = [];
  const timeouts = [];
  const cleared = [];
  let now = 123456;
  const context = {
    state: {
      settings: { model: 'raw-model' },
      conversations: { c1: { id: 'c1', messages: [{ content: 'hello' }] } },
      conversationOrder: ['c1'],
      activeConvId: 'c1',
      worldBooks: { wb1: { id: 'wb1' } },
      characters: { arona: { name: 'Arona' } },
      _charactersMigrated: true,
    },
    StorageService: {
      _lastSaveSnapshot: null,
      async saveAll(data) { saved.push(JSON.parse(JSON.stringify(data))); },
      _isQuotaError() { return false; },
    },
    getSafeSettingsForPersist() { return { model: 'safe-model', apiKey: '' }; },
    updateStorageInfo() { events.push('storage-info'); },
    scheduleCloudSyncUpload() { events.push('cloud-upload'); },
    setTimeout(handler, delay) {
      const id = `timeout-${timeouts.length}`;
      timeouts.push({ id, handler, delay });
      return id;
    },
    clearTimeout(id) { cleared.push(id); },
    Date: { now: () => now },
    console: { error(message) { events.push(`error:${message}`); } },
    JSON,
    Promise,
  };

  vm.runInNewContext(`${source}\nthis.__persist = persistState;\nthis.__active = getActiveConv;`, context);

  assert(context.__active().id === 'c1', 'Active conversation helper should return the current active conversation.');

  await context.__persist(true);
  assert(saved.length === 1 && saved[0].settings.model === 'safe-model', 'Immediate persist should save sanitized settings.');
  assert(saved[0].conversations.c1.messages[0].content === 'hello', 'Immediate persist should include conversations.');
  assert(saved[0].worldBooks.wb1.id === 'wb1' && saved[0].characters.arona.name === 'Arona', 'Immediate persist should include world books and character cards.');
  assert(saved[0].charactersMigrated === true && saved[0].lastSaved === 123456, 'Immediate persist should include migration and timestamp metadata.');
  assert(context.StorageService._lastSaveSnapshot.activeConvId === 'c1', 'Persist should cache the latest snapshot before async storage completes.');
  assert(events.includes('storage-info') && events.includes('cloud-upload'), 'Immediate persist should refresh storage status and schedule cloud upload.');

  now = 999999;
  await context.__persist(true, { preserveLastSaved: true });
  assert(saved.length === 2 && saved[1].lastSaved === 123456, 'Status-only persists should preserve the previous snapshot freshness timestamp.');

  await context.__persist(true, { lastSaved: 6000 });
  assert(saved.length === 3 && saved[2].lastSaved === 6000, 'Explicit snapshot timestamps should be preserved when applying remote data.');

  await context.__persist(false);
  await context.__persist(false);
  assert(timeouts.length === 2 && timeouts[0].delay === 450 && timeouts[1].delay === 450, 'Debounced persist should schedule saves with the storage debounce delay.');
  assert(cleared.includes('timeout-0'), 'Debounced persist should clear the previous pending save.');
  timeouts[1].handler();
  await Promise.resolve();
  assert(saved.length === 4, 'Debounced persist handler should eventually save the snapshot.');
}

async function assertFrontendWebGLBackgroundHelpers() {
  const sources = await Promise.all([
    '../src/app/13-webgl-program.js',
    '../src/app/13-webgl-layout.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  function classList(initial = []) {
    const values = new Set(initial);
    return {
      values,
      add(name) { values.add(name); },
      remove(name) { values.delete(name); },
      contains(name) { return values.has(name); },
    };
  }

  const warnings = [];
  const events = [];
  const context = {
    console: { warn: (...args) => warnings.push(args.join(' ')) },
    window: { innerWidth: 640, innerHeight: 480 },
    document: {
      documentElement: {
        style: {
          setProperty(name, value) {
            events.push(`style:${name}:${value}`);
          },
        },
      },
      body: { classList: classList() },
    },
    Float32Array,
    Set,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__shader = createWebGLShader;\nthis.__program = createWebGLProgram;\nthis.__quad = setupWebGLFullscreenQuad;\nthis.__uniforms = getWebGLBackgroundUniforms;\nthis.__resize = resizeShaderCanvas;\nthis.__height = updateAppHeight;\nthis.__paused = isShaderPausedByTheme;`, context);

  function createFakeGl(options = {}) {
    const calls = [];
    return {
      calls,
      VERTEX_SHADER: 'vertex',
      FRAGMENT_SHADER: 'fragment',
      COMPILE_STATUS: 'compile',
      LINK_STATUS: 'link',
      ARRAY_BUFFER: 'array-buffer',
      STATIC_DRAW: 'static-draw',
      FLOAT: 'float',
      TRIANGLE_STRIP: 'strip',
      createShader(type) { calls.push('createShader:' + type); return { type }; },
      shaderSource(shader, source) { shader.source = source; },
      compileShader(shader) { shader.compiled = true; },
      getShaderParameter() { return options.shaderOk !== false; },
      getShaderInfoLog() { return 'shader failed'; },
      deleteShader(shader) { calls.push('deleteShader:' + shader.type); },
      createProgram() { calls.push('createProgram'); return { shaders: [] }; },
      attachShader(program, shader) { program.shaders.push(shader); },
      linkProgram(program) { program.linked = true; },
      getProgramParameter() { return options.programOk !== false; },
      getProgramInfoLog() { return 'program failed'; },
      deleteProgram() { calls.push('deleteProgram'); },
      createBuffer() { calls.push('createBuffer'); return {}; },
      bindBuffer(target) { calls.push('bindBuffer:' + target); },
      bufferData(target, data, usage) { calls.push(`bufferData:${target}:${data.length}:${usage}`); },
      getAttribLocation(_program, name) { calls.push('attrib:' + name); return 3; },
      enableVertexAttribArray(location) { calls.push('enable:' + location); },
      vertexAttribPointer(location, size, type) { calls.push(`pointer:${location}:${size}:${type}`); },
      getUniformLocation(_program, name) { return 'uniform:' + name; },
      viewport(x, y, w, h) { calls.push(`viewport:${x}:${y}:${w}:${h}`); },
      uniform2f(location, w, h) { calls.push(`uniform2f:${location}:${w}:${h}`); },
    };
  }

  const glOk = createFakeGl();
  const shader = context.__shader(glOk, glOk.VERTEX_SHADER, 'source');
  assert(shader && shader.source === 'source' && shader.compiled === true, 'WebGL shader helper should compile valid shaders.');

  const glBadShader = createFakeGl({ shaderOk: false });
  assert(context.__shader(glBadShader, glBadShader.FRAGMENT_SHADER, 'bad') === null, 'WebGL shader helper should return null on compile failure.');
  assert(glBadShader.calls.includes('deleteShader:fragment') && warnings.some((msg) => msg.includes('Shader compile error')), 'WebGL shader helper should delete failed shaders and warn.');

  const program = context.__program(glOk, { id: 'v' }, { id: 'f' });
  assert(program && program.linked === true && program.shaders.length === 2, 'WebGL program helper should link shaders.');

  const glBadProgram = createFakeGl({ programOk: false });
  assert(context.__program(glBadProgram, { id: 'v' }, { id: 'f' }) === null, 'WebGL program helper should return null on link failure.');
  assert(glBadProgram.calls.includes('deleteProgram'), 'WebGL program helper should delete failed programs.');

  context.__quad(glOk, program);
  assert(glOk.calls.includes('bufferData:array-buffer:8:static-draw'), 'WebGL quad helper should upload four fullscreen vertices.');
  const uniforms = context.__uniforms(glOk, program);
  assert(uniforms.resolution === 'uniform:u_resolution' && uniforms.time === 'uniform:u_time', 'WebGL uniform helper should resolve expected uniforms.');

  const canvas = {};
  context.__resize(canvas, glOk, uniforms.resolution);
  assert(canvas.width === 640 && canvas.height === 480, 'WebGL resize helper should sync canvas size.');
  assert(glOk.calls.includes('viewport:0:0:640:480') && glOk.calls.includes('uniform2f:uniform:u_resolution:640:480'), 'WebGL resize helper should update viewport and resolution uniform.');

  context.__height();
  assert(events.includes('style:--app-height:480px'), 'WebGL layout helper should update --app-height.');
  assert(context.__paused() === false, 'WebGL theme pause helper should allow classic theme.');
  context.document.body.classList.add('theme-new-light');
  assert(context.__paused() === true, 'WebGL theme pause helper should pause themed UI.');
}

async function assertFrontendCloudSnapshotApply() {
  const cloudSource = await readFile(new URL('../src/app/22-cloud-sync.js', import.meta.url), 'utf8');
  const normalizeSource = await readFile(new URL('../src/app/22-cloud-sync-normalize.js', import.meta.url), 'utf8');
  const applySources = await Promise.all([
    '../src/app/22-cloud-sync-apply-settings.js',
    '../src/app/22-cloud-sync-apply-conversations.js',
    '../src/app/22-cloud-sync-apply-effects.js',
    '../src/app/22-cloud-sync-apply.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));
  let persisted = false;
  const persistCalls = [];
  let notified = null;
  let rendered = false;
  const context = {
    state: {
      settings: {
        cloudSyncEnabled: true,
        cloudSyncAutoUpload: true,
        cloudSyncEndpoint: 'https://sync.example/api',
        cloudSyncToken: 'local-token',
        cloudSyncEncrypted: true,
        cloudSyncPassphrase: 'local-passphrase',
        saveApiKey: true,
        apiKey: 'local-api-key',
        summarizeApiKey: 'local-summary-key',
      },
      conversations: {},
      conversationOrder: [],
      activeConvId: null,
      characters: {},
      worldBooks: {},
    },
    defaultSettings: () => ({
      model: 'default-model',
      cloudSyncEnabled: false,
      cloudSyncAutoUpload: false,
      cloudSyncEndpoint: '/api/sync',
      cloudSyncToken: '',
      cloudSyncEncrypted: false,
      cloudSyncPassphrase: '',
      cloudSyncLastAt: 0,
      cloudSyncLastStatus: '',
    }),
    normalizeConversation(conv) { conv.normalized = true; },
    defaultConversation() { return { id: 'default', messages: [] }; },
    persistState(force, options) {
      persisted = true;
      persistCalls.push({ force, options });
    },
    appStore: { notify(value) { notified = value; } },
    requestFullRender() { rendered = true; },
    updateInputState() {},
    updateStorageInfo() {},
    Date,
    Object,
    Array,
    Number,
    String,
  };

  vm.runInNewContext(`${cloudSource}\n${normalizeSource}\n${applySources.join('\n')}\nthis.__apply = applyCloudSyncSnapshot;`, context);
  const applied = context.__apply({
    settings: {
      model: 'remote-model',
      cloudSyncToken: 'remote-token',
      saveApiKey: false,
      apiKey: '',
      summarizeApiKey: '',
    },
    conversations: { c1: { id: 'c1', messages: [{ role: 'user', content: 'hello cloud' }] } },
    conversationOrder: ['c1'],
    activeConvId: 'c1',
    characters: { arona: { id: 'arona', name: 'Arona' } },
    worldBooks: { wb1: { id: 'wb1', entries: [] } },
    charactersMigrated: true,
    lastSaved: 123,
  });

  assert(applied.settings.model === 'remote-model', 'Applied cloud snapshot did not return remote settings.');
  assert(context.state.settings.model === 'remote-model', 'Cloud apply did not restore settings.');
  assert(context.state.settings.cloudSyncToken === 'local-token', 'Cloud apply must preserve local cloud sync token.');
  assert(context.state.settings.cloudSyncPassphrase === 'local-passphrase', 'Cloud apply must preserve local cloud sync passphrase.');
  assert(context.state.settings.saveApiKey === true, 'Cloud apply must preserve the local API key persistence setting.');
  assert(context.state.settings.apiKey === 'local-api-key', 'Cloud apply must preserve the local main API key.');
  assert(context.state.settings.summarizeApiKey === 'local-summary-key', 'Cloud apply must preserve the local summary API key.');
  assert(context.state.conversations.c1.normalized === true, 'Cloud apply did not normalize restored conversations.');
  assert(context.state.conversations.c1.messages[0].content === 'hello cloud', 'Cloud apply did not restore chat history.');
  assert(context.state.characters.arona.name === 'Arona', 'Cloud apply did not restore character cards.');
  assert(context.state.worldBooks.wb1.id === 'wb1', 'Cloud apply did not restore world books.');
  assert(context.state.activeConvId === 'c1', 'Cloud apply did not restore active conversation.');
  assert(context.state._charactersMigrated === true, 'Cloud apply did not restore character migration flag.');
  assert(persisted === true, 'Cloud apply did not persist restored snapshot.');
  assert(persistCalls[0].force === true && persistCalls[0].options.lastSaved === 123, 'Cloud apply should persist using the remote snapshot freshness timestamp.');
  assert(rendered === true, 'Cloud apply did not request a full render.');
  assert(Array.isArray(notified) && notified.includes('characters') && notified.includes('worldBooks'), 'Cloud apply did not notify restored data domains.');

  const dirtyApplied = context.__apply({
    settings: { model: 'dirty-model' },
    conversations: {
      c2: { id: 'c2', messages: [] },
      c1: { id: 'c1', messages: [] },
    },
    conversationOrder: ['missing', 'c2', 1, 'c2'],
    activeConvId: 1,
    characters: null,
    worldBooks: [],
    charactersMigrated: 'yes',
    lastSaved: 'not-a-number',
  });

  assert(dirtyApplied.conversationOrder.join(',') === 'c2,c1', 'Cloud apply should normalize dirty conversation order.');
  assert(context.state.activeConvId === 'c2', 'Cloud apply should recover from an invalid active conversation id.');
  assert(context.state.conversations.c2.normalized === true, 'Cloud apply should normalize recovered conversations.');
  assert(context.state.characters && !Array.isArray(context.state.characters), 'Cloud apply should normalize invalid character cards to an object map.');
  assert(context.state.worldBooks && !Array.isArray(context.state.worldBooks), 'Cloud apply should normalize invalid world books to an object map.');
  assert(context.state._charactersMigrated === true, 'Cloud apply should normalize character migration metadata.');
  assert(Number.isFinite(dirtyApplied.lastSaved), 'Cloud apply should normalize invalid timestamps.');
  assert(persistCalls[1].options.lastSaved === dirtyApplied.lastSaved, 'Cloud apply should persist using the normalized remote timestamp.');

  const falseMigratedApplied = context.__apply({
    settings: { model: 'legacy-false-model' },
    conversations: { c3: { id: 'c3', messages: [] } },
    conversationOrder: ['c3'],
    activeConvId: 'c3',
    characters: {},
    worldBooks: {},
    charactersMigrated: 'false',
    lastSaved: 777,
  });

  assert(falseMigratedApplied.charactersMigrated === false && context.state._charactersMigrated === false, 'Cloud apply should not treat string "false" as migrated.');

  context.state.settings = {};
  const sparseLocalApplied = context.__apply({
    settings: { model: 'remote-after-sparse-local' },
    conversations: { c4: { id: 'c4', messages: [] } },
    conversationOrder: ['c4'],
    activeConvId: 'c4',
    characters: {},
    worldBooks: {},
    charactersMigrated: true,
    lastSaved: 888,
  });

  assert(sparseLocalApplied.settings.model === 'remote-after-sparse-local', 'Cloud apply should return the remote settings for sparse local settings.');
  assert(context.state.settings.model === 'remote-after-sparse-local', 'Sparse local settings should not overwrite remote settings with undefined values.');
  assert(context.state.settings.cloudSyncEndpoint === '/api/sync', 'Sparse local settings should preserve default cloud sync endpoint instead of undefined.');
  assertThrows(() => context.__apply([]), 'Cloud apply should reject array snapshots instead of treating them as object maps.');
}

async function assertFrontendCloudSyncCrypto() {
  const sources = await Promise.all([
    '../src/app/22-cloud-sync.js',
    '../src/app/22-cloud-sync-normalize.js',
    '../src/app/22-cloud-sync-crypto-envelope.js',
    '../src/app/22-cloud-sync-base64.js',
    '../src/app/22-cloud-sync-key-derivation.js',
    '../src/app/22-cloud-sync-encrypt.js',
    '../src/app/22-cloud-sync-decrypt.js',
    '../src/app/22-cloud-sync-crypto.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  const snapshot = {
    settings: { model: 'secret-model-unique-9241' },
    conversations: {
      c1: {
        id: 'c1',
        messages: [{ role: 'user', content: 'secret-chat-message-9241' }],
      },
    },
    conversationOrder: ['c1'],
    activeConvId: 'c1',
    characters: { arona: { id: 'arona', name: 'secret-card-name-9241' } },
    worldBooks: { wb1: { id: 'wb1', entries: [{ id: 'e1', content: 'secret-world-entry-9241' }] } },
    charactersMigrated: true,
    lastSaved: 987654,
  };
  const context = {
    state: {
      settings: {
        cloudSyncEncrypted: true,
        cloudSyncPassphrase: 'correct passphrase',
      },
    },
    defaultSettings: () => ({
      cloudSyncEnabled: false,
      cloudSyncAutoUpload: false,
      cloudSyncEndpoint: '/api/sync',
      cloudSyncToken: '',
      cloudSyncEncrypted: false,
      cloudSyncPassphrase: '',
      cloudSyncLastAt: 0,
      cloudSyncLastStatus: '',
    }),
    StorageService: { _lastSaveSnapshot: null },
    window: { crypto: webcrypto },
    crypto: webcrypto,
    TextEncoder,
    TextDecoder,
    Uint8Array,
    Date,
    JSON,
    Number,
    Object,
    Array,
    String,
    btoa(text) { return Buffer.from(text, 'binary').toString('base64'); },
    atob(text) { return Buffer.from(text, 'base64').toString('binary'); },
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__encrypt = encryptCloudSyncSnapshot;\nthis.__decrypt = decryptCloudSyncSnapshot;`, context);

  const encrypted = await context.__encrypt(snapshot);
  const encryptedText = JSON.stringify(encrypted);
  assert(encrypted.encrypted === true && encrypted.payload && encrypted.iv && encrypted.salt, 'Cloud sync encryption should return an encrypted envelope.');
  assert(encrypted.lastSaved === snapshot.lastSaved, 'Encrypted cloud snapshot should preserve freshness metadata.');
  assert(!encryptedText.includes('secret-model-unique-9241'), 'Encrypted cloud snapshot should not expose settings content.');
  assert(!encryptedText.includes('secret-chat-message-9241'), 'Encrypted cloud snapshot should not expose chat content.');
  assert(!encryptedText.includes('secret-card-name-9241'), 'Encrypted cloud snapshot should not expose character card content.');
  assert(!encryptedText.includes('secret-world-entry-9241'), 'Encrypted cloud snapshot should not expose world book content.');

  const decrypted = await context.__decrypt(encrypted);
  assert(decrypted.settings.model === snapshot.settings.model, 'Encrypted cloud snapshot did not restore settings.');
  assert(decrypted.conversations.c1.messages[0].content === 'secret-chat-message-9241', 'Encrypted cloud snapshot did not restore chat history.');
  assert(decrypted.characters.arona.name === 'secret-card-name-9241', 'Encrypted cloud snapshot did not restore character cards.');
  assert(decrypted.worldBooks.wb1.entries[0].content === 'secret-world-entry-9241', 'Encrypted cloud snapshot did not restore world books.');
  assert(decrypted.activeConvId === 'c1' && decrypted.conversationOrder[0] === 'c1', 'Encrypted cloud snapshot did not restore conversation metadata.');

  await assertRejects(context.__decrypt({
    encrypted: true,
    algorithm: 'AES-GCM',
    iterations: 210000,
    salt: encrypted.salt,
    iv: encrypted.iv,
    payload: [],
  }), 'Malformed encrypted envelopes should be rejected before WebCrypto runs.');

  await assertRejects(context.__decrypt({
    encrypted: true,
    algorithm: 'AES-GCM',
    iterations: 0,
    salt: encrypted.salt,
    iv: encrypted.iv,
    payload: encrypted.payload,
  }), 'Explicitly invalid encrypted envelope iterations should be rejected.');

  context.state.settings.cloudSyncPassphrase = 'short';
  await assertRejects(context.__encrypt(snapshot), 'Short encryption passphrases should be rejected.');
  await assertRejects(context.__decrypt(encrypted), 'Short decryption passphrases should be rejected before WebCrypto runs.');
}

async function assertFrontendCloudSyncTransport() {
  const sources = await Promise.all([
    '../src/app/22-cloud-sync.js',
    '../src/app/22-cloud-sync-normalize.js',
    '../src/app/22-cloud-sync-transport.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  const requests = [];
  const context = {
    state: {
      settings: {
        cloudSyncEndpoint: 'https://sync.example/api',
        cloudSyncToken: 'short',
      },
    },
    defaultSettings: () => ({
      cloudSyncEnabled: false,
      cloudSyncAutoUpload: false,
      cloudSyncEndpoint: '/api/sync',
      cloudSyncToken: '',
      cloudSyncEncrypted: false,
      cloudSyncPassphrase: '',
      cloudSyncLastAt: 0,
      cloudSyncLastStatus: '',
    }),
    StorageService: { _lastSaveSnapshot: null },
    document: { getElementById() { return null; } },
    async fetch(url, options) {
      requests.push({ url, options });
      return new Response(JSON.stringify({ success: true, data: null }), { status: 200 });
    },
    Response,
    JSON,
    Date,
    Number,
    Object,
    Array,
    String,
    Error,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__request = requestCloudSync;\nthis.__status = setCloudSyncStatus;`, context);

  await assertRejects(context.__request('GET'), 'Short cloud sync tokens should be rejected before fetch.');
  assert(requests.length === 0, 'Short cloud sync tokens should not issue a network request.');

  context.state.settings.cloudSyncToken = 'valid-token';
  const result = await context.__request('GET');
  assert(result.success === true, 'Valid cloud sync requests should parse JSON responses.');
  assert(requests[0].url === 'https://sync.example/api', 'Cloud sync transport should use the configured endpoint.');
  assert(requests[0].options.headers.Authorization === 'Bearer valid-token', 'Cloud sync transport should send the bearer token.');
  assert(requests[0].options.headers['X-OpenTavern-Token'] === 'valid-token', 'Cloud sync transport should send the compatibility token header.');

  context.fetch = async function() {
    return new Response(JSON.stringify({ success: false, error: 'bad token' }), { status: 200 });
  };
  await assertRejects(context.__request('GET'), 'Cloud sync API error responses should reject.');
}

async function assertFrontendCloudSyncOperations() {
  const sources = await Promise.all([
    '../src/app/22-cloud-sync-operation-helpers.js',
    '../src/app/22-cloud-sync-upload.js',
    '../src/app/22-cloud-sync-download.js',
    '../src/app/22-cloud-sync-sync.js',
    '../src/app/22-cloud-sync-operations.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  const explicitStatus = { textContent: '', className: '' };
  const documentStatus = { textContent: '', className: '' };
  const events = [];
  let capturedRequest = null;
  let appliedSnapshot = null;
  const localSnapshot = {
    settings: { model: 'cloud-model' },
    conversations: { c1: { id: 'c1', messages: [{ content: 'hello cloud' }] } },
    conversationOrder: ['c1'],
    activeConvId: 'c1',
    characters: { arona: { name: 'Arona' } },
    worldBooks: { wb1: { id: 'wb1' } },
    lastSaved: 1000,
  };
  const context = {
    _cloudSyncSavingStatus: false,
    remoteSnapshot: null,
    readFails: false,
    encryptAsEncrypted: false,
    state: { settings: { cloudSyncEndpoint: '/api/sync', cloudSyncToken: 'token' } },
    document: {
      getElementById(id) { return id === 'cloudSyncStatus' ? documentStatus : null; },
    },
    ensureCloudSyncSettings() { events.push('ensure'); return context.state.settings; },
    buildAppDataSnapshot() { events.push('snapshot'); return localSnapshot; },
    readCloudSyncRemoteSnapshot() {
      events.push('read');
      if (context.readFails) throw new Error('offline');
      return context.remoteSnapshot;
    },
    getCloudSyncFreshness(remote) { events.push(`fresh:${remote && remote.freshness || 'same'}`); return (remote && remote.freshness) || 'same'; },
    async encryptCloudSyncSnapshot(snapshot) {
      events.push('encrypt');
      return Object.assign({ encrypted: !!context.encryptAsEncrypted }, snapshot);
    },
    async requestCloudSync(method, payload) {
      events.push(`request:${method}`);
      capturedRequest = { method, payload };
      return { success: true, updatedAt: 2000 };
    },
    async decryptCloudSyncSnapshot(raw) { events.push('decrypt'); return raw.data || raw; },
    applyCloudSyncSnapshot(data) { events.push('apply'); appliedSnapshot = data; },
    setCloudSyncStatus(message, isError) {
      events.push(`status:${isError ? 'error' : 'ok'}:${message}`);
      context.state.settings.cloudSyncLastStatus = message;
    },
    async persistState(force, options) {
      events.push(`persist:${force}:${context._cloudSyncSavingStatus}`);
      if (options && options.preserveLastSaved) events.push('preserve-last-saved');
    },
    Date,
    Promise,
    console: { warn(message) { events.push(`warn:${message}`); } },
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__pending = setCloudSyncPendingStatus;\nthis.__persistOp = persistCloudSyncOperationState;\nthis.__upload = uploadCloudSyncSnapshot;\nthis.__download = downloadCloudSyncSnapshot;\nthis.__sync = syncCloudSyncSnapshot;`, context);

  context.__pending(explicitStatus, 'Working...');
  assert(explicitStatus.textContent === 'Working...' && explicitStatus.className.includes('text-amber-300'), 'Cloud sync pending helper should update the provided status element.');
  context.__pending(null, 'Fallback working...');
  assert(documentStatus.textContent === 'Fallback working...', 'Cloud sync pending helper should fall back to the document status element.');

  await context.__persistOp();
  assert(events.includes('persist:true:true') && events.includes('preserve-last-saved') && context._cloudSyncSavingStatus === false, 'Cloud sync operation persist should pause auto-upload and preserve snapshot freshness.');

  events.length = 0;
  capturedRequest = null;
  context.encryptAsEncrypted = true;
  await context.__upload(explicitStatus, { force: true });
  assert(capturedRequest.method === 'POST' && capturedRequest.payload.encrypted === true, 'Cloud upload should POST the encrypted payload envelope.');
  assert(capturedRequest.payload.data.conversations.c1.messages[0].content === 'hello cloud', 'Cloud upload should include chat history.');
  assert(capturedRequest.payload.data.settings.model === 'cloud-model', 'Cloud upload should include settings.');
  assert(capturedRequest.payload.data.characters.arona.name === 'Arona', 'Cloud upload should include character cards.');
  assert(capturedRequest.payload.data.worldBooks.wb1.id === 'wb1', 'Cloud upload should include world books.');
  assert(events.some((event) => event.startsWith('status:ok:Cloud upload complete')) && events.includes('persist:true:true'), 'Cloud upload should report success and persist status.');

  events.length = 0;
  capturedRequest = null;
  context.readFails = true;
  const failedPreflight = await context.__upload(explicitStatus, { force: false });
  assert(failedPreflight.skipped === true && failedPreflight.reason === 'preflight-failed' && capturedRequest === null, 'Protected cloud upload should skip when remote freshness cannot be verified.');
  assert(events.includes('persist:true:true') && events.includes('preserve-last-saved'), 'Protected cloud upload preflight skips should persist the status without changing snapshot freshness.');

  events.length = 0;
  capturedRequest = null;
  context.readFails = false;
  context.remoteSnapshot = { freshness: 'newer', lastSaved: 5000 };
  const skipped = await context.__upload(explicitStatus, { force: false });
  assert(skipped.skipped === true && skipped.reason === 'remote-newer' && capturedRequest === null, 'Protected cloud upload should skip when the remote snapshot is newer.');
  assert(events.includes('persist:true:true') && events.includes('preserve-last-saved'), 'Protected cloud upload remote-newer skips should persist the status without changing snapshot freshness.');

  events.length = 0;
  context.remoteSnapshot = { freshness: 'same', lastSaved: 1000 };
  const synced = await context.__sync(null);
  assert(synced.upToDate === true && events.includes('persist:true:true'), 'Cloud sync should persist status when local and remote snapshots are already in sync.');

  events.length = 0;
  appliedSnapshot = null;
  context.remoteSnapshot = {
    freshness: 'newer',
    lastSaved: 7000,
    data: { lastSaved: 7000, settings: { model: 'newer' }, conversations: {}, characters: {}, worldBooks: {} },
  };
  const syncDownloaded = await context.__sync(explicitStatus);
  assert(syncDownloaded.lastSaved === 7000 && appliedSnapshot === syncDownloaded, 'Cloud sync should apply the newer remote snapshot.');
  assert(events.filter((event) => event === 'read').length === 1, 'Cloud sync should reuse the preflight remote snapshot instead of reading twice.');

  events.length = 0;
  appliedSnapshot = null;
  context.remoteSnapshot = null;
  const emptyDownload = await context.__download(explicitStatus);
  assert(emptyDownload === null && appliedSnapshot === null && events.includes('persist:true:true'), 'Cloud download should persist the empty-remote status.');

  events.length = 0;
  appliedSnapshot = null;
  context.remoteSnapshot = {
    freshness: 'newer',
    encrypted: false,
    data: { lastSaved: 6000, settings: {}, conversations: {}, characters: {}, worldBooks: {} },
  };
  const downloaded = await context.__download(explicitStatus);
  assert(downloaded.lastSaved === 6000 && appliedSnapshot === downloaded, 'Cloud download should decrypt and apply the remote snapshot.');
}

async function assertFrontendCloudSyncScheduler() {
  const sources = await Promise.all([
    '../src/app/22-cloud-sync-operation-helpers.js',
    '../src/app/22-cloud-sync-scheduler.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  const events = [];
  const timers = [];
  const context = {
    _cloudSyncSavingStatus: false,
    state: {
      settings: {
        cloudSyncEnabled: true,
        cloudSyncAutoUpload: true,
        cloudSyncEndpoint: '/api/sync',
        cloudSyncToken: 'valid-token',
      },
    },
    ensureCloudSyncSettings() { events.push('ensure'); return context.state.settings; },
    uploadCloudSyncSnapshot() {
      events.push('upload');
      return Promise.reject(new Error('network down'));
    },
    setCloudSyncStatus(message, isError) {
      events.push(`status:${isError ? 'error' : 'ok'}:${message}`);
      context.state.settings.cloudSyncLastStatus = message;
    },
    async persistState(force, options) {
      events.push(`persist:${force}:${context._cloudSyncSavingStatus}:${!!(options && options.preserveLastSaved)}`);
    },
    setTimeout(handler, delay) {
      timers.push({ handler, delay });
      return `timer-${timers.length}`;
    },
    clearTimeout(id) { events.push(`clear:${id}`); },
    Promise,
    Error,
    console: { warn(message) { events.push(`warn:${message}`); } },
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__schedule = scheduleCloudSyncUpload;\nthis.__saving = function() { return _cloudSyncSavingStatus; };`, context);

  context._cloudSyncSavingStatus = true;
  context.__schedule();
  assert(timers.length === 0, 'Cloud sync scheduler should not run while a cloud status persist is active.');

  context._cloudSyncSavingStatus = false;
  context.__schedule();
  assert(timers.length === 1 && timers[0].delay === 2500, 'Cloud sync scheduler should debounce auto uploads.');
  timers[0].handler();
  for (let i = 0; i < 5; i++) await Promise.resolve();

  assert(events.includes('upload'), 'Cloud sync scheduler should attempt the auto upload.');
  assert(events.some((event) => event.includes('Cloud auto upload failed: network down')), 'Cloud sync scheduler should report auto upload failures.');
  assert(events.includes('persist:true:true:true'), 'Cloud sync scheduler should persist failure status while preserving snapshot freshness.');
  assert(context.__saving() === false, 'Cloud sync scheduler should restore the saving guard after failure status persistence.');
}

async function assertFrontendSummaryService() {
  const promptSources = await Promise.all([
    '../src/app/53-summary-default-prompts.js',
    '../src/app/53-summary-prompt-limits.js',
    '../src/app/53-summary-prompt-builder.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));
  const apiSource = await readFile(new URL('../src/app/53-summary-api-client.js', import.meta.url), 'utf8');
  const serviceSource = await readFile(new URL('../src/app/53-summarization-service.js', import.meta.url), 'utf8');
  let capturedRequest = null;
  const context = {
    state: {
      settings: {
        summarizeUseMainAPI: false,
        summarizeApiEndpoint: 'https://summary.example/v1/chat/completions',
        summarizeApiKey: 'summary-key',
        summarizeModel: 'summary-model',
        apiEndpoint: 'https://main.example/v1/chat/completions',
        apiKey: 'main-key',
        model: 'main-model',
        userName: 'Tester',
        lang: 'en',
        summaryMaxWords: 500,
        summaryPrompt: '',
      },
    },
    console,
    JSON,
    Error,
    fetch: async (url, options) => {
      capturedRequest = {
        url,
        headers: options.headers,
        body: JSON.parse(options.body),
      };
      return {
        async json() {
          return {
            choices: [{
              finish_reason: 'length',
              message: { content: 'short generated summary' },
            }],
          };
        },
      };
    },
    t: (key) => key === 'summary_truncated_warning' ? '[truncated]' : key,
    normalizeApiEndpoint: (value) => value,
    shouldUseOllamaCompat: () => false,
    normalizeMessagesForOllamaCompatibility: (messages) => messages,
  };

  vm.runInNewContext(`${promptSources.join('\n')}\n${apiSource}\n${serviceSource}`, context);
  const result = await new Promise((resolve, reject) => {
    context.generateSummary([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'world' },
    ], (err, text) => err ? reject(err) : resolve(text));
  });

  assert(result.startsWith('[truncated]\nshort generated summary'), 'Summary truncation warning was not prepended.');
  assert(capturedRequest.url === 'https://summary.example/v1/chat/completions', 'Summary request did not use the custom endpoint.');
  assert(capturedRequest.headers.Authorization === 'Bearer summary-key', 'Summary request did not use the custom API key.');
  assert(capturedRequest.body.model === 'summary-model', 'Summary request did not use the custom model.');
  assert(capturedRequest.body.max_tokens === 1536, 'Summary max_tokens did not honor the word-limit budget floor.');
  assert(capturedRequest.body.messages[0].content.includes('[Word Limit] Keep the entire summary under 500 words'), 'Summary prompt did not include the word limit.');
  assert(capturedRequest.body.messages[1].content.includes('Tester: hello'), 'Summary user message was not labeled with the configured user name.');
  assert(capturedRequest.body.messages[1].content.includes('Assistant: world'), 'Summary assistant message was not labeled correctly.');
}

async function assertFrontendAutoSummarizationHelpers() {
  const sources = await Promise.all([
    '../src/app/54-summarization-auto-threshold.js',
    '../src/app/54-summarization-auto-selection.js',
    '../src/app/54-summarization-auto-runtime.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  function makeMessages(count) {
    return Array.from({ length: count }, (_, idx) => ({
      role: idx % 2 === 0 ? 'user' : 'assistant',
      content: `message-${idx}`,
    }));
  }

  let activeConv = null;
  const events = [];
  const context = {
    state: {
      settings: {
        summaryEnabled: false,
        summaryThreshold: 12,
        contextLength: 20,
      },
    },
    getActiveConv() {
      return activeConv;
    },
    performSummarization(subset, startIdx, endIdx, cb) {
      events.push({
        type: 'summary',
        count: subset.length,
        startIdx,
        endIdx,
        first: subset[0] && subset[0].content,
      });
      cb(null);
    },
    renderTokenBar() {
      events.push({ type: 'token' });
    },
    Math,
    Array,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__auto = autoSummarize;\nthis.__select = buildAutoSummarySelection;\nthis.__visible = getActualVisibleCountForSummary;`, context);

  function reset(settings, conv) {
    events.length = 0;
    context.state.settings = settings;
    activeConv = conv;
  }

  reset(
    { summaryEnabled: false, summaryThreshold: 12, contextLength: 20 },
    { messages: makeMessages(20), summaries: [] }
  );
  context.__auto();
  assert(events.length === 0, 'Auto summarization should not run while disabled.');

  reset(
    { summaryEnabled: true, summaryThreshold: 12, contextLength: 20 },
    { messages: makeMessages(5), summaries: [] }
  );
  context.__auto();
  assert(events.length === 0, 'Auto summarization should not run for short conversations.');

  reset(
    { summaryEnabled: true, summaryThreshold: 12, contextLength: 20 },
    {
      messages: [{ role: 'system', content: 'hidden' }, ...makeMessages(20)],
      summaries: [{ coveredEnd: 3 }, { coveredEnd: 7 }],
    }
  );
  context.__auto();
  assert(events[0].type === 'summary' && events[0].startIdx === 8 && events[0].endIdx === 15, 'Auto summarization should continue after the max coveredEnd summary.');
  assert(events[0].count === 8 && events[0].first === 'message-8', 'Auto summarization selected the wrong post-summary batch.');
  assert(events[1].type === 'token', 'Auto summarization should refresh the token bar after completion.');

  const scaledSelection = context.__select(
    { messages: makeMessages(24), summaries: [] },
    { summaryThreshold: 20 },
    () => 0
  );
  assert(scaledSelection.targetKeep === 7 && scaledSelection.minSummarizeBatch === 7, 'Auto summarization should scale keep/min-batch with threshold.');
  assert(scaledSelection.subset.length === 17, 'Auto summarization batch size should not be fixed at four messages.');

  reset(
    { summaryEnabled: true, summaryThreshold: 9, contextLength: 20 },
    { messages: makeMessages(9), summaries: [] }
  );
  assert(context.__visible() === 9, 'Auto summarization visible-count fallback should match current visible messages.');
  context.__auto();
  assert(events[0].type === 'summary' && events[0].count === 5 && events[0].startIdx === 0 && events[0].endIdx === 4, 'Auto summarization fallback should trigger at the visible-count threshold.');
}

async function assertFrontendSummaryManagerHelpers() {
  const sources = await Promise.all([
    '../src/app/58-summary-manager-range-ui.js',
    '../src/app/58-summary-manager-generation-ui.js',
    '../src/app/58-summary-manager-open-ui.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  function classList(initial = []) {
    const values = new Set(initial);
    return {
      values,
      add(...names) { names.forEach((name) => values.add(name)); },
      remove(...names) { names.forEach((name) => values.delete(name)); },
      contains(name) { return values.has(name); },
    };
  }
  function el(value = '') {
    return {
      value,
      innerHTML: '',
      textContent: '',
      disabled: false,
      classList: classList(),
    };
  }

  const events = [];
  const conv = {
    messages: [
      { role: 'system', content: 'hidden' },
      { role: 'user', content: 'one' },
      { role: 'assistant', content: 'two' },
      { role: 'user', content: 'three' },
      { role: 'assistant', content: 'four' },
      { role: 'user', content: 'five' },
      { role: 'assistant', content: 'six' },
    ],
  };
  const context = {
    dom: {
      summaryRecentTurns: el('2'),
      rangeStart: el('2'),
      rangeEnd: el('3'),
      rangePreview: el(),
      modeRecentPanel: el(),
      modeRangePanel: el(),
      modeRecentBtn: el(),
      modeRangeBtn: el(),
      summaryManagerStatus: el(),
      summaryGenerateBtn: el(),
      summaryManagerModal: el(),
    },
    getActiveConv() { return conv; },
    t: (key) => ({
      summary_preview_count: 'Will summarize {n} messages',
      summary_range_invalid: 'invalid',
      summary_generating: 'generating',
      nothing_to_archive: 'nothing',
    }[key] || key),
    alert: (msg) => events.push('alert:' + msg),
    performSummarization(subset, startIdx, endIdx, cb) {
      events.push('summarize:' + subset.length + ':' + startIdx + ':' + endIdx);
      cb(null);
    },
    renderSummaryManagerList: () => events.push('list'),
    renderTokenBar: () => events.push('token'),
    requestRender: (keys) => events.push('render:' + keys.join(',')),
    parseInt,
    Math,
    Array,
    Set,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__regular = getSummaryManagerRegularMessages;\nthis.__recent = getRecentSummarySelection;\nthis.__custom = getCustomSummarySelection;\nthis.__preview = previewCustomRange;\nthis.__busy = setSummaryManagerGenerating;\nthis.__generate = doGenerateSummary;\nthis.__open = openSummaryManager;`, context);

  const regular = context.__regular(conv);
  assert(regular.length === 6 && regular[0].content === 'one', 'Summary manager should ignore system messages.');

  const recent = context.__recent(regular);
  assert(recent.subset.length === 4 && recent.startIdx === 2 && recent.endIdx === 5, 'Summary manager recent mode should select the last N turns.');

  const custom = context.__custom(regular);
  assert(custom.subset.map((msg) => msg.content).join(',') === 'two,three', 'Summary manager custom range should use 1-based bounds.');

  context.__preview();
  assert(context.dom.rangePreview.innerHTML.includes('Will summarize 2 messages') && context.dom.rangePreview.innerHTML.includes('Assistant: two'), 'Summary manager preview should render count and message snippets.');

  context.__busy(true);
  assert(context.dom.summaryManagerStatus.textContent === 'generating' && context.dom.summaryGenerateBtn.disabled === true, 'Summary manager should set generating UI state.');
  context.__busy(false);

  context.__generate();
  assert(events.includes('summarize:4:2:5') && events.includes('list') && events.includes('token') && events.includes('render:activeConvId'), 'Summary manager generation should summarize the selected range and refresh UI.');
  assert(context.dom.summaryGenerateBtn.disabled === false && context.dom.summaryManagerStatus.textContent === '', 'Summary manager generation should reset UI state.');

  context.__open();
  assert(!context.dom.summaryManagerModal.classList.values.has('hidden'), 'Summary manager should open the modal.');
  assert(context.dom.summaryRecentTurns.value === 3 && context.dom.rangeEnd.value === 6, 'Summary manager should initialize default ranges.');
}

async function assertFrontendSummaryHistoryUI() {
  const sources = await Promise.all([
    '../src/app/55-summary-history-render.js',
    '../src/app/55-summary-history-ui.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  function button(attrs) {
    return {
      attrs,
      listeners: {},
      getAttribute(name) { return this.attrs[name]; },
      addEventListener(type, handler) { this.listeners[type] = handler; },
    };
  }
  function classList(initial = []) {
    const values = new Set(initial);
    return {
      values,
      contains(name) { return values.has(name); },
    };
  }

  const events = [];
  const editBtn = button({ 'data-edit-id': 's2' });
  const delBtn = button({ 'data-del-id': 's1' });
  const list = {
    innerHTML: '',
    querySelectorAll(selector) {
      if (selector === '.summary-edit-btn') return [editBtn];
      if (selector === '.summary-del-btn') return [delBtn];
      return [];
    },
    querySelector() { return null; },
  };
  const conv = {
    messages: [
      { role: 'system', content: 'hidden' },
      { role: 'user', content: 'one' },
      { role: 'assistant', content: 'two' },
    ],
    summaries: [
      { id: 's1', coveredStart: 0, coveredEnd: 1, created: 1000, text: 'First <summary>' },
      { id: 's2', coveredStart: 0, coveredEnd: 99, created: 2000, text: 'Compressed summary' },
    ],
  };
  const context = {
    dom: {
      summaryHistoryList: list,
      summaryManagerList: null,
      summaryManagerModal: { classList: classList(['hidden']) },
    },
    getActiveConv() { return conv; },
    t(key) {
      const values = {
        summary_no_history: 'No summaries',
        summary_covered: 'Turns ',
        summary_to: '-',
        summary_turns_suffix: '',
        summary_edit: 'Edit',
        summary_delete_confirm: 'Delete?',
      };
      return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : key;
    },
    escapeHtml(value) {
      return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    },
    recordEditSummary(id) { events.push(`edit:${id}`); },
    recordDeleteSummary(id) { events.push(`delete:${id}`); },
    persistState() { events.push('persist'); },
    updateStorageInfo() { events.push('storage'); },
    renderSummaryManagerList() { events.push('manager-list'); },
    showGlassConfirm: async () => true,
    Date,
    Set,
    Array,
    String,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.editSummary = recordEditSummary;\nthis.deleteSummary = recordDeleteSummary;\nthis.__count = getSummaryHistoryMessageCount;\nthis.__range = buildSummaryHistoryRangeText;\nthis.__item = buildSummaryHistoryItemHtml;\nthis.__render = renderSummaryHistory;`, context);

  assert(context.__count(conv) === 2, 'Summary history should count non-system messages only.');
  assert(context.__range(conv.summaries[0], 2) === 'Turns 1-2', 'Summary history range text should render normal summary bounds.');
  assert(context.__range(conv.summaries[1], 2) === '历史摘要（已压缩）', 'Summary history range text should mark compressed historical summaries.');
  assert(context.__item(conv.summaries[0], 2).includes('First &lt;summary&gt;'), 'Summary history item HTML should escape summary text.');

  context.__render();
  assert(list.innerHTML.indexOf('data-summary-id="s2"') < list.innerHTML.indexOf('data-summary-id="s1"'), 'Summary history should render newest summaries first.');
  editBtn.listeners.click({ stopPropagation() { events.push('stop-edit'); } });
  delBtn.listeners.click({ stopPropagation() { events.push('stop-del'); } });
  assert(events.includes('edit:s2') && events.includes('delete:s1'), 'Summary history action buttons should bind edit and delete handlers.');

  conv.summaries = [];
  context.__render();
  assert(list.innerHTML.includes('No summaries'), 'Summary history should render the empty state.');
}

async function assertFrontendPromptSummaryEvents() {
  const sources = await Promise.all([
    '../src/app/66-prompt-viewer-state.js',
    '../src/app/66-prompt-viewer-clipboard.js',
    '../src/app/66-prompt-viewer-events.js',
    '../src/app/66-summary-manager-events.js',
    '../src/app/66-prompt-summary-events.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  function classList(initial = []) {
    const values = new Set(initial);
    return {
      values,
      add(...names) { names.forEach((name) => values.add(name)); },
      remove(...names) { names.forEach((name) => values.delete(name)); },
      contains(name) { return values.has(name); },
    };
  }
  function el(initial = []) {
    return {
      listeners: {},
      textContent: '',
      innerHTML: '',
      classList: classList(initial),
      addEventListener(type, handler) {
        this.listeners[type] = handler;
      },
    };
  }

  const events = [];
  const timers = [];
  const dom = {
    viewPromptBtn: el(),
    promptStageMainBtn: el(),
    promptStageSecondBtn: el(),
    promptViewerModal: el(['hidden']),
    promptViewerCloseBtn: el(),
    promptViewerBackdrop: el(),
    promptViewerContent: el(),
    copyPromptBtn: el(),
    summarizeBtn: el(),
    summaryManagerModal: el(['hidden']),
    summaryManagerCloseBtn: el(),
    summaryManagerBackdrop: el(),
    modeRecentBtn: el(['bg-white/10', 'text-zinc-100']),
    modeRangeBtn: el(),
    modeRecentPanel: el(),
    modeRangePanel: el(['hidden']),
    previewRangeBtn: el(),
    rangeStart: el(),
    rangeEnd: el(),
    rangePreview: el(),
    summaryGenerateBtn: el(),
  };
  const conv = {
    messages: [
      { role: 'assistant', content: 'older main' },
      { role: 'assistant', stage: 'second', content: 'skip second' },
      { role: 'assistant', content: 'latest main' },
    ],
  };
  const context = {
    dom,
    navigator: {
      clipboard: {
        async writeText(text) {
          events.push('copy:' + text);
        },
      },
    },
    setTimeout(fn) {
      timers.push(fn);
    },
    getActiveConv() {
      return conv;
    },
    buildMessagesForAPI() {
      return [{ role: 'user', content: 'main prompt' }];
    },
    buildMessagesForSecondStage(message) {
      events.push('second-source:' + message.content);
      return [{ role: 'system', content: 'second prompt for ' + message.content }];
    },
    formatPromptMessages(messages) {
      return messages.map((message) => message.content).join('\n');
    },
    openSummaryManager() {
      events.push('open-summary');
    },
    previewCustomRange() {
      events.push('preview');
    },
    doGenerateSummary() {
      events.push('generate');
    },
    t: (key) => ({ copied: 'copied', copy: 'copy', no_messages_to_send: 'empty' }[key] || key),
    alert: (msg) => events.push('alert:' + msg),
    console: { error() {} },
    Array,
    Set,
  };

  vm.runInNewContext(`${sources.join('\n')}`, context);
  context.bindPromptAndSummaryWorkflowEvents();

  dom.viewPromptBtn.listeners.click();
  assert(!dom.promptViewerModal.classList.values.has('hidden'), 'Prompt viewer should open from the view prompt button.');
  assert(dom.promptViewerContent.textContent === 'main prompt', 'Prompt viewer should render the main prompt by default.');
  assert(dom.promptStageMainBtn.classList.values.has('text-amber-300'), 'Prompt viewer should mark the main stage active.');

  dom.promptStageSecondBtn.listeners.click();
  assert(events.includes('second-source:latest main'), 'Prompt viewer should use the latest main assistant message for second-stage prompts.');
  assert(dom.promptViewerContent.textContent.includes('second prompt for latest main'), 'Prompt viewer should render second-stage prompts.');

  dom.promptViewerCloseBtn.listeners.click();
  assert(dom.promptViewerModal.classList.values.has('hidden'), 'Prompt viewer close button should hide the modal.');
  dom.promptViewerModal.classList.remove('hidden');
  dom.promptViewerBackdrop.listeners.click();
  assert(dom.promptViewerModal.classList.values.has('hidden'), 'Prompt viewer backdrop should hide the modal.');

  dom.copyPromptBtn.listeners.click();
  await Promise.resolve();
  assert(events.includes('copy:' + dom.promptViewerContent.textContent), 'Prompt viewer copy button should write the rendered prompt.');
  assert(dom.copyPromptBtn.textContent === 'copied', 'Prompt viewer copy button should show copied feedback.');
  timers[0]();
  assert(dom.copyPromptBtn.textContent === 'copy', 'Prompt viewer copy button should restore its label.');

  dom.summarizeBtn.listeners.click();
  assert(events.includes('open-summary'), 'Summary button should open the summary manager.');

  dom.modeRangeBtn.listeners.click();
  assert(dom.modeRecentPanel.classList.values.has('hidden') && !dom.modeRangePanel.classList.values.has('hidden'), 'Summary manager should switch to range mode.');
  assert(dom.modeRangeBtn.classList.values.has('text-zinc-100') && !dom.modeRecentBtn.classList.values.has('text-zinc-100'), 'Summary range mode should update active button styles.');

  dom.rangePreview.innerHTML = 'stale';
  dom.modeRecentBtn.listeners.click();
  assert(!dom.modeRecentPanel.classList.values.has('hidden') && dom.modeRangePanel.classList.values.has('hidden'), 'Summary manager should switch back to recent mode.');
  assert(dom.rangePreview.innerHTML === '', 'Summary recent mode should clear stale range preview.');

  dom.previewRangeBtn.listeners.click();
  dom.rangeStart.listeners.input();
  dom.rangeEnd.listeners.input();
  assert(events.filter((event) => event === 'preview').length === 3, 'Summary range preview controls should refresh previews.');

  dom.summaryGenerateBtn.listeners.click();
  assert(events.includes('generate'), 'Summary generate button should trigger summary generation.');

  dom.summaryManagerModal.classList.remove('hidden');
  dom.summaryManagerCloseBtn.listeners.click();
  assert(dom.summaryManagerModal.classList.values.has('hidden'), 'Summary manager close button should hide the modal.');
}

async function assertFrontendSettingsEventBindings() {
  const sources = await Promise.all([
    '../src/app/71-event-settings-slider-bindings.js',
    '../src/app/71-event-settings-modal-bindings.js',
    '../src/app/71-event-settings-integration-bindings.js',
    '../src/app/71-event-settings-bindings.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  function el(value = '') {
    return {
      value,
      textContent: '',
      checked: false,
      clicked: false,
      listeners: {},
      addEventListener(type, handler) {
        const prev = this.listeners[type];
        this.listeners[type] = prev
          ? function(...args) {
              prev.apply(this, args);
              handler.apply(this, args);
            }
          : handler;
      },
      click() { this.clicked = true; },
    };
  }

  const events = [];
  const dom = {
    sidebarSettingsBtn: el(),
    topSettingsBtn: el(),
    settingsCloseBtn: el(),
    settingsBackdrop: el(),
    stPresetImportBtn: el(),
    stPresetImportFile: el(),
    stPresetExportBtn: el(),
    stPresetDeleteBtn: el(),
    comfyImportWorkflowBtn: el(),
    comfyWorkflowFile: el(),
    comfyTestBtn: el(),
    contextLength: el('32'),
    contextLenVal: el(),
    maxTokens: el('2048'),
    maxTokensVal: el(),
    temperature: el('0.4'),
    tempVal: el(),
    topP: el('0.8'),
    topPVal: el(),
    twoStageTemperature: el('0.25'),
    twoStageTempVal: el(),
    twoStageTopP: el('0.75'),
    twoStageTopPVal: el(),
    worldInfoBudget: el('4096'),
    worldInfoBudgetVal: el(),
    summaryThreshold: el('18'),
    summaryThresholdVal: el(),
    summaryEnabled: el(),
    summarizeUseMainAPI: el(),
  };

  const context = {
    dom,
    state: { settings: {} },
    openSettings() { events.push('open'); },
    closeSettings() { events.push('close'); },
    importSillyTavernPresetFile(file) { events.push(`st:${file.name}`); },
    exportSillyTavernPreset() { events.push('st-export'); },
    deleteSillyTavernPreset() { events.push('st-delete'); },
    importComfyWorkflowFile(file) { events.push(`comfy:${file.name}`); },
    testComfyConnection() { events.push('comfy-test'); },
    updateSummaryThresholdWarning() { events.push('summary-warning'); },
    toggleSummarizeCustomSection() { events.push('toggle-summary-api'); },
    parseInt,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__bind = bindSettingsEvents;`, context);
  context.__bind();

  dom.sidebarSettingsBtn.listeners.click();
  dom.topSettingsBtn.listeners.click();
  dom.settingsCloseBtn.listeners.click();
  dom.settingsBackdrop.listeners.click();
  assert(events.filter((event) => event === 'open').length === 2 && events.filter((event) => event === 'close').length === 2, 'Settings modal events should bind open and close controls.');

  dom.stPresetImportBtn.listeners.click();
  dom.stPresetImportFile.listeners.change({ target: { files: [{ name: 'preset.json' }] } });
  dom.stPresetExportBtn.listeners.click();
  dom.stPresetDeleteBtn.listeners.click();
  dom.comfyImportWorkflowBtn.listeners.click();
  dom.comfyWorkflowFile.listeners.change({ target: { files: [{ name: 'workflow.json' }] } });
  dom.comfyTestBtn.listeners.click();
  assert(dom.stPresetImportFile.clicked === true && dom.comfyWorkflowFile.clicked === true, 'Settings integration events should trigger hidden file inputs.');
  assert(events.includes('st:preset.json') && events.includes('st-export') && events.includes('st-delete') && events.includes('comfy:workflow.json') && events.includes('comfy-test'), 'Settings integration events should bind preset and ComfyUI controls.');

  dom.contextLength.listeners.input.call(dom.contextLength);
  dom.summaryThreshold.listeners.input.call(dom.summaryThreshold);
  dom.summaryEnabled.checked = true;
  dom.summaryEnabled.listeners.change.call(dom.summaryEnabled);
  dom.summarizeUseMainAPI.listeners.change();
  assert(dom.contextLenVal.textContent === '32' && String(dom.summaryThresholdVal.textContent) === '18', 'Settings slider events should update displayed values.');
  assert(context.state.settings.summaryThreshold === 18 && context.state.settings.summaryEnabled === true, 'Settings summary controls should update state.');
  assert(events.includes('toggle-summary-api') && events.includes('summary-warning'), 'Settings summary controls should refresh dependent UI.');
}

async function assertFrontendApiConnectionHelpers() {
  const helperSources = await Promise.all([
    '../src/app/31-api-connection-test-config.js',
    '../src/app/31-api-connection-endpoints.js',
    '../src/app/31-api-connection-result-ui.js',
    '../src/app/31-api-connection-response-helpers.js',
    '../src/app/31-api-connection-models-probe.js',
    '../src/app/31-api-connection-chat-probe.js',
    '../src/app/31-api-connection-test-helpers.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));
  const translations = {
    api_test_success_title: 'Connection OK',
    api_test_models_prefix: 'Models ',
    api_test_models_total: ' of ',
    api_test_models_mid: ':',
    api_test_more_omitted: 'more omitted',
    api_test_models_empty_note: 'No models returned',
    api_test_tested_urls_label: 'Tested URLs',
    api_test_suggest_title: 'Suggestions',
    api_test_timeout_msg: 'Timeout after {s}s',
    api_test_typeerror_prefix: 'Network error: ',
    api_test_fallback_success: 'Chat probe OK: ',
    api_test_fallback_success_choice: 'choice',
    api_test_fallback_success_ok: 'response',
    api_test_fallback_failed_prefix: 'Chat probe failed: ',
    api_test_timeout_short: 'timeout',
    api_test_typeerror_cors_note: 'CORS',
    api_test_suggest_localhost: 'Check local server',
    api_test_suggest_cors: 'Check CORS',
    api_test_suggest_endpoint_path: 'Check endpoint path',
    api_test_suggest_apikey: 'Check API key',
    api_test_suggest_stream: 'Check stream',
    api_test_suggest_gateway: 'Check gateway',
  };
  const context = {
    t: (key) => translations[key] || key,
    JSON,
    String,
    Array,
    Boolean,
    TypeError,
    AbortController,
    setTimeout,
    clearTimeout,
  };

  vm.runInNewContext(`${helperSources.join('\n')}\nthis.__derive = deriveApiModelsEndpoint;\nthis.__collect = collectApiTestModelNames;\nthis.__readHttp = readApiTestHttpError;\nthis.__success = buildApiTestSuccessHtml;\nthis.__suggestions = buildApiTestSuggestions;\nthis.__modelsProbe = runApiModelsEndpointTest;\nthis.__chatProbe = runApiChatCompletionFallbackTest;`, context);

  assert(context.__derive('https://api.example.com/v1/chat/completions') === 'https://api.example.com/v1/models', 'Models URL was not derived from chat completions endpoint.');
  assert(context.__derive('https://api.deepseek.com') === 'https://api.deepseek.com/v1/models', 'Models URL should add /v1 when the endpoint has no version.');
  assert(context.__derive('https://host/openai/v1') === 'https://host/openai/v1/models', 'Models URL should preserve openai/v1 endpoints.');

  const names = context.__collect({ data: [{ id: 'alpha' }, { name: 'beta' }, 'gamma'] });
  assert(names.join(',') === 'alpha,beta,gamma', 'Model name collection did not preserve id/name/string entries.');

  const html = context.__success(Array.from({ length: 13 }, (_, idx) => `m${idx}`));
  assert(html.includes('m0') && html.includes('more omitted'), 'Success HTML did not render model list truncation.');

  const suggestions = context.__suggestions('http://127.0.0.1:11434/v1');
  assert(suggestions.includes('Check local server') && suggestions.includes('Check CORS'), 'API test suggestions missed local/CORS hints.');

  const errorText = await context.__readHttp({
    status: 401,
    async text() {
      return JSON.stringify({ error: { message: 'bad key' } });
    },
  });
  assert(errorText === 'HTTP 401 - bad key', 'HTTP error message parser did not preserve API error detail.');

  const tested = [];
  context.fetch = async function(url, options) {
    if (url.endsWith('/models')) {
      assert(options.headers.Authorization === 'Bearer probe-key', 'Models probe should send bearer auth when an API key is provided.');
      return { ok: true, async json() { return { data: [{ id: 'probe-model' }] }; } };
    }
    assert(options.method === 'POST' && JSON.parse(options.body).stream === false, 'Chat probe should send a non-streaming chat completion request.');
    return { ok: true, async json() { return { choices: [{ message: { content: 'ok' } }] }; } };
  };
  const modelsProbe = await context.__modelsProbe('https://api.example/v1/models', 'probe-key', tested);
  assert(modelsProbe.ok === true && modelsProbe.html.includes('probe-model'), 'Models probe should return success HTML for model list responses.');
  const chatProbe = await context.__chatProbe('https://api.example/v1/chat/completions', 'probe-key', 'probe-model', tested);
  assert(chatProbe.includes('Chat probe OK: choice'), 'Chat probe should report successful chat completion fallback responses.');
  assert(tested.join('|') === 'GET https://api.example/v1/models|POST https://api.example/v1/chat/completions (stream:false)', 'API probes should record tested endpoints in order.');
}

async function assertFrontendApiCompatibilityHelpers() {
  const sources = await Promise.all([
    '../src/app/31-api-endpoint-normalizer.js',
    '../src/app/31-api-ollama-compat.js',
    '../src/app/31-api-compat.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));
  const context = {
    state: { settings: { ollamaCompatMode: false } },
    normalizePromptRole(role) {
      if (role === 'developer') return 'system';
      if (role === 'assistant') return 'assistant';
      if (role === 'system') return 'system';
      return 'user';
    },
    String,
    Array,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__endpoint = normalizeApiEndpoint;\nthis.__likelyOllama = isLikelyOllamaEndpoint;\nthis.__useOllama = shouldUseOllamaCompat;\nthis.__messages = normalizeMessagesForOllamaCompatibility;`, context);

  assert(context.__endpoint('https://api.deepseek.com') === 'https://api.deepseek.com/chat/completions', 'API compat should normalize DeepSeek base endpoints without adding /v1.');
  assert(context.__endpoint('https://host/openai/v1') === 'https://host/openai/v1/chat/completions', 'API compat should preserve OpenAI-compatible /openai/v1 endpoints.');
  assert(context.__endpoint('https://chat.example') === 'https://chat.example/v1/chat/completions', 'API compat should add /v1 to unversioned OpenAI-compatible endpoints.');
  assert(context.__endpoint('https://bigmodel.cn/api/paas/v4') === 'https://bigmodel.cn/api/paas/v4/chat/completions', 'API compat should preserve GLM v4 paths.');
  assert(context.__endpoint('https://already/v1/chat/completions') === 'https://already/v1/chat/completions', 'API compat should leave full chat completion URLs unchanged.');

  assert(context.__likelyOllama('http://127.0.0.1:11434/v1') === true, 'API compat should detect default Ollama ports.');
  assert(context.__useOllama('https://api.example/v1') === false, 'API compat should not force Ollama mode for normal endpoints.');
  context.state.settings.ollamaCompatMode = true;
  assert(context.__useOllama('https://api.example/v1') === true, 'API compat should respect manual Ollama compatibility mode.');

  const messages = context.__messages([
    { role: 'system', content: 'base' },
    { role: 'developer', content: 'dev' },
    { role: 'user', content: 'hello' },
    { role: 'system', content: 'late' },
    { role: 'assistant', content: 'first' },
    { role: 'assistant', content: 'second' },
    { role: 'user', content: '   ' },
  ]);
  assert(messages.map((msg) => msg.role).join(',') === 'system,user,assistant', 'Ollama compat should collapse adjacent compatible message roles.');
  assert(messages[0].content === 'base\n\ndev', 'Ollama compat should merge leading system/developer instructions.');
  assert(messages[1].content.includes('hello') && messages[1].content.includes('[System / developer instruction]\nlate'), 'Ollama compat should convert late system messages to user instructions.');
  assert(messages[2].content === 'first\n\nsecond', 'Ollama compat should merge adjacent assistant messages.');
}

async function assertFrontendGenerationHelpers() {
  const sources = await Promise.all([
    '../src/app/50-generation-cot-utils.js',
    '../src/app/50-generation-api-request.js',
    '../src/app/50-generation-stream-state.js',
    '../src/app/50-generation-response-stream.js',
    '../src/app/50-generation-integrations.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));
  const notifications = [];
  const context = {
    state: {
      isGenerating: false,
      abortController: null,
      settings: {
        apiEndpoint: 'https://chat.example/v1/chat/completions',
        apiKey: 'chat-key',
        model: 'chat-model',
        maxTokens: 1024,
        temperature: 0.7,
        topP: 0.9,
        requestCotEnabled: false,
      },
    },
    appStore: {
      notify(key) { notifications.push(key); },
    },
    isWebLLMBackend: () => false,
    streamChatWebLLMWithMessages() { throw new Error('WebLLM path should not be used.'); },
    t: (key) => key,
    normalizeApiEndpoint: (value) => value,
    shouldUseOllamaCompat: () => false,
    normalizeMessagesForOllamaCompatibility: (messages) => messages,
    fetch: async () => ({
      ok: false,
      status: 500,
      async text() { return JSON.stringify({ error: { message: 'server exploded' } }); },
    }),
    AbortController,
    TextDecoder,
    TextEncoder,
    Error,
    JSON,
    String,
    Array,
    Object,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__extract = extractCotDelta;\nthis.__split = splitInlineCot;\nthis.__parts = buildCotAwareParts;\nthis.__capture = shouldCaptureCotForRequest;\nthis.__payload = buildChatCompletionPayload;\nthis.__fetchOptions = buildChatCompletionFetchOptions;\nthis.__readError = readChatCompletionError;\nthis.__begin = beginGenerationStreamState;\nthis.__finish = finishGenerationStreamState;\nthis.__stream = streamChatWithMessages;`, context);

  assert(context.__extract({ reasoning_content: 'chain' }) === 'chain', 'CoT delta should read reasoning_content.');
  assert(context.__extract({ thinking: [{ text: 'a' }, { content: 'b' }, 'c'] }) === 'abc', 'CoT delta should flatten array parts.');

  const split = context.__split('hello <think>hidden</think> world <thinking>more</thinking>', 'seed');
  assert(split.content === 'hello  world', 'Inline CoT splitter should remove think blocks from content.');
  assert(split.cot === 'seed\nhidden\nmore', 'Inline CoT splitter should append think blocks to existing CoT.');
  const noCotParts = context.__parts(false, 'visible', 'secret');
  assert(noCotParts.content === 'visible' && noCotParts.cot === '', 'CoT parts should ignore CoT when capture is disabled.');

  const settings = {
    model: 'chat-model',
    apiKey: 'secret',
    requestCotEnabled: true,
    maxTokens: 1024,
    temperature: 0.7,
    topP: 0.9,
  };
  const messages = [{ role: 'user', content: 'hi' }];
  const payload = context.__payload(settings, messages, { maxTokens: 256, temperature: 0.2 });
  assert(payload.model === 'chat-model' && payload.messages === messages && payload.stream === true, 'Payload should preserve model/messages/stream.');
  assert(payload.max_tokens === 256 && payload.temperature === 0.2 && payload.top_p === 0.9, 'Payload should apply request overrides and defaults.');
  assert(context.__capture(settings, {}) === true && context.__capture(settings, { requestCot: false }) === false, 'CoT capture flag should respect request override.');

  const controller = new AbortController();
  const fetchOptions = context.__fetchOptions(settings, payload, controller);
  assert(fetchOptions.method === 'POST', 'Fetch options should use POST.');
  assert(fetchOptions.headers.Authorization === 'Bearer secret', 'Fetch options should include bearer token.');
  assert(JSON.parse(fetchOptions.body).model === 'chat-model', 'Fetch options should serialize payload.');
  assert(fetchOptions.signal === controller.signal, 'Fetch options should use the provided abort signal.');

  const parsedError = await context.__readError({
    status: 429,
    async text() { return JSON.stringify({ error: { message: 'rate limited' } }); },
  });
  assert(parsedError.message === 'API Error 429: rate limited', 'API error parser should preserve provider message.');

  const startedController = context.__begin();
  assert(context.state.isGenerating === true && context.state.abortController === startedController, 'Generation begin should set active stream state.');
  context.__finish();
  assert(context.state.isGenerating === false && context.state.abortController === null, 'Generation finish should clear active stream state.');
  assert(notifications.join(',') === 'isGenerating,isGenerating', 'Generation state helpers should notify state changes.');

  notifications.length = 0;
  let streamErrorMessage = '';
  await new Promise((resolve) => {
    context.__stream(
      [{ role: 'user', content: 'hi' }],
      () => {},
      () => { throw new Error('HTTP error path should not complete.'); },
      (err) => { streamErrorMessage = err && err.message; resolve(); }
    );
  });
  assert(streamErrorMessage === 'API Error 500: server exploded', 'Streaming HTTP error should preserve API error detail.');
  assert(context.state.isGenerating === false && context.state.abortController === null, 'Streaming HTTP error should clear active generation state.');
  assert(notifications.join(',') === 'isGenerating,isGenerating', 'Streaming HTTP error should notify begin and finish state changes.');

  function streamResponseFromLines(lines) {
    const encoder = new TextEncoder();
    const chunks = lines.map((line) => encoder.encode(line));
    let index = 0;
    return {
      ok: true,
      body: {
        getReader() {
          return {
            read() {
              if (index < chunks.length) return Promise.resolve({ done: false, value: chunks[index++] });
              return Promise.resolve({ done: true });
            },
          };
        },
      },
    };
  }

  notifications.length = 0;
  const tokenEvents = [];
  let completedContent = '';
  let completedCot = '';
  context.state.settings.requestCotEnabled = true;
  context.fetch = async () => streamResponseFromLines([
    'data: {"choices":[{"delta":{"content":"Hel","reasoning_content":"R1"}}]}\n',
    'data: {"choices":[{"delta":{"content":"lo","reasoning_content":"R2"}}]}\n',
    'data: [DONE]\n',
  ]);
  await new Promise((resolve, reject) => {
    context.__stream(
      [{ role: 'user', content: 'hi' }],
      (delta, content, cot) => tokenEvents.push({ delta, content, cot }),
      (content, cot) => {
        completedContent = content;
        completedCot = cot;
        resolve();
      },
      reject,
      { requestCot: true }
    );
  });
  assert(tokenEvents.length === 2 && tokenEvents[1].content === 'Hello', 'Streaming success should emit incremental content.');
  assert(completedContent === 'Hello' && completedCot === 'R1R2', 'Streaming success should complete with content and CoT.');
  assert(context.state.isGenerating === false && context.state.abortController === null, 'Streaming success should clear active generation state.');
  assert(notifications.join(',') === 'isGenerating,isGenerating', 'Streaming success should notify begin and finish state changes.');
}

async function assertFrontendPromptMessageHelpers() {
  const sources = await Promise.all([
    '../src/app/41-prompt-depth-insert.js',
    '../src/app/41-prompt-summary-messages.js',
    '../src/app/41-prompt-history-messages.js',
    '../src/app/41-prompt-outlet-resolution.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));
  const context = {
    normalizePromptRole(role) {
      const r = String(role || '').toLowerCase();
      return r === 'user' || r === 'assistant' ? r : 'system';
    },
    replacePlaceholders(text, charName, userName) {
      return String(text || '').replace(/\{\{char\}\}/g, charName).replace(/\{\{user\}\}/g, userName);
    },
    parseInt,
    isNaN,
    Object,
    Array,
    String,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__insert = insertMessagesAtDepth;\nthis.__summary = buildPromptSummaryMessage;\nthis.__regular = getRegularPromptMessages;\nthis.__outlets = resolvePromptOutletPlaceholders;\nthis.__replace = replacePromptMessagePlaceholders;`, context);

  const baseMessages = [
    { role: 'system', content: 'sys' },
    { role: 'user', content: 'u1' },
    { role: 'assistant', content: 'a1' },
  ];
  context.__insert(baseMessages, [
    { depth: 1, role: 1, content: 'hello {{char}}' },
    { _depth: -1, role: 'assistant', content: 'bye {{user}}' },
  ], 'Arona', 'Sensei');
  assert(baseMessages.map((m) => `${m.role}:${m.content}`).join('|') === 'system:sys|user:u1|user:hello Arona|assistant:a1|assistant:bye Sensei', 'Prompt depth insertion changed order, roles, or placeholders.');

  const summary = context.__summary([{ text: 'first' }, { text: 'second' }], 'en');
  assert(summary.role === 'system' && summary.content.includes('Automatic summary') && summary.content.includes('first\n---\nsecond'), 'Prompt summary message was not built correctly.');
  const zhSummary = context.__summary([{ text: '摘要' }], 'zh-CN');
  assert(zhSummary.content.startsWith('[以下是先前对话的自动摘要，供上下文参考]\n'), 'Prompt summary Chinese header should stay readable.');

  const conv = {
    summaries: [{ coveredEnd: 1 }],
    messages: [
      { role: 'system', content: 'hidden' },
      { role: 'user', content: 'old user' },
      { role: 'assistant', content: 'old assistant' },
      { role: 'user', content: 'visible one' },
      { role: 'assistant', content: 'visible two' },
      { role: 'user', content: 'visible three' },
      { role: 'assistant', content: '' },
    ],
  };
  const regular = context.__regular(conv, 2);
  assert(regular.map((m) => m.content).join(',') === 'visible two,visible three', 'Prompt regular history should skip summarized messages and respect context length.');
  regular[0].content = 'mutated';
  assert(conv.messages[4].content === 'visible two', 'Prompt regular history should clone messages before outlet mutation.');

  const outletMessages = [{ role: 'system', content: 'A {{outlet::Lore}} B {{outlet::Missing}} C {{char}}' }];
  context.__outlets(outletMessages, {
    Lore: [{ content: 'for {{user}}' }, { content: 'with {{char}}' }],
  }, 'Arona', 'Sensei');
  const replaced = context.__replace(outletMessages, 'Arona', 'Sensei');
  assert(replaced[0].content === 'A for Sensei\n\nwith Arona B  C Arona', 'Prompt outlet resolution or final placeholder replacement changed.');
}

async function assertFrontendSecondStagePromptBuilder() {
  const sources = await Promise.all([
    '../src/app/41-second-stage-message-lookup.js',
    '../src/app/41-second-stage-prompt-builder.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  const previousMain = { id: 'main-1', role: 'assistant', content: 'Previous {{char}}' };
  const previousSecond = { role: 'assistant', stage: 'second', parentId: 'main-1', content: 'Previous second {{user}}' };
  const currentUser = { role: 'user', content: 'Current user {{user}}' };
  const firstStage = { id: 'main-2', role: 'assistant', content: 'Current main {{char}}' };
  const conv = {
    character: { name: 'Arona' },
    messages: [
      { role: 'user', content: 'Old user' },
      previousMain,
      previousSecond,
      currentUser,
      firstStage,
    ],
  };
  const context = {
    state: {
      settings: {
        userName: 'Sensei',
        twoStageSystemPrompt: 'Second system {{char}} {{user}}',
        twoStageIncludeRecentContext: true,
      },
    },
    DEFAULT_TWO_STAGE_PROMPT: 'Default second {{char}}',
    getActiveConv() { return conv; },
    normalizeConversation() {},
    isGroupChat() { return false; },
    getCurrentSpeakerCharacter() { return null; },
    ensureMessageIdentity(msg) { if (!msg.id) msg.id = 'generated-id'; },
    replacePlaceholders(text, charName, userName) {
      return String(text || '').replace(/\{\{char\}\}/g, charName).replace(/\{\{user\}\}/g, userName);
    },
    Array,
    String,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__linked = findLinkedSecondStageMessage;\nthis.__previous = findPreviousMainAssistantMessage;\nthis.__user = findLatestUserMessageBefore;\nthis.__recent = buildSecondStageRecentContextMessages;\nthis.__messages = buildMessagesForSecondStage;`, context);

  assert(context.__linked(conv, previousMain) === previousSecond, 'Second-stage lookup should find the linked child message.');
  assert(context.__previous(conv, firstStage) === previousMain, 'Second-stage lookup should find the previous main assistant message.');
  assert(context.__user(conv, firstStage) === currentUser, 'Second-stage lookup should find the latest user message before the first-stage output.');

  const recent = context.__recent(conv, firstStage, 'Arona', 'Sensei');
  assert(recent.map((msg) => msg.content).join('|') === '[上一轮正文]\nPrevious Arona|[上一轮第二阶段输出]\nPrevious second Sensei|[当前用户消息]\nCurrent user Sensei|[本轮刚生成的正文]\nCurrent main Arona', 'Second-stage recent context should preserve previous main, previous second, user, and current main order.');

  const messagesWithContext = context.__messages(firstStage);
  assert(messagesWithContext.length === 5 && messagesWithContext[0].content === 'Second system Arona Sensei', 'Second-stage builder should include system prompt plus recent context.');

  context.state.settings.twoStageIncludeRecentContext = false;
  const messagesWithoutContext = context.__messages(firstStage);
  assert(messagesWithoutContext.length === 2 && messagesWithoutContext[1].content === 'Current main Arona', 'Second-stage builder should fall back to current first-stage output only.');
}

async function assertFrontendPromptBuilderContexts() {
  const sources = await Promise.all([
    '../src/app/41-world-info-constants.js',
    '../src/app/40-character-prompt-helpers.js',
    '../src/app/41-world-info-injection.js',
    '../src/app/41-prompt-builder.js',
    '../src/app/41-prompt-second-stage-context.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  const context = {
    state: {
      settings: {
        userName: 'Sensei',
        systemPrompt: 'System for {{char}} and {{user}}',
        userDescription: 'Likes {{char}}',
        postHistoryInstructions: 'After history {{user}}',
        twoStagePostHistoryInstructions: 'Second stage {{char}}',
      },
    },
    isGroupChat(conv) {
      return !!(conv && conv.group);
    },
    getGroupMembers(conv) {
      return conv.group.members || [];
    },
    getCurrentSpeakerCharacter(conv) {
      return conv.group.members[0].character;
    },
    Array,
    String,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__system = buildSystemPrompt;\nthis.__second = buildSecondStageContextPrompt;\nthis.__pos = WI_POS;`, context);

  const character = {
    name: 'Arona',
    personality: 'Kind to {{user}}',
    scenario: 'In Kivotos',
    description: 'Blue archive assistant',
    mes_example: '{{char}}: hello {{user}}',
  };
  const wi = {};
  wi[context.__pos.BEFORE_CHAR] = [{ content: 'Before lore {{char}}' }];
  wi[context.__pos.AFTER_CHAR] = [{ content: 'After lore {{user}}' }];

  const system = context.__system(character, wi);
  assert(system.startsWith('Before lore Arona'), 'System prompt should inject before-character world info first.');
  assert(system.includes('System for Arona and Sensei') && system.includes("User's Persona: Likes Arona"), 'System prompt should include settings and user persona.');
  assert(system.includes('After history Sensei') && system.includes('Personality: Kind to Sensei'), 'System prompt should include post-history and character fields.');
  assert(system.includes('Example dialogues:\nArona: hello Sensei') && system.includes('After lore Sensei'), 'System prompt should include examples and after-character world info.');

  const singleSecond = context.__second({ character }, wi);
  assert(singleSecond.includes('Personality: Kind to Sensei'), 'Single second-stage context should include character context.');
  assert(singleSecond.includes('Second stage Arona') && singleSecond.includes('Before lore Arona'), 'Single second-stage context should include second-stage post-history and world info.');

  const groupConv = {
    group: {
      scenarioOverride: 'Group scene for {{char}}',
      members: [
        { character: { name: 'Arona', personality: 'Guide' } },
        { character: { name: 'Plana', system_prompt: 'Plan {{user}}', description: 'Quiet' } },
      ],
    },
  };
  const groupSecond = context.__second(groupConv, null, 'plana');
  assert(groupSecond.includes('多角色群组对话') && groupSecond.includes('Group scene for Plana'), 'Group second-stage context should include group framing and focused scenario.');
  assert(groupSecond.includes('=== Plana ===') && groupSecond.includes('System Prompt: Plan Sensei'), 'Group second-stage context should include member prompt blocks.');
  assert(groupSecond.includes('本轮正文的主要发言者/叙事焦点：Plana'), 'Group second-stage context should record the focused speaker.');
}

async function assertFrontendCharacterImportHelpers() {
  const sources = await Promise.all([
    '../src/app/40-character-card-import.js',
    '../src/app/40-character-book-import.js',
    '../src/app/40-character-prompt-helpers.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  let createdBookName = null;
  const context = {
    state: {
      settings: {
        postHistoryInstructions: ' custom first ',
        twoStagePostHistoryInstructions: '',
      },
    },
    t: (key) => key,
    normalizeImportedWorldInfo(book) {
      return {
        name: book.normalizedName,
        entries: {
          e1: { uid: 'e1', content: 'Kivotos' },
        },
      };
    },
    createNewWorldBook(name) {
      createdBookName = name;
      return { id: 'wb1', name, entries: {} };
    },
    console: { log() {} },
    JSON,
    Object,
    Array,
    String,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__import = importCharacterCard;\nthis.__book = importCharacterBookFromCard;\nthis.__replace = replacePlaceholders;\nthis.__post = getEffectivePostHistoryInstructions;`, context);

  const imported = context.__import({
    spec: 'chara_card_v2',
    data: {
      name: 'Arona',
      description: 123,
      first_mes: 'Hello {{user}}',
      tags: ['ai'],
      extensions: { source: 'test' },
    },
  });
  assert(imported.name === 'Arona' && imported.description === '123', 'Character import should normalize v2 card fields to strings.');
  assert(imported.tags[0] === 'ai' && imported.extensions.source === 'test', 'Character import should preserve tags and extensions.');

  const book = context.__book({
    data: {
      character_book: {
        name: 'Embedded Lore',
        normalizedName: 'Normalized Lore',
        entries: [],
      },
    },
  }, 'Arona');
  assert(book && book.id === 'wb1' && book.name === 'Normalized Lore', 'Character book import should create and name a world book.');
  assert(createdBookName === 'Embedded Lore', 'Character book import should use embedded book name when creating the book.');

  assert(context.__replace('Hi {{char}} from {{user}}', 'Arona', 'Sensei') === 'Hi Arona from Sensei', 'Placeholder replacement changed.');
  assert(context.__post({ post_history_instructions: 'card post' }, 'first') === 'custom first', 'First-stage post-history override should win.');
  assert(context.__post({ post_history_instructions: 'card post' }, 'second') === 'card post', 'Second-stage post-history should fall back to character card when unset.');
}

async function assertFrontendCharacterImportEventHelpers() {
  const sources = await Promise.all([
    '../src/app/66-character-import-conversation.js',
    '../src/app/66-character-import-status-ui.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  function classList() {
    const values = new Set();
    return {
      values,
      add(name) { values.add(name); },
      remove(name) { values.delete(name); },
    };
  }

  const oldConv = {
    id: 'old',
    messages: [{ role: 'user', content: 'hi' }],
    worldInfo: { entries: { a: {} } },
    worldBookIds: ['wb1'],
  };
  const newConv = { id: 'new', messages: [] };
  const status = { classList: classList(), textContent: '', className: '' };
  const importModal = { classList: classList() };
  const context = {
    state: {
      settings: { userName: 'Sensei' },
      conversations: { old: oldConv },
      conversationOrder: ['old'],
      activeConvId: 'old',
      characters: {},
    },
    currentCharacterName: null,
    dom: {
      importStatus: status,
      importModal,
      importFileInput: { value: 'file.png' },
    },
    getActiveConv() { return context.state.conversations[context.state.activeConvId]; },
    newConversation() {},
    saveCurrentConversation() { context.saved = true; },
    defaultConversation() { return newConv; },
    importCharacterBookFromCard() { return { id: 'book', entries: { e1: {}, e2: {} } }; },
    replacePlaceholders(text, charName, userName) { return text.replace('{{char}}', charName).replace('{{user}}', userName); },
    t: (key) => ({ chat_with: 'Chat with ', import_success: 'Loaded: ' }[key] || key),
    JSON,
    Object,
    Set,
    console,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__prepare = prepareConversationForImportedCharacter;\nthis.__apply = applyImportedCharacterToConversation;\nthis.__book = attachEmbeddedCharacterBook;\nthis.__register = registerImportedCharacter;\nthis.__first = addImportedCharacterFirstMessage;\nthis.__status = setCharacterImportStatus;\nthis.__success = buildCharacterImportSuccessText;\nthis.__hide = hideCharacterImportModal;\nthis.__reset = resetCharacterImportFileInput;`, context);

  const conv = context.__prepare();
  assert(conv.id === 'new' && context.saved === true && conv.worldBookIds[0] === 'wb1', 'Character import should start a new conversation when the current one has messages and preserve world books.');

  const character = { name: 'Arona', first_mes: 'Hello {{user}}, I am {{char}}' };
  context.__apply(conv, character);
  const embeddedBook = context.__book({}, character, conv);
  context.__register(character);
  context.__first(conv, character);
  assert(conv.title === 'Chat with Arona' && conv.messages[0].content === 'Hello Sensei, I am Arona', 'Character import should apply character metadata and first message.');
  assert(conv.worldBookIds.includes('book') && context.state.characters.arona.name === 'Arona', 'Character import should link embedded books and register the character.');

  context.__status('ok', 'success');
  assert(status.textContent === 'ok' && status.className.includes('emerald'), 'Character import status should render success state.');
  assert(context.__success(character, embeddedBook).includes('2 entries'), 'Character import success text should include embedded world book count.');
  context.__hide();
  context.__reset();
  assert(importModal.classList.values.has('hidden') && context.dom.importFileInput.value === '', 'Character import UI helpers should hide modal and reset file input.');
}

async function assertFrontendWorldInfoNormalizerHelpers() {
  const sources = await Promise.all([
    '../src/app/41-world-info-constants.js',
    '../src/app/41-world-info-position.js',
    '../src/app/41-world-info-extension-fields.js',
    '../src/app/41-world-info-normalizer.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  const context = {
    JSON,
    Array,
    Object,
    isNaN,
    parseInt,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__normalize = normalizeWIEntry;\nthis.__position = normalizeWorldInfoPositionValue;`, context);

  assert(context.__position('before_example') === 2, 'World info position normalization should support before_example.');
  assert(context.__position('missing') === 1, 'World info position normalization should default to after character.');

  const entry = context.__normalize({
    uid: 'e1',
    keys: ['alpha'],
    secondary_keys: ['beta'],
    insertion_order: 7,
    enabled: false,
    position: 'outlet',
    extensions: {
      scan_depth: 5,
      outlet_name: 'Lore',
      group_override: true,
      match_character_description: true,
      match_whole_words: true,
    },
  });

  assert(entry.key[0] === 'alpha' && entry.keysecondary[0] === 'beta', 'World info normalizer should map ST keys.');
  assert(entry.order === 7 && entry.disable === true, 'World info normalizer should map insertion_order and enabled.');
  assert(entry.position === 7 && entry.extensions.position === 7, 'World info normalizer should normalize and round-trip position.');
  assert(entry.scanDepth === 5 && entry.outletName === 'Lore' && entry.groupOverride === true, 'World info normalizer should promote extension fields.');
  assert(entry.matchCharacterDescription === true && entry.matchWholeWords === true, 'World info normalizer should promote match flags.');
  assert(Array.isArray(entry.triggers) && entry.characterFilter.isExclude === false, 'World info normalizer should ensure required shape.');
}

async function assertFrontendWorldBookDefaults() {
  const sources = await Promise.all([
    '../src/app/41-world-info-constants.js',
    '../src/app/42-worldbook-entry-defaults.js',
    '../src/app/42-worldbook.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  const context = {
    Date: { now: () => 4242 },
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__entry = createDefaultWIEntry;\nthis.__extensions = createDefaultWIEntryExtensions;`, context);

  const entry = context.__entry(7);
  assert(entry.uid === 7 && entry.comment === 'New Entry 7', 'World book default entry should use the provided uid.');
  assert(entry.position === 1 && entry.role === 0 && entry.depth === 4, 'World book default entry should preserve core placement defaults.');
  assert(entry.extensions.position === entry.position && entry.extensions.role === entry.role, 'World book default extensions should mirror core placement defaults.');
  assert(entry.extensions.group_weight === entry.groupWeight && entry.extensions.ignore_budget === entry.ignoreBudget, 'World book default extensions should mirror advanced defaults.');

  const generated = context.__entry();
  assert(generated.uid === 4242, 'World book default entry should fall back to Date.now for uid.');
  const extensionsA = context.__extensions();
  const extensionsB = context.__extensions();
  assert(extensionsA.triggers !== extensionsB.triggers, 'World book default extensions should return fresh array values.');
}

async function assertFrontendWorldBookFormatHelpers() {
  const sources = await Promise.all([
    '../src/app/42-worldbook-import-format.js',
    '../src/app/42-worldbook-st-export-format.js',
    '../src/app/42-worldbook-character-book-export.js',
    '../src/app/42-worldbook-export-format.js',
    '../src/app/42-worldbook-format.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  const context = {
    state: {
      worldBooks: {
        wb1: {
          name: 'Alpha Book',
          entries: {
            '2': { uid: 2, id: 2, content: 'second', insertion_order: 20, position: 1, depth: 3, outletName: 'Lore' },
          },
        },
        wb2: {
          name: 'Beta Book',
          entries: {
            '1': { uid: 1, id: 1, content: 'first', order: 10, role: 1, triggers: ['go'] },
          },
        },
      },
    },
    normalizeWIEntry(entry) {
      return Object.assign({}, entry);
    },
    JSON,
    Object,
    Array,
    Date: { now: () => 999 },
    parseInt,
    isNaN,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__import = normalizeImportedWorldInfo;\nthis.__st = entriesToSTFormat;\nthis.__book = getCharacterBookForExport;`, context);

  const importedArray = context.__import({
    name: 'Imported',
    entries: [{ id: '7', content: 'seven' }, { content: 'zero' }],
  });
  assert(importedArray.name === 'Imported' && importedArray.entries['7'].uid === 7 && importedArray.entries['1'].uid === 1, 'World book import should normalize array entries and numeric ids.');

  const importedObject = context.__import({
    worldInfo: {
      entries: {
        custom: { content: 'custom uid' },
      },
    },
  });
  assert(importedObject.entries['999'].uid === 999, 'World book import should fall back to Date.now for non-numeric object keys.');

  const st = context.__st({
    name: 'Exported',
    entries: {
      '4': {
        uid: 4,
        content: 'entry',
        position: 4,
        depth: 2,
        role: 1,
        outletName: 'Outlet',
        matchWholeWords: true,
      },
    },
  });
  assert(st.name === 'Exported' && st.entries['4'].extensions.position === 4 && st.entries['4'].extensions.outlet_name === 'Outlet', 'World book ST export should mirror extension fields.');
  assert(Array.isArray(st.entries['4'].extensions.triggers), 'World book ST export should always include triggers.');

  const book = context.__book({ worldBookIds: ['wb1', 'wb2'] });
  assert(book.name === 'Alpha Book + Beta Book', 'Character book export should combine world book names.');
  assert(book.entries.map((entry) => entry.content).join(',') === 'first,second', 'Character book export should sort merged entries by order.');
  assert(book.entries[1].extensions.depth === 3, 'Character book export should keep ST extension mappings.');
}

async function assertFrontendSettingsSaveHelpers() {
  const sources = await Promise.all([
    '../src/app/68-settings-cloud-sync-form.js',
    '../src/app/68-settings-save-form-helpers.js',
    '../src/app/68-settings-save-main-form.js',
    '../src/app/68-settings-save-summary-form.js',
    '../src/app/68-settings-save-ui-form.js',
    '../src/app/68-settings-save-summary-api-form.js',
    '../src/app/68-settings-save-comfy-form.js',
    '../src/app/68-settings-save-webllm-form.js',
    '../src/app/68-settings-save-form.js',
    '../src/app/68-settings-save-effect-helpers.js',
    '../src/app/68-settings-save-effects.js',
    '../src/app/68-settings-save.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  const events = [];
  const activeConv = { _wiCache: { stale: true } };
  const classList = {
    values: new Set(),
    add(value) { this.values.add(value); },
  };
  const input = (value) => ({ value });
  const checkbox = (checked) => ({ checked });
  const context = {
    state: { settings: {} },
    dom: {
      apiEndpoint: input(' https://api.example/v1 '),
      apiKey: input(' key '),
      saveApiKey: checkbox(true),
      ollamaCompatMode: checkbox(true),
      modelName: input(' model-a '),
      contextLength: input('32'),
      maxTokens: input('2048'),
      temperature: input('0.4'),
      topP: input('0.8'),
      userName: input(' Sensei '),
      systemPrompt: input(' system '),
      postHistoryInstructions: input(' post '),
      twoStageEnabled: checkbox(true),
      twoStageTemperature: input('0.25'),
      twoStageTopP: input('0.75'),
      twoStageIncludeRecentContext: checkbox(true),
      twoStageSystemPrompt: input(''),
      twoStagePostHistoryInstructions: input(' two post '),
      requestCotEnabled: checkbox(true),
      showCotEnabled: checkbox(true),
      userDescription: input(' user desc '),
      summaryEnabled: checkbox(true),
      summaryThreshold: input('18'),
      summaryMaxWords: input('600'),
      summaryPrompt: input(' summarize '),
      worldInfoBudgetEnabled: checkbox(true),
      worldInfoBudget: input('4096'),
      uiTheme: input('new-dark'),
      lowPowerMode: checkbox(true),
      summarizeUseMainAPI: checkbox(false),
      summarizeApiEndpoint: input(' https://summary.example '),
      summarizeApiKey: input(' summary-key '),
      summarizeModel: input(' summary-model '),
      comfyEnabled: checkbox(true),
      comfyServer: input(' http://127.0.0.1:8188/ '),
      comfyPositiveNodeId: input(' 1 '),
      comfyNegativeNodeId: input(' 2 '),
      comfySeedNodeId: input(' 3 '),
      comfyNegativePrompt: input(' neg '),
      comfyPromptTemplate: input(''),
      cloudSyncEnabled: checkbox(true),
      cloudSyncAutoUpload: checkbox(true),
      cloudSyncEndpoint: input('   '),
      cloudSyncToken: input(' cloud-token '),
      cloudSyncEncrypted: checkbox(true),
      cloudSyncPassphrase: input(' pass phrase '),
      settingsModal: { classList },
    },
    document: {
      getElementById(id) {
        if (id === 'inferenceBackend') return { value: 'webllm' };
        if (id === 'webllmModel') return { value: 'Llama-Test' };
        return null;
      },
    },
    DEFAULT_TWO_STAGE_PROMPT: 'default two stage',
    ensureSillyTavernPresetSettings() { events.push('preset'); },
    normalizeUiTheme(value) { events.push('theme-normalize'); return value; },
    cacheUiTheme(value) { events.push(`cache:${value}`); },
    ensureComfySettings() { events.push('comfy'); },
    normalizeComfyServer(value) { return value.trim().replace(/\/+$/, ''); },
    defaultSettings() { return { comfyPromptTemplate: 'default comfy template' }; },
    ensureCloudSyncSettings() { events.push('cloud'); },
    persistState() { events.push('persist'); },
    applyUiTheme(value) { events.push(`apply-theme:${value}`); },
    applyPerformanceMode(value) { events.push(`perf:${value}`); },
    updateInputState() { events.push('input'); },
    getActiveConv() { return activeConv; },
    renderTokenBar() { events.push('token'); },
    autoSummarize() { events.push('auto'); },
    appStore: { notify(key) { events.push(`notify:${key}`); } },
    setTimeout(fn) { fn(); },
    parseInt,
    parseFloat,
    Number,
    Set,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__close = closeSettings;\nthis.__clearWi = clearActiveConversationWorldInfoCache;\nthis.__rawOr = readControlValueOr;\nthis.__trimOr = readTrimmedControlValueOr;\nthis.__checkbox = readCheckboxControlValue;\nthis.__finiteFloat = readFiniteFloatControlValue;`, context);
  assert(context.__rawOr(input('  raw  '), 'fallback') === '  raw  ', 'Settings save form helper should preserve raw control values when requested.');
  assert(context.__trimOr(input('  '), 'fallback') === 'fallback', 'Settings save form helper should default blank trimmed values.');
  assert(context.__checkbox(null, true) === true, 'Settings save form helper should use checkbox fallback values.');
  assert(context.__finiteFloat(input('0'), 0.3) === 0 && context.__finiteFloat(input('NaN'), 0.3) === 0.3, 'Settings save form helper should preserve finite floats and default invalid values.');
  activeConv._wiCache = { stale: true };
  context.__clearWi();
  assert(activeConv._wiCache === null, 'Settings save effects helper should clear the active world-info cache.');
  context.__close();

  assert(context.state.settings.apiEndpoint === 'https://api.example/v1', 'Settings save should trim API endpoint.');
  assert(context.state.settings.model === 'model-a' && context.state.settings.contextLength === 32, 'Settings save should read model and context length.');
  assert(context.state.settings.twoStageSystemPrompt === 'default two stage', 'Settings save should default empty two-stage prompt.');
  assert(context.state.settings.uiTheme === 'new-dark' && context.state.settings.lowPowerMode === true, 'Settings save should read UI behavior settings.');
  assert(context.state.settings.comfyServer === 'http://127.0.0.1:8188', 'Settings save should normalize Comfy server.');
  assert(context.state.settings.comfyPromptTemplate === 'default comfy template', 'Settings save should default empty Comfy prompt template.');
  assert(context.state.settings.cloudSyncEndpoint === '/api/sync', 'Settings save should default empty cloud sync endpoint.');
  assert(context.state.settings.cloudSyncToken === 'cloud-token', 'Settings save should trim cloud sync token.');
  assert(context.state.settings.cloudSyncPassphrase === ' pass phrase ', 'Settings save should preserve cloud sync passphrase exactly.');
  assert(context.state.settings.inferenceBackend === 'webllm' && context.state.settings.webllmModel === 'Llama-Test', 'Settings save should read WebLLM controls.');
  assert(classList.values.has('hidden'), 'Settings save should hide the modal.');
  assert(activeConv._wiCache === null, 'Settings save should clear world-info cache.');
  assert(events.includes('persist') && events.includes('apply-theme:new-dark') && events.includes('perf:true') && events.includes('notify:settings'), 'Settings save effects did not run.');
  assert(events.includes('auto'), 'Settings save should trigger auto summarize when enabled.');
}

async function assertFrontendSettingsHydrationHelpers() {
  const sources = await Promise.all([
    '../src/app/68-settings-basic-hydration.js',
    '../src/app/68-settings-advanced-hydration-helpers.js',
    '../src/app/68-settings-advanced-hydration.js',
    '../src/app/68-settings-integration-hydration.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  function input(value = '') {
    return {
      value,
      textContent: '',
      checked: false,
      listeners: {},
      addEventListener(type, handler) { this.listeners[type] = handler; },
    };
  }

  const events = [];
  const context = {
    state: { settings: {
      apiEndpoint: 'https://api.example',
      apiKey: 'key',
      saveApiKey: true,
      ollamaCompatMode: true,
      model: 'model-a',
      contextLength: 32,
      maxTokens: 2048,
      temperature: 0.4,
      topP: 0.8,
      userName: 'Sensei',
      systemPrompt: 'system',
      postHistoryInstructions: 'post',
      userDescription: 'desc',
      twoStageEnabled: true,
      twoStageTemperature: 0.25,
      twoStageTopP: 0.75,
      twoStageIncludeRecentContext: true,
      twoStageSystemPrompt: '',
      twoStagePostHistoryInstructions: 'two post',
      requestCotEnabled: true,
      showCotEnabled: false,
      summaryEnabled: true,
      summaryThreshold: 18,
      summaryMaxWords: 600,
      summaryPrompt: 'summary',
      worldInfoBudgetEnabled: true,
      worldInfoBudget: 4096,
      uiTheme: 'new-dark',
      lowPowerMode: true,
      summarizeUseMainAPI: false,
      summarizeApiEndpoint: 'https://summary.example',
      summarizeApiKey: 'summary-key',
      summarizeModel: 'summary-model',
      comfyEnabled: true,
      comfyServer: 'http://127.0.0.1:8188',
      comfyPositiveNodeId: '1',
      comfyNegativeNodeId: '2',
      comfySeedNodeId: '3',
      comfyNegativePrompt: 'neg',
      comfyPromptTemplate: 'template',
    } },
    dom: {
      apiEndpoint: input(), apiKey: input(), saveApiKey: input(), ollamaCompatMode: input(), modelName: input(),
      contextLength: input(), contextLenVal: input(), maxTokens: input(), maxTokensVal: input(), temperature: input(), tempVal: input(), topP: input(), topPVal: input(),
      userName: input(), systemPrompt: input(), postHistoryInstructions: input(), userDescription: input(), fillRoleplayPromptBtn: input(), fillPostHistoryBtn: input(),
      twoStageEnabled: input(), twoStageTemperature: input(), twoStageTempVal: input(), twoStageTopP: input(), twoStageTopPVal: input(), twoStageIncludeRecentContext: input(), twoStageSystemPrompt: input(), twoStagePostHistoryInstructions: input(), requestCotEnabled: input(), showCotEnabled: input(), restoreTwoStagePromptBtn: input(),
      summaryEnabled: input(), summaryThreshold: input(), summaryThresholdVal: input(), summaryMaxWords: input(), summaryPrompt: input(),
      worldInfoBudgetEnabled: input(), worldInfoBudget: input(), worldInfoBudgetVal: input(), uiTheme: input(), lowPowerMode: input(),
      summarizeUseMainAPI: input(), summarizeApiEndpoint: input(), summarizeApiKey: input(), summarizeModel: input(),
      comfyEnabled: input(), comfyServer: input(), comfyPositiveNodeId: input(), comfyNegativeNodeId: input(), comfySeedNodeId: input(), comfyNegativePrompt: input(), comfyPromptTemplate: input(),
    },
    BASE_SYSTEM_PROMPT: 'base system',
    DEFAULT_FIRST_STAGE_POST_HISTORY_INSTRUCTIONS: 'default post',
    DEFAULT_TWO_STAGE_PROMPT: 'default two stage',
    persistState: () => events.push('persist'),
    updateSummaryThresholdWarning: () => events.push('summary-warning'),
    ensureSillyTavernPresetSettings: () => events.push('st-ensure'),
    renderSillyTavernPresetSettings: () => events.push('st-render'),
    ensureComfySettings: () => events.push('comfy-ensure'),
    updateComfyWorkflowStatus: () => events.push('comfy-status'),
    parseInt,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__primary = hydratePrimaryApiSettings;\nthis.__generation = hydrateGenerationSettings;\nthis.__prompt = hydratePromptSettings;\nthis.__two = hydrateTwoStageSettings;\nthis.__summary = hydrateSummarySettings;\nthis.__budget = hydrateWorldInfoBudgetSettings;\nthis.__theme = hydrateThemePerformanceSettings;\nthis.__summaryApi = hydrateSummarizationApiSettings;\nthis.__st = hydrateSillyTavernPresetSettings;\nthis.__comfy = hydrateComfySettingsControls;\nthis.__defaultOn = hydrateCheckboxControlDefaultOn;\nthis.__restorePrompt = bindDefaultPromptRestoreButton;`, context);

  context.__primary();
  context.__generation();
  context.__prompt();
  context.__two();
  context.__summary();
  context.__budget();
  context.__theme();
  context.__summaryApi();
  context.__st();
  context.__comfy();

  const defaultOnCheckbox = input();
  context.__defaultOn(defaultOnCheckbox, undefined);
  assert(defaultOnCheckbox.checked === true, 'Settings advanced hydration helper should default checkboxes on.');
  const restoreBtn = input();
  const restorePrompt = input('custom');
  context.__restorePrompt(restoreBtn, restorePrompt, 'restored prompt');
  restoreBtn.onclick();
  assert(restorePrompt.value === 'restored prompt' && context.state.settings.twoStageSystemPrompt === 'restored prompt' && events.includes('persist'), 'Settings advanced hydration helper should restore default prompts and persist.');

  assert(context.dom.apiEndpoint.value === 'https://api.example' && context.dom.saveApiKey.checked === true, 'Settings hydration should fill primary API controls.');
  assert(context.dom.contextLenVal.textContent === 32 && context.dom.tempVal.textContent === 0.4, 'Settings hydration should fill generation slider labels.');
  assert(context.dom.twoStageSystemPrompt.value === 'default two stage' && context.dom.showCotEnabled.checked === false, 'Settings hydration should fill two-stage controls.');
  assert(context.dom.summaryThresholdVal.textContent === 18 && context.dom.summaryMaxWords.value === 600, 'Settings hydration should fill summary controls.');
  assert(context.dom.worldInfoBudgetVal.textContent === 4096 && context.dom.uiTheme.value === 'new-dark', 'Settings hydration should fill world info and theme controls.');
  assert(context.dom.summarizeApiEndpoint.value === 'https://summary.example' && context.dom.comfyServer.value === 'http://127.0.0.1:8188', 'Settings hydration should fill integration controls.');
  assert(events.includes('st-ensure') && events.includes('comfy-status') && events.includes('summary-warning'), 'Settings hydration should call dependent render/status helpers.');

  const shortcutPersistCountBefore = events.filter((event) => event === 'persist').length;
  context.dom.fillRoleplayPromptBtn.onclick();
  context.dom.restoreTwoStagePromptBtn.onclick();
  assert(context.state.settings.systemPrompt === 'base system' && context.state.settings.twoStageSystemPrompt === 'default two stage', 'Settings hydration shortcut buttons should restore defaults.');
  assert(events.filter((event) => event === 'persist').length === shortcutPersistCountBefore + 2, 'Settings hydration shortcut buttons should persist changes.');
}

async function assertFrontendPublicCardAssets() {
  const dataSource = await readFile(new URL('../src/app/60-public-card-data.js', import.meta.url), 'utf8');
  const assetSource = await readFile(new URL('../src/app/60-public-card-assets.js', import.meta.url), 'utf8');
  const librarySource = await readFile(new URL('../src/app/60-public-card-library.js', import.meta.url), 'utf8');

  const context = {
    window: { location: { protocol: 'file:' } },
    JSON,
  };
  vm.runInNewContext(`${dataSource}\n${assetSource}\n${librarySource}\nthis.__cards = getPublicCards();\nthis.__resolve = resolvePublicCardAssetUrl;\nthis.__resolveImage = resolvePublicCardImageUrl;\nthis.__resolveJson = resolvePublicCardJsonUrl;`, context);

  assert(Array.isArray(context.__cards), 'Public card library did not expose an array.');
  assert(context.__cards.length >= 10, 'Public card library should contain bundled cards.');
  assert(context.__resolve('/cards/Plana.png') === 'cards/Plana.png', 'File protocol should use relative card asset paths.');
  assert(context.__resolve('\\\\cards\\\\Plana.png') === 'cards/Plana.png', 'File protocol should normalize Windows-style card asset paths.');
  assert(context.__resolveImage({ previewImage: '/cards/Plana.png' }) === 'cards/Plana.png', 'Public card image helper should resolve preview assets.');
  assert(context.__resolveJson({ jsonUrl: '/cards/Plana.json' }) === 'cards/Plana.json', 'Public card JSON helper should resolve card data assets.');

  context.window.location.protocol = 'http:';
  assert(context.__resolve('/cards/Plana.png') === '/cards/Plana.png', 'HTTP protocol should preserve absolute card asset paths.');

  const assetPaths = [];
  context.__cards.forEach((card) => {
    assert(card.previewImage, `Public card ${card.id || card.name} is missing a preview image.`);
    assert(card.jsonUrl, `Public card ${card.id || card.name} is missing a JSON URL.`);
    assetPaths.push(context.__resolve(card.previewImage), context.__resolve(card.jsonUrl));
  });

  for (const assetPath of assetPaths) {
    const bytes = await readFile(new URL(`../${assetPath.replace(/^\/+/, '')}`, import.meta.url));
    assert(bytes.byteLength > 0, `Public card asset is empty: ${assetPath}`);
  }
}

async function assertFrontendLibraryCardFilterHelpers() {
  const source = await readFile(new URL('../src/app/60-library-card-filter.js', import.meta.url), 'utf8');
  const context = {
    librarySearchQuery: '',
    libraryFilter: 'all',
    Array,
    String,
    RegExp,
  };

  vm.runInNewContext(`${source}\nthis.__orientation = getCardOrientation;\nthis.__passes = passesLibraryFilter;`, context);

  assert(context.__orientation(['女仆']) === 'male', 'Library card filter should infer target orientation from feminine tags.');
  assert(context.__orientation(['男友']) === 'female', 'Library card filter should infer target orientation from masculine tags.');
  assert(context.__orientation(['male', 'female']) === 'both', 'Library card filter should treat mixed tags as both.');

  context.librarySearchQuery = 'sensei';
  assert(context.__passes({ name: 'Alpha', author: 'Sensei', tags: [], description: '' }), 'Library card filter should match authors.');
  context.librarySearchQuery = 'kind';
  assert(context.__passes({ name: 'Alpha', tags: [], personality: 'Kind guide' }), 'Library card filter should match descriptions or personalities.');
  context.librarySearchQuery = 'missing';
  assert(!context.__passes({ name: 'Alpha', tags: ['hero'], description: 'guide' }), 'Library card filter should reject non-matching searches.');

  context.librarySearchQuery = '';
  context.libraryFilter = 'male';
  assert(context.__passes({ tags: ['女'] }), 'Library card filter should include male-oriented cards for male filter.');
  assert(!context.__passes({ tags: ['男'] }), 'Library card filter should exclude female-oriented cards for male filter.');
}

async function assertFrontendLibraryCardDisplayHelpers() {
  const source = await readFile(new URL('../src/app/60-library-card-display-helpers.js', import.meta.url), 'utf8');
  function makeElement(tag) {
    return {
      tag,
      className: '',
      textContent: '',
      children: [],
      appendChild(child) { this.children.push(child); },
    };
  }
  const context = {
    document: { createElement: makeElement },
  };

  vm.runInNewContext(`${source}\nthis.__name = getLibraryCardDisplayName;\nthis.__initial = getLibraryCardInitial;\nthis.__tags = formatLibraryCardTags;\nthis.__info = createLibraryCardInfo;`, context);

  assert(context.__name({ name: '' }) === 'Unnamed', 'Library card display helper should default missing names.');
  assert(context.__initial({ name: 'arona' }) === 'A' && context.__initial({}) === '?', 'Library card display helper should derive initials.');
  assert(context.__tags(['a', 'b', 'c', 'd']) === 'a · b · c', 'Library card display helper should show the first three tags.');
  const info = context.__info({ name: 'Alpha', tags: ['one', 'two'] });
  assert(info.children.length === 2 && info.children[0].textContent === 'Alpha' && info.children[1].textContent === 'one · two', 'Library card display helper should build shared card info nodes.');
}

async function assertFrontendMyCardGridFiltering() {
  const source = await readFile(new URL('../src/app/60-library-my-card-filter.js', import.meta.url), 'utf8');
  const context = {
    state: {
      characters: {
        keep: { name: 'Keep', tags: ['ai'], description: '', personality: 'kind', creator_notes: 'note' },
        skip: { name: 'Skip', tags: ['other'], description: 'other', creator: 'creator' },
      },
    },
    passesLibraryFilter: (card) => card.name === 'Keep' && card.description === 'kind' && card.author === 'note',
    Object,
  };

  vm.runInNewContext(`${source}\nthis.__card = buildMyLibraryCharacterFilterCard;\nthis.__filtered = getFilteredMyLibraryCharacters;`, context);

  const filterCard = context.__card(context.state.characters.keep);
  assert(filterCard.description === 'kind' && filterCard.author === 'note', 'My card grid filter helper should map personality and creator notes into filter fields.');
  const filtered = context.__filtered();
  assert(filtered.length === 1 && filtered[0].name === 'Keep', 'My card grid filtering should use the shared library filter.');
}

async function assertFrontendMyCardControlHelpers() {
  const sources = await Promise.all([
    '../src/app/60-library-my-card-control-helpers.js',
    '../src/app/60-library-my-card-controls-ui.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  const events = [];
  let confirmResult = false;
  const context = {
    showGlassConfirm: async (message, options) => {
      events.push(`confirm:${message}:${options.okText}`);
      return confirmResult;
    },
    deleteCharacterFromLibrary: (key) => events.push(`delete:${key}`),
    renderMyCards: () => events.push('render'),
    document: { createElement: () => ({ addEventListener() {} }) },
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__key = getMyCharacterCardKey;\nthis.__config = getMyCharacterDeleteConfirmConfig;\nthis.__confirm = confirmAndDeleteMyCharacterCard;`, context);

  assert(context.__key({ name: ' Arona ' }) === 'arona', 'My card controls should normalize character keys.');
  const config = context.__config({ name: 'Arona' });
  assert(config.message.includes('Arona') && config.options.danger === true, 'My card controls should build a dangerous delete confirmation.');

  await context.__confirm({ name: 'Arona' });
  assert(!events.includes('delete:arona'), 'My card controls should not delete when confirmation is cancelled.');

  confirmResult = true;
  await context.__confirm({ name: 'Arona' });
  assert(events.includes('delete:arona') && events.includes('render'), 'My card controls should delete and refresh after confirmation.');
}

async function assertFrontendMyCardActionHelpers() {
  const sources = await Promise.all([
    '../src/app/60-library-my-card-action-helpers.js',
    '../src/app/60-library-my-card-actions-ui.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  function classList() {
    const values = new Set(['hidden']);
    return {
      values,
      add(name) { values.add(name); },
      remove(name) { values.delete(name); },
    };
  }
  function makeElement() {
    return {
      className: '',
      innerHTML: '',
      listeners: {},
      addEventListener(type, handler) { this.listeners[type] = handler; },
      appendChild(child) { this.children = this.children || []; this.children.push(child); },
    };
  }

  const events = [];
  const grid = { children: [], appendChild(child) { this.children.push(child); } };
  const context = {
    dom: {
      importModal: { classList: classList() },
      importStatus: { classList: classList() },
      importFileInput: { value: 'old' },
    },
    document: { createElement: makeElement },
    openCharacterEditor: () => events.push('editor'),
    Set,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__configs = getMyCardActionTileConfigs;\nthis.__append = appendMyCardActionTiles;\nthis.__open = openMyCardImportModal;`, context);

  const configs = context.__configs();
  assert(configs.length === 2 && configs[0].title === '新建角色' && configs[1].title === '导入角色卡', 'My card actions should expose create and import tile configs.');
  configs[0].onClick();
  assert(events.includes('editor'), 'My card create tile should open the character editor.');

  context.__append(grid);
  assert(grid.children.length === 2 && grid.children[0].innerHTML.includes('新建角色'), 'My card actions should append both action tiles.');
  context.__open();
  assert(!context.dom.importModal.classList.values.has('hidden') && context.dom.importStatus.classList.values.has('hidden') && context.dom.importFileInput.value === '', 'My card import modal should open and reset stale controls.');
}

async function assertFrontendPublicCardGridFiltering() {
  const sources = await Promise.all([
    '../src/app/60-library-public-card-filter.js',
    '../src/app/60-library-public-card-grid-ui.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));
  const cards = [
    { name: 'Alpha', tags: ['keep'] },
    { name: 'Beta', tags: ['skip'] },
  ];
  const context = {
    getPublicCards: () => cards,
    passesLibraryFilter: (card) => card.tags.includes('keep'),
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__filtered = getFilteredPublicLibraryCards;`, context);
  const filtered = context.__filtered();
  assert(filtered.length === 1 && filtered[0].name === 'Alpha', 'Public card grid filtering did not use the library filter.');
}

async function assertFrontendDomCache() {
  const sources = await Promise.all([
    '../src/app/60-dom-cache-ids.js',
    '../src/app/60-dom-cache.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));
  const requested = [];
  const context = {
    document: {
      getElementById(id) {
        requested.push(id);
        return { id };
      },
    },
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__cache = cacheDom;\nthis.__dom = dom;\nthis.__ids = DOM_CACHE_IDS;`, context);
  context.__cache();

  assert(context.__ids.includes('cloudSyncStatus') && context.__ids.includes('groupMentionList'), 'DOM cache ids should include cloud sync and group mention controls.');
  assert(requested.length === context.__ids.length, 'cacheDom should request every configured DOM id.');
  assert(context.__dom.messageInput.id === 'messageInput' && context.__dom.cloudSyncStatus.id === 'cloudSyncStatus', 'cacheDom should populate the shared dom cache.');
}

async function assertFrontendPublicCardListUI() {
  const sources = await Promise.all([
    '../src/app/60-public-card-text-ui.js',
    '../src/app/60-public-card-list-filter.js',
    '../src/app/60-public-card-list-item-ui.js',
    '../src/app/60-public-card-list-ui.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  function classList(initial = []) {
    const values = new Set(initial);
    return {
      values,
      add(...names) { names.forEach((name) => values.add(name)); },
      remove(...names) { names.forEach((name) => values.delete(name)); },
      contains(name) { return values.has(name); },
    };
  }

  function makeElement(tag) {
    const element = {
      tag,
      children: [],
      className: '',
      _innerHTML: '',
      textContent: '',
      classList: classList(),
      listeners: {},
      appendChild(child) { this.children.push(child); },
      addEventListener(type, handler) { this.listeners[type] = handler; },
    };
    Object.defineProperty(element, 'innerHTML', {
      get() { return this._innerHTML; },
      set(value) {
        this._innerHTML = String(value);
        if (value === '') this.children = [];
      },
    });
    return element;
  }

  const cards = [
    { id: 'a', name: 'Alpha', author: 'Sensei', description: 'Blue archive card', tags: ['blue', 'hero'], previewImage: 'assets/a.png' },
    { id: 'b', name: 'Beta', author: 'Other', description: 'Red card', tags: ['red'], previewImage: 'assets/b.png' },
  ];
  const detailEvents = [];
  const container = makeElement('div');
  const empty = makeElement('div');
  const count = makeElement('span');
  const context = {
    dom: {
      cardLibraryListView: container,
      cardLibraryEmpty: empty,
      cardLibraryResultCount: count,
      cardLibrarySearchContainer: makeElement('div'),
      cardLibraryDetailView: makeElement('div'),
    },
    document: { createElement: makeElement },
    getPublicCards: () => cards,
    resolvePublicCardImageUrl: (card) => 'resolved:' + card.previewImage,
    showCardLibraryDetail: (card) => detailEvents.push(card.id),
    switchView: () => {},
    setActiveTab: () => {},
    currentLibraryCard: { id: 'old' },
    String,
    RegExp,
    Set,
    Array,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__normalize = normalizeCardLibraryQuery;\nthis.__matches = cardMatchesLibraryQuery;\nthis.__filter = filterCardLibraryCards;\nthis.__item = createCardLibraryItem;\nthis.__fallback = createCardLibraryImageFallback;\nthis.__list = filterCardLibraryList;\nthis.__show = showCardLibraryListView;`, context);

  assert(context.__normalize('  BLUE ') === 'blue', 'Public card list query should be normalized.');
  assert(context.__matches(cards[0], 'sensei') && context.__matches(cards[0], 'archive') && context.__matches(cards[0], 'hero'), 'Public card list matching should include author, description, and tags.');
  assert(context.__filter(cards, 'red')[0].id === 'b', 'Public card list filter should return matching cards.');

  const item = context.__item(cards[0], 'alp');
  assert(item.children.length === 2, 'Public card list item should render image and content columns.');
  assert(item.children[0].children[0].src === 'resolved:assets/a.png', 'Public card list item should resolve preview images.');
  assert(item.children[1].children[0].innerHTML.includes('bg-amber-500/30'), 'Public card list item should highlight query matches.');
  item.listeners.click();
  assert(detailEvents[0] === 'a', 'Public card list item click should open details.');
  assert(context.__fallback({ name: '<alpha>' }).includes('&lt;'), 'Public card image fallback should escape the initial.');

  context.__list('blue');
  assert(container.children.length === 1 && container.children[0].children[1].children[0].innerHTML.includes('Alpha'), 'Public card list filter should render matching cards.');
  assert(empty.classList.values.has('hidden') && count.textContent.includes('1'), 'Public card list filter should hide empty state and update count.');

  context.__list('missing');
  assert(container.children.length === 0 && !empty.classList.values.has('hidden'), 'Public card list filter should show empty state for no matches.');

  context.__show();
  assert(context.currentLibraryCard === null, 'Public card list view should reset the selected card.');
}

async function assertFrontendLibraryPublicCardDetailModal() {
  const sources = await Promise.all([
    '../src/app/60-library-public-card-detail-modal-helpers.js',
    '../src/app/60-library-public-card-detail-modal-ui.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  function classList(initial = []) {
    const values = new Set(initial);
    return {
      values,
      add(name) { values.add(name); },
      remove(name) { values.delete(name); },
    };
  }
  function makeElement(tag) {
    return {
      tag,
      id: '',
      className: '',
      classList: classList(['hidden']),
      innerHTML: '',
      textContent: '',
      children: [],
      onclick: null,
      appendChild(child) { this.children.push(child); },
    };
  }

  const elements = {};
  ['publicDetailName', 'publicDetailAuthor', 'publicDetailTags', 'publicDetailDesc', 'publicDetailClose', 'publicDetailBackdrop', 'publicDetailImport'].forEach((id) => {
    elements[id] = makeElement('div');
  });
  const body = { children: [], appendChild(child) { this.children.push(child); elements[child.id] = child; } };
  const events = [];
  const context = {
    state: { characters: { alpha: { name: 'Alpha' } } },
    document: {
      body,
      getElementById(id) { return elements[id] || null; },
      createElement(tag) { return makeElement(tag); },
    },
    importPublicCard: async (card) => { events.push(`import:${card.name}`); },
    loadOrCreateChatForCharacter: (character) => { events.push(`load:${character.name}`); },
    Set,
    Array,
    String,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__template = buildPublicCardDetailModalHtml;\nthis.__author = formatPublicCardDetailAuthor;\nthis.__tags = renderPublicCardDetailTags;\nthis.__show = showPublicCardDetail;`, context);

  assert(context.__template().includes('publicDetailImport'), 'Public card detail helper should include the import button in the modal template.');
  assert(context.__author('Tester') === '作者: Tester' && context.__author('') === '作者: —', 'Public card detail helper should format author text.');
  context.__tags(elements.publicDetailTags, ['AI', 'Guide']);
  assert(elements.publicDetailTags.children.length === 2 && elements.publicDetailTags.children[0].textContent === 'AI', 'Public card detail helper should render tag pills.');

  context.__show({ name: 'Alpha', author: 'Tester', tags: ['AI'], description: 'Desc' });
  const modal = elements.publicCardDetailModal;
  assert(modal && !modal.classList.values.has('hidden') && elements.publicDetailName.textContent === 'Alpha', 'Public card detail modal should render and show selected card data.');
  elements.publicDetailClose.onclick();
  assert(modal.classList.values.has('hidden'), 'Public card detail modal close button should hide the modal.');
  await elements.publicDetailImport.onclick();
  assert(events.includes('import:Alpha') && events.includes('load:Alpha'), 'Public card detail modal import should import and open the character chat.');
}

async function assertFrontendI18nRuntime() {
  const sources = await Promise.all([
    '../src/app/12-i18n-core.js',
    '../src/app/12-i18n-zh-cn.js',
    '../src/app/12-i18n-zh-tw.js',
    '../src/app/12-i18n-en.js',
    '../src/app/12-i18n-runtime.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  const context = {
    state: { settings: { lang: 'en' } },
  };
  vm.runInNewContext(`${sources.join('\n')}\nthis.__i18n = i18n;\nthis.__t = t;`, context);

  assert(context.__i18n['zh-CN'], 'Simplified Chinese i18n dictionary was not loaded.');
  assert(context.__i18n['zh-TW'], 'Traditional Chinese i18n dictionary was not loaded.');
  assert(context.__i18n.en, 'English i18n dictionary was not loaded.');
  assert(context.__t('settings') === 'Settings', 'English i18n lookup failed.');

  context.state.settings.lang = 'missing-locale';
  assert(context.__t('settings') === 'Settings', 'Unknown locale should fall back to English.');
  assert(context.__t('missing_key_for_test') === 'missing_key_for_test', 'Missing i18n keys should fall back to the key name.');
}

async function assertFrontendSillyTavernPresetNormalizer() {
  const sources = await Promise.all([
    '../src/app/62-sillytavern-preset-model.js',
    '../src/app/62-sillytavern-preset-order-items.js',
    '../src/app/62-sillytavern-preset-order-normalizer.js',
    '../src/app/62-sillytavern-preset-prompt-normalizer.js',
    '../src/app/62-sillytavern-preset-normalizer.js',
    '../src/app/62-sillytavern-preset-placement.js',
    '../src/app/62-sillytavern-preset-runtime.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  const context = {
    state: { settings: {} },
    DEFAULT_TWO_STAGE_PROMPT: 'two stage default',
    defaultSettings: () => ({}),
    t: (key) => key,
    replacePlaceholders: (text, charName, userName) => text.replaceAll('{{char}}', charName).replaceAll('{{user}}', userName),
    Date,
    Object,
    String,
    Array,
    parseInt,
    isNaN,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__normalize = normalizeSillyTavernPreset;\nthis.__ensure = ensureSillyTavernPresetSettings;\nthis.__buildBuckets = buildSillyTavernPresetMessageBuckets;\nthis.__orderItems = getSillyTavernPromptOrderItems;\nthis.__orderMap = buildSillyTavernOrderMap;\nthis.__serializeOrder = serializeSillyTavernPromptOrderItems;\nthis.__role = normalizePromptRole;\nthis.__placement = getSillyTavernPresetPlacement;\nthis.__depth = parseSillyTavernDepth;\nthis.__describePlacement = describeSillyTavernPresetPlacement;\nthis.__historyMarker = isSillyTavernChatHistoryMarker;`, context);

  assert(context.__role('0') === 'system', 'SillyTavern numeric system role was not normalized.');
  assert(context.__role('1') === 'user', 'SillyTavern numeric user role was not normalized.');
  assert(context.__role('2') === 'assistant', 'SillyTavern numeric assistant role was not normalized.');
  assert(context.__placement({ position: 'after chat' }) === 'after_history', 'SillyTavern placement helper should detect after-history prompts.');
  assert(context.__placement({ injection_depth: 3 }) === 'in_chat', 'SillyTavern placement helper should infer in-chat prompts from depth.');
  assert(context.__depth({ injection_depth: '3' }) === 3, 'SillyTavern depth helper should parse injection_depth.');
  assert(context.__describePlacement({ position: 'in_chat', depth: 2 }) === 'in-chat d2', 'SillyTavern placement description should include in-chat depth.');
  assert(context.__historyMarker('conversation-history') === true, 'SillyTavern history marker helper should normalize marker names.');
  const objectOrderItems = context.__orderItems({
    order: ['main'],
    disabled_prompt: false,
    depth_prompt: { identifier: 'depth_prompt', enabled: true, order: 4, injection_depth: 2 },
  });
  assert(objectOrderItems.length === 3 && objectOrderItems[1].identifier === 'disabled_prompt' && objectOrderItems[1].enabled === false, 'SillyTavern order object helpers should preserve boolean prompt toggles.');
  const orderMap = context.__orderMap(objectOrderItems);
  assert(orderMap.DEPTH_PROMPT == null && orderMap.depth_prompt.depth === 2, 'SillyTavern order map should preserve exact and lowercase prompt IDs.');
  const serializedOrder = context.__serializeOrder([{ identifier: 'main', enabled: false, role: 123, order: 1 }, { identifier: '' }]);
  assert(serializedOrder.length === 1 && serializedOrder[0].role === '123' && serializedOrder[0].enabled === false, 'SillyTavern order serializer should filter empty IDs and stringify roles.');

  const preset = context.__normalize({
    name: 'Imported ST Preset',
    prompts: [
      { identifier: 'main', name: 'Main', role: '0', content: 'Hello {{char}}' },
      { identifier: 'after', role: 'system', content: 'After {{user}}' },
      { identifier: 'depth', role: 'assistant', content: 'Depth note', injection_depth: 2 },
    ],
    prompt_order: [{
      order: [
        { identifier: 'main', enabled: true, order: 2, position: 'before_history' },
        { identifier: 'chat_history', enabled: true, order: 3 },
        { identifier: 'after', enabled: true, order: 4, position: 'after_history' },
        { identifier: 'depth', enabled: true, order: 5, position: 'in_chat', depth: 2 },
      ],
    }],
  });

  assert(preset.name === 'Imported ST Preset', 'SillyTavern preset name was not preserved.');
  assert(preset.prompts.length === 3, 'SillyTavern preset prompts were not preserved.');
  assert(preset.prompts[0].role === 'system', 'SillyTavern preset prompt role was not normalized.');
  assert(preset.promptOrder.length === 4, 'SillyTavern prompt order was not preserved.');

  context.state.settings.sillyTavernPreset = preset;
  context.__ensure();
  const buckets = context.__buildBuckets('Arona', 'Sensei');
  assert(buckets.beforeHistory[0].content === 'Hello Arona', 'Before-history preset prompt did not render with placeholders.');
  assert(buckets.afterHistory[0].content === 'After Sensei', 'After-history preset prompt was not bucketed correctly.');
  assert(buckets.inChat[0]._depth === 2, 'In-chat preset prompt depth was not preserved.');

  const legacy = context.__normalize({ main_prompt: 'legacy main prompt' });
  assert(legacy.prompts[0].identifier === 'main_prompt', 'Legacy SillyTavern prompt fields were not imported.');
}

async function assertFrontendSillyTavernPresetSettingsRows() {
  const sources = await Promise.all([
    '../src/app/62-sillytavern-preset-placement.js',
    '../src/app/62-sillytavern-preset-settings-rows.js',
    '../src/app/62-sillytavern-preset-settings-empty-ui.js',
    '../src/app/62-sillytavern-preset-settings-toggle-ui.js',
    '../src/app/62-sillytavern-preset-settings-list-ui.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));
  const context = {
    escapeHtml: (value) => String(value),
    Array,
    String,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__rows = getSillyTavernPresetRows;\nthis.__rowHtml = buildSillyTavernPresetRowHtml;`, context);
  const rows = context.__rows({
    prompts: [
      { id: 'late', order: 20 },
      { id: 'early', order: 1 },
      { id: 'middle', order: 10 },
    ],
  });

  assert(rows.map((row) => row.prompt.id).join(',') === 'early,middle,late', 'SillyTavern preset settings rows should sort by prompt order.');
  assert(rows.map((row) => row.index).join(',') === '1,2,0', 'SillyTavern preset settings rows should preserve original prompt indexes.');
  const rowHtml = context.__rowHtml({ prompt: { id: 'depth', role: 'system', content: 'Depth content', position: 'in_chat', depth: 4 }, index: 0 });
  assert(rowHtml.includes('in-chat d4'), 'SillyTavern preset row should render placement descriptions from the placement helper.');
}

async function assertFrontendNewChatPickerMultiSelection() {
  const sources = await Promise.all([
    '../src/app/59-new-chat-picker-helpers.js',
    '../src/app/59-new-chat-picker-model.js',
    '../src/app/59-new-chat-picker-header.js',
    '../src/app/59-new-chat-picker-multi-bar.js',
    '../src/app/59-new-chat-picker-card-ui.js',
    '../src/app/59-new-chat-picker-static-events.js',
    '../src/app/59-new-chat-picker-multi-session.js',
    '../src/app/59-new-chat-picker-multi-controls.js',
    '../src/app/59-new-chat-picker-multi-confirm.js',
    '../src/app/59-new-chat-picker-multi-ui.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  const context = {
    Set,
    Array,
    Object,
    t: (key) => key,
  };
  vm.runInNewContext(`${sources.join('\n')}\nthis.__key = getNewChatPickerCharacterKey;\nthis.__createSession = createNewChatPickerSession;\nthis.__selected = getNewChatPickerSelectedCharacters;\nthis.__toggleText = updateNewChatPickerMultiToggleText;`, context);
  assert(context.__key({ name: ' Alpha ' }) === 'alpha', 'New chat picker character key should normalize names.');
  const toggleBtn = { textContent: '' };
  context.__toggleText(toggleBtn, true);
  assert(toggleBtn.textContent === 'new_chat_multi_exit', 'New chat picker multi toggle should use exit label when enabled.');

  const characters = [
    { name: 'Alpha' },
    { name: 'Beta' },
    { name: 'Gamma' },
  ];
  const session = context.__createSession({}, {}, characters);
  session.selectedKeys.add('beta');
  session.selectedKeys.add('alpha');

  const selected = context.__selected(session);
  assert(selected.map((c) => c.name).join(',') === 'Beta,Alpha', 'New chat multi-select should preserve click order.');
}

async function assertFrontendQuickNewChatModalHelpers() {
  const sources = await Promise.all([
    '../src/app/59-quick-new-chat-helpers.js',
    '../src/app/59-quick-new-chat-events.js',
    '../src/app/59-quick-new-chat-ui.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  function classList(initial = []) {
    const values = new Set(initial);
    return {
      values,
      add(...names) { names.forEach((name) => values.add(name)); },
      remove(...names) { names.forEach((name) => values.delete(name)); },
    };
  }
  function element(initialClasses = []) {
    return {
      classList: classList(initialClasses),
      listeners: {},
      innerHTML: '',
      addEventListener(type, handler) { this.listeners[type] = handler; },
    };
  }

  const events = [];
  let activeConv = { character: { name: 'A<rona>' } };
  const elements = {
    quickNewChatModal: element(['hidden']),
    quickNewChatCloseBtn: element(),
    quickNewChatBackdrop: element(),
    quickNewChatWithCurrentBtn: element(),
    quickReturnToLibraryBtn: element(),
    quickNewGroupChatBtn: element(),
  };
  const context = {
    state: { characters: { plana: { name: 'Plana' } } },
    currentCharacterName: 'plana',
    newChatPickerCameFromQuick: false,
    document: { getElementById(id) { return elements[id] || null; } },
    getActiveConv() { return activeConv; },
    t: (key) => key === 'quick_new_with_current' ? 'With current' : key,
    escapeHtml: (value) => String(value).replaceAll('<', '&lt;').replaceAll('>', '&gt;'),
    newConversation(char) { events.push(`new:${char ? char.name : 'blank'}`); },
    showNewChatCharacterPicker() { events.push('picker'); },
    renderConversationList() { events.push('render-list'); },
    switchView(view) { events.push(`switch:${view}`); },
    Set,
    Array,
    Object,
    String,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__current = getCurrentChatCharacter;\nthis.__show = showQuickNewChatModal;`, context);

  assert(context.__current().name === 'A<rona>', 'Quick new chat should use the active single-chat character.');
  activeConv = { group: { members: [{ character: { name: 'Group Lead' } }] } };
  assert(context.__current().name === 'Group Lead', 'Quick new chat should use the first group member as the current character.');
  activeConv = null;
  assert(context.__current().name === 'Plana', 'Quick new chat should fall back to the selected library character.');

  activeConv = { character: { name: 'A<rona>' } };
  context.__show();
  assert(!elements.quickNewChatModal.classList.values.has('hidden'), 'Quick new chat modal should be shown.');
  assert(elements.quickNewChatWithCurrentBtn.innerHTML === 'With current（A&lt;rona&gt;）', 'Quick new chat should label the current-character button safely.');
  assert(elements.quickNewChatModal._wiredQuick === true && typeof elements.quickNewChatWithCurrentBtn.listeners.click === 'function', 'Quick new chat modal should wire its controls once.');

  elements.quickNewChatWithCurrentBtn.listeners.click();
  assert(events.includes('new:A<rona>') && elements.quickNewChatModal.classList.values.has('hidden'), 'Quick new chat current-character action should create a chat and hide the modal.');

  context.currentCharacterName = 'Plana';
  elements.quickReturnToLibraryBtn.listeners.click();
  assert(context.currentCharacterName === null && events.includes('render-list') && events.includes('switch:library'), 'Quick new chat return action should clear selection and open the library.');

  elements.quickNewGroupChatBtn.listeners.click();
  assert(context.newChatPickerCameFromQuick === true && events.includes('picker'), 'Quick new chat group action should open the picker in quick-return mode.');

  elements.quickNewChatModal = null;
  events.length = 0;
  context.__show();
  assert(events.includes('picker'), 'Quick new chat should fall back to the full picker when the modal is missing.');
}

async function assertFrontendNewChatWorkflowHelpers() {
  const sources = await Promise.all([
    '../src/app/59-new-chat-worldinfo.js',
    '../src/app/59-new-chat-first-message.js',
    '../src/app/59-new-chat-single.js',
    '../src/app/59-new-chat-group.js',
    '../src/app/59-new-chat-finalize.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  const events = [];
  const context = {
    state: {
      settings: { userName: 'Sensei' },
      conversations: {},
      conversationOrder: [],
      activeConvId: null,
    },
    dom: { messagesContainer: { innerHTML: 'old' } },
    currentView: 'library',
    currentCharacterName: null,
    makeId: () => 'group-id',
    replacePlaceholders: (text, charName, userName) => String(text || '').replaceAll('{{char}}', charName || '').replaceAll('{{user}}', userName || 'User'),
    t: (key) => key === 'chat_with' ? 'Chat with ' : key,
    isGroupChat: (conv) => !!(conv && conv.group),
    persistState: () => events.push('persist'),
    requestRender: (key) => events.push(`render:${key}`),
    renderTokenBar: () => events.push('token'),
    clearPendingGroupMention: () => events.push('clear-mention'),
    switchView: (view) => events.push(`switch:${view}`),
    isMobile: () => true,
    closeSidebar: () => events.push('close-sidebar'),
    JSON,
    Array,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__copyWorldInfo = copyWorldInfoFromCurrentConversation;\nthis.__single = configureSingleCharacterConversation;\nthis.__group = configureGroupConversation;\nthis.__register = registerNewConversation;\nthis.__render = renderNewConversationState;\nthis.__finalizeUi = finalizeNewConversationUi;`, context);

  const conv = { id: 'c1', messages: [] };
  const current = { worldInfo: { entries: { e1: { content: 'lore' } } } };
  context.__copyWorldInfo(conv, current);
  current.worldInfo.entries.e1.content = 'changed';
  assert(conv.worldInfo.entries.e1.content === 'lore', 'New chat should deep-copy current world info.');

  context.__single(conv, { name: 'Arona', first_mes: 'Hello {{user}}' });
  assert(conv.character.name === 'Arona' && conv.messages[0].content === 'Hello Sensei', 'Single-character new chat setup failed.');
  assert(conv.title === 'Chat with Arona', 'Single-character new chat title changed.');

  const groupConv = { id: 'g1', messages: [] };
  context.__group(groupConv, [
    { name: 'Arona', first_mes: 'Hi {{user}}' },
    { name: 'Plana', first_mes: 'Ignored' },
  ]);
  assert(groupConv.group.members.length === 2 && groupConv.group.members[0].order === 0, 'Group chat members were not created.');
  assert(groupConv.messages[0].speaker === 'Arona' && groupConv.messages[0].content === 'Hi Sensei', 'Group chat first message was not attributed.');

  groupConv._wiBudgetWarning = true;
  context.__register(groupConv);
  assert(context.state.activeConvId === 'g1' && context.state.conversationOrder[0] === 'g1', 'New chat registration did not update active conversation.');
  assert(groupConv._wiBudgetWarning === false && groupConv._historyWindow === 150 && groupConv._wiCache === null, 'New chat runtime state was not initialized.');

  context.__render(groupConv);
  context.__finalizeUi();
  assert(events.includes('persist') && events.includes('render:activeConvId') && events.includes('token'), 'New chat render side effects did not run.');
  assert(!events.includes('clear-mention'), 'Group chats should keep pending group mention state.');
  assert(events.includes('switch:chat') && events.includes('close-sidebar'), 'New chat UI finalization did not run.');
}

async function assertFrontendWorldBookActivation() {
  const sources = await Promise.all([
    '../src/app/41-world-info-constants.js',
    '../src/app/41-world-info-position.js',
    '../src/app/41-world-info-extension-fields.js',
    '../src/app/41-world-info-normalizer.js',
    '../src/app/44-worldbook-match-keys.js',
    '../src/app/44-worldbook-match-filters.js',
    '../src/app/44-worldbook-scan-text.js',
    '../src/app/44-worldbook-matching.js',
    '../src/app/44-worldbook-budget.js',
    '../src/app/44-worldbook-timed-effects.js',
    '../src/app/44-worldbook-activation-helpers.js',
    '../src/app/44-worldbook-activation-collection.js',
    '../src/app/44-worldbook-activation-cache.js',
    '../src/app/44-worldbook-activation-groups.js',
    '../src/app/44-worldbook-activation-selection.js',
    '../src/app/44-worldbook-activation-result.js',
    '../src/app/44-worldbook-activation.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  let activeConv = null;
  const context = {
    state: {
      settings: {
        userName: 'Sensei',
        worldInfoBudgetEnabled: false,
      },
      worldBooks: {
        wb1: {
          id: 'wb1',
          entries: {
            global: {
              uid: 'global',
              key: ['Kivotos'],
              content: 'Global lore mentions recursive-key.',
              order: 20,
              position: 1,
            },
            recursive: {
              uid: 'recursive',
              key: ['recursive-key'],
              content: 'Recursive lore',
              order: 30,
              position: 1,
            },
            disabled: {
              uid: 'disabled',
              key: ['Kivotos'],
              content: 'Disabled lore',
              disable: true,
              order: 40,
            },
          },
        },
      },
    },
    getActiveConv: () => activeConv,
    getEffectivePostHistoryInstructions: () => '',
    console,
    JSON,
    Date,
    Math,
    Object,
    Array,
    String,
    RegExp,
    parseInt,
    isNaN,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__activate = getActivatedWorldInfo;\nthis.__WI_POS = WI_POS;`, context);

  activeConv = {
    id: 'c-worldbook',
    messages: [
      { role: 'user', content: 'We reached Kivotos today.' },
      { role: 'assistant', content: 'Welcome, Sensei.' },
    ],
    character: { name: 'Arona', tags: ['blue'] },
    worldBookIds: ['wb1'],
    worldInfo: {
      entries: {
        legacy: {
          uid: 'legacy',
          constant: true,
          content: 'Legacy lore',
          order: 10,
          position: 0,
        },
      },
    },
  };

  const first = context.__activate(activeConv);
  const ids = first.entries.map((entry) => entry.uid);
  assert(ids.join(',') === 'legacy,global,recursive', 'World book activation order or recursion changed.');
  assert(first.byPosition[context.__WI_POS.BEFORE_CHAR][0].uid === 'legacy', 'Legacy world info was not grouped before character.');
  assert(first.byPosition[context.__WI_POS.AFTER_CHAR].some((entry) => entry.uid === 'global'), 'Global world book entry did not activate.');
  assert(first.byPosition[context.__WI_POS.AFTER_CHAR].some((entry) => entry.uid === 'recursive'), 'Recursive world book entry did not activate.');
  assert(!first.entries.some((entry) => entry.uid === 'disabled'), 'Disabled world book entry activated.');
  assert(activeConv._wiCache && activeConv._wiCache.result === first, 'World book activation result was not cached.');

  const second = context.__activate(activeConv);
  assert(second === first, 'World book activation cache was not reused for the same conversation fingerprint.');
}

async function assertFrontendWorldBookActivationHelpers() {
  const sources = await Promise.all([
    '../src/app/44-worldbook-activation-collection.js',
    '../src/app/44-worldbook-activation-cache.js',
    '../src/app/44-worldbook-activation-groups.js',
    '../src/app/44-worldbook-activation-selection.js',
    '../src/app/44-worldbook-activation-result.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  let activeConv = null;
  const context = {
    state: {
      settings: {},
      worldBooks: {
        wb1: {
          entries: {
            global: { uid: 'global', key: ['Kivotos'], content: 'Global lore' },
          },
        },
      },
    },
    normalizeWIEntry(entry) { return Object.assign({}, entry); },
    passesCharacterFilter: () => true,
    passesProbability: () => true,
    buildScanText: () => 'Kivotos trigger',
    entryMatchesKeys: (entry) => (entry.key || []).includes('Kivotos'),
    entryMatchesSecondary: () => true,
    applyWorldInfoBudget(entries) { return { entries, trimmed: entries.length > 2 }; },
    getActiveConv() { return activeConv; },
    WI_POS: { AFTER_CHAR: 1, OUTLET: 6 },
    JSON,
    Date,
    Object,
    Array,
    String,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__collect = collectWorldInfoActivationEntries;\nthis.__combined = buildCombinedWorldInfo;\nthis.__enabled = getEnabledWorldInfoEntries;\nthis.__key = buildWorldInfoActivationCacheKey;\nthis.__cache = cacheActivatedWorldInfoResult;\nthis.__direct = activateDirectWorldInfoEntries;\nthis.__recursive = expandRecursiveWorldInfoEntries;\nthis.__dedupe = dedupeWorldInfoEntries;\nthis.__winner = chooseWorldInfoGroupWinner;\nthis.__groups = resolveWorldInfoInclusionGroups;\nthis.__budget = applyWorldInfoBudgetWithWarning;\nthis.__grouped = groupActivatedWorldInfoByPosition;`, context);

  const conv = {
    worldBookIds: ['wb1'],
    worldInfo: { entries: { local: { uid: 'local', constant: true, content: 'Local lore' } } },
    messages: [
      { role: 'user', content: 'Kivotos first' },
      { role: 'assistant', content: 'reply' },
      { role: 'user', content: 'last message' },
    ],
  };
  const entries = context.__collect(conv);
  assert(entries.length === 2, 'World book activation collection should include linked and legacy entries.');
  assert(entries.find((entry) => entry.uid === 'global')._sourceWorldBookId === 'wb1', 'Linked world book entries should keep source world book id.');

  const combined = context.__combined(entries.concat([{ uid: 'disabled', disable: true }]));
  assert(Object.keys(combined.entries).length === 3, 'Combined world info should index entries by uid.');
  assert(context.__enabled(combined).map((entry) => entry.uid).join(',') === 'global,local', 'Enabled world info helper should filter disabled entries.');

  const keyA = context.__key(conv, combined);
  const keyB = context.__key(Object.assign({}, conv, { messages: conv.messages.concat({ role: 'assistant', content: 'new tail' }) }), combined);
  assert(keyA !== keyB, 'World info activation cache key should change when message fingerprint changes.');
  const result = { entries: [] };
  context.__cache(conv, keyA, result);
  assert(conv._wiCache.key === keyA && conv._wiCache.result === result, 'World info activation cache should store key and result.');

  const direct = context.__direct([
    { uid: 'hit', key: ['Kivotos'], content: 'hit' },
    { uid: 'constant', constant: true, content: 'constant' },
    { uid: 'miss', key: ['Other'], content: 'miss' },
  ], conv, 'Arona', []);
  assert(direct.map((entry) => entry.uid).join(',') === 'hit,constant', 'Direct world info activation should include key hits and constants.');

  const recursive = context.__recursive([{ uid: 'base', content: 'mentions recursive-key' }], [
    { uid: 'base', content: 'mentions recursive-key' },
    { uid: 'recursive', key: ['recursive-key'], content: 'recursive' },
  ], 'Arona', []);
  assert(recursive.some((entry) => entry.uid === 'recursive' && entry.isRecursive === true), 'Recursive world info activation should mark recursive entries.');

  assert(context.__dedupe([{ uid: 'a' }, { uid: 'a' }, { uid: 'b' }]).map((entry) => entry.uid).join(',') === 'a,b', 'World info dedupe should keep first uid occurrence.');
  const winner = context.__winner([
    { uid: 'low', group: 'g', key: ['a'], useGroupScoring: true },
    { uid: 'high', group: 'g', key: ['a', 'b'], keysecondary: ['c'], selectiveLogic: 0, useGroupScoring: true },
  ]);
  assert(winner.uid === 'high', 'World info group scoring should select highest score.');
  const resolved = context.__groups([{ uid: 'solo' }, { uid: 'low', group: 'g', order: 1 }, { uid: 'high', group: 'g', order: 5 }]);
  assert(resolved.map((entry) => entry.uid).sort().join(',') === 'high,solo', 'World info inclusion groups should keep one winner per group.');

  activeConv = {};
  const budgeted = context.__budget([{ uid: '1' }, { uid: '2' }, { uid: '3' }]);
  assert(budgeted.length === 3 && activeConv._wiBudgetWarning === true, 'World info budget helper should set warning on trimmed result.');

  const grouped = context.__grouped([
    { uid: 'normal', position: 1 },
    { uid: 'late', position: 6, outletName: 'Lore', order: 20 },
    { uid: 'early', position: 6, outletName: 'Lore', order: 5 },
  ]);
  assert(grouped.byPosition[1][0].uid === 'normal', 'World info grouping should preserve normal positions.');
  assert(grouped.outlets.Lore.map((entry) => entry.uid).join(',') === 'early,late', 'World info outlets should sort by order.');
}

async function assertFrontendWorldBookMatchingHelpers() {
  const sources = await Promise.all([
    '../src/app/44-worldbook-match-keys.js',
    '../src/app/44-worldbook-match-filters.js',
    '../src/app/44-worldbook-scan-text.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  const context = {
    state: { settings: { userName: 'Sensei' } },
    getEffectivePostHistoryInstructions: () => 'depth note',
    Math: Object.assign({}, Math, { random: () => 0.25 }),
    RegExp,
    String,
    Array,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__key = entryMatchesKeys;\nthis.__secondary = entryMatchesSecondary;\nthis.__charFilter = passesCharacterFilter;\nthis.__prob = passesProbability;\nthis.__scan = buildScanText;`, context);

  assert(context.__key({ key: ['Kivotos'] }, 'hello kivotos', false, false), 'World book key matching should be case-insensitive by default.');
  assert(context.__key({ key: ['/Ki.vo/i'] }, 'Kiavo', true, false), 'World book key matching should support regex keys.');
  assert(context.__secondary({ keysecondary: ['a', 'b'], selectiveLogic: 1 }, 'a b', false), 'World book secondary matching should support AND logic.');
  assert(!context.__secondary({ keysecondary: ['a'], selectiveLogic: 2 }, 'a', false), 'World book secondary matching should support NOT logic.');
  assert(context.__charFilter({ characterFilter: { isExclude: false, names: ['Arona'], tags: [] } }, 'arona', []), 'Character filter should match names case-insensitively.');
  assert(!context.__charFilter({ characterFilter: { isExclude: true, names: [], tags: ['ai'] } }, 'Plana', ['AI']), 'Character filter should exclude matching tags.');
  assert(context.__prob({ useProbability: true, probability: 30 }) === true, 'Probability filter should use percent chance.');
  assert(context.__prob({ useProbability: true, probability: 20 }) === false, 'Probability filter should fail when roll is above chance.');

  const scan = context.__scan({
    character: { name: 'Arona', description: 'desc', personality: 'kind', scenario: 'scene', creator_notes: 'notes' },
    messages: [
      { role: 'system', content: 'hidden' },
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ],
  }, 4, { matchCharacterDescription: true, matchCharacterDepthPrompt: true });
  assert(scan.includes('Sensei: hi') && scan.includes('Arona: hello'), 'Scan text should include labeled recent messages.');
  assert(scan.includes('CharacterDescription: desc') && scan.includes("Character's Note: depth note"), 'Scan text should include selected character sources.');
  assert(!scan.includes('hidden'), 'Scan text should exclude system messages.');
}

async function assertFrontendWebLLMConfirmHelpers() {
  const [source, modalSource] = await Promise.all([
    '../src/app/11-webllm-confirm-helpers.js',
    '../src/app/11-webllm-confirm-modal.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));
  const picker = { value: 'Picker-Model' };
  const dom = {
    webllmModel: picker,
    webllmConfirmModal: { classList: { removed: [], remove(name) { this.removed.push(name); } } },
    webllmConfirmBackdrop: {},
    webllmConfirmCancelBtn: {},
    webllmConfirmContinueBtn: {},
    webllmConfirmText: { innerHTML: '' },
    webllmConfirmChoice: { style: {} },
    webllmConfirmGenericActions: { style: {} },
  };
  const started = [];
  const context = {
    WEBLLM_MODEL_INFO: {
      'Llama-3.2-3B-Instruct-q4f16_1-MLC': { label: 'Llama-3.2-3B', sizeMB: 2100 },
      'Picker-Model': { label: 'Picker', sizeMB: 850 },
    },
    state: { settings: { webllmModel: 'State-Model' } },
    document: { getElementById: (id) => dom[id] || null },
    persistState: () => { context.persisted = true; },
    startWebLLMInitialization: (modelId) => { started.push(modelId); },
    String,
  };

  vm.runInNewContext(`${source}\n${modalSource}\nthis.__model = getWebLLMConfirmModelId;\nthis.__size = formatWebLLMModelSize;\nthis.__html = buildWebLLMConfirmHtml;\nthis.__start = startChosenWebLLMModel;\nthis.__elements = getWebLLMConfirmModalElements;\nthis.__render = renderWebLLMConfirmModal;\nthis.__bind = bindWebLLMConfirmModalHandlers;`, context);

  assert(context.__model(null) === 'Picker-Model', 'WebLLM confirm should prefer the visible model picker.');
  assert(context.__model('Direct-Model') === 'Direct-Model', 'WebLLM confirm should prefer an explicit target model.');
  assert(context.__size(2100) === '2.1 GB' && context.__size(850) === '850 MB', 'WebLLM confirm should format model download sizes.');
  assert(context.__html('Llama-3.2-3B-Instruct-q4f16_1-MLC', true).includes('Llama-3.2-3B'), 'WebLLM model switch copy should include the target model label.');

  context.__start('Llama-3.2-3B-Instruct-q4f16_1-MLC');
  assert(context.state.settings.inferenceBackend === 'webllm' && picker.value === 'Llama-3.2-3B-Instruct-q4f16_1-MLC', 'WebLLM confirm should sync the selected local model.');
  assert(context.persisted === true && started[0] === 'Llama-3.2-3B-Instruct-q4f16_1-MLC', 'WebLLM confirm should persist and start initialization.');

  const modalElements = context.__elements();
  assert(modalElements.modal === dom.webllmConfirmModal && modalElements.continueBtn === dom.webllmConfirmContinueBtn, 'WebLLM confirm modal should resolve expected DOM elements.');

  context.__render(modalElements, 'Picker-Model', false);
  assert(dom.webllmConfirmText.innerHTML.includes('850 MB'), 'WebLLM confirm modal should render the selected model size.');
  assert(dom.webllmConfirmChoice.style.display === '' && dom.webllmConfirmGenericActions.style.display === 'none', 'WebLLM first-enable modal should show model choices.');
  assert(dom.webllmConfirmModal.classList.removed.includes('hidden'), 'WebLLM confirm modal should become visible.');

  context.__render(modalElements, 'Picker-Model', true);
  assert(dom.webllmConfirmChoice.style.display === 'none' && dom.webllmConfirmGenericActions.style.display === 'flex', 'WebLLM switch modal should show generic actions.');

  let cleaned = 0;
  let canceled = 0;
  const continued = [];
  context.__bind(modalElements, () => { cleaned += 1; }, 'Picker-Model', (modelId) => { continued.push(modelId); }, () => { canceled += 1; });
  dom.webllmConfirmCancelBtn.onclick();
  dom.webllmConfirmContinueBtn.onclick();
  assert(cleaned === 2 && canceled === 1 && continued[0] === 'Picker-Model', 'WebLLM confirm modal should clean up and dispatch cancel/continue handlers.');
}

async function assertFrontendWebGPUDeviceHelpers() {
  const sources = await Promise.all([
    '../src/app/11-webgpu-device-info.js',
    '../src/app/11-webgpu-adapter.js',
    '../src/app/11-webgpu-device-detection.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  const gpu = {
    calls: [],
    requestAdapter(options) {
      this.calls.push(options);
      return Promise.resolve('adapter');
    },
  };
  const context = {
    navigator: { gpu },
    document: { getElementById: () => null },
    window: {},
    console,
    Object,
    Array,
    Math,
    Date,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__plain = getPlainAdapterInfo;\nthis.__format = formatWebGPUDeviceReport;\nthis.__wrap = withHighPerformanceWebGPUAdapterRequest;\nthis.__err = getWebGPUDetectionErrorMessage;`, context);

  const plain = context.__plain({ vendor: 'NVIDIA', architecture: 'Ada', device: '4090', description: 'Discrete GPU' });
  assert(plain.vendor === 'NVIDIA' && plain.architecture === 'Ada', 'WebGPU adapter info should be normalized.');

  const formatted = context.__format({
    info: plain,
    features: ['a', 'b'],
    maxBufferSize: 256 * 1024 * 1024,
  });
  assert(formatted.includes('Discrete GPU') && formatted.includes('Max buffer: 256 MB'), 'WebGPU device report should include adapter and limit details.');

  const wrappedResult = await context.__wrap(async () => context.navigator.gpu.requestAdapter({ forceFallbackAdapter: true }));
  assert(wrappedResult === 'adapter', 'WebGPU requestAdapter wrapper should return the wrapped function result.');
  assert(gpu.calls[0].powerPreference === 'high-performance', 'WebGPU requestAdapter wrapper should force high-performance preference.');
  assert(context.__err(new Error('NO_WEBGPU')).includes('WebGPU'), 'WebGPU detection should map missing WebGPU to a user-facing message.');
}

async function assertFrontendWebLLMInitializationHelpers() {
  const sources = await Promise.all([
    '../src/app/11-webllm-storage-preflight.js',
    '../src/app/11-webllm-progress-ui-helpers.js',
    '../src/app/11-webllm-initialization-helpers.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  function classList(initial = []) {
    const values = new Set(initial);
    return {
      values,
      add(name) { values.add(name); },
      remove(name) { values.delete(name); },
      contains(name) { return values.has(name); },
    };
  }

  const events = [];
  const modal = { classList: classList() };
  const context = {
    state: { settings: { inferenceBackend: 'webllm' } },
    StorageService: {
      async getStorageInfo() {
        return { quota: 100, used: 95 };
      },
    },
    async showGlassConfirm(message) {
      events.push('confirm:' + message.includes('900MB'));
      return false;
    },
    async persistState(force) { events.push('persist:' + force); },
    t: (key) => ({
      webllm_init_failed: 'Failed {msg}',
      webllm_init_success: 'Ready {model}',
    }[key] || key),
    alert: (msg) => events.push('alert:' + msg),
    console: { log: (...args) => events.push(args.join(' ')) },
    document: { getElementById: () => null },
    Math,
    Set,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__preflight = preflightWebLLMStorageQuota;\nthis.__progress = updateWebLLMInitializationProgress;\nthis.__cleanup = cleanupWebLLMProgressHandlers;\nthis.__reset = resetWebLLMProgressUI;\nthis.__finish = finishWebLLMInitialization;\nthis.__cancel = cancelWebLLMInitialization;`, context);

  const allowed = await context.__preflight({ label: 'Model', sizeMB: 900 });
  assert(allowed === false && context.state.settings.inferenceBackend === 'remote-api', 'WebLLM preflight should revert backend when storage confirmation is rejected.');
  assert(events.includes('persist:true'), 'WebLLM preflight should persist rejected local backend selection.');

  const elements = {
    modal,
    bar: { style: {} },
    percent: { textContent: '' },
    status: { textContent: '' },
    cancelBtn: { onclick: () => {} },
    detectBtn: { onclick: () => {} },
    closeBtn: { onclick: () => {} },
    backdrop: { onclick: () => {} },
  };
  context.__reset(elements);
  assert(elements.bar.style.width === '0%' && elements.status.textContent === '正在准备下载...' && !modal.classList.values.has('hidden'), 'WebLLM reset helper should initialize progress UI.');

  context.__progress(elements, { label: 'Demo' }, { progress: 0.42, text: 'Loading' });
  assert(elements.bar.style.width === '42%' && elements.percent.textContent === '42%' && elements.status.textContent.includes('Demo'), 'WebLLM progress helper should update bar, percent, and status.');

  context.__finish(elements, { label: 'Demo' }, false, 'bad');
  assert(modal.classList.values.has('hidden') && events.includes('alert:Failed bad'), 'WebLLM finish helper should hide modal and alert failures.');
  assert(elements.cancelBtn.onclick === null && elements.backdrop.onclick === null, 'WebLLM finish helper should clean handlers.');

  elements.cancelBtn.onclick = () => {};
  context.state.settings.inferenceBackend = 'webllm';
  context.__cancel(elements);
  assert(context.state.settings.inferenceBackend === 'remote-api' && elements.cancelBtn.onclick === null, 'WebLLM cancel helper should revert backend and clean handlers.');
}

async function assertFrontendGroupChatCoreHelpers() {
  const sources = await Promise.all([
    '../src/app/32-group-chat-members.js',
    '../src/app/32-group-chat-speakers.js',
    '../src/app/32-group-chat-message-helpers.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  const conv = {
    character: { name: 'Solo' },
    group: {
      members: [
        { character: { name: 'Plana' }, order: 1 },
        { character: { name: 'Arona' }, order: 0 },
      ],
    },
    messages: [{ role: 'assistant', speaker: 'arona', content: 'hi' }],
  };
  const context = {
    state: { settings: { userName: 'Sensei' } },
    t: (key) => ({ sender_assistant: 'Assistant', sender_you: 'You' }[key] || key),
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__isGroup = isGroupChat;\nthis.__members = getGroupMembers;\nthis.__normalize = normalizeConversation;\nthis.__next = getNextGroupSpeaker;\nthis.__current = getCurrentSpeakerCharacter;\nthis.__name = getMessageSenderName;\nthis.__generating = getCurrentGeneratingSpeakerName;\nthis.__mention = parseGroupMention;`, context);

  context.__normalize(conv);
  assert(context.__isGroup(conv), 'Group chat detection should require at least two members.');
  assert(context.__members(conv).map((member) => member.character.name).join(',') === 'Arona,Plana', 'Group members should be sorted by order.');
  assert(conv.group.members.every((member) => member.muted === false), 'Group normalization should fill missing muted flags.');
  assert(context.__next(conv).name === 'Plana', 'Group speaker rotation should advance after the last assistant speaker.');
  assert(context.__current({ character: { name: 'Solo' }, group: null }).name === 'Solo', 'Single chat current speaker should be the conversation character.');
  assert(context.__name({ role: 'user' }, conv) === 'Sensei', 'User messages should use the configured user name.');
  assert(context.__name({ role: 'assistant', speaker: 'Arona' }, conv) === 'Arona', 'Assistant messages should prefer recorded speaker names.');
  assert(context.__generating(conv) === 'Plana', 'Generating speaker name should match the next group speaker.');
  assert(context.__mention('hello @plana and @Arona', conv).name === 'Plana', 'Group mention parsing should resolve the first case-insensitive mention.');
}

async function assertFrontendGroupMentionUI() {
  const sources = await Promise.all([
    '../src/app/32-group-mention-render.js',
    '../src/app/32-group-mention-pill.js',
    '../src/app/32-group-mention-ui.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  function classList(initial = []) {
    const values = new Set(initial);
    return {
      values,
      add(...names) { names.forEach((name) => values.add(name)); },
      remove(...names) { names.forEach((name) => values.delete(name)); },
    };
  }
  function element() {
    return {
      className: '',
      innerHTML: '',
      children: [],
      listeners: {},
      classList: classList(['hidden']),
      onclick: null,
      appendChild(child) { this.children.push(child); },
      addEventListener(type, handler) { this.listeners[type] = handler; },
    };
  }

  const events = [];
  const modal = element();
  const list = element();
  const mentionPill = element();
  const mentionPillName = { textContent: '' };
  const input = {
    value: '@Old hello',
    focus() { events.push('focus-input'); },
  };
  const conv = {
    group: {
      members: [
        { character: { name: 'LongName（extra）', personality: 'Helpful <guide>', previewImage: '/a.png' }, muted: false },
        { character: { name: 'Muted', personality: 'Silent' }, muted: true },
      ],
    },
  };
  const context = {
    dom: {
      groupMentionModal: modal,
      groupMentionList: list,
      groupMentionCloseBtn: { onclick: null },
      groupMentionBackdrop: { onclick: null },
      mentionPill,
      mentionPillName,
      messageInput: input,
    },
    pendingGroupMention: null,
    document: { createElement: element },
    getGroupMembers(current) { return current.group.members || []; },
    escapeHtml(value) {
      return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    },
    Set,
    Array,
    String,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__display = getGroupMentionDisplayName;\nthis.__avatar = buildGroupMentionAvatarHtml;\nthis.__member = createGroupMentionMemberElement;\nthis.__show = showGroupMentionPanel;\nthis.__set = setPendingGroupMention;\nthis.__clear = clearPendingGroupMention;`, context);

  assert(context.__display({ name: 'LongName（extra）' }) === 'Long…', 'Group mention display name should trim parenthesized suffix and cap mobile length.');
  assert(context.__avatar({ name: '<A>', previewImage: '/a.png' }).includes('&lt;A&gt;'), 'Group mention avatar HTML should escape image alt text.');

  let selected = null;
  const activeItem = context.__member(conv.group.members[0], (char) => { selected = char; });
  const mutedItem = context.__member(conv.group.members[1], () => { selected = 'muted'; });
  activeItem.listeners.click();
  assert(selected.name === 'LongName（extra）', 'Group mention member click should select active members.');
  assert(!mutedItem.listeners.click, 'Group mention member click should not bind muted members.');

  context.__show({ group: { members: [] } });
  assert(list.innerHTML.includes('当前群组没有成员') && !modal.classList.values.has('hidden'), 'Group mention panel should show an empty state for groups without members.');

  list.children = [];
  list.innerHTML = '';
  modal.classList.add('hidden');
  input.value = '@Old hello';
  context.__show(conv);
  assert(list.children.length === 2 && !modal.classList.values.has('hidden'), 'Group mention panel should render all members and show the modal.');
  list.children[0].listeners.click();
  assert(context.pendingGroupMention.name === 'LongName（extra）', 'Group mention selection should set the pending character.');
  assert(modal.classList.values.has('hidden') && events.includes('focus-input'), 'Group mention selection should close the modal and focus the input.');
  assert(mentionPill.classList.values.has('flex') && !mentionPill.classList.values.has('hidden'), 'Group mention selection should show the mention pill.');
  assert(mentionPillName.textContent === '@Long…' && mentionPill.title === 'LongName（extra）', 'Group mention pill should show compact text and full title.');
  assert(input.value === 'hello', 'Group mention selection should remove stale inline @ text from the input.');

  modal.classList.remove('hidden');
  context.dom.groupMentionCloseBtn.onclick();
  assert(modal.classList.values.has('hidden'), 'Group mention close button should hide the modal.');
  modal.classList.remove('hidden');
  context.dom.groupMentionBackdrop.onclick();
  assert(modal.classList.values.has('hidden'), 'Group mention backdrop should hide the modal.');

  context.__clear();
  assert(context.pendingGroupMention === null && mentionPill.classList.values.has('hidden') && mentionPillName.textContent === '', 'Group mention clear should reset pending state and hide the pill.');
}

async function assertFrontendConversationModelHelpers() {
  const sources = await Promise.all([
    '../src/app/41-world-info-constants.js',
    '../src/app/40-character-prompt-helpers.js',
    '../src/app/41-world-info-injection.js',
    '../src/app/41-prompt-builder.js',
    '../src/app/32-conversation-model.js',
    '../src/app/32-group-chat-members.js',
    '../src/app/32-group-chat-speakers.js',
    '../src/app/32-group-system-prompt.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  const context = {
    state: {
      settings: {
        userName: 'Sensei',
        lang: 'en',
        systemPrompt: 'Custom {{user}}',
        userDescription: 'User persona for {{char}}',
        postHistoryInstructions: 'Post {{char}}',
      },
    },
    makeId: () => 'conv-id',
    Date: { now: () => 111 },
    Array,
    Object,
    String,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__default = defaultConversation;\nthis.__groupPrompt = buildGroupSystemPrompt;\nthis.__pos = WI_POS;`, context);

  const def = context.__default();
  assert(def.id === 'conv-id' && def.title === 'New Chat' && Array.isArray(def.messages) && Array.isArray(def.worldBookIds), 'Default conversation should include stable chat storage fields.');
  assert(def.created === 111 && def.updated === 111 && def.group === null, 'Default conversation should initialize timestamps and group state.');

  const wi = {};
  wi[context.__pos.BEFORE_CHAR] = [{ content: 'Lore before {{char}}' }];
  wi[context.__pos.AFTER_CHAR] = [{ content: 'Lore after {{user}}' }];
  const groupConv = {
    _forcedSpeaker: { name: 'Plana' },
    group: {
      scenarioOverride: 'Scene for {{char}}',
      members: [
        { order: 1, character: { name: 'Arona', personality: 'Guide {{user}}' } },
        { order: 0, character: { name: 'Plana', system_prompt: 'Plan {{user}}', description: 'Quiet' } },
      ],
    },
  };
  const groupPrompt = context.__groupPrompt(groupConv, wi);
  assert(groupPrompt.startsWith('Lore before Plana'), 'Group system prompt should inject before-character world info for the focused speaker.');
  assert(groupPrompt.includes('Custom Sensei') && groupPrompt.includes("User's Persona: User persona for Assistant"), 'Group system prompt should include user system prompt and persona.');
  assert(groupPrompt.includes('Strict Rules') && groupPrompt.includes('Scene for Plana'), 'Group system prompt should use the configured language instructions and scenario override.');
  assert(groupPrompt.includes('=== Plana ===') && groupPrompt.includes('System Prompt: Plan Sensei'), 'Group system prompt should render sorted member blocks.');
  assert(groupPrompt.includes('本轮回复必须以 Plana 为主角') && groupPrompt.includes('Lore after Sensei'), 'Group system prompt should include forced-speaker guidance and after-character world info.');

  const singlePrompt = context.__groupPrompt({
    character: {
      name: 'Solo',
      personality: 'Kind',
    },
  }, null);
  assert(singlePrompt.includes('Custom Sensei') && singlePrompt.includes('Personality: Kind'), 'Group system prompt should fall back to the single-character system prompt for non-groups.');
}

async function assertFrontendComfyUIHelpers() {
  const sources = await Promise.all([
    '../src/app/51-comfyui-workflow-clone.js',
    '../src/app/51-comfyui-prompt-text.js',
    '../src/app/51-comfyui-workflow-apply.js',
    '../src/app/51-comfyui-output-finder.js',
    '../src/app/51-comfyui-workflow.js',
    '../src/app/51-comfyui-client-helpers.js',
    '../src/app/51-comfyui-errors.js',
    '../src/app/51-comfyui-output-message.js',
    '../src/app/51-comfyui-workflow-import-ui.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  const events = [];
  const statusEl = { textContent: '', style: {} };
  const context = {
    dom: { comfyWorkflowStatus: statusEl, messageInput: { value: ' new image ' } },
    state: { settings: {
      comfyWorkflow: {
        one: { inputs: { text: '' } },
        two: { inputs: { text: '' } },
        three: { inputs: { seed: 0 } },
      },
      comfyWorkflowName: 'api.json',
      comfyPromptTemplate: '{{user}}/{{char}}/{{input}}/{{last_assistant}}/{{scene}}',
      comfyPositiveNodeId: 'one',
      comfyNegativeNodeId: 'two',
      comfySeedNodeId: 'three',
      comfyNegativePrompt: 'avoid blur',
      userName: 'Sensei',
    } },
    t: (key) => ({
      comfy_error_fetch_hint: 'fetch hint',
      comfy_error_no_workflow: 'no workflow data',
      comfy_error_positive_node: 'missing positive node',
      settings_comfy_no_workflow: 'no workflow',
    }[key] || key),
    ensureComfySettings() { events.push('ensure'); },
    isGroupChat(conv) { return !!(conv && conv.group); },
    getGroupMembers(conv) { return conv.group.members; },
    persistState() { events.push('persist'); },
    renderMessagesOnly() { events.push('messages'); },
    renderConversationListOnly() { events.push('conversations'); },
    Math: { floor: Math.floor, random: () => 0.5 },
    JSON,
    Date: { now: () => 12345 },
    Object,
    String,
    Array,
    encodeURIComponent,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__clone = cloneComfyWorkflow;\nthis.__setInput = setComfyNodeInput;\nthis.__promptText = buildComfyPromptText;\nthis.__applyWorkflow = applyComfyPromptToWorkflow;\nthis.__findOutput = findComfyOutputImage;\nthis.__wsUrl = buildComfyPromptWebSocketUrl;\nthis.__historyUrl = buildComfyPromptHistoryUrl;\nthis.__historyComplete = isComfyPromptHistoryComplete;\nthis.__finishedMessage = isComfyPromptFinishedMessage;\nthis.__error = formatComfyError;\nthis.__url = buildComfyImageViewUrl;\nthis.__msg = createComfyImageMessage;\nthis.__append = appendComfyImageMessage;\nthis.__status = updateComfyWorkflowStatus;`, context);

  assert(context.__error(new Error('Failed to fetch')).startsWith('fetch hint'), 'ComfyUI network errors should include the fetch hint.');
  const cloned = context.__clone();
  assert(cloned !== context.state.settings.comfyWorkflow && cloned.one.inputs.text === '', 'ComfyUI workflow clone should deep copy the imported workflow.');
  assert(context.__setInput(cloned, 'one', 'text', 'positive') === true && cloned.one.inputs.text === 'positive', 'ComfyUI node input helper should set existing inputs.');
  const promptText = context.__promptText({
    group: { members: [{ character: { name: 'Arona' } }, { character: { name: 'Plana' } }] },
    messages: [{ role: 'assistant', content: 'last scene' }],
    title: 'fallback title',
  });
  assert(promptText === 'Sensei/Arona, Plana/new image/last scene/new image', 'ComfyUI prompt text should expand template placeholders from chat context.');
  context.__applyWorkflow(cloned, promptText);
  assert(cloned.one.inputs.text === promptText && cloned.two.inputs.text === 'avoid blur' && cloned.three.inputs.seed > 0, 'ComfyUI workflow application should fill prompt, negative prompt, and seed nodes.');
  const image = context.__findOutput({ pid: { outputs: { out: { images: [{ filename: 'image.png' }] } } } }, 'pid');
  assert(image.filename === 'image.png', 'ComfyUI output finder should return the first generated image.');
  const viewUrl = context.__url('http://127.0.0.1:8188', { filename: 'a b.png', subfolder: 'out/f', type: 'output' });
  assert(viewUrl.includes('filename=a%20b.png') && viewUrl.includes('subfolder=out%2Ff'), 'ComfyUI view URL should encode image parameters.');
  assert(context.__wsUrl('http://server', 'client 1') === 'ws://server/ws?clientId=client%201', 'ComfyUI prompt WebSocket URL should be encoded.');
  assert(context.__historyUrl('http://server', 'prompt/1') === 'http://server/history/prompt%2F1', 'ComfyUI prompt history URL should be encoded.');
  assert(context.__historyComplete({ pid: {} }, 'pid') && context.__historyComplete({ outputs: {} }, 'pid'), 'ComfyUI history helper should detect finished prompts.');
  assert(context.__finishedMessage({ type: 'executing', data: { prompt_id: 'pid', node: null } }, 'pid'), 'ComfyUI WebSocket helper should detect finished prompt messages.');

  const msg = context.__msg('data:image/png;base64,abc', 'prompt', 'pid', { filename: 'x.png' });
  assert(msg.attachments[0].mime === 'image/png' && msg.attachments[0].comfyPromptId === 'pid', 'ComfyUI image message should preserve attachment metadata.');

  const conv = { messages: [], updated: 0, _lastRenderedVisibleCount: 4 };
  context.__append(conv, msg);
  assert(conv.messages.length === 1 && conv._lastRenderedVisibleCount === 0, 'ComfyUI append should add the image message and reset visible count.');
  assert(events.includes('persist') && events.includes('messages') && events.includes('conversations'), 'ComfyUI append should persist and refresh chat UI.');

  context.__status();
  assert(statusEl.textContent.includes('api.json') && statusEl.textContent.includes('3 nodes') && statusEl.style.color === '#86efac', 'ComfyUI workflow status should show imported workflow details.');
  context.state.settings.comfyWorkflow = null;
  context.__status();
  assert(statusEl.textContent === 'no workflow' && statusEl.style.color === '', 'ComfyUI workflow status should show the empty state.');
}

async function assertFrontendLibraryConversationHelpers() {
  const source = await readFile(new URL('../src/app/60-library-conversation-helpers.js', import.meta.url), 'utf8');
  const context = {
    state: {
      conversations: {
        old: { id: 'old', character: { name: 'Arona' }, updated: 100 },
        recent: { id: 'recent', character: { name: 'Arona' }, created: 200 },
        other: { id: 'other', character: { name: 'Mika' }, updated: 300 },
      },
    },
    isGroupChat(conv) { return !!(conv && conv.group); },
    Array,
    Object,
  };

  vm.runInNewContext(`${source}\nthis.__recent = findMostRecentConversationForCharacter;\nthis.__name = getConversationDisplayCharacterName;\nthis.__reset = resetConversationRuntimeState;`, context);

  assert(context.__recent('Arona').id === 'recent', 'Library conversation helper should pick the newest matching character conversation.');
  assert(context.__recent('Missing') === null, 'Library conversation helper should return null when no matching conversation exists.');
  assert(context.__name({ character: { name: 'Yuuka' } }) === 'Yuuka', 'Library conversation helper should read single-character conversation names.');
  assert(context.__name({ group: { members: [{ character: { name: 'Nagisa' } }] } }) === 'Nagisa', 'Library conversation helper should read the first group member name.');

  const conv = {
    _showAllMessages: true,
    _lastRenderedVisibleCount: 42,
    _historyWindow: 999,
    _historyScrollHandler: function noop() {},
    _wiCache: { active: true },
  };
  context.__reset(conv);
  assert(conv._showAllMessages === false && conv._lastRenderedVisibleCount === 0 && conv._historyWindow === 150 && conv._historyScrollHandler === null && conv._wiCache === null, 'Library conversation helper should reset transient render state.');
}

async function assertFrontendLibraryViewHelpers() {
  const sources = await Promise.all([
    '../src/app/60-library-sidebar-ui.js',
    '../src/app/60-library-tabs-ui.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  function classList() {
    const values = new Set();
    return {
      values,
      add(...names) { names.forEach((name) => values.add(name)); },
      remove(...names) { names.forEach((name) => values.delete(name)); },
      toggle(name, force) { if (force) values.add(name); else values.delete(name); },
    };
  }
  function element() {
    return {
      classList: classList(),
      style: {},
      dataset: {},
      value: '',
      _wired: false,
      listeners: {},
      addEventListener(type, handler) { this.listeners[type] = handler; },
      closest() { return this.closestResult || null; },
    };
  }

  const myGrid = element();
  const pubGrid = element();
  const tabMy = element();
  const tabPub = element();
  const search = element();
  const convList = element();
  const sidebar = element();
  const charBlock = element();
  const worldBlock = element();
  const fallbackWorldBlock = element();
  const filters = [{ ...element(), dataset: { filter: 'all' } }, { ...element(), dataset: { filter: 'female' } }];
  const context = {
    activeLibraryTab: 'my',
    libraryFilter: 'female',
    librarySearchQuery: 'arona',
    document: {
      getElementById(id) {
        return { myCardsGrid: myGrid, publicCardsGrid: pubGrid, tabMy, tabPublic: tabPub, librarySearch: search, convList, sidebar }[id] || null;
      },
      querySelector(selector) {
        if (selector === '#sidebar span[data-i18n="char_card_title"]') return { closest: () => charBlock };
        if (selector === '#sidebar span[data-i18n="world_book"]') return { closest: () => worldBlock };
        if (selector === '#sidebar .glass.rounded-xl.px-3.py-2') return fallbackWorldBlock;
        return null;
      },
      querySelectorAll(selector) {
        return selector === '#libraryView [data-filter]' ? filters : [];
      },
    },
    Set,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__tab = setActiveTab;\nthis.__wire = wireLibraryTabButtons;\nthis.__filters = syncLibraryFilterButtons;\nthis.__search = syncLibrarySearchInput;\nthis.__sidebar = setLibrarySidebarMode;\nthis.__conv = showLibraryConversationList;`, context);

  context.__tab('public');
  assert(myGrid.classList.values.has('hidden') && !pubGrid.classList.values.has('hidden'), 'Library tabs should show the selected grid.');
  assert(tabPub.classList.values.has('active') && !tabMy.classList.values.has('active'), 'Library tabs should mark the active tab button.');
  assert(context.activeLibraryTab === 'public', 'Library tabs should persist the active tab state.');

  context.__wire();
  assert(tabMy._wired === true && tabPub._wired === true && typeof tabMy.listeners.click === 'function', 'Library tab buttons should be wired once.');

  context.__filters();
  assert(filters[1].classList.values.has('bg-amber-500/20') && !filters[0].classList.values.has('bg-amber-500/20'), 'Library filters should highlight the active filter.');

  context.__search();
  assert(search.value === 'arona', 'Library search input should mirror the stored search query.');

  context.__sidebar(true);
  assert(charBlock.style.display === 'none' && worldBlock.style.display === 'none' && fallbackWorldBlock.style.display === 'none', 'Library mode should hide character and world book sidebar sections.');
  assert(sidebar.classList.values.has('library-mode'), 'Library mode should mark the sidebar.');

  context.__sidebar(false);
  assert(charBlock.style.display === '' && worldBlock.style.display === '' && !sidebar.classList.values.has('library-mode'), 'Chat mode should restore sidebar sections.');

  context.__conv();
  assert(convList.style.display === '', 'Library conversation list helper should show the conversation list.');
}

async function assertFrontendMobileSidebarUI() {
  const source = await readFile(new URL('../src/app/65-mobile-sidebar-ui.js', import.meta.url), 'utf8');

  function classList(initial = []) {
    const values = new Set(initial);
    return {
      values,
      add(...names) { names.forEach((name) => values.add(name)); },
      remove(...names) { names.forEach((name) => values.delete(name)); },
      contains(name) { return values.has(name); },
    };
  }
  function button() {
    return {
      innerHTML: '',
      title: '',
      attrs: {},
      setAttribute(name, value) { this.attrs[name] = value; },
    };
  }

  const events = [];
  const sidebar = { classList: classList() };
  const backdrop = { classList: classList() };
  const closeBtn = button();
  const context = {
    window: { innerWidth: 767 },
    dom: { sidebar, sidebarBackdrop: backdrop, sidebarCloseBtn: closeBtn },
    currentView: 'library',
    currentCharacterName: 'Arona',
    renderConversationList() { events.push('render-list'); },
    switchView(view) { events.push(`switch:${view}`); },
    t: (key) => key === 'back_to_library' ? 'Back to library' : key,
    Set,
  };

  vm.runInNewContext(`${source}\nthis.__isMobile = isMobile;\nthis.__open = openSidebar;\nthis.__close = closeSidebar;\nthis.__toggle = toggleSidebar;\nthis.__handle = handleSidebarClose;\nthis.__button = updateSidebarCloseButton;`, context);

  assert(context.__isMobile() === true, 'Mobile sidebar should treat widths below 768px as mobile.');
  context.window.innerWidth = 768;
  assert(context.__isMobile() === false, 'Mobile sidebar should treat 768px and wider as desktop.');

  context.__open();
  assert(sidebar.classList.values.has('open') && backdrop.classList.values.has('open'), 'Mobile sidebar open should show sidebar and backdrop.');
  context.__toggle();
  assert(!sidebar.classList.values.has('open') && !backdrop.classList.values.has('open'), 'Mobile sidebar toggle should close an open sidebar.');
  context.__toggle();
  assert(sidebar.classList.values.has('open') && backdrop.classList.values.has('open'), 'Mobile sidebar toggle should open a closed sidebar.');

  context.currentView = 'chat';
  context.__button();
  assert(closeBtn.innerHTML === '\u2190' && closeBtn.attrs['aria-label'] === 'Back to library' && closeBtn.title === 'Back to library', 'Chat sidebar close button should become a back-to-library control.');
  context.currentView = 'library';
  context.__button();
  assert(closeBtn.innerHTML === '&times;' && closeBtn.attrs['aria-label'] === 'Close menu' && closeBtn.title === '', 'Library sidebar close button should become a close control.');

  context.currentView = 'chat';
  context.currentCharacterName = 'Arona';
  context.__open();
  context.__handle();
  assert(context.currentCharacterName === null, 'Sidebar close from chat should clear the selected character name.');
  assert(events.includes('render-list') && events.includes('switch:library'), 'Sidebar close from chat should refresh the list and switch to the library.');
  assert(!sidebar.classList.values.has('open') && !backdrop.classList.values.has('open'), 'Sidebar close handler should close the sidebar.');
}

async function assertFrontendConversationListUI() {
  const sources = await Promise.all([
    '../src/app/64-conversation-list-helpers.js',
    '../src/app/64-conversation-list-ui.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  function listenerElement(attrs) {
    return {
      attrs,
      listeners: {},
      getAttribute(name) { return this.attrs[name]; },
      addEventListener(type, handler) { this.listeners[type] = handler; },
    };
  }

  const events = [];
  const convRows = [listenerElement({ 'data-conv-id': 'c1' })];
  const deleteRows = [listenerElement({ 'data-del-id': 'c2' })];
  const exportRows = [listenerElement({ 'data-exp-id': 'g1' })];
  const convList = {
    innerHTML: '',
    querySelectorAll(selector) {
      if (selector === '[data-conv-id]') return convRows;
      if (selector === '.conv-delete-btn') return deleteRows;
      if (selector === '.conv-export-btn') return exportRows;
      return [];
    },
  };
  const context = {
    dom: { convList },
    state: {
      activeConvId: 'c2',
      conversationOrder: ['c1', 'c2', 'g1', 'other', 'missing'],
      conversations: {
        c1: { title: 'Arona chat', character: { name: 'Arona' }, created: 1000, updated: 1000 },
        c2: { title: 'Active Plana chat', character: { name: 'Plana' }, created: 2000, updated: 2000 },
        g1: { title: 'Group chat', group: { members: [{ character: { name: 'Arona' } }] }, created: 3000, updated: 3000 },
        other: { title: 'Other chat', character: { name: 'Other' }, created: 4000, updated: 4000 },
      },
    },
    currentView: 'chat',
    currentCharacterName: 'Arona',
    t(key) {
      return {
        no_conversations: 'No conversations',
        chat_with: 'Chat with ',
        new_chat_title: 'New chat',
        no_character: 'No character',
        conv_export_title: 'Export',
      }[key] || key;
    },
    escapeHtml(value) { return String(value); },
    loadConversation(id) { events.push(`load:${id}`); },
    deleteConversation(id) { events.push(`delete:${id}`); },
    exportConversation(id) { events.push(`export:${id}`); },
    Date,
    Array,
    String,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__visible = getVisibleConversationListOrder;\nthis.__empty = buildConversationListEmptyHtml;\nthis.__item = buildConversationListItemHtml;\nthis.__render = renderConversationList;`, context);

  const visibleOrder = context.__visible();
  assert(visibleOrder.join(',') === 'c1,c2,g1', 'Conversation list helper should keep matching character, active, and group conversations.');
  assert(context.__item('c1', context.state.conversations.c1, false).includes('data-exp-id="c1"'), 'Conversation list helper should render export actions for rows.');
  context.__render();
  assert(convList.innerHTML.includes('data-conv-id="c1"') && convList.innerHTML.includes('data-conv-id="c2"') && convList.innerHTML.includes('data-conv-id="g1"'), 'Conversation list should include matching character, active, and group conversations in chat view.');
  assert(!convList.innerHTML.includes('Other chat'), 'Conversation list should filter unrelated conversations in chat view.');
  assert(context.state.conversationOrder.join(',') === 'c1,c2,g1,other,missing', 'Conversation list render should not mutate conversation order.');

  convRows[0].listeners.click({});
  deleteRows[0].listeners.click({ stopPropagation() { events.push('stop-delete'); } });
  exportRows[0].listeners.click({ stopPropagation() { events.push('stop-export'); } });
  assert(events.includes('load:c1') && events.includes('delete:c2') && events.includes('export:g1'), 'Conversation list should bind load/delete/export actions.');

  context.currentView = 'library';
  context.__render();
  assert(convList.innerHTML.includes('Other chat'), 'Conversation list should show all conversations in library view.');

  context.state.conversationOrder = [];
  context.__render();
  assert(convList.innerHTML.includes('No conversations'), 'Conversation list should render the empty state.');
  assert(context.__empty().includes('No conversations'), 'Conversation list empty helper should render localized empty text.');
}

async function assertFrontendCharacterPanelUI() {
  const sources = await Promise.all([
    '../src/app/65-character-panel-helpers.js',
    '../src/app/65-character-panel-ui.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  function classList() {
    const values = new Set();
    return {
      values,
      add(name) { values.add(name); },
      remove(name) { values.delete(name); },
    };
  }
  function element() {
    return { classList: classList(), textContent: '', innerHTML: '', className: '' };
  }

  let activeConv = null;
  let badgeRenders = 0;
  const dom = {
    charCardPreview: element(),
    charCardEmptyHint: element(),
    charEditBtn: element(),
    charExportBtn: element(),
    charRemoveBtn: element(),
    charCardAvatar: element(),
    charCardName: element(),
    charCardTagCount: element(),
  };
  const context = {
    dom,
    getActiveConv() { return activeConv; },
    isGroupChat(conv) { return !!(conv && conv.group); },
    getGroupMembers(conv) { return conv.group.members; },
    renderWorldInfoBadge() { badgeRenders += 1; },
    t: (key) => ({ char_empty_name: 'Unnamed' }[key] || key),
    Set,
    Array,
    String,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__render = renderCharacterCard;\nthis.__summary = buildGroupCharacterSummary;`, context);

  context.__render();
  assert(dom.charCardPreview.classList.values.has('hidden') && !dom.charCardEmptyHint.classList.values.has('hidden'), 'Character panel should show the empty state without an active conversation.');
  assert(dom.charEditBtn.classList.values.has('hidden') && badgeRenders === 1, 'Character panel empty state should hide actions and refresh the world info badge.');

  activeConv = {
    group: {
      name: 'Team',
      members: [
        { character: { name: 'Arona' } },
        { character: { name: 'Plana' } },
        { character: { name: 'Mika' } },
      ],
    },
  };
  context.__render();
  assert(dom.charCardName.textContent === 'Team' && dom.charCardAvatar.textContent === 'Group', 'Character panel should render group chat identity.');
  assert(dom.charCardTagCount.textContent.includes('3 角色') && dom.charCardTagCount.textContent.includes('等'), 'Character panel should summarize group members.');
  assert(context.__summary(activeConv.group.members).includes('Arona、Plana'), 'Character panel summary helper should include the first two group members.');

  activeConv = { character: { name: 'Arona', previewImage: 'avatar.png', tags: ['ai', 'guide'] } };
  context.__render();
  assert(dom.charEditBtn.classList.values.has('hidden') === false && dom.charCardAvatar.innerHTML.includes('avatar.png'), 'Character panel should show actions and image avatars for single-character chats.');
  assert(dom.charCardName.textContent === 'Arona' && dom.charCardTagCount.textContent === '2 tags', 'Character panel should render single-character metadata.');
}

async function assertFrontendCharacterEditorUI() {
  const sources = await Promise.all([
    '../src/app/65-character-editor-helpers.js',
    '../src/app/65-character-editor-ui.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  function input(value = '') {
    return { value };
  }
  function classList() {
    const values = new Set(['hidden']);
    return {
      values,
      add(name) { values.add(name); },
      remove(name) { values.delete(name); },
    };
  }

  const events = [];
  let activeConv = {
    title: 'New chat',
    messages: [],
    character: {
      name: 'Unnamed',
      tags: ['old'],
      alternate_greetings: ['hi'],
      extensions: { depth: 1 },
    },
  };
  const dom = {
    charEditName: input('Arona'),
    charEditTags: input('ai, guide, '),
    charEditDescription: input('desc'),
    charEditPersonality: input('kind'),
    charEditScenario: input('scene'),
    charEditFirstMes: input('Hello {{user}} from {{char}}'),
    charEditMesExample: input('example'),
    charEditSystemPrompt: input('system'),
    charEditPostHistory: input('post'),
    charEditCreatorNotes: input('notes'),
    charEditorModal: { classList: classList() },
  };
  const context = {
    dom,
    state: { settings: { userName: 'Sensei' }, characters: {} },
    getActiveConv() { return activeConv; },
    replacePlaceholders(text, charName, userName) {
      return text.replaceAll('{{char}}', charName).replaceAll('{{user}}', userName);
    },
    t: (key) => ({ title_new_chat_match: 'New Chat', new_chat_title: 'New chat', chat_with: 'Chat with ' }[key] || key),
    persistState: () => events.push('persist'),
    renderLibraryGrids: () => events.push('library'),
    renderCharacterUI: () => events.push('character'),
    renderMessagesOnly: () => events.push('messages'),
    renderConversationListOnly: () => events.push('conversations'),
    appStore: { notify: (key) => events.push(`notify:${key}`) },
    Date: { now: () => 999 },
    JSON,
    String,
    Set,
    Array,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__open = openCharacterEditor;\nthis.__save = saveCharacterEdits;\nthis.__tags = parseCharacterEditorTags;\nthis.__build = buildCharacterFromEditorForm;`, context);

  activeConv.character.name = 'Plana';
  activeConv.character.description = 'loaded desc';
  context.__open();
  assert(dom.charEditName.value === 'Plana' && dom.charEditDescription.value === 'loaded desc' && !dom.charEditorModal.classList.values.has('hidden'), 'Character editor should hydrate the active character into the form.');

  dom.charEditName.value = 'Arona';
  dom.charEditTags.value = 'ai, guide, ';
  dom.charEditDescription.value = 'desc';
  dom.charEditPersonality.value = 'kind';
  dom.charEditScenario.value = 'scene';
  dom.charEditFirstMes.value = 'Hello {{user}} from {{char}}';
  dom.charEditMesExample.value = 'example';
  dom.charEditSystemPrompt.value = 'system';
  dom.charEditPostHistory.value = 'post';
  dom.charEditCreatorNotes.value = 'notes';
  assert(context.__tags(' a, , b ').join(',') === 'a,b', 'Character editor should parse comma-separated tags.');
  activeConv.character.name = 'Unnamed';
  activeConv.messages = [];
  context.__save();
  assert(activeConv.character.name === 'Arona' && activeConv.character.tags.join(',') === 'ai,guide', 'Character editor should save form fields into the conversation character.');
  assert(activeConv.character.alternate_greetings[0] === 'hi' && activeConv.character.extensions.depth === 1, 'Character editor should preserve existing character metadata.');
  assert(activeConv.messages[0].content === 'Hello Sensei from Arona', 'Character editor should seed first messages for new characters.');
  assert(context.state.characters.arona.name === 'Arona' && context.state.characters.arona !== activeConv.character, 'Character editor should register an independent global card copy.');
  assert(activeConv.title === 'Chat with Arona' && activeConv.updated === 999, 'Character editor should update conversation title and timestamp.');
  assert(events.includes('persist') && events.includes('library') && events.includes('notify:conversations'), 'Character editor should persist and refresh dependent UI.');
}

async function assertFrontendStateLifecycleHelpers() {
  const sources = await Promise.all([
    '../src/app/33-render-shortcuts.js',
    '../src/app/33-final-assistant-message-ui.js',
    '../src/app/33-render-subscriptions.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  const events = [];
  const container = {
    children: [],
    scrollHeight: 500,
    scrollTop: 380,
    clientHeight: 100,
    appendChild(child) { this.children.push(child); },
  };
  const conv = {
    id: 'c1',
    messages: [{ role: 'assistant', speaker: 'Arona', content: 'hello' }],
    _lastRenderedVisibleCount: 1,
  };
  let activeConv = conv;
  const context = {
    dom: { messagesContainer: container, convList: {} },
    appStore: {
      notify(keys) { events.push('notify:' + keys.join(',')); },
      subscribe(handler) { this.handler = handler; },
    },
    document: {
      createElement() { return { className: '', innerHTML: '' }; },
    },
    getActiveConv() { return activeConv; },
    getMessageSenderName() { return 'Arona'; },
    escapeHtml: (value) => String(value),
    renderCotBlock: () => '<cot></cot>',
    renderAssistantContent: (value) => '<p>' + value + '</p>',
    renderTokenBar: () => events.push('token'),
    renderAll: () => events.push('all'),
    renderMessages: () => events.push('messages'),
    renderConversationList: () => events.push('conversations'),
    renderCharacterCard: () => events.push('character'),
    renderTopBar: () => events.push('topbar'),
    renderWorldInfoBudgetWarning: () => events.push('worldInfo'),
    updateInputState: () => events.push('input'),
    t: (key) => key,
    Array,
    String,
    console,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__full = requestFullRender;\nthis.__render = requestRender;\nthis.__append = appendFinalAssistantMessage;\nthis.__html = buildFinalAssistantMessageHtml;`, context);

  context.__full();
  context.__render('activeConvId');
  context.__render(['settings', 'worldInfo']);
  assert(events.includes('all') && events.includes('notify:activeConvId') && events.includes('notify:settings,worldInfo'), 'State lifecycle render shortcuts should notify requested keys.');

  const html = context.__html(conv, 'final', 'cot', 0);
  assert(html.includes('data-action="copy"') && html.includes('<p>final</p>'), 'Final assistant message HTML should include actions and rendered content.');

  context.__append(conv, 'final', 'cot');
  assert(container.children.length === 1 && conv._lastRenderedVisibleCount === 2 && events.includes('token'), 'Final assistant message append should update DOM, visible count, and token bar.');
  assert(container.scrollTop === container.scrollHeight, 'Final assistant message append should keep near-bottom users at the bottom.');

  activeConv = { id: 'other' };
  context.__append(conv, 'late', '');
  assert(container.children.length === 1, 'Final assistant message append should ignore stale conversation completions.');

  context.appStore.handler(['activeConvId', 'isGenerating']);
  assert(events.includes('character') && events.includes('input'), 'Render subscriptions should call handlers for changed keys.');
}

async function assertFrontendMessageContentHelpers() {
  const sources = await Promise.all([
    '../src/app/61-message-text-format.js',
    '../src/app/61-message-status-bar-render.js',
    '../src/app/61-message-options-render.js',
    '../src/app/61-message-attachments-render.js',
    '../src/app/61-message-cot-render.js',
    '../src/app/61-message-content-render.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  class FakeDOMParser {
    parseFromString(text) {
      if (!/^<options[\s>]/i.test(String(text || ''))) {
        return { getElementsByTagName: () => [] };
      }
      const optionBlocks = Array.from(String(text).matchAll(/<option\b[^>]*>([\s\S]*?)<\/option>/gi)).map((match) => match[1]);
      return {
        getElementsByTagName(name) {
          if (name === 'parsererror') return [];
          if (name !== 'option') return [];
          return optionBlocks.map((block) => ({
            getElementsByTagName(childName) {
              const childMatch = new RegExp(`<${childName}[^>]*>([\\s\\S]*?)<\\/${childName}>`, 'i').exec(block);
              return childMatch ? [{ textContent: childMatch[1] }] : [];
            },
          }));
        },
      };
    }
  }

  const context = {
    state: { settings: { showCotEnabled: true } },
    window: { DOMPurify: true },
    DOMPurify: { sanitize: (html) => html.replace(/\sonclick="[^"]*"/g, '') },
    DOMParser: FakeDOMParser,
    t: (key) => key === 'cot_block_title' ? 'Thinking' : key,
    String,
    Array,
    RegExp,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__escape = escapeHtml;\nthis.__highlight = highlightDialogue;\nthis.__status = sanitizeStatusBarHtml;\nthis.__assistant = renderAssistantContent;\nthis.__attachments = renderMessageAttachments;\nthis.__bubble = renderMessageBubbleContent;\nthis.__cot = renderCotBlock;\nthis.__options = renderOptionsXml;`, context);

  assert(context.__escape('<b title="x">&') === '&lt;b title=&quot;x&quot;&gt;&amp;', 'Message escapeHtml should escape unsafe HTML characters.');

  const highlighted = context.__highlight('她说“你好”与「世界」');
  assert(highlighted.includes('dialogue-highlight') && highlighted.includes('“你好”') && highlighted.includes('「世界」'), 'Message dialogue highlighter should wrap Chinese dialogue quotes.');

  const status = context.__status('<details open onclick="bad"><summary>状态栏</summary><span>ok</span></details>');
  assert(status.includes('class="status-bar" open') && status.includes('status-bar-content') && !status.includes('onclick'), 'Status bar sanitizer should normalize allowed status blocks.');

  const assistant = context.__assistant('前文<details open><summary>状态栏</summary><span>HP</span></details>后文');
  assert(assistant.includes('前文') && assistant.includes('status-bar-content') && assistant.includes('后文'), 'Assistant content should preserve text around status blocks.');

  const attachments = context.__attachments({
    attachments: [
      { type: 'image', dataUrl: 'data:image/png;base64,abc', source: 'comfyui', prompt: '<prompt>' },
      { type: 'file', url: 'skip' },
    ],
  });
  assert(attachments.includes('msg-attachment-image') && attachments.includes('ComfyUI') && attachments.includes('&lt;prompt&gt;') && !attachments.includes('skip'), 'Message attachment renderer should render escaped image attachments only.');

  const bubble = context.__bubble({ role: 'user', content: '<hello>', attachments: [] }, true);
  assert(bubble === '&lt;hello&gt;', 'User message bubble should render escaped plain text.');

  const cot = context.__cot('<think>', true);
  assert(cot.includes('msg-cot streaming') && cot.includes('&lt;think&gt;'), 'CoT renderer should escape and mark streaming blocks.');
  context.state.settings.showCotEnabled = false;
  assert(context.__cot('hidden', false) === '', 'CoT renderer should honor disabled display setting.');

  const optionsHtml = context.__options('<options><option><title>Go</title><description>选择“前进”</description></option></options>');
  assert(optionsHtml.includes('Go') && optionsHtml.includes('dialogue-highlight'), 'Options XML renderer should render option cards and highlight dialogue.');
}

async function assertFrontendMessageEditHelpers() {
  const source = await readFile(new URL('../src/app/67-message-edit-helpers.js', import.meta.url), 'utf8');
  const events = [];
  const directBubble = { id: 'direct' };
  const fallbackBubble = { id: 'fallback' };
  const context = {
    dom: {
      messagesContainer: {
        querySelector(selector) {
          events.push('query:' + selector);
          return {
            closest() {
              return { querySelector: () => fallbackBubble };
            },
          };
        },
      },
    },
    document: {
      createElement(tag) {
        return {
          tag,
          value: '',
          className: '',
          style: {},
          scrollHeight: 512,
        };
      },
    },
    removeLinkedSecondStageMessages(conv, msg) {
      events.push('unlink:' + msg.content);
      conv.unlinked = true;
    },
    Date: { now: () => 1234 },
    Math,
    String,
  };

  vm.runInNewContext(`${source}\nthis.__find = findEditableMessageBubble;\nthis.__textarea = createMessageEditTextarea;\nthis.__resize = autoResizeMessageEditTextarea;\nthis.__apply = applyMessageEditContent;`, context);

  const triggerBtn = {
    closest() {
      return { querySelector: () => directBubble };
    },
  };
  assert(context.__find(2, triggerBtn) === directBubble, 'Message edit helper should prefer trigger button wrappers.');
  assert(context.__find(3, null) === fallbackBubble && events.some((event) => event.includes('data-msg-idx="3"')), 'Message edit helper should find fallback bubbles by message index.');

  const textarea = context.__textarea('hello', 200);
  assert(textarea.value === 'hello' && textarea.style.width === '200px' && Math.abs(parseFloat(textarea.style.minWidth) - 230) < 0.001, 'Message edit textarea should preserve content and stable sizing.');
  context.__resize(textarea);
  assert(textarea.style.height === '420px', 'Message edit textarea resize should cap tall content.');

  const conv = {
    messages: [
      { role: 'assistant', content: 'old' },
      { role: 'assistant', stage: 'second', content: 'second' },
    ],
    _wiCache: { stale: true },
    _lastRenderedVisibleCount: 9,
  };
  const changed = context.__apply(conv, 0, 'old', ' new value ');
  assert(changed === 'changed' && conv.messages[0].content === 'new value', 'Message edit apply should trim and save changed content.');
  assert(conv.updated === 1234 && conv._wiCache === null && conv._lastRenderedVisibleCount === 0 && conv.unlinked === true, 'Message edit apply should reset render/world-info state and unlink main assistant second-stage messages.');

  assert(context.__apply(conv, 1, 'second', 'second') === 'unchanged', 'Message edit apply should detect unchanged content.');
  assert(context.__apply(conv, 9, '', 'missing') === 'missing', 'Message edit apply should handle missing messages.');
}

async function assertFrontendMessageActionHelpers() {
  const sources = await Promise.all([
    '../src/app/67-message-action-helpers.js',
    '../src/app/67-message-regeneration-runtime.js',
    '../src/app/67-message-actions-ui.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  let activeConv = null;
  const events = [];
  const context = {
    state: { isGenerating: false },
    getActiveConv() {
      return activeConv;
    },
    removeLinkedSecondStageMessages(conv, msg) {
      events.push('unlink:' + msg.id);
      conv.messages = conv.messages.filter((m) => !(m.stage === 'second' && m.parentId === msg.id));
    },
    persistState() { events.push('persist'); },
    renderMessagesOnly() { events.push('render-messages'); },
    renderConversationListOnly() { events.push('render-conversations'); },
    runSecondStageGeneration(parent, done) {
      events.push('second:' + parent.id);
      done();
    },
    completeGenerationTurn(conv) { events.push('complete:' + conv.id); },
    isGroupChat() { return true; },
    parseGroupMention() { return { name: 'Plana' }; },
    getNextGroupSpeaker() { return { name: 'Next' }; },
    streamChat(onToken) {
      events.push('stream');
      onToken('', 'regen', '');
    },
    updateStreamingBubble(content) { events.push('bubble:' + content); },
    getCurrentGeneratingSpeakerName() { return 'Arona'; },
    handlePrimaryAssistantComplete() {},
    updateInputState() { events.push('input'); },
    isWebLLMBackend() { return false; },
    document: { getElementById: () => null },
    appStore: { notify(key) { events.push('notify:' + key); } },
    alert: (msg) => events.push('alert:' + msg),
    Date: { now: () => 12345 },
    Array,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__delete = deleteMessage;\nthis.__regen = regenerateMessage;\nthis.__regenError = handlePrimaryRegenerationError;`, context);

  function reset(conv) {
    activeConv = conv;
    events.length = 0;
  }

  reset({
    id: 'delete-user',
    messages: [
      { role: 'user', content: 'u' },
      { role: 'assistant', content: 'a1' },
      { role: 'assistant', content: 'a2' },
      { role: 'user', content: 'next' },
    ],
  });
  context.__delete(0);
  assert(activeConv.messages.length === 1 && activeConv.messages[0].content === 'next', 'Message delete should remove a user message and up to two following assistant replies.');
  assert(activeConv.updated === 12345 && events.includes('persist') && events.includes('render-conversations'), 'Message delete should persist and refresh conversation lists.');

  reset({
    id: 'delete-assistant',
    messages: [
      { role: 'user', content: 'u' },
      { id: 'main', role: 'assistant', content: 'a' },
      { id: 'second', role: 'assistant', stage: 'second', parentId: 'main', content: 's' },
    ],
  });
  context.__delete(1);
  assert(activeConv.messages.length === 1 && activeConv.messages[0].role === 'user', 'Assistant delete should remove linked second-stage messages and the main assistant message.');
  assert(events.includes('unlink:main'), 'Assistant delete should unlink second-stage messages.');

  reset({
    id: 'regen-second',
    messages: [
      { id: 'parent', role: 'assistant', content: 'main' },
      { id: 'second', role: 'assistant', stage: 'second', parentId: 'parent', content: 'old second' },
    ],
  });
  context.__regen(1);
  assert(activeConv.messages.length === 1 && events.includes('second:parent') && events.includes('complete:regen-second'), 'Second-stage regenerate should remove the child and rerun second-stage generation.');
  assert(!events.includes('render-conversations'), 'Second-stage regenerate should not refresh the conversation list.');

  reset({
    id: 'regen-main',
    messages: [
      { role: 'user', content: '@Plana retry' },
      { id: 'main', role: 'assistant', content: 'old main' },
      { id: 'second', role: 'assistant', stage: 'second', parentId: 'main', content: 'old second' },
    ],
  });
  context.__regen(1);
  assert(activeConv.messages.length === 1 && activeConv._nextGroupSpeaker.name === 'Plana', 'Primary regenerate should remove the assistant turn and prepare the group speaker from the last user message.');
  assert(events.includes('stream') && events.includes('bubble:regen') && events.includes('input'), 'Primary regenerate should restart streaming and update input state.');

  events.length = 0;
  context.state.isGenerating = true;
  context.__regenError(new Error('regeneration failed'));
  assert(context.state.isGenerating === false && events.includes('notify:isGenerating') && events.includes('render-messages') && events.includes('alert:Error: regeneration failed'), 'Primary regenerate error handler should clear state, render, notify, and alert.');
}

async function assertFrontendSendMessageHelpers() {
  const source = await readFile(new URL('../src/app/70-send-message-helpers.js', import.meta.url), 'utf8');
  const events = [];
  const context = {
    pendingGroupMention: null,
    dom: { messageInput: { value: 'draft', style: { height: '42px' } } },
    Date: { now: () => 777 },
    t: (key) => (key === 'title_new_chat_match' ? 'New Chat' : key),
    clearPendingGroupMention() {
      events.push('clear');
      context.pendingGroupMention = null;
    },
    parseGroupMention(text) {
      events.push('parse:' + text);
      return text.indexOf('@Plana') !== -1 ? { name: 'Plana' } : null;
    },
    getNextGroupSpeaker() {
      events.push('next');
      return { name: 'Next' };
    },
    isGroupChat(conv) {
      return !!(conv && conv.group);
    },
    String,
  };

  vm.runInNewContext(`${source}\nthis.__append = appendUserMessageToConversation;\nthis.__speaker = prepareGroupSpeakerForUserMessage;\nthis.__reset = resetMessageComposerInput;`, context);

  const conv = { title: 'New Chat', messages: [], _wiBudgetWarning: true };
  const longText = 'x'.repeat(55);
  context.__append(conv, longText);
  assert(conv.messages[0].content === longText && conv.updated === 777 && conv._wiBudgetWarning === false, 'Send message helper should append the user message and clear transient warnings.');
  assert(conv.title === longText.slice(0, 50) + '...', 'Send message helper should retitle new conversations from the first user message.');

  const groupConv = { group: { members: [] } };
  context.pendingGroupMention = { name: 'Clicked' };
  context.__speaker(groupConv, 'hello');
  assert(groupConv._nextGroupSpeaker.name === 'Clicked' && events.includes('clear'), 'Send message group helper should prefer clicked mention selections.');

  events.length = 0;
  context.__speaker(groupConv, '@Plana hello');
  assert(groupConv._nextGroupSpeaker.name === 'Plana' && events.includes('parse:@Plana hello'), 'Send message group helper should fall back to typed mentions.');

  events.length = 0;
  context.__speaker(groupConv, 'hello');
  assert(groupConv._nextGroupSpeaker.name === 'Next' && events.includes('next'), 'Send message group helper should use natural speaker order without mentions.');

  const singleConv = {};
  context.__speaker(singleConv, 'hello');
  assert(!singleConv._nextGroupSpeaker, 'Send message group helper should leave single-character chats unchanged.');

  context.__reset();
  assert(context.dom.messageInput.value === '' && context.dom.messageInput.style.height === 'auto' && events.includes('clear'), 'Send message reset helper should clear the composer and pending mention.');
}

async function assertFrontendChatTopBarUI() {
  const source = await readFile(new URL('../src/app/61-chat-topbar-ui.js', import.meta.url), 'utf8');
  let activeConv = null;
  const dom = {
    chatTitle: { textContent: '' },
    charAvatar: { textContent: '', innerHTML: '', className: '' },
    chatSubtitle: { textContent: '' },
  };
  const context = {
    dom,
    getActiveConv() { return activeConv; },
    isGroupChat(conv) { return !!(conv && conv.group); },
    getGroupMembers(conv) { return conv.group.members; },
    t: (key) => ({
      new_chat_title: 'New',
      no_character: 'No character',
      char_tag_separator: ' / ',
    }[key] || key),
  };

  vm.runInNewContext(`${source}\nthis.__render = renderTopBar;`, context);

  activeConv = {
    title: 'Group Chat',
    group: {
      members: [
        { character: { name: 'Arona' } },
        { character: { name: 'Plana' } },
        { character: { name: 'Hikari' } },
        { character: { name: 'Nozomi' } },
      ],
    },
  };
  context.__render();
  assert(dom.chatTitle.textContent === 'Group Chat' && dom.charAvatar.textContent === 'Group', 'Chat top bar should render group title and avatar.');
  assert(dom.chatSubtitle.textContent === 'Arona、Plana、Hikari 等', 'Chat top bar should summarize group members.');

  activeConv = {
    title: '',
    character: { name: 'Arona', previewImage: 'avatar.png', tags: ['blue', 'ai'] },
  };
  context.__render();
  assert(dom.chatTitle.textContent === 'New' && dom.charAvatar.innerHTML.includes('avatar.png'), 'Chat top bar should render single-character image avatars.');
  assert(dom.chatSubtitle.textContent === 'blue / ai', 'Chat top bar should render character tags.');

  activeConv = { title: 'Plain', character: null };
  context.__render();
  assert(dom.charAvatar.textContent === 'Chat' && dom.chatSubtitle.textContent === 'No character', 'Chat top bar should render the no-character fallback.');
}

async function assertFrontendChatMessageRendererHelpers() {
  const sources = await Promise.all([
    '../src/app/61-chat-message-window-state.js',
    '../src/app/61-chat-history-load-button.js',
    '../src/app/61-chat-message-window-render.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  function classList() {
    const values = new Set();
    return {
      values,
      toggle(name, force) { if (force) values.add(name); else values.delete(name); },
    };
  }

  const dom = {
    emptyState: { style: {} },
    tokenInfo: { classList: classList() },
  };
  const context = {
    dom,
    state: { isGenerating: false },
    document: {
      getElementById: () => null,
      createDocumentFragment: () => ({ children: [], appendChild(child) { this.children.push(child); } }),
    },
    createChatMessageElement: (msg) => ({ msg }),
    renderChatMessagesHtml: (messages) => messages.map((msg) => msg.content).join('|'),
    getCurrentGeneratingSpeakerName: () => 'Arona',
    escapeHtml: (value) => String(value),
    ensureHistoryLoadUI: () => {},
    loadMoreHistory: (convArg, containerArg) => {
      context.loaded = { conv: convArg, container: containerArg };
    },
    Set,
    Array,
    Math,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__messages = getRenderableChatMessages;\nthis.__window = getChatMessageWindowState;\nthis.__can = canIncrementalRenderChatMessages;\nthis.__empty = renderChatMessageEmptyState;\nthis.__load = buildLoadEarlierMessagesButtonHtml;\nthis.__incrementalLoad = buildIncrementalLoadEarlierMessagesButtonHtml;\nthis.__bindLoad = bindLoadEarlierMessagesButton;\nthis.__stream = buildStreamingMessageHtml;\nthis.__append = appendIncrementalChatMessages;`, context);

  const conv = {
    _lastRenderedVisibleCount: 1,
    messages: [
      { role: 'system', content: 'hidden' },
      { role: 'user', content: 'one' },
      { role: 'assistant', content: 'two' },
    ],
  };
  const messages = context.__messages(conv);
  assert(messages.length === 2 && messages[0].content === 'one', 'Chat renderer should exclude system messages.');

  const windowState = context.__window(Object.assign({}, conv, { _historyWindow: 1 }), messages);
  assert(windowState.startIdx === 1 && windowState.visibleMessages[0].content === 'two', 'Chat renderer should window long histories.');
  assert(context.__can(windowState) === false, 'Chat renderer should skip incremental render when visible count is unchanged.');
  const nextState = Object.assign({}, windowState, { currentVisibleCount: 2, lastRenderedCount: 1 });
  assert(context.__can(nextState) === true, 'Chat renderer should allow incremental render for appended messages.');

  const container = { innerHTML: 'old', appended: null, scrollTop: 0, scrollHeight: 100, appendChild(fragment) { this.appended = fragment; } };
  context.__append(container, conv, nextState);
  assert(container.appended.children.length === 1 && conv._lastRenderedVisibleCount === 2 && container.scrollTop === 100, 'Chat renderer should append incremental messages and update render count.');

  context.__empty(container);
  assert(container.innerHTML === '' && dom.emptyState.style.display === '' && dom.tokenInfo.classList.values.has('hidden'), 'Chat renderer empty state should clear messages and hide token info.');
  assert(context.__load(3).includes('3') && context.__stream({}).includes('streamingMsg'), 'Chat renderer should build load-earlier and streaming placeholders.');
  assert(context.__incrementalLoad(4).includes('还有 4 条'), 'Chat renderer should build incremental load-earlier labels.');
  const loadBtn = { listeners: {}, addEventListener(type, handler) { this.listeners[type] = handler; } };
  context.__bindLoad(loadBtn, conv, container);
  loadBtn.listeners.click();
  assert(context.loaded.conv === conv && context.loaded.container === container, 'Chat renderer should bind load-earlier clicks to history loading.');
}

async function assertFrontendWorldBookEntryListFiltering() {
  const source = await readFile(new URL('../src/app/43-worldbook-entry-list-filter.js', import.meta.url), 'utf8');
  const context = {
    dom: { wiSearch: { value: '  kivotos  ' } },
    normalizeWIEntry: (entry) => entry,
    Object,
    Array,
    String,
  };

  vm.runInNewContext(`${source}\nthis.__filter = getCurrentWorldBookFilter;\nthis.__entries = getFilteredWorldInfoEntries;`, context);

  const wi = {
    entries: {
      low: { uid: 'low', key: ['academy'], keysecondary: [], comment: 'Kivotos note', order: 10 },
      high: { uid: 'high', key: ['Kivotos'], keysecondary: [], comment: '', order: 50 },
      secondary: { uid: 'secondary', key: [], keysecondary: ['Kivotos'], comment: '', order: 30 },
      other: { uid: 'other', key: ['Gehenna'], keysecondary: [], comment: '', order: 100 },
    },
  };

  assert(context.__filter() === 'kivotos', 'World book filter did not trim search text.');
  const filtered = context.__entries(wi, context.__filter());
  assert(filtered.map((entry) => entry.uid).join(',') === 'high,secondary,low', 'World book entries were not filtered and sorted by order.');
}

async function assertFrontendWorldBookEntryActionHelpers() {
  const source = await readFile(new URL('../src/app/43-worldbook-entry-action-helpers.js', import.meta.url), 'utf8');
  const events = [];
  const context = {
    dom: { wiSearch: { value: '  lore  ' } },
    wiState: {
      currentWorldBookId: 'wb1',
      viewMode: 'entries',
      selectedUid: 'e1',
      dirty: false,
    },
    state: {
      conversations: {
        c1: { worldBookIds: ['wb1', 'wb2'] },
        c2: { worldBookIds: ['wb1'] },
        c3: {},
      },
    },
    updateWIDirtyIndicator() { events.push('dirty'); },
    renderWIEntryList(filter) { events.push(`entries:${filter}`); },
    persistState(force) { events.push(`persist:${force}`); },
    updateStorageInfo() { events.push('storage'); },
    renderWorldInfoBadge() { events.push('badge'); },
    renderWorldBookList(filter) { events.push(`books:${filter}`); },
    updateWorldBookModalHeader() { events.push('header'); },
    JSON,
    Object,
    Array,
  };

  vm.runInNewContext(`${source}\nthis.__filter = getWIEntryActionFilter;\nthis.__mark = markWIEntryActionDirtyAndRender;\nthis.__copy = createDuplicateWIEntry;\nthis.__unlink = unlinkWorldBookFromConversations;\nthis.__reset = resetWorldBookSelectionAfterDelete;\nthis.__refresh = refreshWorldBookDeleteViews;`, context);

  assert(context.__filter() === 'lore', 'World book entry action helper should trim the search filter.');
  context.__mark();
  assert(context.wiState.dirty === true && events.includes('dirty') && events.includes('entries:lore'), 'World book entry action helper should mark dirty and render with the current filter.');

  const sourceEntry = { uid: 'old', comment: '', key: ['Kivotos'], nested: { value: 1 } };
  const copy = context.__copy(sourceEntry, 123);
  sourceEntry.nested.value = 2;
  assert(copy.uid === 123 && copy.comment === 'Entry (copy)' && copy.nested.value === 1, 'World book entry action helper should deep-copy duplicated entries.');

  context.__unlink('wb1');
  assert(context.state.conversations.c1.worldBookIds.join(',') === 'wb2' && context.state.conversations.c2.worldBookIds.length === 0, 'World book delete helper should unlink deleted books from conversations.');

  context.__reset('wb1');
  assert(context.wiState.currentWorldBookId === null && context.wiState.viewMode === 'books' && context.wiState.selectedUid === null, 'World book delete helper should reset selection for the deleted active book.');

  events.length = 0;
  context.__refresh();
  assert(events.join('|') === 'dirty|persist:true|storage|badge|books:lore|header', 'World book delete helper should refresh persistence, badge, list, and header views.');
}

async function assertFrontendWorldBookEntryListUIHelpers() {
  const sources = await Promise.all([
    '../src/app/43-worldbook-entry-list-navigation-ui.js',
    '../src/app/43-worldbook-entry-list-association-ui.js',
    '../src/app/43-worldbook-entry-list-delete-ui.js',
    '../src/app/43-worldbook-entry-list-header-ui.js',
    '../src/app/43-worldbook-entry-list-row-ui.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  function fakeElement() {
    const toggle = { listeners: {}, addEventListener(type, handler) { this.listeners[type] = handler; } };
    const del = { listeners: {}, addEventListener(type, handler) { this.listeners[type] = handler; } };
    const button = { listeners: {}, addEventListener(type, handler) { this.listeners[type] = handler; } };
    return {
      className: '',
      innerHTML: '',
      textContent: '',
      children: [],
      listeners: {},
      addEventListener(type, handler) { this.listeners[type] = handler; },
      appendChild(child) { this.children.push(child); },
      querySelector(selector) {
        if (selector === '.wi-list-toggle') return toggle;
        if (selector === '.wi-list-del') return del;
        if (selector === 'button') return button;
        return null;
      },
      _button: button,
    };
  }

  const emptyContainer = fakeElement();
  const events = [];
  const activeConv = { worldBookIds: ['wb1'] };
  const context = {
    dom: { wiEntryStats: { textContent: '' } },
    wiState: { selectedUid: 'e1', currentWorldBookId: 'wb1', viewMode: 'entries', dirty: false },
    document: { createElement: fakeElement },
    t: (key) => key,
    escapeHtml: (value) => String(value),
    getCurrentWorldBookFilter() { return 'filter'; },
    renderWIEntryList(filter) { events.push(`entries:${filter}`); },
    updateWorldBookModalHeader() { events.push('header'); },
    getActiveConv() { return activeConv; },
    updateWIDirtyIndicator() { events.push('dirty'); },
    persistState(force) { events.push(`persist:${force}`); },
    renderWorldInfoBadge() { events.push('badge'); },
    renderWorldBookList(filter) { events.push(`books:${filter}`); },
    deleteWorldBook(id) { events.push(`delete:${id}`); },
    String,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__header = appendWorldBookEntryListHeader;\nthis.__empty = renderWorldBookEntryListEmpty;\nthis.__row = createWorldBookEntryListRow;`, context);

  const headerContainer = fakeElement();
  context.__header(headerContainer);
  assert(headerContainer.children.length === 3, 'World book entry list header should append navigation, association, and delete rows.');
  headerContainer.children[0].listeners.click();
  assert(context.wiState.viewMode === 'books' && context.wiState.currentWorldBookId === null && events.includes('header'), 'World book header back row should return to the book list.');
  context.wiState.currentWorldBookId = 'wb1';
  headerContainer.children[1]._button.listeners.click();
  assert(activeConv.worldBookIds.length === 0 && events.includes('dirty') && events.includes('books:filter'), 'World book association row should unlink the active book and refresh views.');
  headerContainer.children[2]._button.listeners.click();
  assert(events.includes('delete:wb1'), 'World book delete row should delete the active book.');

  context.__empty(emptyContainer);
  assert(emptyContainer.children.length === 1 && context.dom.wiEntryStats.textContent === '0 world_book_entry', 'World book entry empty state should update list stats.');

  context.wiState.selectedUid = 'e1';
  const row = context.__row({ uid: 'e1', comment: 'Memo', key: ['Kivotos'], order: 7 }, { entries: { e1: {} } });
  assert(row.className.includes('bg-amber-500/10'), 'World book entry list row should mark the selected entry active.');
  assert(row.innerHTML.includes('&times;</button>'), 'World book entry delete button should render a valid close control.');
  assert(!row.innerHTML.includes('閴'), 'World book entry list row should not render mojibake button text.');
}

async function assertFrontendWorldBookEntryLiveHelpers() {
  const sources = await Promise.all([
    '../src/app/43-worldbook-entry-live-core.js',
    '../src/app/43-worldbook-entry-live-match.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  const entry = { uid: 'e1', extensions: {} };
  const context = {
    wiState: { selectedUid: 'e1' },
    getActiveWI() { return { entries: { e1: entry } }; },
    Object,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__entry = getSelectedWorldBookEntry;\nthis.__setPath = setWorldBookEntryPathValue;\nthis.__syncExt = syncWorldBookEntryExtensionField;\nthis.__matchExtKey = getWorldBookMatchExtensionKey;`, context);

  assert(context.__entry() === entry, 'World book live binding should resolve the selected entry.');
  context.__setPath(entry, 'characterFilter.isExclude', true);
  assert(entry.characterFilter.isExclude === true, 'World book live binding should write nested checkbox paths.');
  context.__syncExt(entry, 'position', 6);
  context.__syncExt(entry, 'role', 1);
  context.__syncExt(entry, 'comment', 'ignored');
  assert(entry.extensions.position === 6 && entry.extensions.role === 1 && entry.extensions.comment === undefined, 'World book live binding should sync supported extension fields only.');
  assert(context.__matchExtKey('matchCharacterDescription') === 'match_character_description', 'World book match extension keys should use snake_case.');
}

async function assertFrontendWorldBookEntryEditorHelpers() {
  const sources = await Promise.all([
    '../src/app/41-world-info-constants.js',
    '../src/app/43-worldbook-entry-editor-strategy-ui.js',
    '../src/app/43-worldbook-entry-editor-position-ui.js',
    '../src/app/43-worldbook-entry-editor-state.js',
    '../src/app/43-worldbook-entry-editor-header-ui.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  function classList() {
    const values = new Set();
    return {
      values,
      add(name) { values.add(name); },
      remove(name) { values.delete(name); },
      toggle(name, force) { if (force) values.add(name); else values.delete(name); },
    };
  }
  function button() {
    return {
      attrs: {},
      style: {},
      setAttribute(name, value) { this.attrs[name] = value; },
    };
  }

  const entry = { characterFilter: {} };
  const titleEl = { textContent: '' };
  const context = {
    dom: {
      wiStratConstant: button(),
      wiStratSelective: button(),
      wiDepthRow: { classList: classList() },
      wiOutletRow: { classList: classList() },
      wiNoSelection: { classList: classList() },
      wiEditorForm: { classList: classList() },
      wiCharNames: { value: ' Arona, Plana ' },
      wiCharTags: { value: ' ai, helper ' },
    },
    wiState: {
      selectedUid: 'e1',
      primaryKeys: ['old'],
      secondaryKeys: ['old2'],
      currentWorldBookId: 'wb1',
      dirty: false,
    },
    state: { worldBooks: { wb1: { name: 'Lore' } } },
    getActiveWI() { return { entries: { e1: entry } }; },
    document: { querySelector: () => titleEl },
    Set,
    parseInt,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__strategy = updateStrategyButtons;\nthis.__position = updatePositionConditionalRows;\nthis.__none = showNoSelection;\nthis.__update = updateEntryFromForm;\nthis.__header = updateWorldBookModalHeader;`, context);

  context.__strategy({ constant: true });
  assert(context.dom.wiStratConstant.attrs['data-active'] === 'true', 'World book strategy UI should mark constant active.');
  assert(context.dom.wiStratSelective.style.borderColor === '', 'World book strategy UI should clear inactive border.');

  context.__position(context.WI_POS.AT_DEPTH);
  assert(!context.dom.wiDepthRow.classList.values.has('hidden') && context.dom.wiOutletRow.classList.values.has('hidden'), 'World book position UI should show depth row only for AT_DEPTH.');

  context.__update();
  assert(entry.characterFilter.names.join(',') === 'Arona,Plana', 'World book editor should sync character filter names.');
  assert(entry.characterFilter.tags.join(',') === 'ai,helper' && context.wiState.dirty === true, 'World book editor should sync character filter tags and mark dirty.');

  context.__header();
  assert(titleEl.textContent === '世界书：Lore', 'World book editor header should show selected world book name.');

  context.__none();
  assert(context.wiState.selectedUid === null && context.wiState.primaryKeys.length === 0, 'World book no-selection state should clear selection and keys.');
}

async function assertFrontendWorldBookImportExportUIHelpers() {
  const sources = await Promise.all([
    '../src/app/43-worldbook-export-ui.js',
    '../src/app/43-worldbook-badge-ui.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  const badgeEl = { textContent: '', title: '' };
  const context = {
    dom: { wiEntryCount: badgeEl },
    state: {
      worldBooks: {
        wb1: { entries: { a: {}, b: {} } },
        wb2: { entries: { c: {} } },
      },
    },
    getActiveConv() {
      return { worldBookIds: ['wb1', 'wb2'], worldInfo: { entries: { legacy: {} } } };
    },
    t: (key) => key,
    String,
    Object,
    Array,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__name = sanitizeWorldInfoFileName;\nthis.__badge = renderWorldInfoBadge;\nthis.__suffix = buildWorldInfoBadgeSourceSuffix;`, context);

  assert(context.__name('Lore: A/B?') === 'Lore_A_B', 'World book export filename should replace unsafe characters.');
  assert(context.__name('') === 'world_info', 'World book export filename should keep a non-empty fallback.');

  context.__badge();
  assert(badgeEl.textContent === 4, 'World book badge should count linked and legacy entries.');
  assert(badgeEl.title.includes('\u6765\u81ea 2 \u4e2a\u4e16\u754c\u4e66'), 'World book badge title should describe multiple linked books.');
}

async function assertFrontendWorldBookGlobalListUIHelpers() {
  const sources = await Promise.all([
    '../src/app/43-worldbook-global-list-filter.js',
    '../src/app/43-worldbook-global-list-actions.js',
    '../src/app/43-worldbook-global-list-row-ui.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  function fakeButton() {
    return { addEventListener() {} };
  }
  function fakeElement() {
    return {
      className: '',
      innerHTML: '',
      textContent: '',
      children: [],
      addEventListener() {},
      appendChild(child) { this.children.push(child); },
      querySelector(selector) {
        if (selector === '.world-book-del-btn' || selector === '.world-book-unlink-btn') return fakeButton();
        return null;
      },
    };
  }

  const events = [];
  const currentConv = { worldBookIds: ['one', 'two'] };
  const context = {
    state: { worldBooks: {
      one: { id: 'one', name: 'Kivotos', entries: { a: {} } },
      two: { id: 'two', name: 'Gehenna', entries: {} },
    } },
    dom: { wiEntryStats: { textContent: '' }, wiBookName: { value: '' }, wiSearch: { value: '  lore  ' } },
    wiState: { currentWorldBookId: 'one', viewMode: 'books', selectedUid: 'old', dirty: false },
    document: { createElement: fakeElement },
    t: (key) => ({ world_book_entry: 'entry', world_book_linked: 'Linked', world_book_unlink: 'Unlink', world_book_delete_book: 'Delete', world_book_no_books_hint: 'No books' }[key] || key),
    escapeHtml: (value) => String(value),
    getActiveConv: () => currentConv,
    renderWIEntryList(filter) { events.push(`entries:${filter}`); },
    updateWorldBookModalHeader() { events.push('header'); },
    updateWIDirtyIndicator() { events.push('dirty'); },
    persistState(force) { events.push(`persist:${force}`); },
    renderWorldInfoBadge() { events.push('badge'); },
    renderWorldBookList(filter) { events.push(`books:${filter}`); },
    getCurrentWorldBookFilter: () => 'kiv',
    Object,
    String,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__filter = getFilteredWorldBookList;\nthis.__empty = renderWorldBookListEmpty;\nthis.__row = createWorldBookListRow;\nthis.__open = openWorldBookFromList;\nthis.__unlink = unlinkWorldBookFromCurrentConversation;`, context);

  assert(context.__filter('kiv').map((book) => book.id).join(',') === 'one', 'World book global list should filter by book name.');

  const emptyContainer = fakeElement();
  context.__empty(emptyContainer);
  assert(emptyContainer.children.length === 1 && context.dom.wiEntryStats.textContent === '0 entry', 'World book global list empty state should update stats.');

  const row = context.__row({ id: 'one', name: '', entries: { a: {} } }, ['one']);
  assert(row.className.includes('bg-amber-500/10'), 'World book global list row should mark the selected book active.');
  assert(row.innerHTML.includes('&times;</button>'), 'World book global delete button should render a valid close control.');
  assert(row.innerHTML.includes('Linked') && !row.innerHTML.includes('鏈'), 'World book global list row should render translated linked text without mojibake.');

  context.__open({ id: 'two', name: 'Gehenna' });
  assert(context.wiState.currentWorldBookId === 'two' && context.wiState.viewMode === 'entries' && context.wiState.selectedUid === null, 'World book global list open action should select the book and switch to entry mode.');
  assert(context.dom.wiBookName.value === 'Gehenna' && events.includes('entries:lore') && events.includes('header'), 'World book global list open action should refresh the editor view.');

  events.length = 0;
  context.__unlink('one');
  assert(currentConv.worldBookIds.join(',') === 'two' && context.wiState.dirty === true, 'World book global list unlink action should remove the book from the active conversation and mark dirty.');
  assert(events.join('|') === 'dirty|persist:true|badge|books:kiv', 'World book global list unlink action should refresh persistence, badge, and list state.');
}

async function assertFrontendFileProtocolOPFSSilence() {
  const opfsSources = await Promise.all([
    '../src/app/20-storage-opfs-location.js',
    '../src/app/20-storage-opfs-unsupported.js',
    '../src/app/20-storage-opfs-root.js',
    '../src/app/20-storage-opfs-probe.js',
    '../src/app/20-storage-opfs-environment.js',
    '../src/app/20-storage-opfs-read-write.js',
    '../src/app/20-storage-opfs-info.js',
    '../src/app/20-storage-opfs-clear.js',
    '../src/app/20-storage-opfs-io.js',
    '../src/app/20-storage-opfs.js',
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

async function assertFrontendStorageServiceSaveHelpers() {
  const source = await readFile(new URL('../src/app/20-storage-service-save-helpers.js', import.meta.url), 'utf8');
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

  vm.runInNewContext(`${source}\nthis.__empty = isDangerouslyEmptyStorageSnapshot;\nthis.__history = saveStorageServiceLocalHistorySnapshot;\nthis.__mirror = mirrorStorageServiceSnapshotToOPFS;\nthis.__tryIdb = trySaveStorageServiceIDBCanonical;\nthis.__markLocal = markStorageServiceLocalStorageCanonical;`, context);

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

async function assertFrontendStorageServiceLoadHelpers() {
  const sources = await Promise.all([
    '../src/app/20-storage-service-backend-sync.js',
    '../src/app/20-storage-service-load-candidates.js',
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
    '../src/app/20-storage-service-info-readers.js',
    '../src/app/20-storage-service-info-fallback.js',
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
    async getWebLLMUsedSize() { return 2048; },
    Blob,
    JSON,
    Object,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__webllm = readStorageServiceWebLLMUsage;\nthis.__app = readStorageServiceAppUsage;\nthis.__quota = readStorageServiceBrowserQuota;\nthis.__fallback = getStorageServiceFallbackInfo;`, context);

  assert(await context.__webllm() === 2048, 'Storage info reader should report WebLLM usage.');
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
    '../src/app/20-storage-service-helpers.js',
    '../src/app/20-storage-service-maintenance.js',
    '../src/app/20-storage-service-info-readers.js',
    '../src/app/20-storage-service-info-fallback.js',
    '../src/app/20-storage-service-info.js',
    '../src/app/20-storage-service-clear-backends.js',
    '../src/app/20-storage-service-clear.js',
    '../src/app/20-storage-service-backend-sync.js',
    '../src/app/20-storage-service-load-candidates.js',
    '../src/app/20-storage-service-load.js',
    '../src/app/20-storage-service-save-helpers.js',
    '../src/app/20-storage-service-save.js',
    '../src/app/20-storage-service-opfs-init.js',
    '../src/app/20-storage-service-init.js',
    '../src/app/20-storage-service-state.js',
    '../src/app/20-storage-service-helper-api.js',
    '../src/app/20-storage-service-local-api.js',
    '../src/app/20-storage-service-operations-api.js',
    '../src/app/20-storage-service-api.js',
    '../src/app/20-storage-service.js',
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

  const cleared = await service.clearAllData();
  const clearedSnapshot = JSON.parse(localStorageMock[context.STORAGE_KEY]);
  assert(cleared.opfs === true && cleared.ls === true, 'StorageService clearAllData should clear available backends and local snapshots.');
  assert(Object.keys(clearedSnapshot.conversations).length === 0 && clearedSnapshot.charactersMigrated === true, 'StorageService clearAllData should leave an empty recovery snapshot.');
}

async function assertFrontendStorageRecoveryScanner() {
  const sources = await Promise.all([
    '../src/app/23-storage-recovery-candidates.js',
    '../src/app/23-storage-recovery-backends.js',
    '../src/app/23-storage-recovery-scan.js',
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
    '../src/app/23-storage-legacy-idb-requests.js',
    '../src/app/23-storage-legacy-idb-snapshot.js',
    '../src/app/23-storage-legacy-idb.js',
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
    '../src/app/20-storage-idb-connection.js',
    '../src/app/20-storage-idb-helpers.js',
    '../src/app/20-storage-idb-operations.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  const context = {
    Date,
    Error,
    Promise,
    setTimeout,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__normalize = normalizeIDBStorageData;\nthis.__retry = withRetryIDBStorage;`, context);

  const normalized = context.__normalize({ data: { conversations: {} } });
  assert(normalized.conversations && Number.isFinite(normalized.lastSaved), 'IDB normalize should unwrap stored snapshot data and add lastSaved.');

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
}

async function assertFrontendStorageServiceFileProtocolStatus() {
  const sources = await Promise.all([
    '../src/app/20-storage-service-helpers.js',
    '../src/app/20-storage-service-maintenance.js',
    '../src/app/20-storage-service-info-readers.js',
    '../src/app/20-storage-service-info-fallback.js',
    '../src/app/20-storage-service-info.js',
    '../src/app/20-storage-service-clear-backends.js',
    '../src/app/20-storage-service-clear.js',
    '../src/app/20-storage-service-backend-sync.js',
    '../src/app/20-storage-service-load-candidates.js',
    '../src/app/20-storage-service-load.js',
    '../src/app/20-storage-service-save-helpers.js',
    '../src/app/20-storage-service-save.js',
    '../src/app/20-storage-service-opfs-init.js',
    '../src/app/20-storage-service-init.js',
    '../src/app/20-storage-service-state.js',
    '../src/app/20-storage-service-helper-api.js',
    '../src/app/20-storage-service-local-api.js',
    '../src/app/20-storage-service-operations-api.js',
    '../src/app/20-storage-service-api.js',
    '../src/app/20-storage-service.js',
    '../src/app/21-storage-opfs-status-text.js',
    '../src/app/21-storage-usage-format.js',
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

async function assertFrontendSettingsStorageClearHelpers() {
  const source = await readFile(new URL('../src/app/68-settings-storage-clear-helpers.js', import.meta.url), 'utf8');
  let storageInfoUpdated = 0;
  const elements = {
    storageUsage: { textContent: '' },
    storageUsageBar: { style: {} },
  };
  const context = {
    t: () => '',
    updateStorageInfo() {
      storageInfoUpdated += 1;
    },
    document: {
      getElementById(id) {
        return elements[id] || null;
      },
    },
  };

  vm.runInNewContext(`${source}\nthis.__style = getClearAllStorageButtonStyle;\nthis.__apply = applyClearAllStorageButtonState;\nthis.__clearConfig = getClearAllStorageConfirmConfig;\nthis.__webConfig = getClearWebLLMCacheConfirmConfig;\nthis.__renderCleared = renderStorageUsageClearedState;`, context);

  assert(context.__style('idb').background === 'rgba(239,68,68,0.15)', 'Storage clear helper should use danger styling for IndexedDB.');
  assert(context.__style('localStorage').color === '#fbbf24', 'Storage clear helper should use warning styling for fallback storage.');

  const btn = { style: {}, textContent: '' };
  context.__apply(btn, 'idb');
  assert(btn.style.display === 'flex' && btn.textContent.includes('OPFS'), 'Storage clear helper should show and label the clear button.');

  const clearConfig = context.__clearConfig();
  assert(clearConfig.options.danger === true && clearConfig.options.okText, 'Storage clear confirmation should be marked dangerous.');
  const webConfig = context.__webConfig();
  assert(webConfig.message.includes('WebLLM') && webConfig.options.okText, 'WebLLM clear confirmation should describe model cache deletion.');

  context.__renderCleared();
  assert(storageInfoUpdated === 1 && elements.storageUsage.textContent.includes('\u5df2\u6e05\u9664') && elements.storageUsageBar.style.width === '0%', 'Storage clear helper should refresh cleared usage UI.');
}

async function assertFrontendStorageStatusRenderHelpers() {
  const sources = await Promise.all([
    '../src/app/21-storage-opfs-status-text.js',
    '../src/app/21-storage-usage-format.js',
    '../src/app/21-storage-status-render.js',
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

  const title = context.__title({ backend: 'idb', used: 1048576, webllmUsed: 2097152, opfsAvailable: true, persisted: false }, 'idb');
  assert(title.includes('IndexedDB') && title.includes('1.0 MB') && title.includes('2.0 MB') && title.includes('非持久授权'), 'Storage status title should include backend, app usage, model cache, and persistence state.');

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

async function assertFrontendStateInitialization() {
  const sources = await Promise.all([
    '../src/app/34-state-init-helpers.js',
    '../src/app/34-state-init-normalize.js',
    '../src/app/34-state-init-load.js',
    '../src/app/34-state-init-settings.js',
    '../src/app/34-state-init-conversations.js',
    '../src/app/34-state-init.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  let persisted = false;
  let migratedCount = 0;
  const context = {
    state: {
      settings: {},
      conversations: {},
      conversationOrder: [],
      activeConvId: null,
      characters: {},
      worldBooks: {},
    },
    StorageService: {
      async loadAll() {
        return {
          settings: { lang: 'en', saveApiKey: false, apiKey: 'secret', summarizeApiKey: 'summary-secret', uiTheme: 'new-light' },
          conversations: {
            c1: { id: 'c1', messages: [{ role: 'user', content: 'hello' }] },
            c2: { id: 'c2', messages: [{ role: 'assistant', content: 'world' }] },
          },
          conversationOrder: ['missing', 'c2', 'c2'],
          activeConvId: 'missing',
          characters: { arona: { name: 'Arona' } },
          worldBooks: { wb1: { id: 'wb1', entries: [] } },
          charactersMigrated: 'false',
          lastSaved: 10,
        };
      },
      getBackend() { return 'idb'; },
      _hasUserData() { return true; },
    },
    loadAll() { return null; },
    defaultConversation() { return { id: 'default', messages: [] }; },
    migrateCharactersToRegistry() { migratedCount += 1; },
    persistState() { persisted = true; },
    normalizeUiTheme(value) { return value; },
    cacheUiTheme() {},
    applyUiTheme() {},
    applyPerformanceMode() {},
    DEFAULT_TWO_STAGE_PROMPT: 'two stage default',
    console: { log() {}, warn() {} },
    Object,
    Array,
    Set,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__initState = initState;`, context);
  await context.__initState();

  assert(context.state.settings.lang === 'en', 'initState did not restore settings.');
  assert(context.state.settings.apiKey === '', 'initState should clear API key when saveApiKey is false/defaulted.');
  assert(context.state.settings.summarizeApiKey === '', 'initState should clear summarize API key when saveApiKey is false/defaulted.');
  assert(context.state.settings.twoStageSystemPrompt === 'two stage default', 'initState did not apply two-stage prompt default.');
  assert(context.state.conversations.c1.messages[0].content === 'hello', 'initState did not restore conversations.');
  assert(context.state.conversationOrder.join(',') === 'c2,c1', 'initState should normalize restored conversation order.');
  assert(context.state.activeConvId === 'c2', 'initState did not recover active conversation from conversationOrder.');
  assert(context.state.characters.arona.name === 'Arona', 'initState did not restore character cards.');
  assert(context.state.worldBooks.wb1.id === 'wb1', 'initState did not restore world books.');
  assert(context.state._charactersMigrated === true, 'initState did not set character migration flag.');
  assert(migratedCount === 1, 'initState should treat string "false" migration metadata as not migrated.');
  assert(context.state._storageMigration.backend === 'idb', 'initState did not record storage backend.');
  assert(persisted === true, 'initState should persist first character migration when user data exists.');
}

async function assertFrontendAppInitHelpers() {
  const sources = await Promise.all([
    '../src/app/72-app-init-storage.js',
    '../src/app/72-app-init-ui.js',
    '../src/app/72-app-startup-runtime.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  function classList(initial = []) {
    const values = new Set(initial);
    return {
      values,
      add(name) { values.add(name); },
      remove(name) { values.delete(name); },
      contains(name) { return values.has(name); },
      toggle(name, force) { if (force) values.add(name); else values.delete(name); },
    };
  }
  function langButton(lang) {
    return {
      classList: classList(['text-zinc-400']),
      getAttribute(name) { return name === 'data-lang' ? lang : ''; },
    };
  }

  const events = [];
  const zhBtn = langButton('zh-CN');
  const enBtn = langButton('en');
  const visibleModal = { classList: classList() };
  const hiddenModal = { classList: classList(['hidden']) };
  const activeConv = {
    id: 'c1',
    character: { name: 'Arona', first_mes: 'Hello {{user}} from {{char}}' },
    messages: [],
  };
  const context = {
    state: {
      settings: { lang: 'en', apiKey: '', apiEndpoint: '', userName: 'Sensei' },
      conversations: {},
      conversationOrder: [],
      activeConvId: null,
    },
    dom: {
      messageInput: { placeholder: '', disabled: false },
      sendBtn: { disabled: false },
      settingsModal: hiddenModal,
      importModal: visibleModal,
      charEditorModal: hiddenModal,
      summaryManagerModal: hiddenModal,
      worldBookModal: hiddenModal,
    },
    document: {
      documentElement: { lang: '' },
      querySelectorAll(selector) { return selector === '.lang-btn' ? [zhBtn, enBtn] : []; },
    },
    window: {},
    StorageService: {
      async getStorageInfo() { return { used: 12 }; },
      getBackend() { return 'idb'; },
    },
    clearWebLLMCache() { events.push('clear-webllm'); },
    defaultConversation() { return { id: 'fallback', messages: [] }; },
    getActiveConv() { return activeConv; },
    replacePlaceholders(text, charName, userName) {
      return text.replace('{{char}}', charName).replace('{{user}}', userName);
    },
    persistState() { events.push('persist'); },
    renderAll() { events.push('render'); },
    isWebLLMBackend() { return false; },
    t: (key) => ({ input_placeholder_no_api: 'missing api' }[key] || key),
    shouldShowAnnouncement() { return true; },
    showAnnouncementModal() { events.push('announcement'); },
    updateStorageInfo() { events.push('storage-info'); },
    updateStorageStatusUI() { events.push('storage-status'); },
    cacheDom() { events.push('cache'); },
    bindEvents() { events.push('bind'); },
    showBackupReminderIfNeeded() { events.push('backup'); },
    setTimeout(fn) { fn(); },
    console: { log() {}, warn() {}, error() {} },
    Object,
    Date,
    Set,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__fallback = ensureFallbackConversation;\nthis.__lang = applyInitialLanguageState;\nthis.__input = updateStartupInputAvailability;\nthis.__first = migrateActiveConversationFirstMessage;\nthis.__modal = isAnyStartupModalOpen;\nthis.__announce = scheduleAnnouncementModal;\nthis.__debug = installAppDebugGlobals;\nthis.__storageStatus = refreshStartupStorageStatus;`, context);

  context.__fallback();
  assert(context.state.activeConvId === 'fallback' && context.state.conversationOrder[0] === 'fallback', 'App init fallback should create a default conversation.');

  context.__lang();
  assert(context.document.documentElement.lang === 'en', 'App init should apply document language.');
  assert(enBtn.classList.values.has('active') && zhBtn.classList.values.has('text-zinc-400'), 'App init should update language button state.');

  context.__input();
  assert(context.dom.messageInput.disabled === true && context.dom.sendBtn.disabled === true && context.dom.messageInput.placeholder === 'missing api', 'App init should disable remote chat input when API settings are missing.');

  assert(context.__first() === true && activeConv.messages[0].content === 'Hello Sensei from Arona', 'App init should migrate empty character conversations with first_mes.');
  assert(events.includes('persist') && events.includes('render'), 'App init first message migration should persist and render.');

  assert(context.__modal() === true, 'App init should detect open modals before showing announcement.');
  visibleModal.classList.add('hidden');
  context.__announce();
  assert(events.includes('announcement'), 'App init should show announcement when no modal is open.');

  context.__debug();
  const debugInfo = await context.window.debugStorage();
  assert(debugInfo.used === 12 && context.window.clearWebLLMCache === context.clearWebLLMCache, 'App init should install debug globals.');
  context.__storageStatus();
  assert(events.includes('storage-info'), 'App init should refresh storage info after startup.');
}

async function assertFrontendConversationImportHelpers() {
  const sources = await Promise.all([
    '../src/app/63-conversation-export-helpers.js',
    '../src/app/63-conversation-import-records.js',
    '../src/app/63-conversation-import-merge.js',
    '../src/app/63-conversation-import-helpers.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));
  let renderRequested = null;
  let persistCount = 0;
  const context = {
    state: {
      conversations: {
        existing: { id: 'existing', messages: [{ role: 'user', content: 'old' }] },
      },
      conversationOrder: ['existing'],
      activeConvId: null,
      characters: {},
      worldBooks: {},
      _charactersMigrated: true,
    },
    makeId: () => 'new-id',
    getSafeSettingsForPersist: () => ({ theme: 'dark' }),
    persistState: () => { persistCount += 1; },
    requestRender: (key) => { renderRequested = key; },
    updateStorageInfo() {},
    renderLibraryGrids() {},
    renderMyCards() {},
    t: (key) => ({
      import_conv_success: 'Imported ',
      import_conv_success_suffix: ' conversation(s).',
      import_conv_duplicate: ' duplicates',
    }[key] || key),
    JSON,
    Object,
    Array,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__exportRecords = getConversationExportRecords;\nthis.__singleExport = buildSingleConversationExportData;\nthis.__singleFilename = buildSingleConversationExportFilename;\nthis.__fullExport = buildAllConversationsExportData;\nthis.__fullFilename = buildAllConversationsExportFilename;\nthis.__records = getConversationImportRecords;\nthis.__import = importConversationRecords;\nthis.__apply = applySuccessfulConversationImport;\nthis.__message = buildConversationImportSuccessMessage;`, context);

  const data = {
    conversations: [
      { id: 'existing', messages: [{ role: 'user', content: 'new' }], character: { name: 'Arona' } },
      {
        id: 'group',
        messages: [{ role: 'assistant', content: 'group' }],
        group: { members: [{ character: { name: 'Plana' } }] },
      },
    ],
    characters: { top: { name: 'Top Card' } },
    worldBooks: { wb1: { id: 'wb1', entries: [{ content: 'Kivotos' }] } },
  };

  const records = context.__records(data);
  assert(records.length === 2, 'Conversation import records were not detected.');
  const result = context.__import(records);
  context.__apply(data, result);

  assert(result.imported === 2, 'Conversation import did not count imported conversations.');
  assert(result.skipped === 1, 'Conversation import did not count duplicated IDs.');
  assert(context.state.conversations['new-id'].messages[0].content === 'new', 'Duplicated conversation was not assigned a new ID.');
  assert(context.state.conversations.group.messages[0].content === 'group', 'Non-duplicated conversation was not imported.');
  assert(context.state.characters.top.name === 'Top Card', 'Top-level imported character card was not preserved.');
  assert(context.state.characters.arona.name === 'Arona', 'Single-chat character was not registered.');
  assert(context.state.characters.plana.name === 'Plana', 'Group member character was not registered.');
  assert(context.state.worldBooks.wb1.entries[0].content === 'Kivotos', 'World book was not imported.');
  assert(context.state.activeConvId === 'group', 'Import should select the first imported conversation when no active conversation exists.');
  assert(persistCount === 2, 'Successful import should persist before and after active conversation update.');
  assert(renderRequested === 'activeConvId', 'Successful import should request active conversation render.');
  assert(context.__message(2, 1).includes('duplicates'), 'Import success message should include duplicate count.');

  const singleExport = context.__singleExport(context.state.conversations.group, '2026-07-08T12:00:00.000Z');
  assert(singleExport.version === 1 && singleExport.conversations[0].id === 'group', 'Single conversation export should preserve the selected conversation.');
  assert(context.__singleFilename({ title: 'Chat/Name:*' }) === 'Chat_Name__.json', 'Single conversation export should sanitize filenames.');

  const orderedExports = context.__exportRecords();
  assert(orderedExports.map((conv) => conv.id).join(',') === 'group,new-id,existing', 'Conversation export records should follow conversation order.');

  const fullExport = context.__fullExport(orderedExports, '2026-07-08T12:00:00.000Z');
  assert(fullExport.version === 2 && fullExport.type === 'opentavern-full-export', 'Full conversation export should use the complete export format.');
  assert(fullExport.settings.theme === 'dark' && fullExport.charactersMigrated === true, 'Full conversation export should include safe settings and migration state.');
  assert(fullExport.characters.arona.name === 'Arona' && fullExport.worldBooks.wb1.id === 'wb1', 'Full conversation export should include character cards and world books.');
  assert(context.__fullFilename('2026-07-08T12:00:00.000Z') === 'opentavern_all_2026-07-08.json', 'Full conversation export filename should use the export date.');
}

async function main() {
  await assertFrontendCloudSnapshot();
  await assertFrontendAppDialogHelpers();
  await assertFrontendStateStoreDefaults();
  await assertFrontendStatePersistenceHelpers();
  await assertFrontendWebGLBackgroundHelpers();
  await assertFrontendCloudSnapshotApply();
  await assertFrontendCloudSyncCrypto();
  await assertFrontendCloudSyncTransport();
  await assertFrontendCloudSyncOperations();
  await assertFrontendCloudSyncScheduler();
  await assertFrontendSummaryService();
  await assertFrontendAutoSummarizationHelpers();
  await assertFrontendSummaryManagerHelpers();
  await assertFrontendSummaryHistoryUI();
  await assertFrontendPromptSummaryEvents();
  await assertFrontendSettingsEventBindings();
  await assertFrontendApiConnectionHelpers();
  await assertFrontendApiCompatibilityHelpers();
  await assertFrontendGenerationHelpers();
  await assertFrontendPromptMessageHelpers();
  await assertFrontendSecondStagePromptBuilder();
  await assertFrontendPromptBuilderContexts();
  await assertFrontendCharacterImportHelpers();
  await assertFrontendCharacterImportEventHelpers();
  await assertFrontendWorldInfoNormalizerHelpers();
  await assertFrontendWorldBookDefaults();
  await assertFrontendWorldBookFormatHelpers();
  await assertFrontendSettingsSaveHelpers();
  await assertFrontendSettingsHydrationHelpers();
  await assertFrontendPublicCardAssets();
  await assertFrontendLibraryCardFilterHelpers();
  await assertFrontendLibraryCardDisplayHelpers();
  await assertFrontendMyCardGridFiltering();
  await assertFrontendMyCardControlHelpers();
  await assertFrontendMyCardActionHelpers();
  await assertFrontendPublicCardGridFiltering();
  await assertFrontendDomCache();
  await assertFrontendPublicCardListUI();
  await assertFrontendLibraryPublicCardDetailModal();
  await assertFrontendI18nRuntime();
  await assertFrontendSillyTavernPresetNormalizer();
  await assertFrontendSillyTavernPresetSettingsRows();
  await assertFrontendNewChatPickerMultiSelection();
  await assertFrontendQuickNewChatModalHelpers();
  await assertFrontendNewChatWorkflowHelpers();
  await assertFrontendWorldBookActivation();
  await assertFrontendWorldBookActivationHelpers();
  await assertFrontendWorldBookMatchingHelpers();
  await assertFrontendWebLLMConfirmHelpers();
  await assertFrontendWebGPUDeviceHelpers();
  await assertFrontendWebLLMInitializationHelpers();
  await assertFrontendGroupChatCoreHelpers();
  await assertFrontendGroupMentionUI();
  await assertFrontendConversationModelHelpers();
  await assertFrontendComfyUIHelpers();
  await assertFrontendLibraryConversationHelpers();
  await assertFrontendLibraryViewHelpers();
  await assertFrontendMobileSidebarUI();
  await assertFrontendConversationListUI();
  await assertFrontendCharacterPanelUI();
  await assertFrontendCharacterEditorUI();
  await assertFrontendStateLifecycleHelpers();
  await assertFrontendMessageContentHelpers();
  await assertFrontendMessageEditHelpers();
  await assertFrontendMessageActionHelpers();
  await assertFrontendSendMessageHelpers();
  await assertFrontendChatTopBarUI();
  await assertFrontendChatMessageRendererHelpers();
  await assertFrontendWorldBookEntryActionHelpers();
  await assertFrontendWorldBookEntryListFiltering();
  await assertFrontendWorldBookEntryListUIHelpers();
  await assertFrontendWorldBookEntryLiveHelpers();
  await assertFrontendWorldBookEntryEditorHelpers();
  await assertFrontendWorldBookImportExportUIHelpers();
  await assertFrontendWorldBookGlobalListUIHelpers();
  await assertFrontendFileProtocolOPFSSilence();
  await assertFrontendIDBStorageHelpers();
  await assertFrontendStorageServiceLoadHelpers();
  await assertFrontendStorageServiceSaveHelpers();
  await assertFrontendStorageServiceInfoHelpers();
  await assertFrontendStorageServicePipeline();
  await assertFrontendStorageRecoveryScanner();
  await assertFrontendLegacyIDBRecoveryReader();
  await assertFrontendStorageServiceFileProtocolStatus();
  await assertFrontendSettingsStorageClearHelpers();
  await assertFrontendStorageStatusRenderHelpers();
  await assertFrontendStateInitialization();
  await assertFrontendAppInitHelpers();
  await assertFrontendConversationImportHelpers();

  const { db, store } = createMockD1();
  const env = { SYNC_DB: db };
  const tokenA = 'test-token-alpha';
  const tokenB = 'test-token-bravo';
  const snapshot = {
    settings: {
      model: 'demo-model',
      lang: 'zh-CN',
      summaryEnabled: true,
      cloudSyncToken: 'frontend-should-strip-before-upload',
    },
    conversations: {
      c1: {
        id: 'c1',
        title: 'Cloud sync chat',
        messages: [
          { role: 'user', content: 'hello' },
          { role: 'assistant', content: 'world', speaker: 'Arona' },
        ],
        summaries: [{ id: 's1', text: 'short summary' }],
      },
    },
    conversationOrder: ['c1'],
    activeConvId: 'c1',
    characters: {
      arona: {
        id: 'arona',
        name: 'Arona',
        description: 'Student council AI',
        first_mes: 'Sensei!',
        tags: ['blue-archive'],
      },
    },
    worldBooks: {
      wb1: {
        id: 'wb1',
        name: 'World',
        entries: [{ id: 'e1', key: ['academy'], content: 'Kivotos' }],
      },
    },
    lastSaved: 123,
  };

  const unauthorized = await onRequest({ request: request('GET'), env });
  assert(unauthorized.status === 401, 'Expected missing-token request to be unauthorized.');

  const post = await onRequest({ request: request('POST', tokenA, { data: snapshot }), env });
  await assertOk(post, 'POST');
  const postJson = await readJson(post);
  assert(postJson.success && postJson.updatedAt, 'POST response missing success metadata.');

  const badArraySnapshot = await onRequest({
    request: request('POST', 'test-token-array', { data: [] }),
    env,
  });
  assert(badArraySnapshot.status === 400, 'Array sync payloads should be rejected.');

  const getA = await onRequest({ request: request('GET', tokenA), env });
  await assertOk(getA, 'GET A');
  const getAJson = await readJson(getA);
  assert(getAJson.data.settings.model === 'demo-model', 'Settings were not restored.');
  assert(getAJson.data.settings.lang === 'zh-CN', 'Settings language was not restored.');
  assert(getAJson.data.conversations.c1, 'Conversation was not restored.');
  assert(getAJson.data.conversations.c1.messages[0].content === 'hello', 'Chat user message was not restored.');
  assert(getAJson.data.conversations.c1.messages[1].speaker === 'Arona', 'Chat speaker metadata was not restored.');
  assert(getAJson.data.conversations.c1.summaries[0].text === 'short summary', 'Chat summary was not restored.');
  assert(getAJson.data.conversationOrder[0] === 'c1', 'Conversation order was not restored.');
  assert(getAJson.data.activeConvId === 'c1', 'Active conversation id was not restored.');
  assert(getAJson.data.characters.arona, 'Character card was not restored.');
  assert(getAJson.data.characters.arona.first_mes === 'Sensei!', 'Character card first message was not restored.');
  assert(getAJson.data.characters.arona.tags.includes('blue-archive'), 'Character card tags were not restored.');
  assert(getAJson.data.worldBooks.wb1, 'World book was not restored.');
  assert(getAJson.data.worldBooks.wb1.entries[0].content === 'Kivotos', 'World book entry was not restored.');

  const getB = await onRequest({ request: request('GET', tokenB), env });
  await assertOk(getB, 'GET B');
  const getBJson = await readJson(getB);
  assert(getBJson.data === null, 'Different tokens must not share snapshots.');

  const partialToken = 'test-token-partial';
  const partialPost = await onRequest({
    request: request('POST', partialToken, {
      data: {
        settings: { model: 'partial-model' },
        conversations: {
          c2: { id: 'c2', messages: [] },
          c1: { id: 'c1', messages: [] },
        },
        conversationOrder: ['missing', 'c2', 'c2'],
        activeConvId: 'missing',
        characters: null,
        worldBooks: [],
        charactersMigrated: 'yes',
        lastSaved: 'not-a-number',
      },
    }),
    env,
  });
  await assertOk(partialPost, 'partial POST');
  const partialGet = await onRequest({ request: request('GET', partialToken), env });
  await assertOk(partialGet, 'partial GET');
  const partialJson = await readJson(partialGet);
  assert(partialJson.data.settings.model === 'partial-model', 'Partial settings were not preserved.');
  assert(partialJson.data.conversations && typeof partialJson.data.conversations === 'object' && !Array.isArray(partialJson.data.conversations), 'Conversations should normalize to an object map.');
  assert(partialJson.data.characters && typeof partialJson.data.characters === 'object' && !Array.isArray(partialJson.data.characters), 'Character cards should normalize to an object map.');
  assert(partialJson.data.worldBooks && typeof partialJson.data.worldBooks === 'object' && !Array.isArray(partialJson.data.worldBooks), 'World books should normalize to an object map.');
  assert(partialJson.data.conversationOrder.join(',') === 'c2,c1', 'Dirty conversation order should normalize to existing unique ids.');
  assert(partialJson.data.activeConvId === 'c2', 'Invalid active conversation should fall back to the first valid ordered conversation.');
  assert(partialJson.data.charactersMigrated === true, 'Character migration metadata should normalize to a boolean.');
  assert(Number.isFinite(partialJson.data.lastSaved), 'Invalid lastSaved should normalize to a timestamp.');

  const corruptToken = 'test-token-corrupt';
  const corruptPost = await onRequest({
    request: request('POST', corruptToken, { data: { settings: { model: 'corrupt-model' } } }),
    env,
  });
  await assertOk(corruptPost, 'corrupt seed POST');
  const corruptRow = Array.from(store.values()).find((row) => row.data.includes('corrupt-model'));
  corruptRow.data = '{not-json';
  const corruptGet = await onRequest({ request: request('GET', corruptToken), env });
  const corruptJson = await readJson(corruptGet);
  assert(corruptGet.status === 500 && corruptJson.success === false, 'Corrupt stored sync snapshots should return a structured error.');

  const falseMigratedToken = 'test-token-false-migrated';
  const falseMigratedPost = await onRequest({
    request: request('POST', falseMigratedToken, {
      data: {
        settings: { model: 'false-migrated-model' },
        conversations: { c1: { id: 'c1', messages: [] } },
        conversationOrder: ['c1'],
        activeConvId: 'c1',
        charactersMigrated: 'false',
      },
    }),
    env,
  });
  await assertOk(falseMigratedPost, 'false migrated POST');
  const falseMigratedGet = await onRequest({ request: request('GET', falseMigratedToken), env });
  await assertOk(falseMigratedGet, 'false migrated GET');
  const falseMigratedJson = await readJson(falseMigratedGet);
  assert(falseMigratedJson.data.charactersMigrated === false, 'String false migration metadata should normalize to false.');

  const badEncrypted = await onRequest({
    request: request('POST', tokenB, { encrypted: true, data: { encrypted: true, payload: 'missing-metadata' } }),
    env,
  });
  assert(badEncrypted.status === 400, 'Invalid encrypted payload should return 400.');

  const badEncryptedEnvelope = await onRequest({
    request: request('POST', tokenB, {
      encrypted: true,
      data: { encrypted: true, payload: [], iv: 'aXY=', salt: 'c2FsdA==', iterations: 210000 },
    }),
    env,
  });
  assert(badEncryptedEnvelope.status === 400, 'Encrypted payload metadata must be non-empty strings.');

  const badEncryptedIterations = await onRequest({
    request: request('POST', tokenB, {
      encrypted: true,
      data: { encrypted: true, algorithm: 'AES-GCM', payload: 'Y2lwaGVy', iv: 'aXY=', salt: 'c2FsdA==', iterations: 0 },
    }),
    env,
  });
  assert(badEncryptedIterations.status === 400, 'Encrypted payload iterations must reject explicit invalid values.');

  const encryptedEnvelope = {
    encrypted: true,
    version: 1,
    algorithm: 'AES-GCM',
    kdf: 'PBKDF2-SHA256',
    iterations: 210000,
    salt: 'c2FsdA==',
    iv: 'aXY=',
    payload: 'Y2lwaGVydGV4dA==',
    lastSaved: 456,
  };
  const postEncrypted = await onRequest({
    request: request('POST', tokenB, { encrypted: true, data: encryptedEnvelope }),
    env,
  });
  await assertOk(postEncrypted, 'encrypted POST');

  const getEncrypted = await onRequest({ request: request('GET', tokenB), env });
  await assertOk(getEncrypted, 'encrypted GET');
  const getEncryptedJson = await readJson(getEncrypted);
  assert(getEncryptedJson.data.encrypted === true, 'Encrypted envelope flag was not preserved.');
  assert(getEncryptedJson.data.payload === encryptedEnvelope.payload, 'Encrypted payload was not preserved.');

  console.log('frontend and sync function tests passed');
}

await main();
