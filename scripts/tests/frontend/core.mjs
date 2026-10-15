import { assert, responseVersionsSource } from '../support.mjs';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';


async function assertFrontendAppDialogHelpers() {
  const sources = await Promise.all([
    '../../../src/app/core/11-app-dialog-native.js',
    '../../../src/app/core/11-app-dialog-dom.js',
    '../../../src/app/core/11-app-dialog-events.js',
    '../../../src/app/core/11-app-dialog.js',
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

async function assertFrontendDomCache() {
  const sources = await Promise.all([
    '../../../src/app/core/60-dom-cache-ids.js',
    '../../../src/app/core/60-dom-cache.js',
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

async function assertFrontendI18nRuntime() {
  const sources = await Promise.all([
    '../../../src/app/core/12-i18n-core.js',
    '../../../src/app/core/12-i18n-zh-cn.js',
    '../../../src/app/core/12-i18n-zh-tw.js',
    '../../../src/app/core/12-i18n-en.js',
    '../../../src/app/core/12-i18n-runtime.js',
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

async function assertFrontendMobileSidebarUI() {
  const source = await readFile(new URL('../../../src/app/core/65-mobile-sidebar-ui.js', import.meta.url), 'utf8');

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

async function assertFrontendStateLifecycleHelpers() {
  const sources = await Promise.all([
    '../../../src/app/core/33-render-shortcuts.js',
    '../../../src/app/core/33-final-assistant-message-ui.js',
    '../../../src/app/core/33-render-subscriptions.js',
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
    getMessageSpeakerCharacter() { return { name: 'Arona' }; },
    renderAssistantSenderHtml(name) { return '<p>' + name + '</p>'; },
    renderMsgTokenMeta() { return ''; },
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

  vm.runInNewContext(`${responseVersionsSource}\n${sources.join('\n')}\nthis.__full = requestFullRender;\nthis.__render = requestRender;\nthis.__append = appendFinalAssistantMessage;\nthis.__html = buildFinalAssistantMessageHtml;`, context);

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
  await Promise.resolve();
  assert(events.includes('character') && events.includes('input'), 'Render subscriptions should call handlers for changed keys.');
}
export { assertFrontendAppDialogHelpers, assertFrontendDomCache, assertFrontendI18nRuntime, assertFrontendMobileSidebarUI, assertFrontendStateLifecycleHelpers };
