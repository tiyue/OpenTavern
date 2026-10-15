import { assert, messageIdentitySource } from '../support.mjs';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';


async function assertFrontendSettingsEventBindings() {
  const sources = await Promise.all([
    '../../../src/app/events/71-event-settings-slider-bindings.js',
    '../../../src/app/events/71-event-settings-modal-bindings.js',
    '../../../src/app/events/71-event-settings-integration-bindings.js',
    '../../../src/app/events/71-event-settings-bindings.js',
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
  const footerControls = { settingsDoneBtn: el(), settingsDiscardBtn: el() };
  const dom = {
    sidebarSettingsBtn: el(),
    topSettingsBtn: el(),
    settingsCloseBtn: el(),
    settingsBackdrop: el(),
    stPresetImportBtn: el(),
    stPresetImportFile: el(),
    stPresetExportBtn: el(),
    stPresetDeleteBtn: el(),
    imageGenerationEnabled: el(),
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
    document: { getElementById: id => footerControls[id] },
    state: { settings: {} },
    settingsFormDraft: null,
    getSettingsFormTarget() { return context.state.settings; },
    openSettings() { events.push('open'); },
    closeSettings() { events.push('close'); },
    discardSettingsDraft() { events.push('discard'); },
    bindSettingsTabs() { events.push('bind-tabs'); },
    bindReadingAppearanceEvents() { events.push('bind-reading'); },
    bindInterfaceBehaviorSettingsEvents() { events.push('bind-interface'); },
    formatStreamIdleTimeoutLabel(value) { return String(value); },
    importSillyTavernPresetFile(file) { events.push(`st:${file.name}`); },
    exportSillyTavernPreset() { events.push('st-export'); },
    deleteSillyTavernPreset() { events.push('st-delete'); },
    updateInputState() { events.push('input-state'); },
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
  footerControls.settingsDoneBtn.listeners.click();
  footerControls.settingsDiscardBtn.listeners.click();
  assert(events.includes('bind-reading') && events.includes('discard') && events.filter(event => event === 'close').length === 3, 'Settings should bind reading controls and distinct done/discard actions.');

  dom.stPresetImportBtn.listeners.click();
  dom.stPresetImportFile.listeners.change({ target: { files: [{ name: 'preset.json' }] } });
  dom.stPresetExportBtn.listeners.click();
  dom.stPresetDeleteBtn.listeners.click();
  dom.imageGenerationEnabled.checked = true;
  dom.imageGenerationEnabled.listeners.change();
  assert(dom.stPresetImportFile.clicked === true, 'Settings integration events should trigger the preset file input.');
  assert(events.includes('st:preset.json') && events.includes('st-export') && events.includes('st-delete'), 'Settings integration events should bind preset controls.');
  assert(context.state.settings.imageGenerationEnabled === true && events.includes('input-state'), 'Settings integration events should apply the Qwen image enabled state.');

  dom.contextLength.listeners.input.call(dom.contextLength);
  dom.summaryThreshold.listeners.input.call(dom.summaryThreshold);
  dom.summaryEnabled.checked = true;
  dom.summaryEnabled.listeners.change.call(dom.summaryEnabled);
  dom.summarizeUseMainAPI.listeners.change();
  assert(dom.contextLenVal.textContent === '32' && String(dom.summaryThresholdVal.textContent) === '18', 'Settings slider events should update displayed values.');
  assert(context.state.settings.summaryThreshold === 18 && context.state.settings.summaryEnabled === true, 'Settings summary controls should update state.');
  assert(events.includes('toggle-summary-api') && events.includes('summary-warning'), 'Settings summary controls should refresh dependent UI.');
}

async function assertFrontendMessageOptionInteractions() {
  const source = await readFile(new URL('../../../src/app/events/71-event-message-option-bindings.js', import.meta.url), 'utf8');
  const events = [];
  let clickHandler = null;

  function createOption(title, description) {
    const attributes = {
      'data-option-title': title,
      'data-option-description': description,
      'aria-pressed': 'false',
    };
    return {
      getAttribute(name) { return attributes[name] || null; },
      setAttribute(name, value) { attributes[name] = String(value); },
    };
  }

  const first = createOption('继续深入', '继续探索当前剧情。');
  const second = createOption('拥入怀中', '用拥抱回应角色。');
  const options = [first, second];
  const container = {
    querySelectorAll(selector) {
      assert(selector === '.message-option-choice[aria-pressed="true"]', 'Message option selection should query only selected option cards.');
      return options.filter((option) => option.getAttribute('aria-pressed') === 'true');
    },
    addEventListener(type, handler) {
      assert(type === 'click', 'Message option binding should use delegated click handling.');
      clickHandler = handler;
    },
  };
  const messageInput = {
    value: '',
    disabled: false,
    dispatchEvent(event) { events.push(`input:${event.type}`); },
  };
  const context = {
    state: { isGenerating: false },
    dom: { messagesContainer: container, messageInput },
    sendMessage() { events.push(`send:${messageInput.value}`); },
    Event: function Event(type) { this.type = type; },
    Array,
    String,
  };

  vm.runInNewContext(`${source}\nthis.__activate = activateMessageOption;\nthis.__bind = bindMessageOptionEvents;`, context);

  assert(context.__activate(first, container) === 'selected', 'First message option click should select without sending.');
  assert(first.getAttribute('aria-pressed') === 'true' && messageInput.value === '继续深入\n\n继续探索当前剧情。', 'First message option click should fill the composer with both the title and description.');
  assert(!events.some((event) => event.startsWith('send:')), 'First message option click must not send a message.');

  assert(context.__activate(second, container) === 'selected', 'Clicking another message option should switch the selection.');
  assert(first.getAttribute('aria-pressed') === 'false' && second.getAttribute('aria-pressed') === 'true' && messageInput.value === '拥入怀中\n\n用拥抱回应角色。', 'Switching message options should replace the composer with the selected title and description.');

  assert(context.__activate(second, container) === 'sent', 'Clicking the selected message option again should send it.');
  assert(events.includes('send:拥入怀中\n\n用拥抱回应角色。'), 'Second click should send the selected option title and description through the normal composer flow.');

  context.__bind();
  assert(typeof clickHandler === 'function', 'Message option click delegation should be bound to the message container.');
  first.setAttribute('aria-pressed', 'false');
  clickHandler({ target: { closest: () => first } });
  assert(first.getAttribute('aria-pressed') === 'true', 'Delegated message option clicks should activate the matching option card.');

  context.state.isGenerating = true;
  assert(context.__activate(first, container) === 'blocked', 'Message options should not send while generation is active.');
}

async function assertFrontendSendMessageHelpers() {
  const source = await readFile(new URL('../../../src/app/events/70-send-message-helpers.js', import.meta.url), 'utf8');
  const events = [];
  const context = {
    pendingGroupMention: null,
    dom: { messageInput: { value: 'draft', style: { height: '42px' } } },
    makeId: () => 'user-id',
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

  vm.runInNewContext(`${messageIdentitySource}\n${source}\nthis.__append = appendUserMessageToConversation;\nthis.__speaker = prepareGroupSpeakerForUserMessage;\nthis.__reset = resetMessageComposerInput;`, context);

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
export { assertFrontendSettingsEventBindings, assertFrontendMessageOptionInteractions, assertFrontendSendMessageHelpers };
