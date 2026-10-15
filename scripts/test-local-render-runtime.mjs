// R6 局部渲染运行时验证：按键（会话 ID + 消息稳定 ID）复用行节点、只重建真正变化的行、
// 恢复滚动锚点、保留流式节点，并按 data-msg-idx 解析动作目标。
// Node 环境没有真实 DOM；这里用最小可用的假节点覆盖窗口渲染实际调用到的接口。
import fs from 'node:fs';
import assert from 'node:assert/strict';

const readSource = (file) => fs.readFileSync(new URL(`../src/app/${file}`, import.meta.url), 'utf8');

const ROW_HEIGHT = 100;

// 记录假 DOM 上的 childList 变更次数，用于断言“未变化渲染不产生 DOM 变更”。
const mutationCounter = { count: 0 };
function recordMutation() { mutationCounter.count += 1; }

function createTextNode(text) {
  return { nodeType: 3, parentNode: null, textContent: String(text) };
}

function parseSelector(selector) {
  const match = /^([a-zA-Z*][\w-]*)?(#[\w-]+)?((?:\.[\w-]+)*)((?:\[[^\]]+\])*)$/.exec(String(selector).trim());
  if (!match) return { tag: null, id: null, classes: [], attrs: [] };
  return {
    tag: match[1] && match[1] !== '*' ? match[1].toLowerCase() : null,
    id: match[2] ? match[2].slice(1) : null,
    classes: match[3] ? match[3].split('.').filter(Boolean) : [],
    attrs: match[4] ? Array.from(match[4].matchAll(/\[([^\]=]+)(?:="([^"]*)")?\]/g)).map((item) => ({ name: item[1], value: item[2] })) : [],
  };
}

function matchesSelector(node, selector) {
  if (node.nodeType !== 1) return false;
  const parsed = parseSelector(selector);
  if (parsed.tag && node.tagName.toLowerCase() !== parsed.tag) return false;
  if (parsed.id && node.getAttribute('id') !== parsed.id) return false;
  const classes = String(node.getAttribute('class') || '').split(/\s+/).filter(Boolean);
  if (parsed.classes.some((name) => !classes.includes(name))) return false;
  for (const attr of parsed.attrs) {
    if (attr.value === undefined) { if (!node.hasAttribute(attr.name)) return false; }
    else if (node.getAttribute(attr.name) !== attr.value) return false;
  }
  return true;
}

function queryAll(root, selector) {
  const out = [];
  const walk = (node) => {
    for (const child of node.childNodes) {
      if (child.nodeType !== 1) continue;
      if (matchesSelector(child, selector)) out.push(child);
      walk(child);
    }
  };
  walk(root);
  return out;
}

function createFakeNode(tagName) {
  const node = {
    nodeType: 1,
    tagName: String(tagName || 'div').toUpperCase(),
    attributes: {},
    childNodes: [],
    parentNode: null,
    style: {},
    scrollTop: 0,
    clientHeight: 0,
    listeners: {},
  };
  Object.defineProperty(node, 'children', { get: () => node.childNodes.filter((child) => child.nodeType === 1) });
  Object.defineProperty(node, 'firstChild', { get: () => node.childNodes[0] || null });
  Object.defineProperty(node, 'firstElementChild', { get: () => node.childNodes.find((child) => child.nodeType === 1) || null });
  Object.defineProperty(node, 'nextSibling', {
    get: () => {
      if (!node.parentNode) return null;
      const siblings = node.parentNode.childNodes;
      return siblings[siblings.indexOf(node) + 1] || null;
    },
  });
  Object.defineProperty(node, 'id', { get: () => node.getAttribute('id') || '', set: (value) => node.setAttribute('id', value) });
  Object.defineProperty(node, 'className', { get: () => node.getAttribute('class') || '', set: (value) => node.setAttribute('class', value) });
  Object.defineProperty(node, 'offsetTop', {
    get: () => (node.parentNode ? node.parentNode.children.indexOf(node) * ROW_HEIGHT : 0),
  });
  Object.defineProperty(node, 'textContent', {
    get: () => (node.childNodes.length ? node.childNodes.map((child) => child.textContent).join('') : node._text || ''),
    set: (value) => {
      const next = String(value);
      if (node.childNodes.length || node._text !== next) recordMutation();
      node.childNodes = [];
      node._text = next;
    },
  });
  // 模拟滚动容器内的视口矩形：内容坐标减去容器滚动量，容器自身作为视口原点。
  node.getBoundingClientRect = () => {
    const scroll = (node.parentNode && node.parentNode.scrollTop) || 0;
    const top = (node.offsetTop || 0) - scroll;
    const height = node.offsetHeight || ROW_HEIGHT;
    return { top, bottom: top + height, left: 0, right: 0, width: 0, height };
  };
  Object.defineProperty(node, 'innerHTML', {
    get: () => node._html || '',
    set: (value) => {
      node._html = String(value);
      node.childNodes = [];
      parseHtml(node._html).forEach((child) => node.appendChild(child));
    },
  });
  node.getAttribute = (name) => (Object.prototype.hasOwnProperty.call(node.attributes, name) ? node.attributes[name] : null);
  node.setAttribute = (name, value) => { node.attributes[name] = String(value); };
  node.hasAttribute = (name) => Object.prototype.hasOwnProperty.call(node.attributes, name);
  node.appendChild = (child) => {
    if (child.nodeType === 11) { child.childNodes.slice().forEach((grandchild) => node.appendChild(grandchild)); return child; }
    if (child.parentNode) child.parentNode.removeChild(child);
    child.parentNode = node;
    node.childNodes.push(child);
    recordMutation();
    return child;
  };
  node.insertBefore = (child, reference) => {
    if (child.parentNode) child.parentNode.removeChild(child);
    child.parentNode = node;
    const index = reference ? node.childNodes.indexOf(reference) : node.childNodes.length;
    node.childNodes.splice(index < 0 ? node.childNodes.length : index, 0, child);
    recordMutation();
    return child;
  };
  node.removeChild = (child) => {
    const index = node.childNodes.indexOf(child);
    if (index >= 0) { node.childNodes.splice(index, 1); recordMutation(); }
    child.parentNode = null;
    return child;
  };
  node.remove = () => { if (node.parentNode) node.parentNode.removeChild(node); };
  node.addEventListener = (type, handler) => { (node.listeners[type] = node.listeners[type] || []).push(handler); };
  node.dispatch = (type, event) => { (node.listeners[type] || []).forEach((handler) => handler(event)); };
  node.querySelectorAll = (selector) => queryAll(node, selector);
  node.querySelector = (selector) => queryAll(node, selector)[0] || null;
  node.closest = (selector) => {
    let current = node;
    while (current) {
      if (matchesSelector(current, selector)) return current;
      current = current.parentNode;
    }
    return null;
  };
  node.classList = {
    toggle(name, force) {
      const names = new Set(String(node.getAttribute('class') || '').split(/\s+/).filter(Boolean));
      const want = force === undefined ? !names.has(name) : !!force;
      if (want) names.add(name); else names.delete(name);
      node.setAttribute('class', Array.from(names).join(' '));
    },
    contains(name) { return String(node.getAttribute('class') || '').split(/\s+/).includes(name); },
  };
  return node;
}

function applyAttributes(node, source) {
  const pattern = /\s+([a-zA-Z-:]+)(?:\s*=\s*"([^"]*)")?/g;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    node.setAttribute(match[1], match[2] === undefined ? '' : match[2]);
  }
}

