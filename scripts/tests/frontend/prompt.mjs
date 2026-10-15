import { assert, messageIdentitySource, summaryValiditySource, responseVersionsSource, mutationPersistenceSource, prepareVerifiedSummaryFixture } from '../support.mjs';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';


async function assertFrontendPromptSummaryEvents() {
  const sources = await Promise.all([
    '../../../src/app/prompt/66-prompt-viewer-state.js',
    '../../../src/app/prompt/66-prompt-viewer-clipboard.js',
    '../../../src/app/prompt/66-prompt-viewer-events.js',
    '../../../src/app/summary/66-summary-manager-events.js',
    '../../../src/app/summary/66-prompt-summary-events.js',
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
  assert(dom.promptViewerContent.textContent.includes('下一次预览') && dom.promptViewerContent.textContent.includes('main prompt'), 'Prompt viewer should label its read-only preview and render the main prompt.');
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

async function assertFrontendSecondStageRuntime() {
  const sources = await Promise.all([
    '../../../src/app/prompt/41-second-stage-content-isolation.js',
    '../../../src/app/generation/52-generation-runtime.js',
    '../../../src/app/generation/52-generation-second-stage-runtime.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  let parent = { id: 'main-id', role: 'assistant', stage: 'main', speaker: 'Makoto', content: '正文' };
  let oldSecond = { id: 'second-id', role: 'assistant', stage: 'second', parentId: 'main-id', content: '旧选项' };
  const conv = { id: 'conv', messages: [parent, oldSecond] };
  let activeConv = conv;
  const events = [];
  let pending = null;
  let doneResult = null;
  let generatedId = 0;
  let persistShouldFail = false;
  const context = {
    state: {
      isGenerating: true,
      settings: { twoStageTemperature: 0.3, twoStageTopP: 0.85, maxTokens: 1024 },
      conversations: { conv },
    },
    getActiveConv: () => activeConv,
    DEFAULT_TWO_STAGE_PROMPT: '只输出 <options> 行动选项 XML。',
    ensureMessageIdentity() {},
    buildMessagesForSecondStage: () => [{ role: 'user', content: 'build options' }],
    buildSecondStageCorrectionMessages: (messages) => messages.concat([{ role: 'user', content: 'RETRY_INVALID_FORMAT' }]),
    removeGenerationStreamingBubble(stage) { events.push('remove:' + stage); },
    updateStreamingBubble(content, target, label, cot, stage) { events.push('stream:' + stage + ':' + content); },
    streamChatWithMessages(messages, onToken, onComplete, onError) {
      pending = { messages, onToken, onComplete, onError };
    },
    finishAssistantMessage(target, content, speaker, stage, parentId) {
      const message = { id: 'new-second', role: 'assistant', content, speaker, stage, parentId };
      target.messages.push(message);
      events.push('append:' + content);
      return message;
    },
    async persistState(_immediate, options) {
      events.push('persist');
      if (persistShouldFail) {
        if (options && options.onPersistError) options.onPersistError();
        throw new Error('save failed');
      }
      if (options && options.onPersistSuccess) options.onPersistSuccess();
    },
    makeId() { return `generated-${++generatedId}`; },
    renderMessagesOnly() { events.push('render'); },
    renderTokenBar() { events.push('token'); },
    appStore: { notify(key) { events.push('notify:' + key); } },
    alert(message) { events.push('alert:' + message); },
    isLiveConversation: () => true,
    isGroupChat: () => false,
    t: () => '第二阶段',
    Date: { now: () => 888 },
    String,
    Array,
    RegExp,
    parseInt,
    console,
  };

  vm.runInNewContext(`${messageIdentitySource}\n${summaryValiditySource}\n${responseVersionsSource}\n${mutationPersistenceSource}\n${sources.join('\n')}\nthis.__runSecond = runSecondStageGeneration;\nthis.__completePrimary = handlePrimaryAssistantComplete;\nthis.__normalize = normalizeSecondStageOptions;`, context);

  const fencedExample = [
    '正文开头',
    '```xml',
    '<options><option><title>这是示例</title><description>不能把示例变成选项</description></option></options>',
    '```',
    '正文结尾',
  ].join('\n');
  const saveConv = { id: 'save-conv', messages: [] };
  context.state.settings.twoStageEnabled = true;
  context.state.conversations[saveConv.id] = saveConv;
  await context.__completePrimary(fencedExample, '', null, saveConv, { interrupted: true });
  assert(saveConv.messages.length === 1 && saveConv.messages[0].content === fencedExample,
    'Primary completion must save fenced XML examples with both surrounding prose sections intact. Saved: ' + JSON.stringify(saveConv.messages.map((message) => message.content)) + ' Events: ' + JSON.stringify(events));

  const unclosedFenceExample = [
    '正文开头',
    '```xml',
    '<options><option><title>未闭合示例</title><description>保留后文</description></option>',
    '```',
    '正文结尾',
  ].join('\n');
  const unclosedSaveConv = { id: 'unclosed-save-conv', messages: [] };
  context.state.conversations[unclosedSaveConv.id] = unclosedSaveConv;
  await context.__completePrimary(unclosedFenceExample, '', null, unclosedSaveConv, { interrupted: true });
  assert(unclosedSaveConv.messages.length === 1 && unclosedSaveConv.messages[0].content === unclosedFenceExample,
    'Primary completion must not truncate prose after an unclosed options example.');

  const normalizedFencedSecondStage = context.__normalize([
    '以下是可选行动：',
    '```xml',
    '<options><option><title>缺外闭合</title><description>仍然完整。</description></option>',
    '```',
    '请选择。',
  ].join('\n'));
  assert(normalizedFencedSecondStage.includes('<title>缺外闭合</title>') && normalizedFencedSecondStage.endsWith('</options>'),
    'Default second-stage normalization must still recover complete options from an overall fenced response missing the outer close.');

  function refreshTargets() {
    parent = conv.messages.find((message) => message.id === 'main-id');
    oldSecond = conv.messages.find((message) => message.id === 'second-id');
  }

  context.__runSecond(parent, (err, savedMessage) => { doneResult = { err, savedMessage }; }, oldSecond);
  assert(conv.messages.length === 2 && conv.messages[1] === oldSecond && oldSecond.content === '旧选项', 'Second-stage replacement should remain non-destructive while the request is pending.');
  await pending.onComplete('```xml\n<options><option><title>握住手</title><description>轻轻回应 & 等待。</description></option></options>\n```', '', { total_tokens: 12 });
  refreshTargets();
  assert(conv.messages.length === 2 && conv.messages[1].id === 'second-id', 'Successful second-stage regeneration should replace the original message ID in place without duplicates.');
  assert(oldSecond.content.startsWith('<options>') && oldSecond.content.includes('<title>握住手</title>') && oldSecond.content.includes('&amp;'), 'Successful second-stage regeneration should persist canonical options XML.');
  assert(doneResult && doneResult.err === null && doneResult.savedMessage.id === oldSecond.id && doneResult.savedMessage.content === oldSecond.content && events.includes('persist') && events.includes('render'), 'Successful second-stage replacement should persist, render, and return the saved message.');
  assert(parent.responseVersions.length === 2 && parent.responseVersions[0].secondMessages[0].content === '旧选项' && parent.selectedResponseVersionId === parent.responseVersions[1].id,
    'Second-stage regeneration must retain the old response group as a recoverable version.');

  oldSecond.content = '上一次有效选项';
  persistShouldFail = true;
  let saveFailureDoneCount = 0;
  context.__runSecond(parent, () => { saveFailureDoneCount += 1; }, oldSecond);
  await pending.onComplete('<options><option><title>保存失败</title><description>不得覆盖旧选项。</description></option></options>', '', null);
  assert(oldSecond.content === '上一次有效选项' && saveFailureDoneCount === 1,
    'Second-stage save failures must preserve the previous option and settle exactly once.');
  persistShouldFail = false;

  oldSecond.content = '上一次有效选项';
  events.length = 0;
  doneResult = null;
  context.__runSecond(parent, (err, savedMessage) => { doneResult = { err, savedMessage }; }, oldSecond);
  const firstInvalid = pending;
  await firstInvalid.onComplete('模型没有按格式回答', '', null);
  assert(oldSecond.content === '上一次有效选项' && conv.messages.length === 2, 'Invalid second-stage output must preserve the previous valid option message before retry.');
  assert(pending !== firstInvalid && doneResult === null, 'Default prompt must issue a single format-correction request before deciding.');
  assert(pending.messages.at(-1).role === 'user' && pending.messages.at(-1).content === 'RETRY_INVALID_FORMAT', 'Correction request must keep the original context and add a user format reminder.');
  await pending.onComplete('仍然没有选项', '', null);
  assert(oldSecond.content === '上一次有效选项' && conv.messages.length === 2, 'Second invalid output must still preserve the previous valid option message.');
  assert(doneResult && doneResult.err && doneResult.err.message === '未返回有效的选项格式' && !doneResult.savedMessage && events.some((event) => event.includes('原有回复已保留')), 'Invalid second-stage output should report an error that explains the preserved fallback.');

  events.length = 0;
  doneResult = null;
  context.__runSecond(parent, (err) => { doneResult = { err }; }, oldSecond);
  pending.onError(new Error('network failed'));
  assert(oldSecond.content === '上一次有效选项' && doneResult.err.message === 'network failed', 'Second-stage network failures must preserve the previous valid option message.');

  context.state.settings.twoStageSystemPrompt = '输出本轮状态栏。';
  const statusOutput = '<details><summary>状态栏</summary><p>HP: 100</p></details>';
  context.__runSecond(parent, (err, savedMessage) => { doneResult = { err, savedMessage }; }, oldSecond);
  await pending.onComplete(statusOutput, '', null);
  refreshTargets();
  assert(doneResult.err === null && oldSecond.content === statusOutput, 'Custom second-stage prompts must retain their existing non-option output formats.');

  context.state.settings.twoStageSystemPrompt = '';
  context.__runSecond(parent, (err, savedMessage) => { doneResult = { err, savedMessage }; });
  activeConv = { id: 'other-conv', messages: [] };
  events.length = 0;
  pending.onToken('', '<options>', '');
  assert(!events.some((event) => event.startsWith('stream:')), 'Second-stage tokens must not appear in another conversation after switching chats.');
  await pending.onComplete('<options><option><title>原会话选项</title><description>留在原会话。</description></option></options>', '', null);
  assert(activeConv.messages.length === 0 && conv.messages[2].parentId === parent.id && conv.messages[2].content.includes('原会话选项'), 'Second-stage completion must save to the conversation that started the request after switching chats.');
}

async function assertFrontendPromptMessageHelpers() {
  const sources = await Promise.all([
    '../../../src/app/prompt/41-prompt-depth-insert.js',
    '../../../src/app/prompt/41-prompt-summary-messages.js',
    '../../../src/app/prompt/41-second-stage-content-isolation.js',
    '../../../src/app/prompt/41-prompt-history-messages.js',
    '../../../src/app/prompt/41-prompt-outlet-resolution.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));
  const context = {
    state: { settings: { twoStageEnabled: true } },
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

  vm.runInNewContext(`${messageIdentitySource}\n${summaryValiditySource}\n${sources.join('\n')}\nthis.__insert = insertMessagesAtDepth;\nthis.__summary = buildPromptSummaryMessage;\nthis.__regular = getRegularPromptMessages;\nthis.__outlets = resolvePromptOutletPlaceholders;\nthis.__replace = replacePromptMessagePlaceholders;\nthis.__strip = isolatePrimaryStageContent;\nthis.__stripKnownSecondStage = (content) => stripSecondStageOptionBlocks(content, true);`, context);

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
      { role: 'assistant', stage: 'second', content: '<options><option><title>old leak</title></option></options>' },
      { role: 'user', content: 'visible one' },
      { role: 'assistant', content: 'visible two\n<options><option><title>main leak</title></option></options>' },
      { role: 'user', content: 'visible three' },
      { role: 'assistant', content: '' },
    ],
  };
  prepareVerifiedSummaryFixture(context, conv);
  const regular = context.__regular(conv, 2);
  assert(regular.map((m) => m.content).join(',') === 'visible two,visible three', 'Prompt regular history should skip summarized messages and respect context length.');
  assert(regular.every((m) => !m.content.includes('<options>')), 'Primary prompt history should exclude second-stage messages and strip leaked option blocks from main replies.');
  regular[0].content = 'mutated';
  assert(conv.messages[5].content.startsWith('visible two'), 'Prompt regular history should clone messages before outlet mutation.');

  const historyExamples = [
    '正文开头',
    '```xml',
    '<options><option><title>这是示例</title><description>不能把示例变成选项</description></option></options>',
    '```',
    '正文结尾',
  ].join('\n');
  const historyExampleMessages = context.__regular({ messages: [{ role: 'assistant', content: historyExamples }] }, 10);
  assert(historyExampleMessages.length === 1 && historyExampleMessages[0].content === historyExamples,
    'Prompt history requests must preserve fenced XML examples and both surrounding prose sections.');

  const unclosedHistoryExamples = [
    '正文开头',
    '````xml extra',
    '<OPTIONS data-kind="example"><option><title>未闭合示例</title><description>保留后文</description></option>',
    '```',
    '正文结尾',
  ].join('\n');
  const unclosedHistoryMessages = context.__regular({ messages: [{ role: 'assistant', content: unclosedHistoryExamples }] }, 10);
  assert(unclosedHistoryMessages.length === 1 && unclosedHistoryMessages[0].content === unclosedHistoryExamples,
    'Prompt history requests must preserve unclosed variable-length fences, attribute tags, and trailing prose.');

  const boundaryExamples = [
    '<options><option><title>实际块一</title></option></options>',
    '~~~~html',
    '<options><option><title>波浪围栏示例</title></option></options>',
    '~~~~',
    '````xml',
    '<options><option><title>变长围栏示例</title></option></options>',
    '```',
    '````',
    '``',
    '<options><option><title>跨行 inline 示例</title></option></options>',
    '``',
    '&lt;options&gt;&lt;option&gt;转义标签示例&lt;/option&gt;&lt;/options&gt;',
    '<OPTIONS data-kind="real"><option><title>带属性实际块</title></option></OPTIONS>',
    '尾部',
  ].join('\n');
  const expectedBoundaryText = [
    '~~~~html',
    '<options><option><title>波浪围栏示例</title></option></options>',
    '~~~~',
    '````xml',
    '<options><option><title>变长围栏示例</title></option></options>',
    '```',
    '````',
    '``',
    '<options><option><title>跨行 inline 示例</title></option></options>',
    '``',
    '&lt;options&gt;&lt;option&gt;转义标签示例&lt;/option&gt;&lt;/options&gt;',
    '尾部',
  ].join('\n');
  assert(context.__strip(boundaryExamples) === expectedBoundaryText,
    'Primary isolation must reuse variable fences, wave fences, multiline inline code, escaped tags, multiple blocks, case, and attributes.');

  const uncertainControlBlock = '正文开头\n<OPTIONS data-kind="unknown"><option><title>无法确认</title></option>\n正文结尾';
  assert(context.__strip(uncertainControlBlock) === uncertainControlBlock,
    'Uncertain unclosed control blocks must remain verbatim instead of truncating later prose.');

  const closeTagInsideCodeExample = '正文开头<options>\n```xml\n</options>\n```\n正文结尾';
  assert(context.__strip(closeTagInsideCodeExample) === closeTagInsideCodeExample,
    'A control block must not close across protected code boundaries.');

  const literalOptionTagsInExplanation = '说明：<options>是选项容器</options>。后文';
  assert(context.__strip(literalOptionTagsInExplanation) === literalOptionTagsInExplanation,
    'Literal option tags in explanatory prose without a complete option item must remain verbatim.');

  const inlineCodeSecondStage = '<options><option><title>继续</title><description>选择 `ABC` 然后继续。</description></option></options>';
  assert(context.__strip(inlineCodeSecondStage) === inlineCodeSecondStage,
    'Primary isolation must continue protecting option ranges that overlap inline code.');
  assert(context.__stripKnownSecondStage(inlineCodeSecondStage) === '',
    'Known second-stage display isolation must remove complete options even when descriptions contain inline code.');

  const attachmentOnlyHistory = {
    summaries: [{ coveredEnd: 2 }],
    messages: [
      { role: 'user', content: 'summarized user' },
      { role: 'assistant', content: '', attachments: [{ type: 'image' }] },
      { role: 'assistant', content: 'summarized assistant' },
      { role: 'user', content: 'still visible user' },
      { role: 'assistant', content: 'still visible assistant' },
    ],
  };
  prepareVerifiedSummaryFixture(context, attachmentOnlyHistory);
  const attachmentRegular = context.__regular(attachmentOnlyHistory, 10);
  assert(attachmentRegular.map((m) => m.content).join(',') === 'still visible user,still visible assistant', 'Attachment-only messages must not shift summary coverage over unsummarized text messages.');

  const partialCoverage = {
    summaries: [{ coveredStart: 6, coveredEnd: 9, text: 'summary of m6 through m9' }],
    messages: Array.from({ length: 10 }, (_, index) => ({
      role: index % 2 === 0 ? 'user' : 'assistant',
      content: `m${index}`,
    })),
  };
  prepareVerifiedSummaryFixture(context, partialCoverage);
  const partialRegular = context.__regular(partialCoverage, 20);
  assert(partialRegular.map((m) => m.content).join(',') === 'm0,m1,m2,m3,m4,m5',
    'A manual summary should remove only the messages inside its covered range.');
  partialCoverage.messages.push({ role: 'user', content: 'm10' });
  const partialWithNewMessage = context.__regular(partialCoverage, 20);
  assert(partialWithNewMessage.map((m) => m.content).join(',') === 'm0,m1,m2,m3,m4,m5,m10',
    'A manual summary must preserve older uncovered messages after a new turn is added.');

  const invalidCoverage = {
    summaries: [
      { coveredStart: -1, coveredEnd: 2, text: 'legacy invalid range' },
      { coveredStart: 3, coveredEnd: 99, text: 'out of bounds range' },
    ],
    messages: partialCoverage.messages.slice(0, 5),
  };
  const invalidCoverageRegular = context.__regular(invalidCoverage, 20);
  assert(invalidCoverageRegular.map((m) => m.content).join(',') === 'm0,m1,m2,m3,m4',
    'Invalid or stale summary ranges must not remove original prompt messages.');

  const outletMessages = [{ role: 'system', content: 'A {{outlet::Lore}} B {{outlet::Missing}} C {{char}}' }];
  context.__outlets(outletMessages, {
    Lore: [{ content: 'for {{user}}' }, { content: 'with {{char}}' }],
  }, 'Arona', 'Sensei');
  const replaced = context.__replace(outletMessages, 'Arona', 'Sensei');
  assert(replaced[0].content === 'A for Sensei\n\nwith Arona B  C Arona', 'Prompt outlet resolution or final placeholder replacement changed.');

  await assertFrontendDreamWrapperRender();
}

async function assertFrontendDreamWrapperRender() {
  const [identitySource, isolationSource, optionsSource, displayModelSource, source, cardModelSource, cardFrameSource] = await Promise.all([
    readFile(new URL('../../../src/app/conversation/32-message-identity.js', import.meta.url), 'utf8'),
    readFile(new URL('../../../src/app/prompt/41-second-stage-content-isolation.js', import.meta.url), 'utf8'),
    readFile(new URL('../../../src/app/chat/61-message-options-render.js', import.meta.url), 'utf8'),
    readFile(new URL('../../../src/app/chat/61-message-display-model.js', import.meta.url), 'utf8'),
    readFile(new URL('../../../src/app/chat/61-message-content-render.js', import.meta.url), 'utf8'),
    readFile(new URL('../../../src/app/card-runtime/61-card-runtime-model.js', import.meta.url), 'utf8'),
    readFile(new URL('../../../src/app/card-runtime/61-card-runtime-frame.js', import.meta.url), 'utf8'),
  ]);
  const context = {
    formatMessage: (text) => String(text),
    renderStaticMessage: (text) => String(text),
    escapeHtml: (text) => String(text || ''),
    crypto: webcrypto,
    TextEncoder,
    Object,
    Array,
    RegExp,
    String,
  };
  vm.runInNewContext(`${identitySource}\n${isolationSource}\n${optionsSource}\n${displayModelSource}\n${source}\n${cardModelSource}\n${cardFrameSource}\nthis.__render = renderAssistantContent;\nthis.__display = prepareMessageDisplay;\nthis.__strip = stripDreamControlWrappers;`, context);

  const wrapped = '<dream_plot>\n<dream_body>\n截图正文。\n</dream_body>\n<dream_after_format>\n<dream_done/>\n</dream_after_format>\n</dream_plot>';
  const rendered = context.__render(wrapped, {});
  assert(rendered.trim() === '截图正文。', 'dream 包装标记必须去除、只保留正文，实际：' + JSON.stringify(rendered));
  assert(!rendered.includes('dream_'), 'dream 控制标记不得残留在显示输出');

  const withStatus = '<dream_plot><dream_body>正文</dream_body><dream_after_format><details><summary>状态栏</summary><p>HP</p></details></dream_after_format></dream_plot>';
  const statusRendered = context.__strip(withStatus);
  assert(statusRendered.includes('正文') && statusRendered.includes('状态栏') && statusRendered.includes('<details>') && !statusRendered.includes('dream_'), '连续贴着正文的完整包装必须兼容，且 after_format 内的状态栏内容必须保留');

  const withOptions = '<dream_plot><dream_body>正文</dream_body><dream_after_format><options><option><title>T</title></option></options></dream_after_format></dream_plot>';
  assert(context.__strip(withOptions).includes('<options>') && !context.__strip(withOptions).includes('dream_'), 'after_format 内的选项内容必须保留');

  const fenced = ['示例：', '```', '<dream_plot>', '  <dream_body>code</dream_body>', '</dream_plot>', '```', '行内 ` <dream_done/> ` 示例'].join('\n');
  assert(context.__strip(fenced) === fenced, '代码围栏与行内代码中作为示例的 dream 标记必须保留');

  // 四反引号围栏内的一行三反引号不得结束代码，围栏关闭后必须继续去除正文包装。
  const fourFence = ['````', '```', '<dream_body>代码示例</dream_body>', '````', '<dream_plot>闭合后正文</dream_plot>'].join('\n');
  const fourFenceResult = context.__strip(fourFence);
  assert(fourFenceResult.includes('<dream_body>代码示例</dream_body>'), '四反引号围栏内的三反引号行必须仍属于代码');
  assert(!fourFenceResult.includes('<dream_plot>') && fourFenceResult.includes('闭合后正文'), '围栏关闭后必须继续去除正文包装');

  // 不同字符的标记不得互相闭合。
  const backtickFence = ['```', '~~~', '<dream_plot>波浪线代码</dream_plot>', '```', '<dream_body>正文</dream_body>'].join('\n');
  const backtickResult = context.__strip(backtickFence);
  assert(backtickResult.includes('<dream_plot>波浪线代码</dream_plot>'), '反引号围栏内的波浪线行不得关闭围栏');
  assert(!backtickResult.includes('dream_body') && backtickResult.includes('正文'), '反引号围栏关闭后继续去除正文包装');
  const tildeFence = ['~~~', '```', '<dream_plot>反引号代码</dream_plot>', '~~~', '<dream_body>正文</dream_body>'].join('\n');
  const tildeResult = context.__strip(tildeFence);
  assert(tildeResult.includes('<dream_plot>反引号代码</dream_plot>'), '波浪线围栏内的反引号行不得关闭围栏');
  assert(!tildeResult.includes('dream_body') && tildeResult.includes('正文'), '波浪线围栏关闭后继续去除正文包装');

  // 变长行内代码：双反引号包裹单反引号，内部的 dream 标记保留，代码外的包装仍去除。
  const variableInline = '示例 `` ` <dream_body>inline</dream_body> `` 之后 <dream_plot>正文</dream_plot>';
  const variableResult = context.__strip(variableInline);
  assert(variableResult.includes('<dream_body>inline</dream_body>'), '变长行内代码中的 dream 标记必须保留');
  assert(!variableResult.includes('<dream_plot>') && variableResult.includes('正文'), '行内代码外的 dream 包装仍须去除');

  // 跨行行内代码：代码跨行时内部标记受保护，闭合后继续去除。
  const multiLineInline = ['前 `` 跨行 <dream_body>code', '继续 `` 后 <dream_plot>正文</dream_plot>'].join('\n');
  const multiResult = context.__strip(multiLineInline);
  assert(multiResult.includes('<dream_body>code') && multiResult.includes('继续 ``'), '跨行行内代码必须整体受保护');
  assert(!multiResult.includes('<dream_plot>') && multiResult.includes('正文'), '跨行行内代码闭合后必须继续去除正文包装');

  // 大写 dream 标签同样去除；未知的 dream_* 标签保持不变。
  const upper = '<DREAM_PLOT><DREAM_BODY>大写正文</DREAM_BODY></DREAM_PLOT>';
  assert(!context.__strip(upper).includes('DREAM_') && context.__strip(upper).includes('大写正文'), '大写 dream 标签同样必须去除');
  const unknown = '<dream_scene>未知标签</dream_scene>';
  assert(context.__strip(unknown) === unknown, '未知的 dream_* 标签不得被去除');

  const javascript = 'URL: <dream_plot> 不是脚本 </dream_plot>';
  assert(!context.__strip(javascript).includes('dream_') && context.__strip(javascript).includes('不是脚本'), '去除标记不得破坏其余正文');

  // 真实卡片入口：创建入口和授权摘要先接收原始输入，静态区只对派生显示清理包装。
  const cardRaw = '<dream_plot>\n<dream_body>\n<script>window.auditMalicious=1</script>\n正常叙事正文。\n</dream_body>\n</dream_plot>';
  const character = { id: 'character-a', name: '验收角色', extensions: {} };
  const msg = { id: 'card-static', role: 'assistant', stage: 'main', content: cardRaw, selectedResponseVersionId: 'v1' };
  const conv = { id: 'conv-a', character, messages: [msg] };
  context.state = { conversations: { 'conv-a': conv }, activeConvId: 'conv-a' };
  context.getActiveConv = () => conv;
  context.getMessageSpeakerCharacter = () => character;
  context.cardRuntimeDigest = async (text) => {
    const bytes = await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text)));
    return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
  };
  let authorizationInput = null;
  context.prepareCardRuntimeExecution = async (text) => {
    authorizationInput = text;
    return { level: 'L0', entrySource: text, scripts: [], modules: [] };
  };
  const cardEntry = context.createCardRuntimeEntry(cardRaw, { conv, msg, character });
  assert(cardEntry, '真实卡片入口必须识别含脚本的 HTML 源码');
  assert(cardEntry.original === cardRaw, '卡片入口必须保留原始消息字节');
  assert(cardEntry.source === cardRaw, '卡片入口必须保留原始源码字节');
  assert(context.findCardRuntimeGrant(cardEntry) === null, '未授权时不得存在可直接运行的许可');
  const prepared = await context.prepareCardRuntimeGrant(cardEntry, { level: 'L0', permissions: {}, network: {} }, new AbortController().signal);
  assert(authorizationInput === cardRaw, '授权准备必须接收未清理的原始源码');
  assert(prepared.plan.entrySource === cardRaw, '授权计划必须保留未清理的原始源码');
  assert(prepared.source === cardRaw, '授权材料必须保留未清理的原始源码');
  const displayResult = context.__display({ text: cardRaw, context: { conv, msg, character }, messageRole: 'assistant', sourcePlacement: 'AI_OUTPUT', isolatePrimary: false });
  assert(displayResult.inputText === cardRaw && displayResult.executableText === cardRaw, '显示准备不得改写卡片可执行源码');
  context.activateCardRuntimeGrant(cardEntry, prepared);
  assert(context.findCardRuntimeGrant(cardEntry) === prepared, '确认授权后必须只复用同一逐卡许可');

  let cardDisplay = null;
  let renderPreparedResult = null;
  const prepareMessageDisplayImpl = context.prepareMessageDisplay;
  context.prepareMessageDisplay = (input) => {
    renderPreparedResult = prepareMessageDisplayImpl(input);
    return renderPreparedResult;
  };
  const renderCardRuntimeContentImpl = context.renderCardRuntimeContent;
  context.renderCardRuntimeContent = (text, renderContext, display) => {
    cardDisplay = { text, display };
    return renderCardRuntimeContentImpl(text, renderContext, display);
  };
  const cardHtml = context.__render(cardRaw, { conv, msg, character });
  assert(cardHtml.includes('data-action="card-runtime-run"') && cardHtml.includes('data-action="card-runtime-details"'), '真实卡片入口必须保留审核与运行入口');
  assert(cardHtml.includes('正常叙事正文。'), '卡片静态区必须保留正文');
  assert(!cardHtml.includes('<dream_plot>') && !cardHtml.includes('<dream_body>'), '卡片静态区不得显示代码外 dream 包装标记，实际：' + cardHtml);
  assert(cardDisplay && cardDisplay.text === displayResult.executableText && cardDisplay.display === renderPreparedResult, '卡片静态链必须复用单次显示准备结果');

  let cardFormatCalls = 0;
  let cardMvuCalls = 0;
  context.formatMessage = (text) => {
    cardFormatCalls += 1;
    return String(text);
  };
  context.renderDeclarativeTemplateSubset = (text) => {
    cardMvuCalls += 1;
    return { output: String(text), diagnostics: [] };
  };
  context.stripMvuControlBlocks = (text) => String(text).replace(/<UpdateVariable>[\s\S]*?<\/UpdateVariable>/g, '').trim();
  context.getMvuDataForMessage = () => ({});
  context.getMvuWorldInfoEntries = () => ({});
  context.getMvuDiagnostics = () => [];
  const isolatedCardRaw = '<UpdateVariable><JSONPatch>[]</JSONPatch></UpdateVariable>\n<script>window.onlyIsolatedFixture=1</script>\n原始卡片正文。';
  const isolatedMsg = { id: 'isolated-card', role: 'assistant', stage: 'main', content: isolatedCardRaw, selectedResponseVersionId: 'v1' };
  const isolatedConv = { id: 'conv-isolated', character, messages: [isolatedMsg] };
  context.state = { conversations: { 'conv-isolated': isolatedConv }, activeConvId: 'conv-isolated' };
  context.getActiveConv = () => isolatedConv;
  const isolatedHtml = context.__render(isolatedCardRaw, { conv: isolatedConv, msg: isolatedMsg, character });
  const isolatedEntry = Array.from(context.cardRuntimeEntries.values()).find((entry) => entry.msg === isolatedMsg);
  assert(cardFormatCalls === 1 && cardMvuCalls === 1, 'Card final rendering should execute formatting and MVU rendering exactly once.');
  assert(isolatedEntry && isolatedEntry.original === '<script>window.onlyIsolatedFixture=1</script>\n原始卡片正文。', 'Card entry original must match the pre-split source boundary after MVU control removal.');
  assert(isolatedEntry.source === isolatedEntry.original && !isolatedEntry.source.includes('UpdateVariable'), 'Card entry source must exclude MVU control blocks.');
  assert(isolatedMsg.content === isolatedCardRaw, 'Card rendering must not rewrite the original message.');
  assert(isolatedHtml.includes('card-runtime'), 'MVU-backed card input must retain the runtime entry.');

  const codeRaw = '<dream_plot>\n```html\n<dream_body>代码示例</dream_body>\n```\n行内 `<dream_done/>` 示例\n</dream_plot>';
  assert(context.__strip(codeRaw).includes('<dream_body>代码示例</dream_body>') && context.__strip(codeRaw).includes('<dream_done/>'), '代码示例中的 dream 标记必须保留');
  msg.content += '\n<script>changed</script>';
  let staleCode = '';
  try { context.activateCardRuntimeGrant(cardEntry, prepared); } catch (error) { staleCode = error.code; }
  assert(staleCode === 'STALE_TARGET', '修改源码后既有授权必须失效');
}

async function assertFrontendSecondStagePromptBuilder() {
  const sources = await Promise.all([
    '../../../src/app/prompt/41-second-stage-message-lookup.js',
    '../../../src/app/prompt/41-second-stage-prompt-builder.js',
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

  vm.runInNewContext(`${sources.join('\n')}\nthis.__linked = findLinkedSecondStageMessage;\nthis.__previous = findPreviousMainAssistantMessage;\nthis.__user = findLatestUserMessageBefore;\nthis.__recent = buildSecondStageRecentContextMessages;\nthis.__messages = buildMessagesForSecondStage;\nthis.__correction = buildSecondStageCorrectionMessages;`, context);

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

  // 默认提示词：在正文/最近上下文后追加明确的 user 选项请求；自定义提示词不追加。
  context.state.settings.twoStageSystemPrompt = '';
  context.state.settings.twoStageIncludeRecentContext = true;
  const defaultWithContext = context.__messages(firstStage);
  assert(defaultWithContext.length === messagesWithContext.length + 1 && defaultWithContext.at(-1).role === 'user', '默认提示词必须在最近上下文后追加 user 选项请求');
  assert(defaultWithContext.at(-1).content.includes('<options>') && /2-4/.test(defaultWithContext.at(-1).content), '默认选项请求必须要求 2-4 个 <options>');
  assert(defaultWithContext[0].content === 'Default second Arona', '默认提示词应使用 DEFAULT_TWO_STAGE_PROMPT 作为 system');

  context.state.settings.twoStageIncludeRecentContext = false;
  const defaultWithoutContext = context.__messages(firstStage);
  assert(defaultWithoutContext.length === 3 && defaultWithoutContext.at(-1).role === 'user' && defaultWithoutContext.at(-1).content.includes('2-4'), '无最近上下文时也必须在正文后追加 user 选项请求');

  const correction = context.__correction(defaultWithoutContext);
  assert(correction.length === defaultWithoutContext.length + 1 && correction.at(-1).role === 'user' && /无效/.test(correction.at(-1).content), '格式纠正请求必须基于原上下文追加“上次格式无效”的 user 提醒');
  assert(correction[0] === defaultWithoutContext[0] && correction.at(-1).content.includes('<options>'), '格式纠正请求必须保留原 system 与明确格式指令');
}

async function assertFrontendPromptBuilderContexts() {
  const sources = await Promise.all([
    '../../../src/app/worldbook/41-world-info-constants.js',
    '../../../src/app/prompt/40-character-prompt-helpers.js',
    '../../../src/app/worldbook/41-world-info-injection.js',
    '../../../src/app/prompt/41-prompt-builder.js',
    '../../../src/app/prompt/41-prompt-second-stage-context.js',
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
export { assertFrontendPromptSummaryEvents, assertFrontendSecondStageRuntime, assertFrontendPromptMessageHelpers, assertFrontendSecondStagePromptBuilder, assertFrontendPromptBuilderContexts };
