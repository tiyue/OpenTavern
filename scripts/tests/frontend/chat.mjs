import { responseVersionsSource, assert, messageIdentitySource, summaryValiditySource } from '../support.mjs';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';


async function assertFrontendMessageContentHelpers() {
  const sources = await Promise.all([
    '../../../src/app/prompt/41-second-stage-content-isolation.js',
    '../../../src/app/chat/61-message-text-format.js',
    '../../../src/app/chat/61-message-status-bar-render.js',
    '../../../src/app/chat/61-message-options-render.js',
    '../../../src/app/chat/61-message-attachments-render.js',
    '../../../src/app/chat/61-message-cot-render.js',
    '../../../src/app/chat/61-message-content-render.js',
    '../../../src/app/chat/61-message-display-model.js',
    '../../../src/app/chat/61-chat-message-html.js',
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
    state: { settings: { showCotEnabled: true, twoStageEnabled: true } },
    window: { DOMPurify: true },
    DOMPurify: { sanitize: (html) => html.replace(/\sonclick="[^"]*"/g, '') },
    DOMParser: FakeDOMParser,
    t: (key) => key === 'cot_block_title' ? 'Thinking' : key,
    String,
    Array,
    RegExp,
  };

  vm.runInNewContext(`${responseVersionsSource}\n${sources.join('\n')}\nthis.__escape = escapeHtml;\nthis.__highlight = highlightDialogue;\nthis.__status = sanitizeStatusBarHtml;\nthis.__assistant = renderAssistantContent;\nthis.__attachments = renderMessageAttachments;\nthis.__bubble = renderMessageBubbleContent;\nthis.__cot = renderCotBlock;\nthis.__options = renderOptionsXml;\nthis.__display = prepareMessageDisplay;\nthis.__actions = renderMessageActionButtons;`, context);

  assert(context.__escape(`<b title="x">&'`) === '&lt;b title=&quot;x&quot;&gt;&amp;&#39;', 'Message escapeHtml should escape all unsafe HTML characters.');

  const highlighted = context.__highlight('她说“你好”与「世界」');
  assert(highlighted.includes('dialogue-highlight') && highlighted.includes('“你好”') && highlighted.includes('「世界」'), 'Message dialogue highlighter should wrap Chinese dialogue quotes.');

  const status = context.__status('<details open onclick="bad"><summary>状态栏</summary><span>ok</span></details>');
  assert(status.includes('class="status-bar" open') && status.includes('status-bar-content') && !status.includes('onclick'), 'Status bar sanitizer should normalize allowed status blocks.');

  const assistant = context.__assistant('前文<details open><summary>状态栏</summary><span>HP</span></details>后文');
  assert(assistant.includes('前文') && assistant.includes('status-bar-content') && assistant.includes('后文'), 'Assistant content should preserve text around status blocks.');

  const attachments = context.__attachments({
    attachments: [
      { type: 'image', dataUrl: 'data:image/png;base64,abc', source: 'comfyui', prompt: '<prompt>' },
      { type: 'image', url: '/api/image/assets/packy', source: 'packy-gpt-image', prompt: '场景总结。风格要求：高质量日系动画插画。' },
      { type: 'image', url: '/api/image/assets/qwen-history', source: 'qwen-image' },
      { type: 'file', url: 'skip' },
    ],
  });
  assert((attachments.match(/class="msg-attachment-image"/g) || []).length === 3 && !attachments.includes('skip'), 'Message attachment renderer must keep rendering all supported historical image sources.');
  assert(attachments.includes('data:image/png;base64,abc') && attachments.includes('/api/image/assets/packy') && attachments.includes('/api/image/assets/qwen-history'), 'Message attachment renderer must preserve each valid image source.');
  assert(!attachments.includes('msg-attachment-caption') && !attachments.includes('<figcaption'), 'Generated image attachments must not render a visible caption.');
  assert(!attachments.includes('&lt;prompt&gt;') && !attachments.includes('场景总结') && !attachments.includes('风格要求'), 'Generated image attachments must not expose prompts or scene summaries in chat HTML.');
  assert(!attachments.includes('Packy GPT Image') && !attachments.includes('ComfyUI') && !attachments.includes('图片生成（历史 Qwen）'), 'Generated image attachments must not expose provider labels in chat HTML.');

  const textActions = context.__actions(1, false, { role: 'assistant', content: 'text reply' });
  const imageActions = context.__actions(2, false, { role: 'assistant', content: '', attachments: [{ type: 'image', source: 'packy-gpt-image', url: '/api/image/assets/id' }] });
  assert(textActions.includes('data-action="copy"') && textActions.includes('data-action="edit"') && textActions.includes('data-action="retry"'), 'Text assistant messages should keep their standard actions.');
  assert(!imageActions.includes('data-action="copy"') && !imageActions.includes('data-action="edit"') && !imageActions.includes('data-action="retry"') && imageActions.includes('data-action="delete"'), 'Image-only messages should expose only the safe delete action.');

  let formatCalls = 0;
  let formatContext = null;
  context.formatMessage = (text, messageContext) => {
    formatCalls += 1;
    formatContext = messageContext;
    return String(text);
  };
  const bubble = context.__bubble({ role: 'user', content: '<hello>', attachments: [] }, true);
  assert(bubble === '&lt;hello&gt;', 'User message bubble should render escaped plain text.');

  formatCalls = 0;
  context.__bubble({ role: 'assistant', content: '正文', attachments: [] }, false);
  assert(formatCalls === 1, 'Assistant message bubbles should format each message exactly once.');

  const isolatedMainBubble = context.__bubble({ role: 'assistant', stage: 'main', content: '正文\n<options><option><title>泄漏选项</title></option></options>', attachments: [] }, false);
  assert(isolatedMainBubble === '正文', 'Main assistant bubbles should hide option XML that leaked from primary generation.');
  const fencedOptionExample = [
    '正文开头',
    '```xml',
    '<options><option><title>这是示例</title><description>不能把示例变成选项</description></option></options>',
    '```',
    '正文结尾',
  ].join('\n');
  const fencedExampleHtml = context.__assistant(fencedOptionExample);
  assert(fencedExampleHtml.includes('正文开头') && fencedExampleHtml.includes('正文结尾') && fencedExampleHtml.includes('&lt;options&gt;') && !fencedExampleHtml.includes('message-option-choice'),
    'Assistant display must keep fenced XML examples as code with both surrounding prose sections.');

  const unclosedFencedOptionExample = [
    '正文开头',
    '```xml',
    '<options><option><title>未闭合示例</title><description>保留后文</description></option>',
    '```',
    '正文结尾',
  ].join('\n');
  const unclosedExampleHtml = context.__assistant(unclosedFencedOptionExample);
  assert(unclosedExampleHtml.includes('正文开头') && unclosedExampleHtml.includes('正文结尾') && !unclosedExampleHtml.includes('message-option-choice'),
    'Assistant display must preserve trailing prose after an uncertain unclosed options example.');

  const protectedCloseExample = '正文开头<options>\n```xml\n</options>\n```\n正文结尾';
  const protectedCloseHtml = context.__assistant(protectedCloseExample);
  assert(protectedCloseHtml.includes('正文开头') && protectedCloseHtml.includes('正文结尾') && protectedCloseHtml.includes('&lt;options&gt;') && !protectedCloseHtml.includes('message-option-choice'),
    'Assistant display must preserve an uncertain option block that closes across protected code.');

  const literalOptionTagsExample = '说明：<options>是选项容器</options>。后文';
  const literalOptionTagsHtml = context.__assistant(literalOptionTagsExample);
  assert(literalOptionTagsHtml.includes('说明：') && literalOptionTagsHtml.includes('后文') && literalOptionTagsHtml.includes('&lt;options&gt;') && !literalOptionTagsHtml.includes('message-option-choice'),
    'Assistant display must preserve literal option tags in explanatory prose.');

  const mixedOptionContent = '段落一\n<options><option><title>真实选择</title><description>保留正文</description></option></options>\n段落二';
  const mixedOptionHtml = context.__assistant(mixedOptionContent);
  assert(mixedOptionHtml.includes('段落一') && mixedOptionHtml.includes('段落二') && mixedOptionHtml.includes('message-option-choice') && mixedOptionHtml.includes('真实选择'),
    'Mixed assistant content must render prose and real options together instead of replacing the whole body.');
  assert(context.__options(fencedOptionExample, false) === '', 'Options renderer must not extract XML examples from fenced code during ordinary content display.');
  const defaultFencedOptionsHtml = context.__options(fencedOptionExample);
  const secondStageFencedOptionsHtml = context.__options(fencedOptionExample, true);
  assert(defaultFencedOptionsHtml === secondStageFencedOptionsHtml && secondStageFencedOptionsHtml.includes('message-option-choice'),
    'Options renderer must keep the includeCodePayloads default and explicit second-stage behavior compatible.');
  const secondStageBubble = context.__bubble({ role: 'assistant', stage: 'second', content: '<options><option><title>独立选项</title><description>描述</description></option></options>', attachments: [] }, false);
  assert(secondStageBubble.includes('message-option-choice') && secondStageBubble.includes('独立选项'), 'Dedicated second-stage bubbles should still render selectable option cards.');
  const customSecondStageBubble = context.__bubble({ role: 'assistant', stage: 'second', content: '<details><summary>状态栏</summary><span>HP: 100</span></details>\n<options><option><title>自定义选项</title><description>选择 `ABC` 然后继续。</description></option></options>', attachments: [] }, false);
  assert(customSecondStageBubble.includes('status-bar-content') && customSecondStageBubble.includes('HP: 100') && customSecondStageBubble.includes('message-option-choice') && customSecondStageBubble.includes('自定义选项'),
    'Custom second-stage content must preserve non-option status text while rendering real options.');
  assert(!customSecondStageBubble.includes('<options>') && !customSecondStageBubble.includes('&lt;options&gt;'),
    'Custom second-stage mixed content must not duplicate option XML when descriptions contain inline code.');

  context.renderStaticMessage = (text) => String(text);
  const literalStaticHtml = context.__assistant(literalOptionTagsExample);
  assert(literalStaticHtml === '说明：&lt;options&gt;是选项容器&lt;/options&gt;。后文',
    'Static display input must escape literal option tags exactly once.');
  const protectedStaticHtml = context.__assistant(protectedCloseExample);
  assert(protectedStaticHtml.includes('正文开头&lt;options&gt;') && protectedStaticHtml.includes('</options>') && protectedStaticHtml.includes('正文结尾'),
    'Static display input must leave option tags inside protected code unchanged.');
  const secondStageCodeDescription = '<options><option><title>继续</title><description>选择 `ABC` 然后继续。</description></option></options>';
  const secondStageCodeDescriptionHtml = context.__assistant(secondStageCodeDescription, { msg: { stage: 'second' } });
  assert(!secondStageCodeDescriptionHtml.includes('<options>') && !secondStageCodeDescriptionHtml.includes('&lt;options&gt;'),
    'Real second-stage options with inline-code descriptions must not leak duplicate XML into static display.');
  assert((secondStageCodeDescriptionHtml.match(/class="message-option-choice/g) || []).length === 1,
    'Real second-stage options with inline-code descriptions must render exactly one option button.');

  const cot = context.__cot('<think>', true);
  assert(cot.includes('msg-cot streaming') && cot.includes('&lt;think&gt;'), 'CoT renderer should escape and mark streaming blocks.');
  context.state.settings.showCotEnabled = false;
  assert(context.__cot('hidden', false) === '', 'CoT renderer should honor disabled display setting.');

  const optionsHtml = context.__options('<options><option><title>Go</title><description>选择“前进”</description></option></options>');
  assert(optionsHtml.includes('Go') && optionsHtml.includes('dialogue-highlight'), 'Options XML renderer should render option cards and highlight dialogue.');
  assert(optionsHtml.includes('class="message-option-choice') && optionsHtml.includes('data-option-title="Go"') && optionsHtml.includes('data-option-description="选择') && optionsHtml.includes('aria-pressed="false"'), 'Options XML renderer should expose selectable option buttons with separate title and description text.');
  assert(optionsHtml.includes('message-option-selected-hint'), 'Options XML renderer should include the selected click-again hint.');

  const fencedOptionsHtml = context.__options('```xml\n<options><option><title>靠近她</title><description>轻声回应。</description></option></options>\n```');
  assert(fencedOptionsHtml.includes('message-option-choice') && fencedOptionsHtml.includes('靠近她'), 'Options renderer should recover XML wrapped in Markdown code fences.');

  const prefixedOptionsHtml = context.__options('以下是可选行动：\n<options><option><title>继续等候</title><description>保持安静。</description></option></options>\n希望能帮到你。');
  assert(prefixedOptionsHtml.includes('message-option-choice') && prefixedOptionsHtml.includes('继续等候'), 'Options renderer should ignore explanatory text around a valid options block.');

  const incompleteOuterOptionsHtml = context.__options('<options><option><title>握住她</title><description>把手轻轻拢进掌心。</description></option>');
  assert(incompleteOuterOptionsHtml.includes('message-option-choice') && incompleteOuterOptionsHtml.includes('握住她'), 'Options renderer should salvage complete option items when the outer closing tag is missing.');

  assert(context.__options('正文中提到 <option> 标签，但不是二阶段选项。') === '', 'Options renderer should not reinterpret ordinary assistant text without an options container.');

  let mvuCalls = 0;
  let snapshotCalls = 0;
  const sourceMessage = { id: 'display-source', role: 'assistant', stage: 'main', content: 'raw' };
  const sourceConversation = { id: 'display-conversation' };
  context.renderDeclarativeTemplateSubset = (text, snapshot) => {
    mvuCalls += 1;
    assert(snapshot.value === 'earlier', 'Display preparation should pass the source message MVU snapshot.');
    return { output: '<dream_body>显示正文</dream_body><UpdateVariable>deferred</UpdateVariable>', diagnostics: ['display-diag'] };
  };
  context.getMvuDataForMessage = (conv, msg) => {
    snapshotCalls += 1;
    assert(conv === sourceConversation && msg === sourceMessage, 'Display preparation should preserve conversation and message identity.');
    return { value: 'earlier' };
  };
  context.getMvuWorldInfoEntries = () => ({ world: true });
  context.getMvuDiagnostics = () => [];
  context.stripMvuControlBlocks = (text) => String(text).replace(/<UpdateVariable>[\s\S]*?<\/UpdateVariable>/g, '').trim();
  const displayInput = {
    text: '<dream_body>原始正文</dream_body><UpdateVariable>source</UpdateVariable>',
    context: { conv: sourceConversation, msg: sourceMessage },
    isolatePrimary: false,
  };
  const displayInputBefore = JSON.stringify(displayInput);
  formatCalls = 0;
  const preparedDisplay = context.__display(displayInput);
  assert(JSON.stringify(displayInput) === displayInputBefore, 'Message display preparation must not mutate or replace its input.');
  assert(formatCalls === 1 && mvuCalls === 1 && snapshotCalls === 1, 'Message display preparation should execute formatting and MVU rendering exactly once.');
  assert(formatContext.msg === sourceMessage && formatContext.conv === sourceConversation, 'Message formatting should retain source message identity and history snapshot context.');
  assert(preparedDisplay.inputText === displayInput.text && preparedDisplay.executableText === '<dream_body>显示正文</dream_body>', 'Preparation must strip MVU control blocks from the executable source before static display cleanup.');
  assert(preparedDisplay.executableText.includes('<dream_body>'), 'Static dream cleanup must not rewrite the executable source.');
  assert(preparedDisplay.display.text === '显示正文' && preparedDisplay.display.html.includes('显示正文') && preparedDisplay.noticeHtml.includes('display-diag'), 'Static display must be derived separately and retain diagnostics outside the executable source.');

  formatCalls = 0;
  mvuCalls = 0;
  snapshotCalls = 0;
  context.__bubble(sourceMessage, false, { conv: sourceConversation });
  assert(formatCalls === 1 && mvuCalls === 1 && snapshotCalls === 1, 'Ordinary assistant message bubbles should execute formatting and MVU rendering exactly once.');

  formatCalls = 0;
  mvuCalls = 0;
  snapshotCalls = 0;
  const finalHtml = context.__assistant('raw', { conv: sourceConversation, msg: sourceMessage });
  assert(finalHtml.includes('显示正文') && finalHtml.includes('display-diag'), 'Final assistant rendering should reuse the prepared display and diagnostics.');
  assert(formatCalls === 1 && mvuCalls === 1 && snapshotCalls === 1, 'Final assistant rendering should execute formatting and MVU rendering exactly once.');

  const originalParseOptions = context.parseSecondStageOptions;
  let optionParseCalls = 0;
  context.parseSecondStageOptions = (text) => {
    optionParseCalls += 1;
    return originalParseOptions(text);
  };
  const mixedPrepared = context.__display({ text: mixedOptionContent, processMessage: false, isolatePrimary: false });
  assert(optionParseCalls === 1, 'Ordinary display preparation should parse each real option block exactly once.');
  assert(mixedPrepared.display.options.length === 1 && mixedPrepared.display.html.includes('message-option-choice') && mixedPrepared.display.text === '段落一\n段落二', 'Prepared display should separate prose text from selectable option output.');
}

async function assertFrontendMessageEditHelpers() {
  const source = await readFile(new URL('../../../src/app/chat/67-message-edit-helpers.js', import.meta.url), 'utf8');
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

  vm.runInNewContext(`${messageIdentitySource}\n${summaryValiditySource}\n${responseVersionsSource}\n${source}\nthis.__find = findEditableMessageBubble;\nthis.__textarea = createMessageEditTextarea;\nthis.__resize = autoResizeMessageEditTextarea;\nthis.__apply = applyMessageEditContent;`, context);

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
    '../../../src/app/chat/67-message-action-helpers.js',
    '../../../src/app/chat/67-message-regeneration-runtime.js',
    '../../../src/app/chat/67-message-actions-ui.js',
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
    async persistConversationMessageMutation(conv, mutate) { const candidate = JSON.parse(JSON.stringify(conv)); const result = mutate(candidate); events.push('persist'); Object.assign(conv, candidate); return result; },
    renderMessagesOnly() { events.push('render-messages'); },
    renderConversationListOnly() { events.push('render-conversations'); },
    runSecondStageGeneration(parent, done, replacementMessage) {
      events.push('second:' + parent.id + ':' + (replacementMessage && replacementMessage.id || 'missing'));
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
    runWhenGenerationBackendReady(onReady) { onReady(); },
    updateStreamingBubble(content) { events.push('bubble:' + content); },
    getCurrentGeneratingSpeakerName() { return 'Arona'; },
    handlePrimaryAssistantComplete() {},
    updateInputState() { events.push('input'); },
    document: { getElementById: () => null },
    appStore: { notify(key) { events.push('notify:' + key); } },
    alert: (msg) => events.push('alert:' + msg),
    t: (key) => key,
    isImageAttachmentOnlyMessage(msg) {
      return !String(msg && msg.content || '').trim()
        && Array.isArray(msg && msg.attachments)
        && msg.attachments.some((attachment) => attachment && attachment.type === 'image');
    },
    Date: { now: () => 12345 },
    Array,
  };

  vm.runInNewContext(`${messageIdentitySource}\n${summaryValiditySource}\n${sources.join('\n')}\nthis.__delete = deleteMessage;\nthis.__regen = regenerateMessage;\nthis.__regenError = handlePrimaryRegenerationError;\nthis.__prepare = prepareGroupSpeakerForRegeneration;`, context);
  context.startPrimaryMessageRegeneration = (conv, target) => events.push('start:' + conv.id + ':' + target.id);

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
  await context.__delete(0);
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
  await context.__delete(1);
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
  assert(activeConv.messages.length === 2 && activeConv.messages[1].content === 'old second' && events.includes('second:parent:second') && events.includes('complete:regen-second'), 'Second-stage regenerate should keep the previous child until a replacement succeeds.');
  assert(!events.includes('render-conversations'), 'Second-stage regenerate should not refresh the conversation list.');

  reset({
    id: 'regen-image',
    messages: [
      { role: 'assistant', content: '', attachments: [{ type: 'image', source: 'qwen-image', url: '/api/image/assets/id' }] },
    ],
  });
  context.__regen(0);
  assert(activeConv.messages.length === 1 && events.length === 0, 'Image-only assistant messages must not enter the text regeneration flow.');

  reset({
    id: 'regen-main',
    messages: [
      { role: 'user', content: '@Plana retry' },
      { id: 'main', role: 'assistant', content: 'old main' },
      { id: 'second', role: 'assistant', stage: 'second', parentId: 'main', content: 'old second' },
    ],
  });
  context.__regen(1);
  assert(activeConv.messages.length === 3 && activeConv.messages[1].content === 'old main' && activeConv.messages[2].content === 'old second', 'Primary regenerate must keep the original response group while the candidate request starts.');
  assert(events.includes('start:regen-main:main') && !events.includes('persist'), 'Primary regenerate should dispatch the target without persisting a destructive intermediate state.');
  context.__prepare(activeConv, activeConv.messages[0]);
  assert(activeConv._nextGroupSpeaker.name === 'Plana', 'The group speaker preparation helper should still resolve mentions from the last user message.');

  reset({
    id: 'regen-middle',
    messages: [
      { role: 'user', content: 'first user' },
      { id: 'middle', role: 'assistant', content: 'first reply' },
      { role: 'user', content: 'later user' },
      { id: 'latest', role: 'assistant', content: 'latest reply' },
    ],
  });
  const middleBefore = JSON.stringify(activeConv.messages);
  context.__regen(1);
  assert(JSON.stringify(activeConv.messages) === middleBefore && !events.some((event) => event.startsWith('start:')) && events.includes('alert:regeneration_latest_only'),
    'Unsupported middle-history regeneration must explain the limit without deleting any message.');

  events.length = 0;
  context.state.isGenerating = true;
  context.__regenError(new Error('regeneration failed'));
  assert(context.state.isGenerating === false && events.includes('notify:isGenerating') && events.includes('render-messages') && events.includes('alert:regeneration_failed_preserved: regeneration failed'), 'Primary regenerate error handler should clear state, render, notify, and explain that the previous response is preserved.');
}

async function assertFrontendChatTopBarUI() {
  const source = await readFile(new URL('../../../src/app/chat/61-chat-topbar-ui.js', import.meta.url), 'utf8');
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
    '../../../src/app/chat/61-chat-message-window-state.js',
    '../../../src/app/chat/61-chat-history-load-button.js',
    '../../../src/app/chat/61-chat-message-window-render.js',
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
    isGroupChat: () => false,
    renderAssistantSenderHtml: (name) => '<p>' + name + '</p>',
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
export { assertFrontendMessageContentHelpers, assertFrontendMessageEditHelpers, assertFrontendMessageActionHelpers, assertFrontendChatTopBarUI, assertFrontendChatMessageRendererHelpers };
