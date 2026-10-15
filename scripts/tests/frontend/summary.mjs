import { assert, messageIdentitySource, summaryValiditySource, prepareVerifiedSummaryFixture, mutationPersistenceSource } from '../support.mjs';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';


async function assertFrontendSummaryService() {
  const promptSources = await Promise.all([
    '../../../src/app/summary/53-summary-default-prompts.js',
    '../../../src/app/summary/53-summary-prompt-limits.js',
    '../../../src/app/summary/53-summary-prompt-builder.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));
  const apiSource = await readFile(new URL('../../../src/app/summary/53-summary-api-client.js', import.meta.url), 'utf8');
  const serviceSource = await readFile(new URL('../../../src/app/summary/53-summarization-service.js', import.meta.url), 'utf8');
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
        ok: true,
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

  context.fetch = async () => ({
    ok: false,
    status: 401,
    async text() { return JSON.stringify({ error: { message: 'invalid summary key' } }); },
  });
  const providerError = await new Promise((resolve) => {
    context.generateSummary([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'world' },
    ], (err) => resolve(err));
  });
  assert(providerError && /API Error 401.*invalid summary key/.test(providerError.message),
    'Summary HTTP failures should expose the provider status and message.');

  context.fetch = async () => ({
    ok: true,
    async json() { throw new SyntaxError('invalid JSON'); },
  });
  const invalidJsonError = await new Promise((resolve) => {
    context.generateSummary([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'world' },
    ], (err) => resolve(err));
  });
  assert(invalidJsonError && /invalid JSON/.test(invalidJsonError.message),
    'Summary success responses with invalid JSON should report a format error.');
}

