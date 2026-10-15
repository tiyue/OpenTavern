import { captureBrowserEvidence } from './check-release.mjs';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const modulePath = process.env.OPENTAVERN_PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = await import(path.isAbsolute(modulePath) ? pathToFileURL(modulePath).href : modulePath);
const url = process.env.OPENTAVERN_TEST_URL || 'http://127.0.0.1:8765/.sites-public/opentavern.html';
const output = process.env.OPENTAVERN_TEST_OUTPUT || await mkdtemp(path.join(os.tmpdir(), 'opentavern-m4-'));
await mkdir(output, { recursive: true });
const optionExample = [
    '正文开头',
    '```xml',
    '<options><option><title>这是示例</title><description>不能把示例变成选项</description></option></options>',
    '```',
    '正文结尾',
].join('\n');
const unclosedOptionExample = [
    '未闭合开头',
    '````xml extra',
    '<OPTIONS data-kind="example"><option><title>未闭合示例</title><description>保留后文</description></option>',
    '```',
    '&lt;options&gt;转义标签&lt;/options&gt;',
    '未闭合结尾',
].join('\n');
const protectedCloseExample = '正文开头<options>\n```xml\n</options>\n```\n正文结尾';
const literalOptionTagsExample = '说明：<options>是选项容器</options>。后文';
const secondStageCodeDescription = '<options><option><title>继续</title><description>选择 `ABC` 然后继续。</description></option></options>';
const cardStaticExample = '<dream_plot>\n<dream_body>\n<script>window.auditMalicious=1</script>\n<img src="https://attack.invalid/pixel" onerror="window.auditMalicious=1">\n<div onclick="window.auditMalicious=1">正常叙事正文。</div>\n<a href="javascript:window.auditMalicious=1">危险链接</a>\n<a href="data:text/html,attack">数据链接</a>\n<a href="https://example.com/help">安全链接</a>\n</dream_body>\n<dream_after_format>\n<details><summary>自定义状态栏</summary><div>精力：80</div></details>\n<options><option><title>继续</title><description>保留卡片选项</description></option></options>\n</dream_after_format>\n</dream_plot>';
const cardCodeExample = '<dream_plot>\n<script>const marker = "<dream_body>script-literal</dream_body>";</script>\n```html\n<dream_body>code-literal</dream_body>\n```\n行内 `<dream_done/>` 示例\n</dream_plot>';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const errors = [], external = [];
page.on('pageerror', error => errors.push(error.message));
await context.route('**/*', async route => {
    const target = new URL(route.request().url());
    if (target.pathname.endsWith('/assets/js/app.js')) {
        const response = await route.fetch(), bundle = await response.text(), end = bundle.lastIndexOf('})();');
        const probe = 'Object.assign(window, { state, getActiveConv, normalizeConversation, applyUiTheme, requestFullRender, switchView, renderAssistantContent, renderStreamingAssistantContent, prepareMessageDisplay, formatMessage, cardRuntimeEntries });\n';
        return route.fulfill({ response, body: bundle.slice(0, end) + probe + bundle.slice(end) });
    }
    if (target.origin !== new URL(url).origin) { external.push(target.href); return route.abort(); }
    return route.continue();
});
await page.addInitScript(() => { localStorage.setItem('opentavern_onboarding_completed_v1', '1'); localStorage.setItem('opentavern_announce_dismissed_v1', '1'); });
const sample = '# 静态消息验收\n\n“今天一起去散步。”\n\n**重点**、*轻声*、~~删除线~~、`inline()`。\n\n- 第一项\n- 第二项\n\n1. 有序条目\n2. 第二条\n\n- [x] 已完成\n- [ ] 待处理\n\n> 引用保留\n\n```html\n<img src="https://attack.invalid/code" onerror="window.m4Attack=1">\n```\n\n[安全链接](https://example.com/help)\n\n![说明图片](https://attack.invalid/image.png)\n\n| 项目 | 长内容 | 说明 |\n| --- | --- | --- |\n| 表格 | 这是用于移动端横向滚动的长文本 '.concat('单元格'.repeat(30), ' | 保留正文 |\n\n<details open><summary>状态栏</summary><div>精力：80</div><strong>地点：公园</strong></details>');
try {
    await page.goto(url); await page.waitForFunction(() => typeof renderAssistantContent === 'function' && getActiveConv());
    external.length = 0;
    const baseline = await page.evaluate(() => ({ color: getComputedStyle(document.body).color, display: getComputedStyle(document.body).display }));
    await page.evaluate(text => {
        const conv = getActiveConv(); conv.character = { name: '静态消息', extensions: {} };
        conv.messages = [{ id: 'static-message', role: 'assistant', content: text }]; normalizeConversation(conv);
        requestFullRender(); switchView('chat');
    }, sample);
    const bubble = page.locator('[data-message-id="static-message"] .msg-bubble');
    assert.equal(await bubble.locator('h1').textContent(), '静态消息验收');
    assert.equal(await bubble.locator('strong').first().textContent(), '重点');
    assert.equal(await bubble.locator('ul').count(), 2);
    assert.equal(await bubble.locator('ol').count(), 1);
    assert.equal(await bubble.locator('input').count(), 0);
    assert.match(await bubble.textContent(), /\[x\] 已完成/);
    assert.equal(await bubble.locator('pre code').textContent(), '<img src="https://attack.invalid/code" onerror="window.m4Attack=1">\n');
    assert.equal(await bubble.locator('.dialogue-highlight').count(), 1);
    assert.equal(await bubble.locator('img,iframe,style,script').count(), 0);
    assert.match(await bubble.locator('a').last().textContent(), /图片：说明图片/);
    assert.equal(await bubble.locator('a').first().getAttribute('rel'), 'noopener noreferrer');
    assert.equal(await bubble.locator('a').first().getAttribute('referrerpolicy'), 'no-referrer');
    await bubble.locator('details summary').click(); assert.equal(await bubble.locator('details').getAttribute('open'), null);
    await bubble.locator('details summary').click();
    await page.evaluate(texts => {
        const conv = getActiveConv();
        conv.messages.push({ id: 'option-example', role: 'assistant', content: texts[0] });
        conv.messages.push({ id: 'unclosed-option-example', role: 'assistant', content: texts[1] });
        conv.messages.push({ id: 'protected-close-example', role: 'assistant', content: texts[2] });
        conv.messages.push({ id: 'literal-option-tags-example', role: 'assistant', content: texts[3] });
        normalizeConversation(conv);
        conv._showAllMessages = true;
        requestFullRender();
    }, [optionExample, unclosedOptionExample, protectedCloseExample, literalOptionTagsExample]);
    const optionBubble = page.locator('[data-message-id="option-example"] .msg-bubble');
    const optionBubbleText = await optionBubble.textContent();
    assert.match(optionBubbleText, /正文开头/); assert.match(optionBubbleText, /正文结尾/);
    assert.match(await optionBubble.locator('pre code').textContent(), /<options><option><title>这是示例<\/title>/);
    assert.equal(await optionBubble.locator('.message-option-choice').count(), 0, '代码示例不得渲染为选项按钮');
    const unclosedBubble = page.locator('[data-message-id="unclosed-option-example"] .msg-bubble');
    const unclosedBubbleText = await unclosedBubble.textContent();
    assert.match(unclosedBubbleText, /未闭合开头/); assert.match(unclosedBubbleText, /未闭合结尾/); assert.match(unclosedBubbleText, /转义标签/);
    assert.equal(await unclosedBubble.locator('.message-option-choice').count(), 0, '未闭合控制块不得截尾或变成选项按钮');
    const protectedCloseBubble = page.locator('[data-message-id="protected-close-example"] .msg-bubble');
    const protectedCloseText = await protectedCloseBubble.textContent();
    assert.match(protectedCloseText, /正文开头/); assert.match(protectedCloseText, /正文结尾/);
    assert.match(protectedCloseText, /<options>/); assert.match(protectedCloseText, /<\/options>/);
    assert.equal(await protectedCloseBubble.locator('.message-option-choice').count(), 0, '跨保护区闭合标签不得变成选项按钮');
    const literalOptionTagsBubble = page.locator('[data-message-id="literal-option-tags-example"] .msg-bubble');
    const literalOptionTagsText = await literalOptionTagsBubble.textContent();
    assert.match(literalOptionTagsText, /说明：/); assert.match(literalOptionTagsText, /后文/);
    assert.match(literalOptionTagsText, /<options>/); assert.match(literalOptionTagsText, /<\/options>/);
    assert.equal(await literalOptionTagsBubble.locator('.message-option-choice').count(), 0, '没有完整 option 的字面标签不得变成选项按钮');
    for (const width of [390, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        for (const theme of ['new-light', 'new-dark']) {
            await page.evaluate(value => applyUiTheme(value), theme);
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
            assert.equal(await bubble.locator('.message-table-scroll').evaluate(element => element.scrollWidth > element.clientWidth), width === 390);
            await page.screenshot({ path: path.join(output, `static-${width}-${theme}.png`), animations: 'disabled' });
        }
    }
    const attack = '<script>window.m4Attack=1</script><style>body{display:none!important}</style><iframe src="https://attack.invalid/frame"></iframe><img src="https://attack.invalid/pixel" onerror="window.m4Attack=1"><form action="https://attack.invalid/post"><input autofocus></form><svg onload="window.m4Attack=1"><a href="javascript:window.m4Attack=1">SVG</a></svg><math><mtext><img src=x onerror="window.m4Attack=1"></mtext></math><div id="app" class="overlay" style="position:fixed;inset:0" onclick="window.m4Attack=1">正文</div><a href="javascript:window.m4Attack=1">危险链接</a><a href="data:text/html,attack">数据链接</a><base href="https://attack.invalid/"><link rel="stylesheet" href="https://attack.invalid/style">';
    const security = await page.evaluate(text => {
        window.m4Attack = 0;
        const container = document.createElement('div'); container.innerHTML = renderAssistantContent(text); document.body.appendChild(container);
        const result = { dangerous: container.querySelectorAll('script,style,iframe,img,form,input,svg,math,base,link,[id],[style],[onclick],[onload],[onerror]').length, badLinks: Array.from(container.querySelectorAll('a')).filter(link => !/^https?:/.test(link.href)).length, notice: container.querySelector('.message-content-notice')?.textContent, text: container.textContent };
        container.remove(); return result;
    }, attack);
    assert.equal(security.dangerous, 0); assert.equal(security.badLinks, 0); assert.match(security.notice, /静态显示/); assert.match(security.text, /正文/);
    await page.waitForTimeout(150);
    assert.equal(await page.evaluate(() => window.m4Attack), 0);
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).display), baseline.display);
    assert.deepEqual(external, [], 'Rendering must not load card resources.');

    external.length = 0;
    const cardSecurity = await page.evaluate(({ content, codeContent }) => {
        window.auditMalicious = 0;
        const conv = getActiveConv();
        const msg = { id: 'card-static-security', role: 'assistant', content };
        conv.messages.push(msg);
        conv.messages.push({ id: 'card-code-security', role: 'assistant', content: codeContent });
        conv.messages.push({ id: 'plain-no-script', role: 'assistant', content: '<dream_plot><dream_body>普通无脚本正文</dream_body></dream_plot>' });
        normalizeConversation(conv);
        conv._showAllMessages = true;
        requestFullRender();

        const saved = document.querySelector('[data-message-id="card-static-security"] .card-runtime-static');
        const direct = document.createElement('div');
        direct.innerHTML = renderAssistantContent(content);
        const stream = document.createElement('div');
        for (let index = 1; index <= content.length; index += 1) renderStreamingAssistantContent(stream, content.slice(0, index), {}, true);
        const token = document.querySelector('[data-message-id="card-code-security"] .card-runtime')?.getAttribute('data-card-runtime-token');
        const entry = token ? cardRuntimeEntries.get(token) : null;
        const codeBubble = document.querySelector('[data-message-id="card-code-security"] .msg-bubble');
        const plainBubble = document.querySelector('[data-message-id="plain-no-script"] .msg-bubble');
        return {
            savedMatchesDirect: saved ? saved.innerHTML === direct.innerHTML : false,
            streamMatchesDirect: stream.innerHTML === direct.innerHTML,
            text: saved ? saved.textContent : '',
            streamText: stream.textContent,
            dangerous: saved ? saved.querySelectorAll('script,style,iframe,img,form,input,svg,math,base,link,[id],[style],[onclick],[onload],[onerror]').length : -1,
            badLinks: saved ? Array.from(saved.querySelectorAll('a')).filter(link => !/^https?:/i.test(link.getAttribute('href') || '')).length : -1,
            runEntries: document.querySelectorAll('[data-message-id="card-static-security"] [data-action="card-runtime-run"]').length,
            detailEntries: document.querySelectorAll('[data-message-id="card-static-security"] [data-action="card-runtime-details"]').length,
            entryOriginal: entry ? entry.original : '',
            entrySource: entry ? entry.source : '',
            codeText: codeBubble ? codeBubble.textContent : '',
            codeRaw: getActiveConv().messages.find(message => message.id === 'card-code-security').content,
            plainText: plainBubble ? plainBubble.textContent : '',
            plainCards: document.querySelectorAll('[data-message-id="plain-no-script"] .card-runtime').length,
        };
    }, { content: cardStaticExample, codeContent: cardCodeExample });
    assert.equal(cardSecurity.savedMatchesDirect, true, '真实卡片静态正文必须与普通整段显示一致');
    assert.equal(cardSecurity.streamMatchesDirect, true, '流式普通预览必须与最终普通显示一致');
    assert.ok(cardSecurity.text.includes('正常叙事正文。') && !cardSecurity.text.includes('dream_'), '真实卡片静态区必须保留正文且不显示代码外 dream 标记');
    assert.ok(cardSecurity.streamText.includes('正常叙事正文。') && !cardSecurity.streamText.includes('dream_'), '流式普通预览必须与卡片正文一致');
    assert.equal(cardSecurity.dangerous, 0, '真实卡片静态 DOM 不得保留脚本、事件或嵌入资源');
    assert.equal(cardSecurity.badLinks, 0, '真实卡片静态 DOM 不得保留 javascript/data 等禁止链接');
    assert.equal(cardSecurity.runEntries, 1, '未授权卡片必须保留真实逐卡运行入口');
    assert.equal(cardSecurity.detailEntries, 1, '未授权卡片必须保留真实审核详情入口');
    assert.equal(cardSecurity.entryOriginal, cardCodeExample, '卡片入口必须保留原始消息字节');
    assert.equal(cardSecurity.entrySource, cardCodeExample, '卡片入口必须保留原始源码字节');
    assert.ok(cardSecurity.codeText.includes('<dream_body>code-literal</dream_body>') && cardSecurity.codeText.includes('<dream_done/>'), 'fenced/inline dream 示例必须保留为字面内容');
    assert.ok(cardSecurity.codeRaw.includes('<dream_body>script-literal</dream_body>'), '脚本字符串中的 dream 标记必须保留在原文');
    assert.ok(cardSecurity.plainText.includes('普通无脚本正文') && !cardSecurity.plainText.includes('dream_'), '无脚本普通消息必须只做普通显示清理');
    assert.equal(cardSecurity.plainCards, 0, '无脚本普通消息不得出现卡片运行入口');
    await page.waitForTimeout(150);
    assert.equal(await page.evaluate(() => window.auditMalicious), 0, '卡片静态 DOM 中的恶意脚本不得执行');
    assert.deepEqual(external, [], '卡片静态显示不得发起禁止的外部资源请求');
    const checks = await page.evaluate(({ optionText, secondStageText }) => {
        const plain = document.createElement('div'); plain.innerHTML = renderAssistantContent('纯文本\n第二行 “你好”');
        const mvu = document.createElement('div'); mvu.innerHTML = renderAssistantContent('<UpdateVariable>[{"op":"replace","path":"/energy","value":90}]</UpdateVariable>');
        const options = document.createElement('div'); options.innerHTML = renderAssistantContent('<options><option><title>选择</title><description>“继续吧”</description></option></options>');
        const mixed = document.createElement('div'); mixed.innerHTML = renderAssistantContent('段落一\n<options><option><title>真实选择</title><description>保留正文</description></option></options>\n段落二');
        const secondStage = document.createElement('div'); secondStage.innerHTML = renderAssistantContent(secondStageText, { msg: { stage: 'second' } });
        const stream = document.createElement('div'); state.settings.streamTextAnimEnabled = true; state.settings.lowPowerMode = false;
        const full = '**流式正文**\n\n- 项目一\n- 项目二';
        for (let i = 1; i <= full.length; i++) renderStreamingAssistantContent(stream, full.slice(0, i), {}, true);
        const expected = document.createElement('div'); expected.innerHTML = renderAssistantContent(full);
        const optionStream = document.createElement('div');
        for (let i = 1; i <= optionText.length; i++) renderStreamingAssistantContent(optionStream, optionText.slice(0, i), {}, true);
        const optionExpected = document.createElement('div'); optionExpected.innerHTML = renderAssistantContent(optionText);
        return {
            plain: plain.textContent,
            br: plain.querySelectorAll('br').length,
            mvu: mvu.textContent,
            options: options.querySelectorAll('.message-option-choice').length,
            mixedText: mixed.textContent,
            mixedOptions: mixed.querySelectorAll('.message-option-choice').length,
            secondStageText: secondStage.textContent,
            secondStageOptions: secondStage.querySelectorAll('.message-option-choice').length,
            stream: stream.innerHTML === expected.innerHTML,
            optionStream: optionStream.innerHTML === optionExpected.innerHTML,
            raw: getActiveConv().messages[0].content,
            optionRaw: getActiveConv().messages.find(message => message.id === 'option-example').content,
        };
    }, { optionText: optionExample, secondStageText: secondStageCodeDescription });
    assert.match(checks.plain, /纯文本/); assert.match(checks.plain, /第二行/); assert.equal(checks.br, 1);
    assert.match(checks.mvu, /UpdateVariable/); assert.match(checks.mvu, /尚未支持/); assert.equal(checks.options, 1);
    assert.match(checks.mixedText, /段落一/); assert.match(checks.mixedText, /段落二/); assert.equal(checks.mixedOptions, 1);
    assert.doesNotMatch(checks.secondStageText, /<options>/); assert.doesNotMatch(checks.secondStageText, /<option>/); assert.equal(checks.secondStageOptions, 1, '真实二阶段 inline-code 描述不得重复 XML，且只能有一个选项按钮');
    assert.equal(checks.stream, true); assert.equal(checks.optionStream, true); assert.equal(checks.raw, sample); assert.equal(checks.optionRaw, optionExample);
    const structured = await page.evaluate(payload => {
        state.settings.streamTextAnimEnabled = true;
        state.settings.lowPowerMode = false;
        state.settings.twoStageEnabled = false;
        const conv = getActiveConv();
        const character = conv.character;
        const context = { conv, character };
        const prepared = prepareMessageDisplay({ text: payload.optionText, context, messageRole: 'assistant', sourcePlacement: 'AI_OUTPUT' });
        const fullStream = document.createElement('div');
        renderStreamingAssistantContent(fullStream, payload.optionText, context, true);
        const chunkStream = document.createElement('div');
        for (let index = 1; index <= payload.optionText.length; index += 1) renderStreamingAssistantContent(chunkStream, payload.optionText.slice(0, index), context, true);
        const final = document.createElement('div');
        final.innerHTML = renderAssistantContent(payload.optionText, context);

        const msg = { id: 'mvu-card-source-boundary', role: 'assistant', content: payload.cardText };
        conv.messages.push(msg);
        normalizeConversation(conv);
        const savedMsg = conv.messages.find(message => message.id === 'mvu-card-source-boundary');
        const cardPrepared = prepareMessageDisplay({ text: savedMsg.content, context: { conv, msg: savedMsg, character }, messageRole: 'assistant', sourcePlacement: 'AI_OUTPUT' });
        const cardHtml = renderAssistantContent(savedMsg.content, { conv, msg: savedMsg, character });
        const entry = Array.from(cardRuntimeEntries.values()).find(candidate => candidate.msg === savedMsg);
        return {
            reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
            preparedText: prepared.display.text,
            preparedOptions: prepared.display.options.length,
            preparedHtml: prepared.display.html,
            streamHtml: fullStream.innerHTML,
            chunkHtml: chunkStream.innerHTML,
            streamText: fullStream.textContent,
            finalHtml: final.innerHTML,
            finalText: final.textContent,
            cardInput: savedMsg.content,
            cardPreparedInput: cardPrepared.inputText,
            cardExecutable: cardPrepared.executableText,
            entryOriginal: entry ? entry.original : '',
            entrySource: entry ? entry.source : '',
            cardHtml,
        };
    }, {
        optionText: '前文。<options><option><title>动作</title><description>受控行动。</description></option></options>尾文。',
        cardText: '<UpdateVariable><JSONPatch>[]</JSONPatch></UpdateVariable>\n<script>window.onlyIsolatedFixture=1</script>\n原始卡片正文。',
    });
    assert.equal(structured.reducedMotion, false, 'Option streaming regression must run outside reduced motion.');
    assert.equal(structured.preparedOptions, 1, 'Prepared streaming content must retain the real option.');
    assert.equal(structured.preparedText, '前文。尾文。', 'Prepared prose text must remove only the option block.');
    assert.equal(structured.streamHtml, structured.finalHtml, 'One-shot structured streaming must match final assistant rendering.');
    assert.equal(structured.chunkHtml, structured.finalHtml, 'Chunked structured streaming must converge to the same prepared final output.');
    assert.equal(structured.streamText, structured.finalText, 'Structured streaming and final rendering must preserve the same text.');
    assert.match(structured.streamHtml, /message-option-choice/, 'Streaming options must survive the animation path as selectable controls.');
    assert.match(structured.streamHtml, /前文。/); assert.match(structured.streamHtml, /尾文。/);
    assert.equal(structured.cardInput, structured.cardPreparedInput, 'Card preparation must preserve the complete original message input.');
    assert.equal(structured.cardExecutable, '<script>window.onlyIsolatedFixture=1</script>\n原始卡片正文。', 'Executable card source must stop at the pre-split MVU-cleaned byte boundary.');
    assert.equal(structured.entryOriginal, structured.cardExecutable, 'Card entry original must use the MVU-cleaned executable source.');
    assert.equal(structured.entrySource, structured.cardExecutable, 'Card entry source must not inherit MVU control blocks.');
    assert.doesNotMatch(structured.entrySource, /UpdateVariable/);
    assert.match(structured.cardHtml, /card-runtime/);
    const large = await page.evaluate(() => {
        const text = '普通长文\n\n'.repeat(5000), start = performance.now(), container = document.createElement('div'); container.innerHTML = renderAssistantContent(text);
        return { elapsed: performance.now() - start, paragraphs: container.querySelectorAll('p').length, fallback: renderAssistantContent('<script>不可执行</script>' + 'x'.repeat(500001)).includes('<script>') };
    });
    assert.equal(large.paragraphs, 5000); assert.equal(large.fallback, false); assert.ok(large.elapsed < 3000, 'Long prose must render within the smoke-test budget.');
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ passed: true, screenshots: output, ...(await captureBrowserEvidence(page, output)), longProseMs: Math.round(large.elapsed) }));
} finally { await context.close(); await browser.close(); }
