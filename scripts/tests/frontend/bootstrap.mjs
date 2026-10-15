import { createConversationSaveAckHarness, summaryValiditySource, mutationPersistenceSource, assert } from '../support.mjs';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';


async function assertFrontendAppInitHelpers() {
  const sources = await Promise.all([
    '../../../src/app/bootstrap/72-app-init-storage.js',
    '../../../src/app/bootstrap/72-app-init-ui.js',
    '../../../src/app/conversation/32-message-identity.js',
    '../../../src/app/conversation/59-new-chat-first-message.js',
    '../../../src/app/bootstrap/72-app-startup-runtime.js',
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
    defaultConversation() { return { id: 'fallback', messages: [] }; },
    getActiveConv() { return context.state.conversations[context.state.activeConvId]; },
    makeId: () => 'startup-first-message',
    replacePlaceholders(text, charName, userName) {
      return text.replace('{{char}}', charName).replace('{{user}}', userName);
    },
    reportPersistPostSaveError(label) { events.push('error:' + label); },
    renderAll() { events.push('render'); },
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
  const pending = createConversationSaveAckHarness(context, events);

  vm.runInNewContext(`${sources.join('\n')}\n${summaryValiditySource}\n${mutationPersistenceSource}\nthis.__fallback = ensureFallbackConversation;\nthis.__lang = applyInitialLanguageState;\nthis.__input = updateStartupInputAvailability;\nthis.__first = migrateActiveConversationFirstMessage;\nthis.__modal = isAnyStartupModalOpen;\nthis.__announce = scheduleAnnouncementModal;\nthis.__debug = installAppDebugGlobals;\nthis.__storageStatus = refreshStartupStorageStatus;`, context);

  context.__fallback();
  assert(context.state.activeConvId === 'fallback' && context.state.conversationOrder[0] === 'fallback', 'App init fallback should create a default conversation.');

  context.__lang();
  assert(context.document.documentElement.lang === 'en', 'App init should apply document language.');
  assert(enBtn.classList.values.has('active') && zhBtn.classList.values.has('text-zinc-400'), 'App init should update language button state.');

  context.__input();
  assert(context.dom.messageInput.disabled === true && context.dom.sendBtn.disabled === true && context.dom.messageInput.placeholder === 'missing api', 'App init should disable remote chat input when API settings are missing.');

  context.state.conversations.c1 = activeConv;
  context.state.conversationOrder.push('c1');
  context.state.activeConvId = 'c1';
  const beforeMigration = JSON.stringify(context.state);
  const migrating = context.__first();
  assert(pending.length === 1 && JSON.stringify(context.state) === beforeMigration && !events.includes('render'), 'App init first-message migration must keep live history unchanged and defer rendering until ACK.');
  const preparedMessage = pending[0].snapshot.conversations.c1.messages[0];
  assert(preparedMessage.content === 'Hello Sensei from Arona' && preparedMessage.id && preparedMessage.revision, 'App init should persist a candidate first message with stable identity.');
  pending[0].acknowledge();
  assert(await migrating === true && activeConv.messages[0].content === 'Hello Sensei from Arona', 'App init should migrate empty character conversations with first_mes.');
  assert(events.includes('persist') && events.includes('render'), 'App init first message migration should persist and render.');
  assert(await context.__first() === false && pending.length === 1, 'App init first-message migration should leave existing history unchanged.');

  const failedConv = { id: 'failed-startup', character: { name: 'Plana', first_mes: 'Unsaved greeting' }, messages: [] };
  context.state.conversations[failedConv.id] = failedConv;
  context.state.conversationOrder.push(failedConv.id);
  context.state.activeConvId = failedConv.id;
  const beforeFailure = JSON.stringify(context.state);
  const renderCount = events.filter((event) => event === 'render').length;
  const failing = context.__first();
  assert(pending.length === 2 && JSON.stringify(context.state) === beforeFailure, 'A pending startup migration must keep its empty live conversation intact.');
  pending[1].fail();
  assert(await failing === false && JSON.stringify(context.state) === beforeFailure && failedConv.messages.length === 0, 'App init should return false and preserve empty history when first-message persistence fails.');
  assert(events.includes('error:first message migration') && events.filter((event) => event === 'render').length === renderCount, 'Failed startup migration should report the error without rendering success.');

  assert(context.__modal() === true, 'App init should detect open modals before showing announcement.');
  visibleModal.classList.add('hidden');
  context.__announce();
  assert(events.includes('announcement'), 'App init should show announcement when no modal is open.');

  context.__debug();
  const debugInfo = await context.window.debugStorage();
  assert(debugInfo.used === 12, 'App init should install debug globals.');
  context.__storageStatus();
  assert(events.includes('storage-info'), 'App init should refresh storage info after startup.');
}
export { assertFrontendAppInitHelpers };