async function assertFrontendAutoSummarizationHelpers() {
  const sources = await Promise.all([
    '../../../src/app/prompt/41-prompt-history-messages.js',
    '../../../src/app/summary/54-summarization-auto-threshold.js',
    '../../../src/app/summary/54-summarization-auto-selection.js',
    '../../../src/app/summary/54-summarization-auto-runtime.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));
  const tokenBarSource = await readFile(new URL('../../../src/app/chat/61-chat-shell-ui.js', import.meta.url), 'utf8');

  function makeMessages(count) {
    return Array.from({ length: count }, (_, idx) => ({
      role: idx % 2 === 0 ? 'user' : 'assistant',
      content: `message-${idx}`,
    }));
  }

  let activeConv = null;
  let summaryFailure = null;
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
      cb(summaryFailure);
    },
    renderTokenBar() {
      events.push({ type: 'token' });
    },
    alert(message) {
      events.push({ type: 'alert', message });
    },
    t(key) {
      return key === 'summary_auto_failed' ? 'Automatic summary failed' : key;
    },
    console,
    Math,
    Array,
  };

  vm.runInNewContext(`${messageIdentitySource}\n${summaryValiditySource}\n${sources.join('\n')}\nthis.__auto = autoSummarize;\nthis.__select = buildAutoSummarySelection;\nthis.__visible = getActualVisibleCountForSummary;`, context);

  function reset(settings, conv) {
    events.length = 0;
    context.state.settings = settings;
    activeConv = prepareVerifiedSummaryFixture(context, conv);
    context.state.conversations = { [conv.id]: conv };
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

  const beforeThreshold = context.__select(
    { messages: makeMessages(10), summaries: [] },
    { summaryThreshold: 12 },
    () => 10
  );
  assert(beforeThreshold === null, 'Auto summarization must not trigger before the configured threshold.');

  const atThreshold = context.__select(
    { messages: makeMessages(12), summaries: [] },
    { summaryThreshold: 12 },
    () => 12
  );
  assert(atThreshold && atThreshold.subset.length === 8 && atThreshold.endIdx === 7,
    'Auto summarization should trigger exactly at the configured threshold and keep the recent buffer.');

  const partialCoverageSelection = context.__select(
    prepareVerifiedSummaryFixture(context, {
      messages: makeMessages(16),
      summaries: [{ coveredStart: 10, coveredEnd: 13 }],
    }),
    { summaryThreshold: 12 },
    () => 12
  );
  assert(partialCoverageSelection
    && partialCoverageSelection.startIdx === 0
    && partialCoverageSelection.endIdx === 7
    && partialCoverageSelection.subset.length === 8,
  'Auto summarization must not treat messages before a partial/manual summary as already covered.');

  reset(
    { summaryEnabled: true, summaryThreshold: 9, contextLength: 20 },
    { messages: makeMessages(9), summaries: [] }
  );
  assert(context.__visible() === 9, 'Auto summarization visible-count fallback should match current visible messages.');
  context.__auto();
  assert(events[0].type === 'summary' && events[0].count === 5 && events[0].startIdx === 0 && events[0].endIdx === 4, 'Auto summarization fallback should trigger at the visible-count threshold.');

  summaryFailure = new Error('summary endpoint blocked');
  reset(
    { summaryEnabled: true, summaryThreshold: 9, contextLength: 20 },
    { messages: makeMessages(9), summaries: [] }
  );
  context.__auto();
  assert(events.some((event) => event.type === 'alert' && event.message.includes('summary endpoint blocked')),
    'Auto summarization failures must be visible instead of being silently ignored.');
  assert(!events.some((event) => event.type === 'token'),
    'A failed auto summary must not render the token bar as though it succeeded.');

  const tokenDom = {
    tokenCount: { textContent: '' },
    tokenMax: { textContent: '' },
    tokenBar: { style: {} },
  };
  const tokenContext = {
    state: { settings: { contextLength: 12 } },
    dom: tokenDom,
    getActiveConv: () => ({ messages: makeMessages(117) }),
    getActualVisibleCountForSummary: () => 3,
    buildMessagesForAPI: () => makeMessages(15),
    t: (key) => key === 'msgs_label' ? 'messages' : key,
    document: { body: { classList: { contains: () => false } } },
    Math,
  };
  vm.runInNewContext(`${tokenBarSource}\nthis.__renderTokenBar = renderTokenBar;`, tokenContext);
  tokenContext.__renderTokenBar();
  assert(tokenDom.tokenCount.textContent === 3,
    'The context bar must show unsummarized chat history instead of fixed prompt injections.');
  assert(tokenDom.tokenMax.textContent === 'max 12 messages',
    'The context bar maximum should continue to reflect the configured history limit.');
}

async function assertFrontendSummarizationRuntimeLock() {
  const source = await readFile(new URL('../../../src/app/summary/54-summarization-runtime.js', import.meta.url), 'utf8');
  const makeMessages = () => Array.from({ length: 6 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `message-${i}` }));
  let activeConv = { id: 'summary-lock', messages: makeMessages(), summaries: [], updated: 0 };
  const pending = [];
  const completions = [];
  const context = {
    state: { conversations: { [activeConv.id]: activeConv } },
    getActiveConv: () => activeConv,
    generateSummary(messages, callback) { pending.push(callback); },
    makeId: () => `summary-${Array.isArray(activeConv.summaries) ? activeConv.summaries.length + 1 : 1}`,
    persistState(_immediate, options) {
      options?.beforePersist?.();
      options?.onPersistSuccess?.();
    },
    renderSummaryHistory() {},
    t: (key) => key,
    dom: {},
    alert() {},
    Date,
    Error,
    WeakSet,
  };

  vm.runInNewContext(`${messageIdentitySource}\n${summaryValiditySource}\n${mutationPersistenceSource}\n${source}\nthis.__perform = performSummarization;`, context);
  context.normalizeConversationMessageIdentity(activeConv);
  const subset = activeConv.messages.slice(0, 2);
  context.__perform(subset, 0, 1, (err) => completions.push(err));
  context.__perform(subset, 0, 1, (err) => completions.push(err));

  assert(pending.length === 1, 'A conversation must not start a duplicate summary request while one is in flight.');
  assert(completions.length === 1 && completions[0] instanceof Error,
    'A duplicate summary attempt should finish with an explicit in-progress error.');

  await pending[0](null, 'first summary');
  context.__perform(activeConv.messages.slice(2, 4), 2, 3, (err) => completions.push(err));
  assert(pending.length === 2, 'The summary lock should release after the first request completes.');
  await pending[1](new Error('network failed'));
  context.__perform(activeConv.messages.slice(4, 6), 4, 5, (err) => completions.push(err));
  assert(pending.length === 3, 'The summary lock should also release after a request fails.');

  await pending[2](null, 'third summary');
  activeConv = { id: 'legacy-lock', messages: makeMessages(), updated: 0 };
  context.state.conversations[activeConv.id] = activeConv;
  context.__perform(activeConv.messages.slice(0, 2), 0, 1, (err) => completions.push(err));
  let legacyWriteError = null;
  try {
    await pending[3](null, 'legacy conversation summary');
  } catch (error) {
    legacyWriteError = error;
  }
  assert(!legacyWriteError && Array.isArray(activeConv.summaries) && activeConv.summaries.length === 1,
    'Summarization should initialize missing summary storage for legacy conversations.');
}

async function assertFrontendSummaryManagerHelpers() {
  const sources = await Promise.all([
    '../../../src/app/summary/58-summary-manager-range-ui.js',
    '../../../src/app/summary/58-summary-manager-generation-ui.js',
    '../../../src/app/summary/58-summary-manager-open-ui.js',
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
    '../../../src/app/summary/55-summary-history-render.js',
    '../../../src/app/summary/55-summary-history-ui.js',
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

  vm.runInNewContext(`${messageIdentitySource}\n${summaryValiditySource}\n${sources.join('\n')}\nthis.editSummary = recordEditSummary;\nthis.deleteSummary = recordDeleteSummary;\nthis.__count = getSummaryHistoryMessageCount;\nthis.__range = buildSummaryHistoryRangeText;\nthis.__item = buildSummaryHistoryItemHtml;\nthis.__render = renderSummaryHistory;`, context);

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
export { assertFrontendSummaryService, assertFrontendAutoSummarizationHelpers, assertFrontendSummarizationRuntimeLock, assertFrontendSummaryManagerHelpers, assertFrontendSummaryHistoryUI };
