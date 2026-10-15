import { createConversationSaveAckHarness, assert, waitForTestCondition, messageIdentitySource, summaryValiditySource } from '../support.mjs';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';


async function assertFrontendCharacterImportEventHelpers() {
  const sources = await Promise.all([
    '../../../src/app/conversation/19-conversation-order-helpers.js',
    '../../../src/app/conversation/59-new-chat-first-message.js',
    '../../../src/app/conversation/59-new-chat-finalize.js',
    '../../../src/app/character/66-character-import-conversation.js',
    '../../../src/app/conversation/32-message-identity.js',
    '../../../src/app/character/66-character-import-status-ui.js',
    '../../../src/app/character/66-character-import-events.js',
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
    return { classList: classList(), listeners: {}, addEventListener(type, listener) { this.listeners[type] = listener; } };
  }

  const events = [];
  let nextId = 0;
  const oldConv = {
    id: 'old',
    messages: [{ role: 'user', content: 'hi' }],
    worldInfo: { entries: { a: {} } },
    worldBookIds: ['wb1'],
  };
  const status = { classList: classList(), textContent: '', className: '' };
  const importModal = { classList: classList() };
  const context = {
    state: {
      settings: { userName: 'Sensei' },
      conversations: { old: oldConv },
      conversationOrder: ['old'],
      activeConvId: 'old',
      characters: {},
      worldBooks: {},
    },
    currentCharacterName: null,
    dom: {
      importStatus: status,
      importModal,
      importFileInput: Object.assign(element(), { value: 'file.png' }),
      importCloseBtn: element(),
      importBackdrop: element(),
    },
    getActiveConv() { return context.state.conversations[context.state.activeConvId]; },
    saveCurrentConversation() { events.push('save-current'); },
    defaultConversation() { return { id: 'new-' + (++nextId), messages: [] }; },
    makeId() { return 'id-' + (++nextId); },
    getEmbeddedCharacterBook(json) { return json.character_book || null; },
    normalizeImportedWorldInfo(book) { return JSON.parse(JSON.stringify(book)); },
    getImportedCharacterBookName(book, name) { return book.name || name; },
    sanitizeCloudSyncSignatureConversation(conv) { return JSON.parse(JSON.stringify(conv)); },
    normalizeConversation(conv) { context.normalizeConversationMessageIdentity(conv); },
    async readCharacterImportFile() { return { json: { name: 'Plana', first_mes: 'Hi {{user}}', character_book: { name: 'Plana lore', entries: { e1: { content: 'lore' } } } } }; },
    importCharacterCard(json) { return { name: json.name, first_mes: json.first_mes }; },
    renderLibraryGrids() { events.push('library'); },
    renderAll() { events.push('render'); },
    reportPersistPostSaveError(label) { events.push('error:' + label); },
    setTimeout() {},
    replacePlaceholders(text, charName, userName) { return text.replace('{{char}}', charName).replace('{{user}}', userName); },
    t: (key) => ({ chat_with: 'Chat with ', import_success: 'Loaded: ' }[key] || key),
    JSON,
    Object,
    Set,
    console,
  };
  const pending = createConversationSaveAckHarness(context, events);

  vm.runInNewContext(`${sources.join('\n')}\nthis.__prepare = prepareConversationForImportedCharacter;\nthis.__apply = applyImportedCharacterToConversation;\nthis.__book = attachEmbeddedCharacterBook;\nthis.__register = registerCharacterImportReplacingExisting;\nthis.__first = addImportedCharacterFirstMessage;\nthis.__status = setCharacterImportStatus;\nthis.__success = buildCharacterImportSuccessText;\nthis.__hide = hideCharacterImportModal;\nthis.__reset = resetCharacterImportFileInput;\nthis.__bind = bindCharacterImportModalEvents;`, context);

  const originalState = JSON.stringify(context.state);
  const conv = context.__prepare();
  assert(conv.id.startsWith('new-') && conv.worldBookIds[0] === 'wb1', 'Character import should start a new conversation candidate when the current one has messages and preserve world books.');
  assert(JSON.stringify(context.state) === originalState && !events.includes('save-current'), 'Character import preparation must leave live conversations and persistence untouched.');
  assert(conv.worldInfo !== oldConv.worldInfo && conv.worldBookIds !== oldConv.worldBookIds, 'Character import candidates must own copies of inherited world books.');

  const character = { name: 'Arona', first_mes: 'Hello {{user}}, I am {{char}}' };
  context.__apply(conv, character);
  const embeddedBook = context.__book({ character_book: { name: 'Embedded lore', entries: { e1: {}, e2: {} } } }, character, conv);
  assert(embeddedBook && Object.keys(context.state.worldBooks).length === 0, 'Embedded books should be built for candidates without early library registration.');
  context.__register(character);
  context.__first(conv, character);
  assert(conv.title === 'Chat with Arona' && conv.messages[0].content === 'Hello Sensei, I am Arona', 'Character import should apply character metadata and first message.');
  assert(conv.worldBookIds.includes(embeddedBook.id) && context.state.characters.arona.name === 'Arona', 'Character import should link embedded books and register the character.');
  assert(context.state.characters.arona !== character && conv.messages[0].id && conv.messages[0].revision, 'Character import registration should clone the card and first messages should have stable identities.');
  const beforeReplacement = context.state.characters.arona;
  const replacementCharacter = { name: ' Arona ', description: 'replacement', extensions: { kept: true } };
  context.__register(replacementCharacter);
  assert(context.state.characters.arona.description === 'replacement' && context.state.characters.arona.extensions.kept === true, 'Character import registration should replace a same-ID card while preserving imported metadata.');
  assert(context.state.characters.arona !== beforeReplacement && context.state.characters.arona !== replacementCharacter, 'Character import registration should publish independent replacement copies.');
  context.__register();
  context.__register({});
  assert(context.state.characters.arona.description === 'replacement', 'Character import registration should ignore empty input.');

  const empty = { id: 'empty', messages: [], worldInfo: { entries: { keep: { content: 'keep' } } }, worldBookIds: ['wb1'] };
  context.state.conversations.empty = empty;
  context.state.activeConvId = 'empty';
  const replacement = context.__prepare();
  assert(replacement.id === empty.id && replacement !== empty && replacement.worldInfo !== empty.worldInfo, 'Character import should prepare an independent replacement for an empty active chat.');
  context.state.activeConvId = null;
  assert(context.__prepare().messages.length === 0, 'Character import should prepare a default conversation without an active chat.');
  delete context.state.conversations.empty;
  delete context.state.characters.arona;
  context.state.activeConvId = 'old';

  context.__status('ok', 'success');
  assert(status.textContent === 'ok' && status.className.includes('emerald'), 'Character import status should render success state.');
  assert(context.__success(character, embeddedBook).includes('2 entries'), 'Character import success text should include embedded world book count.');
  context.__hide();
  context.__reset();
  assert(importModal.classList.values.has('hidden') && context.dom.importFileInput.value === '', 'Character import UI helpers should hide modal and reset file input.');

  context.__bind();
  importModal.classList.remove('hidden');
  context.dom.importFileInput.value = 'plana.json';
  const beforeImport = JSON.stringify(context.state);
  const importing = context.dom.importFileInput.listeners.change({ target: { files: [{}] } });
  await waitForTestCondition(() => pending.length === 1, 'Character import did not reach reliable candidate persistence.');
  const prepared = pending[0].snapshot;
  assert(JSON.stringify(context.state) === beforeImport && context.currentCharacterName === null, 'Character import must keep the live conversation, library records and selection unchanged before ACK.');
  assert(prepared.conversations[prepared.activeConvId].character.name === 'Plana' && prepared.characters.plana.name === 'Plana' && Object.keys(prepared.worldBooks).length === 1, 'Character import should persist the candidate, card and embedded book together.');
  assert(!importModal.classList.values.has('hidden') && !events.includes('render'), 'Character import must wait for ACK before success UI.');
  pending[0].acknowledge();
  await importing;
  assert(context.state.activeConvId !== 'old' && context.state.characters.plana.name === 'Plana' && Object.keys(context.state.worldBooks).length === 1, 'Character import should register and activate the saved candidate after ACK.');
  assert(context.currentCharacterName === 'Plana' && importModal.classList.values.has('hidden') && events.includes('library') && events.includes('render'), 'Character import should refresh and close its modal after reliable success.');

  importModal.classList.remove('hidden');
  context.dom.importFileInput.value = 'failed.json';
  const beforeFailure = JSON.stringify(context.state);
  const beforeName = context.currentCharacterName;
  const renderCount = events.filter((event) => event === 'render').length;
  const failing = context.dom.importFileInput.listeners.change({ target: { files: [{}] } });
  await waitForTestCondition(() => pending.length === 2, 'Failed character import did not reach persistence.');
  assert(JSON.stringify(context.state) === beforeFailure, 'A pending replacement import must not change live state.');
  pending[1].fail();
  await failing;
  assert(JSON.stringify(context.state) === beforeFailure && context.currentCharacterName === beforeName, 'A failed character import must preserve conversations, library records and selection.');
  assert(!importModal.classList.values.has('hidden') && status.className.includes('red') && status.textContent.includes('fixture save failure') && context.dom.importFileInput.value === '', 'Failed character import should retain its modal, report failure and reset the file input.');
  assert(events.filter((event) => event === 'render').length === renderCount, 'Failed character import must not render success.');
}

async function assertFrontendNewChatPickerMultiSelection() {
  const sources = await Promise.all([
    '../../../src/app/conversation/59-new-chat-picker-helpers.js',
    '../../../src/app/conversation/59-new-chat-picker-model.js',
    '../../../src/app/conversation/59-new-chat-picker-header.js',
    '../../../src/app/conversation/59-new-chat-picker-multi-bar.js',
    '../../../src/app/conversation/59-new-chat-picker-card-ui.js',
    '../../../src/app/conversation/59-new-chat-picker-static-events.js',
    '../../../src/app/conversation/59-new-chat-picker-multi-session.js',
    '../../../src/app/conversation/59-new-chat-picker-multi-controls.js',
    '../../../src/app/conversation/59-new-chat-picker-multi-confirm.js',
    '../../../src/app/conversation/59-new-chat-picker-multi-ui.js',
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
    '../../../src/app/conversation/59-quick-new-chat-helpers.js',
    '../../../src/app/conversation/59-quick-new-chat-events.js',
    '../../../src/app/conversation/59-quick-new-chat-ui.js',
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
    '../../../src/app/conversation/19-conversation-order-helpers.js',
    '../../../src/app/conversation/59-new-chat-worldinfo.js',
    '../../../src/app/conversation/59-new-chat-first-message.js',
    '../../../src/app/conversation/59-new-chat-single.js',
    '../../../src/app/conversation/59-new-chat-group.js',
    '../../../src/app/conversation/59-new-chat-finalize.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  const events = [];
  const context = {
    state: {
      settings: { userName: 'Sensei' },
      conversations: {},
      conversationOrder: [],
      activeConvId: null,
      characters: {},
      worldBooks: {},
    },
    dom: { messagesContainer: { innerHTML: 'old' } },
    currentView: 'library',
    currentCharacterName: null,
    getActiveConv() { return context.state.conversations[context.state.activeConvId]; },
    sanitizeCloudSyncSignatureConversation(conv) { return JSON.parse(JSON.stringify(conv)); },
    makeId: () => 'group-id',
    replacePlaceholders: (text, charName, userName) => String(text || '').replaceAll('{{char}}', charName || '').replaceAll('{{user}}', userName || 'User'),
    t: (key) => key === 'chat_with' ? 'Chat with ' : key,
    isGroupChat: (conv) => !!(conv && conv.group),
    requestRender: (key) => events.push(`render:${key}`),
    renderTokenBar: () => events.push('token'),
    clearPendingGroupMention: () => events.push('clear-mention'),
    switchView: (view) => events.push(`switch:${view}`),
    isMobile: () => true,
    closeSidebar: () => events.push('close-sidebar'),
    JSON,
    Array,
  };
  const pending = createConversationSaveAckHarness(context, events);

  vm.runInNewContext(`${messageIdentitySource}\n${sources.join('\n')}\nthis.__copyWorldInfo = copyWorldInfoFromCurrentConversation;\nthis.__single = configureSingleCharacterConversation;\nthis.__group = configureGroupConversation;\nthis.__register = registerNewConversation;\nthis.__render = renderNewConversationState;\nthis.__finalizeUi = finalizeNewConversationUi;\nthis.__save = persistPreparedConversation;`, context);

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
  const candidate = Object.assign(JSON.parse(JSON.stringify(groupConv)), { id: 'prepared-group' });
  const saving = context.__save(candidate);
  assert(pending.length === 1 && context.state.activeConvId === 'g1' && !context.state.conversations[candidate.id], 'New chat candidates must wait for reliable ACK before registration and activation.');
  pending[0].acknowledge();
  assert(await saving === candidate && context.state.activeConvId === candidate.id, 'New chat candidate saves should publish the prepared conversation after ACK.');
  assert(events.includes('persist') && events.includes('render:activeConvId') && events.includes('token'), 'New chat render side effects did not run.');
  assert(!events.includes('clear-mention'), 'Group chats should keep pending group mention state.');
  assert(events.includes('switch:chat') && events.includes('close-sidebar'), 'New chat UI finalization did not run.');
}

async function assertFrontendGroupChatCoreHelpers() {
  const sources = await Promise.all([
    '../../../src/app/conversation/32-group-chat-members.js',
    '../../../src/app/conversation/32-group-chat-speakers.js',
    '../../../src/app/conversation/32-group-chat-message-helpers.js',
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

  vm.runInNewContext(`${messageIdentitySource}\n${summaryValiditySource}\n${sources.join('\n')}\nthis.__isGroup = isGroupChat;\nthis.__members = getGroupMembers;\nthis.__normalize = normalizeConversation;\nthis.__next = getNextGroupSpeaker;\nthis.__current = getCurrentSpeakerCharacter;\nthis.__name = getMessageSenderName;\nthis.__generating = getCurrentGeneratingSpeakerName;\nthis.__mention = parseGroupMention;`, context);

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
    '../../../src/app/conversation/32-group-mention-render.js',
    '../../../src/app/conversation/32-group-mention-pill.js',
    '../../../src/app/conversation/32-group-mention-ui.js',
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
    '../../../src/app/worldbook/41-world-info-constants.js',
    '../../../src/app/prompt/40-character-prompt-helpers.js',
    '../../../src/app/worldbook/41-world-info-injection.js',
    '../../../src/app/prompt/41-prompt-builder.js',
    '../../../src/app/conversation/32-conversation-model.js',
    '../../../src/app/conversation/32-group-chat-members.js',
    '../../../src/app/conversation/32-group-chat-speakers.js',
    '../../../src/app/conversation/32-group-system-prompt.js',
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

async function assertFrontendLibraryConversationHelpers() {
  const sources = await Promise.all([
    '../../../src/app/conversation/19-conversation-order-helpers.js',
    '../../../src/app/conversation/59-conversation-timestamp-helpers.js',
    '../../../src/app/library/60-library-conversation-helpers.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));
  const context = {
    state: {
      conversations: {
        old: { id: 'old', character: { name: 'Arona' }, updated: 100 },
        recent: { id: 'recent', character: { name: 'Arona' }, created: 200 },
        tieObjectFirst: { id: 'tieObjectFirst', character: { name: 'Arona' }, updated: 700 },
        tieOrderFirst: { id: 'tieOrderFirst', character: { name: 'Arona' }, updated: 700 },
        messageRecent: { id: 'messageRecent', character: { name: 'Arona' }, messages: [{ createdAt: 500, content: 'newer imported chat' }] },
        staleUpdated: { id: 'staleUpdated', character: { name: 'Arona' }, updated: 300, messages: [{ createdAt: 950, content: 'message newer than updated' }] },
        orphan: { id: 'orphan', character: { name: 'Arona' }, updated: 900 },
        other: { id: 'other', character: { name: 'Mika' }, updated: 800 },
      },
      conversationOrder: ['old', 'recent', 'tieOrderFirst', 'tieObjectFirst', 'messageRecent', 'staleUpdated', 'other'],
      activeConvId: 'recent',
    },
    isGroupChat(conv) { return !!(conv && conv.group); },
    defaultConversation() {
      return { id: 'default', messages: [] };
    },
    Array,
    Object,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__activity = getConversationActivityTimestamp;\nthis.__messageActivity = getMessageActivityTimestamp;\nthis.__recent = findMostRecentConversationForCharacter;\nthis.__name = getConversationDisplayCharacterName;\nthis.__reset = resetConversationRuntimeState;\nthis.__deleteState = deleteConversationFromLibraryState;`, context);

  assert(context.__activity({ updated: 300, messages: [{ created: 950 }] }) === 950, 'Conversation activity timestamp should use newer message created timestamps.');
  assert(context.__messageActivity({ timestamp: 1700000000 }) === 1700000000000, 'Message activity timestamp should normalize Unix seconds to milliseconds.');
  assert(context.__recent('Arona').id === 'staleUpdated', 'Library conversation helper should use the newest message timestamp when it is newer than the conversation updated timestamp.');
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

  context.__deleteState('old');
  assert(!context.state.conversations.old && context.state.conversationOrder.join(',') === 'recent,tieOrderFirst,tieObjectFirst,messageRecent,staleUpdated,other' && context.state.activeConvId === 'recent', 'Library conversation helper should remove inactive conversations without changing the active conversation.');

  context.__deleteState('recent');
  assert(!context.state.conversations.recent && context.state.activeConvId === 'staleUpdated', 'Library conversation helper should prefer the newest message timestamp after deleting the active conversation.');

  context.__deleteState('messageRecent');
  assert(!context.state.conversations.messageRecent && context.state.activeConvId === 'staleUpdated', 'Library conversation helper should preserve the active conversation when deleting another row.');

  context.__deleteState('other');
  assert(!context.state.conversations.other && context.state.activeConvId === 'staleUpdated', 'Library conversation helper should preserve the active stale-updated conversation when deleting another row.');

  context.__deleteState('staleUpdated');
  assert(!context.state.conversations.staleUpdated && context.state.activeConvId === 'orphan', 'Library conversation helper should fall back to the newest orphan conversation after deleting the stale-updated active row.');

  context.__deleteState('orphan');
  assert(!context.state.conversations.orphan && context.state.activeConvId === 'tieOrderFirst', 'Library conversation helper should fall back to the stable newest ordered conversation after deleting the orphan row.');

  context.__deleteState('tieObjectFirst');
  assert(!context.state.conversations.tieObjectFirst && context.state.activeConvId === 'tieOrderFirst', 'Library conversation helper should preserve the active stable newest conversation.');

  context.__deleteState('tieOrderFirst');
  assert(context.state.activeConvId === 'default' && context.state.conversations.default && context.state.conversationOrder.join(',') === 'default', 'Library conversation helper should create a default conversation when the last active conversation is deleted.');
}

async function assertFrontendConversationListUI() {
  const sources = await Promise.all([
    '../../../src/app/conversation/19-conversation-order-helpers.js',
    '../../../src/app/conversation/59-conversation-timestamp-helpers.js',
    '../../../src/app/conversation/64-conversation-list-helpers.js',
    '../../../src/app/conversation/64-conversation-list-ui.js',
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
      conversationOrder: ['c1', 'c2', 'g1', 'legacy', 'staleUpdated', 'sendDateChat', 'other', 'missing'],
      conversations: {
        c1: { title: 'Arona chat', character: { name: 'Arona' }, created: 1000, updated: 1000 },
        c2: { title: 'Active Plana chat', character: { name: 'Plana' }, created: 2000, updated: 2000 },
        g1: { title: 'Group chat', group: { members: [{ character: { name: 'Arona' } }] }, created: 3000, updated: 3000 },
        legacy: { title: 'Legacy chat', character: { name: 'Arona' }, messages: [{ createdAt: 5000, content: 'latest legacy' }] },
        staleUpdated: { title: 'Stale updated chat', character: { name: 'Arona' }, updated: 1500, messages: [{ createdAt: 7000, content: 'newest activity' }] },
        sendDateChat: { title: 'Send date chat', character: { name: 'Arona' }, messages: [{ send_date: '1970-01-01T00:00:06.500Z', content: 'send date activity' }] },
        orphan: { title: 'Orphan chat', character: { name: 'Arona' }, updated: 6000 },
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
  assert(visibleOrder.join(',') === 'staleUpdated,sendDateChat,orphan,legacy,g1,c2,c1', 'Conversation list helper should use the newest activity timestamp across conversation and message metadata.');
  assert(context.__item('c1', context.state.conversations.c1, false).includes('data-exp-id="c1"'), 'Conversation list helper should render export actions for rows.');
  context.__render();
  assert(convList.innerHTML.indexOf('data-conv-id="staleUpdated"') < convList.innerHTML.indexOf('data-conv-id="orphan"'), 'Conversation list should render message-newer conversations before stale updated rows.');
  assert(convList.innerHTML.includes('data-conv-id="c1"') && convList.innerHTML.includes('data-conv-id="c2"') && convList.innerHTML.includes('data-conv-id="g1"'), 'Conversation list should include matching character, active, and group conversations in chat view.');
  assert(!convList.innerHTML.includes('Other chat'), 'Conversation list should filter unrelated conversations in chat view.');
  assert(context.state.conversationOrder.join(',') === 'c1,c2,g1,legacy,staleUpdated,sendDateChat,other,missing', 'Conversation list render should not mutate conversation order.');

  convRows[0].listeners.click({});
  deleteRows[0].listeners.click({ stopPropagation() { events.push('stop-delete'); } });
  exportRows[0].listeners.click({ stopPropagation() { events.push('stop-export'); } });
  assert(events.includes('load:c1') && events.includes('delete:c2') && events.includes('export:g1'), 'Conversation list should bind load/delete/export actions.');

  context.currentView = 'library';
  context.__render();
  assert(convList.innerHTML.includes('Other chat'), 'Conversation list should show all conversations in library view.');

  context.state.conversationOrder = [];
  context.state.conversations = {};
  context.__render();
  assert(convList.innerHTML.includes('No conversations'), 'Conversation list should render the empty state.');
  assert(context.__empty().includes('No conversations'), 'Conversation list empty helper should render localized empty text.');
}

async function assertFrontendCharacterEditorUI() {
  const sources = await Promise.all([
    '../../../src/app/conversation/19-conversation-order-helpers.js',
    '../../../src/app/conversation/59-new-chat-first-message.js',
    '../../../src/app/conversation/59-new-chat-finalize.js',
    '../../../src/app/character/65-character-editor-helpers.js',
    '../../../src/app/character/65-character-editor-ui.js',
    '../../../src/app/conversation/32-message-identity.js',
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
    id: 'edited',
    title: 'New chat',
    messages: [],
    character: {
      name: 'Unnamed',
      tags: ['old'],
      previewImage: 'data:image/png;base64,preview',
      avatar: 'data:image/png;base64,avatar',
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
    state: { settings: { userName: 'Sensei' }, conversations: { edited: activeConv }, conversationOrder: ['edited'], activeConvId: 'edited', characters: {}, worldBooks: {} },
    currentCharacterName: 'Unnamed',
    getActiveConv() { return context.state.conversations[context.state.activeConvId]; },
    makeId: () => 'edited-first-message',
    sanitizeCloudSyncSignatureConversation(conv) { return JSON.parse(JSON.stringify(conv)); },
    normalizeConversation(conv) { context.normalizeConversationMessageIdentity(conv); },
    replacePlaceholders(text, charName, userName) {
      return text.replaceAll('{{char}}', charName).replaceAll('{{user}}', userName);
    },
    t: (key) => ({ title_new_chat_match: 'New Chat', new_chat_title: 'New chat', chat_with: 'Chat with ' }[key] || key),
    alert: (message) => events.push('alert:' + message),
    reportPersistPostSaveError: (label) => events.push('error:' + label),
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
  const pending = createConversationSaveAckHarness(context, events);

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
  const previous = activeConv;
  const beforeSave = JSON.stringify(context.state);
  const saving = context.__save();
  assert(pending.length === 1 && JSON.stringify(context.state) === beforeSave && context.currentCharacterName === 'Unnamed', 'Character editor must keep its live card, messages, registry and selection unchanged before ACK.');
  assert(!dom.charEditorModal.classList.values.has('hidden') && !events.includes('library'), 'Character editor must remain open and defer success UI until ACK.');
  assert(pending[0].snapshot.conversations.edited.character.name === 'Arona' && pending[0].snapshot.characters.arona.name === 'Arona', 'Character editor must save the independent conversation candidate and global card together.');
  pending[0].acknowledge();
  assert(await saving === true, 'Character editor should report reliable save success.');
  activeConv = context.getActiveConv();
  assert(activeConv !== previous && previous.character.name === 'Unnamed' && previous.messages.length === 0, 'Character editor should publish its candidate after ACK without mutating the original conversation.');
  assert(activeConv.character.name === 'Arona' && activeConv.character.tags.join(',') === 'ai,guide', 'Character editor should save form fields into the conversation character.');
  assert(activeConv.character.alternate_greetings[0] === 'hi' && activeConv.character.extensions.depth === 1, 'Character editor should preserve existing character metadata.');
  assert(activeConv.character.previewImage.includes('preview') && activeConv.character.avatar.includes('avatar'), 'Character editor should preserve role-card images used by image generation.');
  assert(activeConv.messages[0].content === 'Hello Sensei from Arona', 'Character editor should seed first messages for new characters.');
  assert(context.state.characters.arona.name === 'Arona' && context.state.characters.arona !== activeConv.character, 'Character editor should register an independent global card copy.');
  assert(activeConv.title === 'Chat with Arona' && activeConv.updated === 999, 'Character editor should update conversation title and timestamp.');
  assert(events.includes('persist') && events.includes('library') && events.includes('notify:conversations'), 'Character editor should persist and refresh dependent UI.');
  assert(context.currentCharacterName === 'Arona' && dom.charEditorModal.classList.values.has('hidden'), 'Character editor should update selection and close after ACK.');

  context.__open();
  dom.charEditName.value = 'Failed edit';
  dom.charEditDescription.value = 'unsaved description';
  const beforeFailure = JSON.stringify(context.state);
  const libraryCount = events.filter((event) => event === 'library').length;
  const failing = context.__save();
  assert(pending.length === 2 && JSON.stringify(context.state) === beforeFailure, 'A pending character edit must leave the committed conversation and registry unchanged.');
  pending[1].fail();
  assert(await failing === false, 'Character editor should return false when reliable persistence fails.');
  assert(context.getActiveConv() === activeConv && JSON.stringify(context.state) === beforeFailure && context.currentCharacterName === 'Arona', 'Failed character edits must preserve the live conversation, global card and selection.');
  assert(!dom.charEditorModal.classList.values.has('hidden') && dom.charEditName.value === 'Failed edit' && events.some((event) => event.includes('fixture save failure')), 'Failed character edits should retain the editable form and report the failure.');
  assert(events.filter((event) => event === 'library').length === libraryCount, 'Failed character edits must not refresh success UI.');
}

async function assertFrontendStorageRecoveryRestoreHelpers() {
  const orderSource = await readFile(new URL('../../../src/app/conversation/19-conversation-order-helpers.js', import.meta.url), 'utf8');
  const source = await readFile(new URL('../../../src/app/storage/23-storage-recovery-restore.js', import.meta.url), 'utf8');
  const context = {
    state: {
      settings: {},
      conversations: {},
      conversationOrder: [],
      activeConvId: null,
      worldBooks: {},
      characters: {},
    },
    getSafeSettingsForPersist() {
      return { model: 'safe-model' };
    },
    Date: { now: () => 777 },
    Object,
    Array,
  };

  vm.runInNewContext(`${orderSource}\n${source}\nthis.__apply = applyStorageRecoveryData;\nthis.__snapshot = buildStorageRecoverySaveSnapshot;`, context);

  context.__apply({
    conversations: {
      c1: { id: 'c1', messages: [{ content: 'first' }] },
      orphan: { id: 'orphan', messages: [{ content: 'missing order' }] },
    },
    conversationOrder: ['missing', 'c1', 'c1'],
    activeConvId: 'orphan',
    worldBooks: { wb1: { id: 'wb1' } },
    characters: { arona: { name: 'Arona' } },
    charactersMigrated: true,
  });

  assert(context.state.conversationOrder.join(',') === 'c1,orphan', 'Storage recovery should normalize restored conversation order.');
  assert(context.state.activeConvId === 'orphan', 'Storage recovery should preserve a valid restored active conversation.');

  const snapshot = context.__snapshot();
  assert(snapshot.conversationOrder.join(',') === 'c1,orphan' && snapshot.lastSaved === 777, 'Storage recovery save snapshot should include complete conversation order.');

  context.__apply({
    conversations: {
      c3: { id: 'c3', messages: [{ content: 'third' }] },
      c4: { id: 'c4', messages: [{ content: 'fourth' }] },
    },
    conversationOrder: ['missing', 'c4'],
    activeConvId: 'missing',
  });
  assert(context.state.conversationOrder.join(',') === 'c4,c3' && context.state.activeConvId === 'c4', 'Storage recovery should recover invalid active conversation ids.');
}
export { assertFrontendCharacterImportEventHelpers, assertFrontendNewChatPickerMultiSelection, assertFrontendQuickNewChatModalHelpers, assertFrontendNewChatWorkflowHelpers, assertFrontendGroupChatCoreHelpers, assertFrontendGroupMentionUI, assertFrontendConversationModelHelpers, assertFrontendLibraryConversationHelpers, assertFrontendConversationListUI, assertFrontendCharacterEditorUI, assertFrontendStorageRecoveryRestoreHelpers };