function parseHtml(html) {
  const root = createFakeNode('#fragment');
  const tagPattern = /<\/?([a-zA-Z][\w-]*)((?:\s+[a-zA-Z-:]+(?:\s*=\s*"[^"]*")?)*)\s*\/?>/g;
  const stack = [root];
  let lastIndex = 0;
  let match;
  while ((match = tagPattern.exec(html)) !== null) {
    const text = html.slice(lastIndex, match.index);
    if (text.trim()) stack[stack.length - 1].appendChild(createTextNode(text));
    lastIndex = tagPattern.lastIndex;
    if (match[0].startsWith('</')) { if (stack.length > 1) stack.pop(); continue; }
    const element = createFakeNode(match[1]);
    applyAttributes(element, match[2]);
    stack[stack.length - 1].appendChild(element);
    if (!match[0].endsWith('/>')) stack.push(element);
  }
  const tail = html.slice(lastIndex);
  if (tail.trim()) stack[stack.length - 1].appendChild(createTextNode(tail));
  return root.childNodes.slice();
}

function createHarness() {
  const document = {
    body: createFakeNode('body'),
    createElement: (tag) => createFakeNode(tag),
    createTextNode,
    createDocumentFragment: () => ({ nodeType: 11, childNodes: [], appendChild(child) { this.childNodes.push(child); return child; } }),
    getElementById(id) {
      let found = null;
      const walk = (node) => {
        for (const child of node.childNodes) {
          if (child.nodeType !== 1 || found) continue;
          if (child.getAttribute('id') === id) { found = child; return; }
          walk(child);
        }
      };
      walk(document.body);
      return found;
    },
  };
  document.body.className = 'theme-new-light';

  const messagesContainer = createFakeNode('div');
  messagesContainer.id = 'messagesContainer';
  Object.defineProperty(messagesContainer, 'scrollHeight', { get: () => messagesContainer.children.length * ROW_HEIGHT });
  Object.defineProperty(messagesContainer, 'clientHeight', { get: () => ROW_HEIGHT });
  document.body.appendChild(messagesContainer);

  const convList = createFakeNode('div');
  convList.id = 'conversationList';
  document.body.appendChild(convList);

  const dom = {
    messagesContainer,
    convList,
    emptyState: createFakeNode('div'),
    tokenInfo: createFakeNode('div'),
  };

  const state = {
    conversations: {},
    conversationOrder: [],
    activeConvId: null,
    isGenerating: false,
    settings: { lang: 'zh-CN', userName: '你' },
  };

  let createdRows = 0;
  const createChatMessageElement = (msg, conv) => {
    createdRows += 1;
    const row = createFakeNode('div');
    row.className = 'msg-enter ' + (msg.role === 'user' ? 'msg-user' : 'msg-assistant');
    row.setAttribute('data-message-id', msg.id);
    const bubble = createFakeNode('div');
    bubble.className = 'msg-bubble';
    bubble.textContent = `${msg.id}:${msg.content || ''}`;
    row.appendChild(bubble);
    const actions = createFakeNode('div');
    actions.className = 'msg-actions';
    const actualIdx = conv.messages.indexOf(msg);
    const copy = createFakeNode('button');
    copy.className = 'msg-action-btn';
    copy.setAttribute('data-action', 'copy');
    copy.setAttribute('data-msg-idx', String(actualIdx));
    actions.appendChild(copy);
    const favorite = createFakeNode('button');
    favorite.className = 'msg-action-btn';
    favorite.setAttribute('data-action', 'favorite');
    favorite.setAttribute('data-msg-idx', String(actualIdx));
    favorite.textContent = getMessageFavoriteState(msg, activeConv()) ? '取消收藏' : '收藏';
    actions.appendChild(favorite);
    if (canContinueMessage(activeConv(), msg)) {
      const continueBtn = createFakeNode('button');
      continueBtn.className = 'msg-action-btn';
      continueBtn.setAttribute('data-action', 'continue');
      continueBtn.setAttribute('data-msg-idx', String(actualIdx));
      continueBtn.textContent = '续写';
      actions.insertBefore(continueBtn, favorite);
    }
    row.appendChild(actions);
    return row;
  };

  const getMessageFavoriteState = (msg, conv) => !!(conv && conv.favoriteMessageIds && conv.favoriteMessageIds.indexOf(msg.id) >= 0);
  const activeConv = () => state.conversations[state.activeConvId] || null;
  // 模拟 MVU 回放：数据由 message.__mvuSet 的累加决定，用于验证模板行随上游变量变化重算。
  const getMvuDataForMessage = (conv, msg) => {
    const messages = (conv && conv.messages) || [];
    const index = messages.indexOf(msg);
    const data = {};
    for (let i = 0; i <= index; i++) {
      const entry = messages[i];
      if (entry && entry.__mvuSet) Object.assign(data, entry.__mvuSet);
    }
    return data;
  };
  const getActiveConv = () => activeConv();
  const getMessageSenderName = (msg) => (msg.speaker || (msg.role === 'user' ? 'You' : 'Assistant'));
  const getMessageSpeakerCharacter = (msg, conv) => ({ name: getMessageSenderName(msg) });
  const getMessageAvatarSource = () => '';
  const canContinueMessage = (conv, msg) => {
    if (!conv || !msg || msg.role !== 'assistant' || msg.stage === 'second' || !String(msg.content || '').trim()) return false;
    return conv.messages.filter((m) => m.role !== 'system' && m.stage !== 'second').slice(-1)[0] === msg;
  };
  const isImageAttachmentOnlyMessage = () => false;
  const renderAssistantSenderHtml = (name) => `<p>${name}</p>`;
  const t = (key) => key;

  const env = {
    document,
    state,
    dom,
    getActiveConv,
    createChatMessageElement,
    getMessageSenderName,
    getMessageSpeakerCharacter,
    getMessageAvatarSource,
    canContinueMessage,
    isImageAttachmentOnlyMessage,
    getMessageFavoriteState,
    getMvuDataForMessage,
    renderAssistantSenderHtml,
    getCurrentGeneratingSpeakerName: () => 'Assistant',
    getCurrentSpeakerCharacter: () => ({ name: 'Assistant' }),
    isGroupChat: () => false,
    mountCardRuntimeFrames() {},
    pruneCardRuntimeInstances() {},
    t,
    console,
    escapeHtml: (value) => String(value),
    currentView: 'chat',
    currentCharacterName: null,
    loadConversation(id) { state.activeConvId = id; },
    deleteConversation() {},
    exportConversation() {},
  };

  const sources = [
    'conversation/32-message-identity.js',
    'conversation/32-response-versions.js',
    'conversation/19-conversation-order-helpers.js',
    'conversation/59-conversation-timestamp-helpers.js',
    'chat/61-chat-history-load-button.js',
    'chat/61-chat-history-window-ui.js',
    'chat/61-chat-message-window-state.js',
    'chat/61-chat-message-window-render.js',
    'chat/61-chat-message-renderer.js',
    'conversation/64-conversation-list-helpers.js',
    'conversation/64-conversation-list-ui.js',
  ].map(readSource).join('\n');

  const names = Object.keys(env);
  const factory = new Function(...names, `${sources}\nreturn {
    renderMessages,
    renderChatMessageWindow,
    getChatMessageWindowState,
    getRenderableChatMessages,
    renderConversationList
  };`);
  const api = factory(...names.map((name) => env[name]));
  return {
    document, state, dom, api,
    createdRowCount: () => createdRows,
    resetMutations: () => { mutationCounter.count = 0; },
    mutationCount: () => mutationCounter.count,
  };
}

function makeConversation(id, count, options = {}) {
  const messages = [];
  for (let i = 0; i < count; i++) {
    messages.push({
      id: `${id}-m${i}`,
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `content-${i}`,
    });
  }
  return Object.assign({ id, title: id, messages, favoriteMessageIds: [] }, options);
}

function render(harness) {
  harness.api.renderMessages();
}

function rowNodes(harness) {
  return harness.dom.messagesContainer.children.filter((child) => child.getAttribute('data-message-id'));
}

function rowIds(harness) {
  return rowNodes(harness).map((node) => node.getAttribute('data-message-id'));
}

function assertSameNodes(before, after, label) {
  assert.equal(before.length, after.length, `${label}: row count must stay identical`);
  for (let i = 0; i < before.length; i++) {
    assert.equal(before[i], after[i], `${label}: row ${i} node identity must be preserved`);
  }
}

function testUnchangedRenderReusesNodes() {
  const harness = createHarness();
  const conv = makeConversation('c', 4);
  harness.state.conversations[conv.id] = conv;
  harness.state.conversationOrder = [conv.id];
  harness.state.activeConvId = conv.id;

  render(harness);
  const first = rowNodes(harness);
  const createdAfterFirst = harness.createdRowCount();
  assert.equal(first.length, 4, 'initial render must create every visible row');

  render(harness);
  render(harness);
  assertSameNodes(first, rowNodes(harness), 'repeated unchanged render');
  assert.equal(harness.createdRowCount(), createdAfterFirst, 'unchanged render must not rebuild any row');
}

function testContentChangeRebuildsOnlyChangedRow() {
  const harness = createHarness();
  const conv = makeConversation('c', 4);
  harness.state.conversations[conv.id] = conv;
  harness.state.conversationOrder = [conv.id];
  harness.state.activeConvId = conv.id;

  render(harness);
  const before = rowNodes(harness);

  conv.messages[1].content = 'edited content';
  render(harness);
  const after = rowNodes(harness);

  assert.equal(before[0], after[0], 'rows before the change must be reused');
  assert.notEqual(before[1], after[1], 'the changed row must be rebuilt');
  assert.equal(before[2], after[2], 'unrelated downstream rows must not be refreshed for a plain content edit');
  assert.equal(before[3], after[3], 'all unrelated downstream rows must be preserved');
  assert.match(after[1].textContent, /edited content/, 'rebuilt row must show the new content');
}

function testRepeatedUnchangedRenderProducesNoMutations() {
  const harness = createHarness();
  const conv = makeConversation('c', 4);
  harness.state.conversations[conv.id] = conv;
  harness.state.conversationOrder = [conv.id];
  harness.state.activeConvId = conv.id;

  render(harness);
  harness.resetMutations();
  render(harness);
  render(harness);
  assert.equal(harness.mutationCount(), 0, 'repeated unchanged render must not mutate the message container');

  // 收藏状态未变化时，逐行补丁也不应写入 DOM。
  conv.favoriteMessageIds = [];
  harness.resetMutations();
  render(harness);
  assert.equal(harness.mutationCount(), 0, 'unchanged favorite state must not touch the DOM');
}

function testMvuVariableChangeRebuildsDependentSuffix() {
  const harness = createHarness();
  const conv = makeConversation('c', 4);
  conv.messages[0] = { id: 'c-m0', role: 'user', content: 'source', __mvuSet: { v: 1 } };
  conv.messages[1] = { id: 'c-m1', role: 'assistant', content: 'value <% v %>' };
  conv.messages[3] = { id: 'c-m3', role: 'assistant', content: 'tail <% v %>' };
  harness.state.conversations[conv.id] = conv;
  harness.state.conversationOrder = [conv.id];
  harness.state.activeConvId = conv.id;

  render(harness);
  const before = rowNodes(harness);

  conv.messages[0].__mvuSet = { v: 2 };
  render(harness);
  const after = rowNodes(harness);

  assert.equal(before[0], after[0], 'the non-template source row keeps its node');
  assert.notEqual(before[1], after[1], 'the template row after the changed variable recomputes');
  assert.equal(before[2], after[2], 'a non-template row between templates is preserved');
  assert.notEqual(before[3], after[3], 'the later template row also recomputes');
}

function testManualMvuDataChangeRebuildsItsRow() {
  const harness = createHarness();
  const conv = makeConversation('c', 3);
  conv.messages[1].mvuManualData = { a: 1 };
  harness.state.conversations[conv.id] = conv;
  harness.state.conversationOrder = [conv.id];
  harness.state.activeConvId = conv.id;

  render(harness);
  const before = rowNodes(harness);

  conv.messages[1].mvuManualData = { a: 2 };
  render(harness);
  const after = rowNodes(harness);

  assert.equal(before[0], after[0], 'rows before the override change are preserved');
  assert.notEqual(before[1], after[1], 'changing manual MVU DATA (not just a boolean) rebuilds the row');
  assert.equal(before[2], after[2], 'rows after a non-template override are preserved');
}

function testSlidingWindowReusesSurvivingLastRow() {
  for (const count of [150, 151, 500]) {
    const harness = createHarness();
    const conv = makeConversation('c', count);
    conv._historyWindow = 150;
    harness.state.conversations[conv.id] = conv;
    harness.state.conversationOrder = [conv.id];
    harness.state.activeConvId = conv.id;

    render(harness);
    const rows = rowNodes(harness);
    assert.equal(rows.length, 150, `count ${count}: window must render exactly 150 rows`);
    render(harness);
    assertSameNodes(rows, rowNodes(harness), `count ${count}: unchanged re-render`);

    const survivor = rows[rows.length - 1];
    const survivorId = survivor.getAttribute('data-message-id');
    conv.messages.push({ id: `c-new-${count}`, role: 'user', content: 'new' });
    render(harness);

    assert.equal(rowNodes(harness).length, 150, `count ${count}: sliding keeps the window at 150 rows`);
    assert.equal(
      harness.dom.messagesContainer.querySelector(`[data-message-id="${survivorId}"]`),
      survivor,
      `count ${count}: the surviving last row node must be reused`
    );
  }
}

function testFavoritePatchesOnlyTargetButton() {
  const harness = createHarness();
  const conv = makeConversation('c', 3);
  harness.state.conversations[conv.id] = conv;
  harness.state.conversationOrder = [conv.id];
  harness.state.activeConvId = conv.id;

  render(harness);
  const before = rowNodes(harness);
  const createdBefore = harness.createdRowCount();

  conv.favoriteMessageIds = [conv.messages[2].id];
  render(harness);
  const after = rowNodes(harness);

  assertSameNodes(before, after, 'favorite toggle must not rebuild any row');
  assert.equal(harness.createdRowCount(), createdBefore, 'favorite toggle must not rebuild any row node');
  const targetFavorite = after[2].querySelector('.msg-action-btn[data-action="favorite"]');
  assert.equal(targetFavorite.getAttribute('aria-pressed'), 'true', 'target favorite button must reflect the new state');
  assert.equal(targetFavorite.textContent, '取消收藏', 'target favorite button label must update in place');
  assert.equal(after[0].querySelector('.msg-action-btn[data-action="favorite"]').getAttribute('aria-pressed'), 'false', 'unrelated favorite buttons must stay unchanged');
}

function testVersionChangeRebuildsOnlyItsRow() {
  const harness = createHarness();
  const conv = makeConversation('c', 4);
  conv.messages[1].role = 'assistant';
  conv.messages[1].stage = 'main';
  harness.state.conversations[conv.id] = conv;
  harness.state.conversationOrder = [conv.id];
  harness.state.activeConvId = conv.id;

  render(harness);
  const before = rowNodes(harness);

  conv.messages[1].responseVersions = [
    { id: 'v1', message: { id: conv.messages[1].id, role: 'assistant', stage: 'main', content: 'first' }, secondMessages: [] },
    { id: 'v2', message: { id: conv.messages[1].id, role: 'assistant', stage: 'main', content: 'second' }, secondMessages: [] },
  ];
  conv.messages[1].selectedResponseVersionId = 'v2';
  render(harness);
  const after = rowNodes(harness);

  assert.equal(before[0], after[0], 'rows before the version change must be reused');
  assert.notEqual(before[1], after[1], 'the version-changed row must be rebuilt');
  assert.equal(before[2], after[2], 'unrelated rows are preserved after a version change');
}

function testSettingChangeInvalidatesAllRows() {
  const harness = createHarness();
  const conv = makeConversation('c', 3);
  harness.state.conversations[conv.id] = conv;
  harness.state.conversationOrder = [conv.id];
  harness.state.activeConvId = conv.id;

  render(harness);
  const before = rowNodes(harness);

  harness.state.settings.lang = 'en';
  render(harness);
  const after = rowNodes(harness);

  for (let i = 0; i < before.length; i++) {
    assert.notEqual(before[i], after[i], `row ${i} must be rebuilt after a display setting change`);
  }
}

function testWindowSlideKeepsRemainingRows() {
  const harness = createHarness();
  const conv = makeConversation('c', 151);
  conv._historyWindow = 150;
  harness.state.conversations[conv.id] = conv;
  harness.state.conversationOrder = [conv.id];
  harness.state.activeConvId = conv.id;

  render(harness);
  let ids = rowIds(harness);
  assert.equal(ids.length, 150, 'window must render exactly 150 rows');
  assert.equal(ids[0], 'c-m1', '151 messages must hide the first one');
  assert.equal(ids[ids.length - 1], 'c-m150', 'window must end at the newest message');
  const before = new Map(rowNodes(harness).map((node) => [node.getAttribute('data-message-id'), node]));

  conv.messages.push({ id: 'c-m151', role: 'assistant', content: 'newest' });
  render(harness);
  ids = rowIds(harness);
  assert.equal(ids.length, 150, 'sliding the window must keep exactly 150 rows');
  assert.deepEqual(ids, Array.from({ length: 150 }, (_, index) => `c-m${index + 2}`), 'only the now-out-of-window row is dropped and one new row is added');
  const after = new Map(rowNodes(harness).map((node) => [node.getAttribute('data-message-id'), node]));
  for (const id of ids) {
    if (id === 'c-m151') continue;
    assert.equal(before.get(id), after.get(id), `row ${id} must be reused across the window slide`);
  }
  const reused = after.get('c-m2');
  assert.equal(reused.getAttribute('data-message-id'), 'c-m2', 'reused row keeps its stable id');
  assert.equal(reused.querySelector('[data-action="copy"]').getAttribute('data-msg-idx'), '2', 'windowing does not change the underlying message index');
}

function testFrontDeletionPatchesActionIndexes() {
  const harness = createHarness();
  const conv = makeConversation('c', 4);
  harness.state.conversations[conv.id] = conv;
  harness.state.conversationOrder = [conv.id];
  harness.state.activeConvId = conv.id;

  render(harness);
  const before = new Map(rowNodes(harness).map((node) => [node.getAttribute('data-message-id'), node]));

  conv.messages.splice(0, 1);
  render(harness);
  const ids = rowIds(harness);
  assert.deepEqual(ids, ['c-m1', 'c-m2', 'c-m3'], 'deleting the front message removes exactly one row');
  for (let i = 0; i < ids.length; i++) {
    const node = rowNodes(harness)[i];
    assert.equal(node.querySelector('[data-action="copy"]').getAttribute('data-msg-idx'), String(i), 'row action index must match the current message index after a front deletion');
    if (ids[i] !== 'c-m1') {
      assert.equal(before.get(ids[i]), node, `unchanged row ${ids[i]} must be reused after a front deletion`);
    }
  }
}

function testSystemMessagesKeepOriginalActionIndexes() {
  const harness = createHarness();
  const conv = {
    id: 'c',
    title: 'c',
    favoriteMessageIds: [],
    messages: [
      { id: 's0', role: 'system', content: 'hidden' },
      { id: 'c-m1', role: 'user', content: 'one' },
      { id: 'c-m2', role: 'assistant', content: 'two' },
      { id: 'c-m3', role: 'user', content: 'three' },
    ],
  };
  harness.state.conversations[conv.id] = conv;
  harness.state.conversationOrder = [conv.id];
  harness.state.activeConvId = conv.id;

  render(harness);
  assert.deepEqual(rowIds(harness), ['c-m1', 'c-m2', 'c-m3'], 'system messages are not rendered as rows');
  assert.equal(rowNodes(harness)[0].querySelector('[data-action="copy"]').getAttribute('data-msg-idx'), '1', 'action index uses the original conversation index, not the filtered window index');
  assert.equal(rowNodes(harness)[1].querySelector('[data-action="copy"]').getAttribute('data-msg-idx'), '2', 'later rows keep their original conversation index');

  // 前面删除一条非 system 消息后，索引要更新为新的原始下标（system 仍占着 0）。
  conv.messages.splice(1, 1);
  render(harness);
  assert.deepEqual(rowIds(harness), ['c-m2', 'c-m3'], 'deleting the first non-system message removes exactly one row');
  assert.equal(rowNodes(harness)[0].querySelector('[data-action="copy"]').getAttribute('data-msg-idx'), '1', 'action index is recomputed after a front deletion with a system message present');
  assert.equal(rowNodes(harness)[1].querySelector('[data-action="copy"]').getAttribute('data-msg-idx'), '2', 'the following row index also shifts correctly');
}

function testFiveHundredMessageWindow() {
  const harness = createHarness();
  const conv = makeConversation('c', 500);
  conv._historyWindow = 150;
  harness.state.conversations[conv.id] = conv;
  harness.state.conversationOrder = [conv.id];
  harness.state.activeConvId = conv.id;

  render(harness);
  const ids = rowIds(harness);
  assert.equal(ids.length, 150, '500-message history must render only the 150-message window');
  assert.equal(ids[0], 'c-m350', 'window must start at message 350');
  assert.equal(ids[149], 'c-m499', 'window must end at the newest message');
  assert.equal(new Set(ids).size, ids.length, 'window must not duplicate any message id');
}

function testLoadEarlierKeepsAnchorAndReusesRows() {
  const harness = createHarness();
  const container = harness.dom.messagesContainer;
  const conv = makeConversation('c', 320);
  conv._historyWindow = 150;
  harness.state.conversations[conv.id] = conv;
  harness.state.conversationOrder = [conv.id];
  harness.state.activeConvId = conv.id;

  render(harness);
  const wrapper = container.querySelector('#loadEarlierBtn').parentNode;
  assert.ok(wrapper, 'hidden history must render a load-earlier control');
  assert.equal(wrapper.getAttribute('data-hidden-count'), '170', 'control must report the hidden message count');
  const anchoredRow = container.querySelector('[data-message-id="c-m200"]');
  assert.ok(anchoredRow, 'window must start 150 rows before the newest message');

  container.scrollTop = 50;
  const anchoredTopBefore = anchoredRow.getBoundingClientRect().top;
  const createdBefore = harness.createdRowCount();
  const loadButton = container.querySelector('#loadEarlierBtn');
  loadButton.dispatch('click', { preventDefault() {} });
  assert.equal(harness.createdRowCount() - createdBefore, 100, 'loading earlier must only create the newly revealed rows');

  const wrapperAfter = container.querySelector('#loadEarlierBtn') && container.querySelector('#loadEarlierBtn').parentNode;
  assert.equal(wrapperAfter, wrapper, 'load-earlier control must be reused, not rebuilt');
  assert.equal(wrapper.getAttribute('data-hidden-count'), '70', 'control must update the hidden count in place');
  assert.match(container.querySelector('#loadEarlierBtn').textContent, /70/, 'control label must reflect the new hidden count');

  const ids = rowIds(harness);
  assert.equal(ids.length, 250, 'loading earlier must widen the window by 100 rows');
  assert.equal(ids[0], 'c-m70', 'window must extend earlier by 100 messages');
  assert.equal(container.querySelector('[data-message-id="c-m200"]'), anchoredRow, 'already-visible rows must be reused while loading earlier');
  assert.ok(Math.abs(anchoredRow.getBoundingClientRect().top - anchoredTopBefore) < 0.5, 'loading earlier must keep the anchored row at the same viewport offset');
  assert.equal(container.scrollTop, 10050, 'loading earlier must keep the first visible row at the same offset');
}

function testScrollBehavior() {
  const harness = createHarness();
  const conv = makeConversation('c', 6);
  harness.state.conversations[conv.id] = conv;
  harness.state.conversationOrder = [conv.id];
  harness.state.activeConvId = conv.id;
  const container = harness.dom.messagesContainer;

  render(harness);
  container.scrollTop = 550;
  render(harness);
  assert.equal(container.scrollTop, container.scrollHeight, 'near-bottom readers follow new content to the bottom');

  container.scrollTop = 50;
  render(harness);
  assert.equal(container.scrollTop, 50, 'readers who are not at the bottom keep their position');

  container.scrollTop = 250;
  conv.messages[0].content = 'rewritten';
  render(harness);
  assert.equal(container.scrollTop, 250, 'scroll anchor must keep the first visible row steady after an earlier change');
}

function testEmptyStateAndConversationSwitch() {
  const harness = createHarness();
  const first = makeConversation('first', 3);
  const second = makeConversation('second', 2);
  harness.state.conversations[first.id] = first;
  harness.state.conversations[second.id] = second;
  harness.state.conversationOrder = [first.id, second.id];
  harness.state.activeConvId = first.id;

  render(harness);
  assert.equal(rowIds(harness).length, 3, 'first conversation renders its rows');

  harness.state.activeConvId = second.id;
  render(harness);
  assert.deepEqual(rowIds(harness), ['second-m0', 'second-m1'], 'switching conversations clears the previous rows once');

  harness.state.conversations[second.id].messages = [];
  render(harness);
  assert.equal(rowNodes(harness).length, 0, 'empty conversation must clear the message rows');
}

function testStreamingNodeRetentionAndCreation() {
  const harness = createHarness();
  const conv = makeConversation('c', 2);
  harness.state.conversations[conv.id] = conv;
  harness.state.conversationOrder = [conv.id];
  harness.state.activeConvId = conv.id;

  render(harness);
  const rows = rowNodes(harness);
  const streaming = createFakeNode('div');
  streaming.id = 'streamingMsg';
  harness.dom.messagesContainer.appendChild(streaming);
  harness.state.isGenerating = true;
  render(harness);
  assert.equal(harness.dom.messagesContainer.children[harness.dom.messagesContainer.children.length - 1], streaming, 'existing streaming node must be retained');
  assertSameNodes(rows, rowNodes(harness), 'streaming render must reuse message rows');

  harness.state.isGenerating = false;
  streaming.remove();
  harness.state.isGenerating = true;
  render(harness);
  const created = harness.dom.messagesContainer.children.find((child) => child.id === 'streamingMsg');
  assert.ok(created, 'streaming placeholder must be created while generating');
}

function testSidebarKeyedReuse() {
  const harness = createHarness();
  const a = makeConversation('a', 2);
  const b = makeConversation('b', 2);
  harness.state.conversations = { a, b };
  harness.state.conversationOrder = ['a', 'b'];
  harness.state.activeConvId = 'a';

  harness.api.renderConversationList();
  const beforeRows = harness.dom.convList.children.slice();
  assert.equal(beforeRows.length, 2, 'sidebar renders one row per conversation');
  assert.equal(beforeRows[0].getAttribute('data-conv-id'), 'a', 'sidebar order follows the visible conversation order');

  harness.api.renderConversationList();
  assertSameNodes(beforeRows, harness.dom.convList.children.slice(), 'unchanged sidebar render');

  harness.state.activeConvId = 'b';
  harness.api.renderConversationList();
  const afterRows = harness.dom.convList.children.slice();
  assert.equal(afterRows.length, 2, 'sidebar must not duplicate rows');
  assertSameNodes(beforeRows, afterRows, 'sidebar keeps its row nodes when only the active conversation changes');
  assert.equal(afterRows[1].getAttribute('data-conv-id'), 'b', 'active conversation row stays in place');
  assert.ok(afterRows[1].getAttribute('class').includes('active'), 'active state must update on the reused row');
  assert.ok(!afterRows[0].getAttribute('class').includes('active'), 'the previously active row loses the active class in place');
}

function createRenderSubscriptionHarness() {
  const counts = { conversationList: 0, messages: 0, characterCard: 0, topBar: 0, worldInfoWarning: 0, inputState: 0 };
  let latest = 0, observed = -1;
  let handler = null;
  const env = {
    appStore: { subscribe(fn) { handler = fn; } },
    pruneCardRuntimeInstances() {},
    renderConversationListOnly() { counts.conversationList += 1; observed = latest; },
    renderMessagesOnly() { counts.messages += 1; },
    renderCharacterCard() { counts.characterCard += 1; },
    renderTopBar() { counts.topBar += 1; },
    renderWorldInfoBudgetWarning() { counts.worldInfoWarning += 1; },
    updateInputState() { counts.inputState += 1; },
    console,
  };
  const names = Object.keys(env);
  new Function(...names, readSource('core/33-render-subscriptions.js'))(...names.map((name) => env[name]));
  return { counts, notify: (keys) => handler(keys), setLatest: value => { latest = value; }, observed: () => observed };
}

async function testRenderSubscriptionCoalescesRegions() {
  const harness = createRenderSubscriptionHarness();
  harness.notify(['conversations', 'conversationOrder', 'activeConvId']);
  harness.setLatest(2);
  harness.notify(['conversations']);
  assert.equal(harness.counts.conversationList, 0, 'render work waits for the final state of the synchronous batch');
  await Promise.resolve();
  assert.equal(harness.counts.conversationList, 1, 'one batch must render the conversation list once');
  assert.equal(harness.counts.messages, 1, 'active conversation change renders messages once');
  assert.equal(harness.counts.characterCard, 1, 'active conversation change renders the character card once');
  assert.equal(harness.counts.topBar, 1, 'active conversation change renders the top bar once');
  assert.equal(harness.counts.worldInfoWarning, 1, 'active conversation change renders the world-info warning once');
  assert.equal(harness.counts.inputState, 0, 'rendering-only keys must not touch the input state');
  assert.equal(harness.observed(), 2, 'coalescing must draw the final state, never drop a later state change');

  // 状态控件不参与合并，每次通知都同步执行。
  harness.notify(['isGenerating']);
  harness.notify(['isGenerating']);
  assert.equal(harness.counts.inputState, 2, 'state control updates stay synchronous per notification');

  // 进入新 tick 后可以再次渲染。
  await Promise.resolve();
  harness.setLatest(3);
  harness.notify(['conversations']);
  harness.setLatest(4);
  harness.notify(['conversationOrder']);
  await Promise.resolve();
  assert.equal(harness.counts.conversationList, 2, 'a new tick may render the same region again');
  assert.equal(harness.observed(), 4);
}

const tests = [
  testUnchangedRenderReusesNodes,
  testContentChangeRebuildsOnlyChangedRow,
  testRepeatedUnchangedRenderProducesNoMutations,
  testMvuVariableChangeRebuildsDependentSuffix,
  testManualMvuDataChangeRebuildsItsRow,
  testFavoritePatchesOnlyTargetButton,
  testVersionChangeRebuildsOnlyItsRow,
  testSettingChangeInvalidatesAllRows,
  testWindowSlideKeepsRemainingRows,
  testSlidingWindowReusesSurvivingLastRow,
  testFrontDeletionPatchesActionIndexes,
  testSystemMessagesKeepOriginalActionIndexes,
  testFiveHundredMessageWindow,
  testLoadEarlierKeepsAnchorAndReusesRows,
  testScrollBehavior,
  testEmptyStateAndConversationSwitch,
  testStreamingNodeRetentionAndCreation,
  testSidebarKeyedReuse,
  testRenderSubscriptionCoalescesRegions,
];

for (const test of tests) {
  await test();
  console.log(`ok ${test.name}`);
}
console.log(`R6 local render runtime checks passed (${tests.length} cases).`);
