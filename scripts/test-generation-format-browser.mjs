import { captureBrowserEvidence } from './check-release.mjs';
/**
 * 真实浏览器验收：三个截图文案问题。
 *
 * 1) 内嵌正则 Worker 就绪握手等待 900ms（> 500ms 执行上限）时简单规则仍应成功；真正卡住的灾难正则在 500ms 终止、主线程保持响应、队列恢复。
 * 2) 默认二阶段请求末尾必须是明确的 user 选项指令；模型先返回无效续写时最多追加一次格式纠正请求，随后保存完整选项。
 * 3) dream_plot/dream_body/dream_after_format/dream_done 包装只在显示层去掉标记本身，保留正文/状态栏/选项、代码示例与原始消息。
 *
 * 使用已有 Playwright/Chrome（OPENTAVERN_PLAYWRIGHT_MODULE 指定模块路径），不自动安装依赖。
 * 入口默认 /.sites-public/opentavern.html，可被 OPENTAVERN_TEST_URL 覆盖；需先运行 npm run build 与 npm run prepare:sites。
 * 模型请求为本地模拟（/__mock_model），没有真实供应商凭据，不声明供应商验证。
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const modulePath = process.env.OPENTAVERN_PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = await import(path.isAbsolute(modulePath) ? pathToFileURL(modulePath).href : modulePath);
const url = process.env.OPENTAVERN_TEST_URL || 'http://127.0.0.1:8765/.sites-public/opentavern.html';
const output = process.env.OPENTAVERN_TEST_OUTPUT || await mkdtemp(path.join(os.tmpdir(), 'opentavern-format-'));
await mkdir(output, { recursive: true });

const OPTIONS_REQUEST_MARKER = '生成 2-4 个下一步行动选项';
const RETRY_REQUEST_MARKER = '上一次输出格式无效';
const CUSTOM_PROMPT_MARKER = '自定义状态栏提示';
const SNAPSHOT_PRIMARY_MARKER = '模型快照主请求';
const PRIMARY_CODE_EXAMPLE = [
    '主回复开头',
    '```xml',
    '<options><option><title>这是示例</title><description>不能把示例变成选项</description></option></options>',
    '```',
    '正文开头<options>',
    '```xml',
    '</options>',
    '```',
    '主回复结尾',
    '说明：<options>是选项容器</options>。后文',
].join('\n');
const CARD_STATIC_EXAMPLE = '<dream_plot>\n<dream_body>\n<script>window.auditMalicious=1</script>\n正常叙事正文。\n</dream_body>\n<dream_after_format>\n<details><summary>自定义状态栏</summary><div>精力：80</div></details>\n<options><option><title>继续</title><description>保留卡片选项</description></option></options>\n</dream_after_format>\n</dream_plot>';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext();
const page = await context.newPage();
const errors = [];
const warnings = [];
const requests = [];
let workerLoads = 0;
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'warning') warnings.push(message.text()); });
page.on('dialog', dialog => dialog.dismiss());

function mockReply(payload) {
    const messages = (payload && payload.messages) || [];
    const first = String(messages.length ? messages[0].content : '');
    const last = String(messages.length ? messages[messages.length - 1].content : '');
    if (last.includes(RETRY_REQUEST_MARKER)) return '<options><option><title>纠正选项</title><description>依据本轮正文生成的纠正选项。</description></option></options>';
    if (last.includes(OPTIONS_REQUEST_MARKER)) return '继续 dream 正文，但没有输出任何选项。';
    if (first.includes(CUSTOM_PROMPT_MARKER)) return '<div>自定义状态栏内容</div>';
    return PRIMARY_CODE_EXAMPLE;
}

function isSecondStageRequest(payload) {
    const messages = (payload && payload.messages) || [];
    const first = String(messages.length ? messages[0].content : '');
    const last = String(messages.length ? messages[messages.length - 1].content : '');
    return last.includes(OPTIONS_REQUEST_MARKER) || last.includes(RETRY_REQUEST_MARKER) || first.includes(CUSTOM_PROMPT_MARKER);
}

await context.route('**/*', async route => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.pathname.endsWith('/assets/js/app.js')) {
        const response = await route.fetch();
        const bundle = await response.text();
        const end = bundle.lastIndexOf('})();');
        assert.ok(end > 0, 'app.js 必须是 IIFE，才能注入测试 probe');
        const probe = 'Object.assign(window, {' +
            ' state, dom, getActiveConv, normalizeConversation, requestFullRender, switchView, applyUiTheme,' +
            ' renderAssistantContent, renderStreamingAssistantContent, prepareMessageDisplay, cardRuntimeEntries,' +
            ' __regexProbe: function() { return {' +
            ' pending: typeof regexPendingTasks === "undefined" ? -1 : regexPendingTasks.size,' +
            ' promptQueue: typeof regexPromptQueue === "undefined" ? -1 : regexPromptQueue.length,' +
            ' displayQueue: typeof regexDisplayQueue === "undefined" ? -1 : regexDisplayQueue.length,' +
            ' waiting: typeof regexWaitingDisplayTasks === "undefined" ? -1 : regexWaitingDisplayTasks.length,' +
            ' renderPending: regexRenderScheduled || regexDeferredRenderTimer != null }; }' +
            '});\n';
        return route.fulfill({ response, body: bundle.slice(0, end) + probe + bundle.slice(end) });
    }
    if (requestUrl.pathname.startsWith('/__mock_model')) {
        const payload = route.request().postDataJSON();
        requests.push({ ...payload, requestEndpoint: requestUrl.href });
        if (payload.messages.some(message => String(message.content).includes(SNAPSHOT_PRIMARY_MARKER))) {
            await new Promise(resolve => setTimeout(resolve, 250));
        }
        return route.fulfill({ json: { choices: [{ message: { content: mockReply(payload) } }] } });
    }
    if (requestUrl.pathname.endsWith('/assets/js/regex-worker.js')) {
        workerLoads += 1;
        return route.continue();
    }
    if (requestUrl.origin !== new URL(url).origin) return route.abort();
    return route.continue();
});

await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.__regexWorkerStartup = { urls: [], delayed: false, delayMs: 0 };
    window.Worker = new Proxy(NativeWorker, {
        construct(target, args) {
            const worker = Reflect.construct(target, args);
            window.__regexWorkerStartup.urls.push(String(args[0]));
            const postMessage = worker.postMessage.bind(worker);
            worker.postMessage = (data, ...transfer) => {
                if (data && data.type === 'regex-worker-prepare' && !window.__regexWorkerStartup.delayed) {
                    window.__regexWorkerStartup.delayed = true;
                    const started = performance.now();
                    setTimeout(() => {
                        window.__regexWorkerStartup.delayMs = performance.now() - started;
                        postMessage(data, ...transfer);
                    }, 900);
                    return;
                }
                return postMessage(data, ...transfer);
            };
            return worker;
        }
    });
    localStorage.setItem('opentavern_onboarding_completed_v1', '1');
    localStorage.setItem('opentavern_announce_dismissed_v1', '1');
});

try {
    await page.goto(url);
    await page.waitForFunction(() => typeof renderAssistantContent === 'function' && typeof __regexProbe === 'function' &&
        getActiveConv() && state.settings && document.getElementById('messageInput') && document.getElementById('sendBtn'));
    // 不依赖任何既有会话数据：把活动会话重置为测试自己的干净会话与角色。
    await page.evaluate(() => {
        const conv = getActiveConv();
        conv.character = { name: '验收角色', extensions: {} };
        conv.title = '验收会话';
        conv.messages = [];
        normalizeConversation(conv);
        switchView('chat');
        requestFullRender();
    });

    // ---------- A1) 装载 900ms > 500ms，但简单规则仍必须成功 ----------
    await page.evaluate(() => {
        Object.assign(state.settings, { globalRegexEnabled: true, globalRegexScripts: [{ name: '简单规则', placement: [2], findRegex: 'foo', replaceString: 'bar', flags: 'g' }] });
        const conv = getActiveConv();
        conv.character = { name: '验收角色', extensions: {} };
        conv.messages = [{ id: 'slow-load', role: 'assistant', content: 'foo foo' }];
        normalizeConversation(conv);
        conv._showAllMessages = true;
        switchView('chat');
        requestFullRender();
    });
    await page.waitForFunction(() => __regexProbe().pending === 0 && !__regexProbe().renderPending, null, { timeout: 20000 });
    const slowLoadText = await page.evaluate(() => (document.querySelector('[data-message-id="slow-load"] .msg-bubble') || {}).textContent || '');
    assert.ok(slowLoadText.includes('bar bar'), '装载 900ms 不得被当作执行超时，简单规则必须成功');
    const startup = await page.evaluate(() => window.__regexWorkerStartup);
    assert.equal(startup.urls.length, 1, '简单规则必须实际创建一个 Worker');
    assert.ok(startup.urls[0].startsWith('blob:'), '必须实际运行内嵌 Blob Worker');
    assert.ok(startup.delayMs >= 880, '必须实际等待约 900ms 的就绪握手');
    assert.equal(workerLoads, 0, '内嵌 Worker 不应下载独立脚本');

    // ---------- A3) 旧客户端（第 11 版及以前）未 prepare 直发任务：第一条消息必须是 result，不得是 ready ----------
    const legacyFirstMessage = await page.evaluate(() => new Promise((resolve, reject) => {
        const worker = new Worker(new URL('assets/js/regex-worker.js', document.baseURI));
        const timer = setTimeout(() => { worker.terminate(); reject(new Error('旧客户端直发任务 10 秒内未收到回复')); }, 10000);
        worker.onmessage = event => { clearTimeout(timer); const data = event.data; worker.terminate(); resolve(data); };
        worker.onerror = () => { clearTimeout(timer); worker.terminate(); reject(new Error('旧客户端直发任务触发 onerror')); };
        worker.postMessage({ text: 'a1a', source: 'a', flags: 'g', replacement: 'b', trimStrings: [] });
    }));
    assert.notEqual(legacyFirstMessage.ready, true, '旧客户端直发任务第一条消息不得是 ready');
    assert.equal(legacyFirstMessage.result, 'b1b', '旧客户端直发任务第一条消息必须是 result');

    // ---------- A2) 灾难正则：主线程保持响应、约 500ms 终止（不是 10s 装载期限）、队列恢复 ----------
    const chaos = await page.evaluate(async () => {
        state.settings.globalRegexScripts = [{ name: '灾难规则', placement: [2], findRegex: '(a+)+$', replaceString: 'X', flags: 'g' }];
        const conv = getActiveConv();
        conv.messages = [{ id: 'chaos', role: 'assistant', content: 'a'.repeat(4000) + '!' }];
        normalizeConversation(conv);
        requestFullRender();
        let ticks = 0;
        const start = performance.now();
        await new Promise(resolve => {
            const timer = setInterval(() => {
                ticks += 1;
                if (performance.now() - start > 450) { clearInterval(timer); resolve(); }
            }, 30);
        });
        // 从触发到队列真正清空的真实耗时：灾难正则应在约 500ms 终止，而不是等到 10 秒装载期限。
        const deadline = start + 5000;
        while ((__regexProbe().pending !== 0 || __regexProbe().renderPending) && performance.now() < deadline) await new Promise(resolve => setTimeout(resolve, 5));
        return { ticks, drainMs: performance.now() - start };
    });
    assert.ok(chaos.ticks >= 5, `灾难正则执行期间主线程必须保持响应，实际 tick=${chaos.ticks}`);
    assert.ok(chaos.drainMs >= 450 && chaos.drainMs < 3000, `灾难正则必须在约 500ms 终止，实际 ${Math.round(chaos.drainMs)}ms`);
    assert.ok(warnings.some(text => text.includes('灾难规则')), '灾难正则超时提示必须包含规则名，实际警告：' + warnings.join(' | '));
    const chaosText = await page.evaluate(() => (document.querySelector('[data-message-id="chaos"] .msg-bubble') || {}).textContent || '');
    assert.ok(chaosText.includes('aaaa'), '灾难正则超时终止后必须保持原文');
    await page.evaluate(() => {
        state.settings.globalRegexScripts = [{ name: '简单规则', placement: [2], findRegex: 'foo', replaceString: 'bar', flags: 'g' }];
        const conv = getActiveConv();
        conv.messages = [{ id: 'recover', role: 'assistant', content: 'foo recover' }];
        normalizeConversation(conv);
        requestFullRender();
    });
    await page.waitForFunction(() => __regexProbe().pending === 0 && !__regexProbe().renderPending, null, { timeout: 20000 });
    const recoveredText = await page.evaluate(() => (document.querySelector('[data-message-id="recover"] .msg-bubble') || {}).textContent || '');
    assert.ok(recoveredText.includes('bar recover'), '超时终止后队列必须恢复，后续简单规则正常');
    await page.evaluate(() => { state.settings.globalRegexEnabled = false; });

    // ---------- C) dream 包装只在显示层去除标记 ----------
    const dreamBody = '<dream_plot>\n<dream_body>\n截图正文。\n</dream_body>\n<dream_after_format>\n<details><summary>状态栏</summary><div>精力：80</div></details>\n</dream_after_format>\n</dream_plot>';
    await page.evaluate(payload => {
        const conv = getActiveConv();
        conv.messages = [
            { id: 'dream-full', role: 'assistant', content: payload.text },
            { id: 'dream-clamped', role: 'assistant', content: '<dream_plot><dream_body>贴着正文</dream_body><dream_after_format>\n<details><summary>状态栏</summary><div>精力：42</div></details>\n</dream_after_format></dream_plot>' },
            { id: 'dream-options', role: 'assistant', content: '<dream_plot><dream_body>选项正文</dream_body><dream_after_format><options><option><title>继续</title><description>贴着包装的选项。</description></option></options></dream_after_format></dream_plot>' },
            { id: 'dream-code', role: 'assistant', content: '示例：\n```html\n<dream_plot>\n  <dream_body>code</dream_body>\n</dream_plot>\n```\n行内 ` <dream_done/> ` 示例' },
            { id: 'dream-xss', role: 'assistant', content: '<dream_plot><dream_body><img src=x onerror="window.__dreamXss=1"><script>window.__dreamXss=1</script>危险正文</dream_body></dream_plot>' }
        ];
        normalizeConversation(conv);
        conv._showAllMessages = true;
        window.__dreamXss = 0;
        requestFullRender();
    }, { text: dreamBody });

    const fullText = await page.evaluate(() => (document.querySelector('[data-message-id="dream-full"] .msg-bubble') || {}).textContent || '');
    assert.ok(fullText.includes('截图正文。'), 'dream 正文必须保留');
    assert.ok(!fullText.includes('dream_'), 'dream 包装标记不得显示');
    assert.ok(await page.locator('[data-message-id="dream-full"] .msg-bubble .status-bar').count() === 1, 'after_format 内的状态栏必须保留');
    await page.locator('[data-message-id="dream-full"] .msg-bubble .status-bar summary').click();
    assert.ok((await page.locator('[data-message-id="dream-full"] .msg-bubble').innerText()).includes('精力：80'), '状态栏内容必须保留');

    const clampedText = await page.evaluate(() => (document.querySelector('[data-message-id="dream-clamped"] .msg-bubble') || {}).textContent || '');
    assert.ok(clampedText.includes('贴着正文') && !clampedText.includes('dream_'), '连续贴着正文的完整包装必须兼容');
    assert.equal(await page.locator('[data-message-id="dream-clamped"] .msg-bubble .status-bar').count(), 1, '与正文贴着的 after_format 状态栏必须保留');
    const optionsText = await page.evaluate(() => (document.querySelector('[data-message-id="dream-options"] .msg-bubble') || {}).textContent || '');
    assert.ok(!optionsText.includes('dream_'), 'after_format 选项包装不得残留 dream 标记');
    assert.equal(await page.locator('[data-message-id="dream-options"] .msg-bubble .message-option-choice').count(), 1, 'after_format 内的选项必须保留');
    assert.ok(optionsText.includes('继续') && optionsText.includes('贴着包装的选项。'), '选项内容必须保留');

    const codeText = await page.evaluate(() => (document.querySelector('[data-message-id="dream-code"] .msg-bubble') || {}).textContent || '');
    assert.ok(codeText.includes('<dream_plot>') && codeText.includes('<dream_body>') && codeText.includes('<dream_done/>'), '代码围栏与行内代码中的示例标记必须保留');

    const xssCheck = await page.evaluate(() => {
        const bubble = document.querySelector('[data-message-id="dream-xss"] .msg-bubble');
        return { xss: window.__dreamXss, dangerous: bubble ? bubble.querySelectorAll('script,img,iframe,style').length : -1, text: bubble ? bubble.textContent : '' };
    });
    assert.equal(xssCheck.xss, 0, 'dream 正文中的脚本不得执行');
    assert.equal(xssCheck.dangerous, 0, 'dream 正文中的危险元素必须被清理');
    assert.ok(xssCheck.text.includes('危险正文'), '安全清理后正文应保留');

    await page.evaluate(payload => {
        const conv = getActiveConv();
        conv.messages.push({ id: 'dream-card', role: 'assistant', content: payload.text });
        normalizeConversation(conv);
        conv._showAllMessages = true;
        window.auditMalicious = 0;
        requestFullRender();
    }, { text: CARD_STATIC_EXAMPLE });
    const cardBubble = page.locator('[data-message-id="dream-card"] .msg-bubble');
    const cardStatic = cardBubble.locator('.card-runtime-static');
    const cardText = await cardStatic.textContent();
    assert.ok(cardText.includes('正常叙事正文。'), '真实卡片静态区必须保留正文');
    assert.ok(!cardText.includes('dream_'), '真实卡片静态区不得显示代码外 dream 包装标记');
    assert.equal(await cardBubble.locator('.status-bar').count(), 1, '卡片静态区必须保留自定义状态栏');
    assert.equal(await cardBubble.locator('.message-option-choice').count(), 1, '卡片静态区必须保留选项');
    assert.equal(await cardBubble.locator('[data-action="card-runtime-run"]').count(), 1, '真实卡片入口必须保留逐卡运行按钮');
    assert.equal(await cardBubble.locator('[data-action="card-runtime-details"]').count(), 1, '真实卡片入口必须保留审核详情按钮');
    assert.equal(await cardBubble.locator('[data-action="card-runtime-revoke"]').getAttribute('hidden'), '', '未运行时撤销入口必须保持隐藏');

    const cardConsistency = await page.evaluate(payload => {
        const stream = document.createElement('div');
        for (let index = 1; index <= payload.text.length; index += 1) renderStreamingAssistantContent(stream, payload.text.slice(0, index), {}, true);
        const direct = document.createElement('div');
        direct.innerHTML = renderAssistantContent(payload.text);
        const saved = document.querySelector('[data-message-id="dream-card"] .card-runtime-static');
        return {
            streamMatchesDirect: stream.innerHTML === direct.innerHTML,
            savedMatchesDirect: saved ? saved.innerHTML === direct.innerHTML : false,
            streamText: stream.textContent,
            savedText: saved ? saved.textContent : '',
            raw: getActiveConv().messages.find(message => message.id === 'dream-card').content,
        };
    }, { text: CARD_STATIC_EXAMPLE });
    assert.equal(cardConsistency.streamMatchesDirect, true, '逐字符流式普通预览必须与整段普通预览一致');
    assert.equal(cardConsistency.savedMatchesDirect, true, '保存后的卡片静态正文必须与普通预览一致');
    assert.ok(!cardConsistency.streamText.includes('dream_') && cardConsistency.streamText.includes('正常叙事正文。'), '流式普通预览不得显示 dream 包装标记');
    assert.equal(cardConsistency.raw, CARD_STATIC_EXAMPLE, '卡片静态处理不得改写原始消息');
    assert.equal(await page.evaluate(() => window.auditMalicious), 0, '卡片静态区中的脚本不得执行');

    const displayBoundaries = await page.evaluate(payload => {
        const conv = getActiveConv();
        const character = conv.character;
        const context = { conv, character };
        state.settings.streamTextAnimEnabled = true;
        state.settings.lowPowerMode = false;
        state.settings.twoStageEnabled = false;
        const prepared = prepareMessageDisplay({ text: payload.optionText, context, messageRole: 'assistant', sourcePlacement: 'AI_OUTPUT' });
        const stream = document.createElement('div');
        renderStreamingAssistantContent(stream, payload.optionText, context, true);
        const final = document.createElement('div');
        final.innerHTML = renderAssistantContent(payload.optionText, context);

        const msg = { id: 'generation-card-source-boundary', role: 'assistant', content: payload.cardText };
        conv.messages.push(msg);
        normalizeConversation(conv);
        const savedMsg = conv.messages.find(message => message.id === 'generation-card-source-boundary');
        const cardPrepared = prepareMessageDisplay({ text: savedMsg.content, context: { conv, msg: savedMsg, character }, messageRole: 'assistant', sourcePlacement: 'AI_OUTPUT' });
        renderAssistantContent(savedMsg.content, { conv, msg: savedMsg, character });
        const entry = Array.from(cardRuntimeEntries.values()).find(candidate => candidate.msg === savedMsg);
        return {
            preparedText: prepared.display.text,
            preparedOptions: prepared.display.options.length,
            preparedHtml: prepared.display.html,
            streamHtml: stream.innerHTML,
            finalHtml: final.innerHTML,
            messageInput: savedMsg.content,
            preparedInput: cardPrepared.inputText,
            executable: cardPrepared.executableText,
            entryOriginal: entry ? entry.original : '',
            entrySource: entry ? entry.source : '',
        };
    }, {
        optionText: '前文。<options><option><title>动作</title><description>受控行动。</description></option></options>尾文。',
        cardText: '<UpdateVariable><JSONPatch>[]</JSONPatch></UpdateVariable>\n<script>window.onlyIsolatedFixture=1</script>\n原始卡片正文。',
    });
    assert.equal(displayBoundaries.preparedOptions, 1, '真实准备结果必须保留完整选项');
    assert.equal(displayBoundaries.preparedText, '前文。尾文。', '真实准备结果必须只从纯正文文本移除选项块');
    assert.equal(displayBoundaries.preparedHtml, displayBoundaries.streamHtml, '流式静态输出必须复用同一准备结果');
    assert.equal(displayBoundaries.streamHtml, displayBoundaries.finalHtml, '完整流式输入必须与最终助手显示等价');
    assert.match(displayBoundaries.streamHtml, /message-option-choice/);
    assert.equal(displayBoundaries.messageInput, displayBoundaries.preparedInput, '卡片准备必须保持完整原始消息输入');
    assert.equal(displayBoundaries.executable, '<script>window.onlyIsolatedFixture=1</script>\n原始卡片正文。', '卡片可执行源必须在 MVU 控制块后形成拆分前字节边界');
    assert.equal(displayBoundaries.entryOriginal, displayBoundaries.executable);
    assert.equal(displayBoundaries.entrySource, displayBoundaries.executable);
    assert.doesNotMatch(displayBoundaries.entrySource, /UpdateVariable/);

    const preservedRaw = await page.evaluate(() => getActiveConv().messages.find(message => message.id === 'dream-full').content);
    assert.ok(preservedRaw.includes('<dream_plot>') && preservedRaw.includes('<dream_body>'), '原始消息不得被改写');

    const streamConsistency = await page.evaluate(payload => {
        const full = '<dream_plot>\n<dream_body>**流式正文** “你好”</dream_body>\n<dream_after_format><details><summary>状态栏</summary><div>HP: 5</div></details></dream_after_format>\n</dream_plot>';
        const target = document.createElement('div');
        for (let i = 1; i <= full.length; i += 1) renderStreamingAssistantContent(target, full.slice(0, i), {}, true);
        const direct = document.createElement('div');
        direct.innerHTML = renderAssistantContent(full);
        return { same: target.innerHTML === direct.innerHTML, rendered: target.textContent, raw: payload.raw };
    }, { raw: dreamBody });
    assert.equal(streamConsistency.same, true, '逐字符流式的最终输出必须与整段渲染一致');
    assert.ok(!streamConsistency.rendered.includes('dream_') && streamConsistency.rendered.includes('流式正文'), '流式最终输出也必须去除 dream 标记并保留正文');

    // ---------- B) 默认二阶段：无效续写 -> 一次格式纠正 -> 保存选项 ----------
    const endpointFixture = Object.freeze({
        oldEndpoint: new URL('/__mock_model/old/v1/chat/completions', url).href,
        newEndpoint: new URL('/__mock_model/new/v1/chat/completions', url).href,
    });
    const generationFixture = Object.freeze({ ...endpointFixture, marker: CUSTOM_PROMPT_MARKER });
    await page.evaluate(payload => {
        Object.assign(state.settings, {
            apiEndpoint: payload.oldEndpoint, apiKey: 'mock-key', model: 'old-model', maxTokens: 4096,
            streamEnabled: false, summaryEnabled: false, twoStageEnabled: true,
            twoStageSystemPrompt: '', twoStageIncludeRecentContext: false,
            globalRegexEnabled: false
        });
        const conv = getActiveConv();
        conv.character = { name: '验收角色', extensions: {} };
        conv.messages = [{ role: 'user', content: '开始验收' }];
        normalizeConversation(conv);
        switchView('chat');
        requestFullRender();
    }, generationFixture);

    const requestsBeforeSecondStage = requests.length;
    await page.locator('#messageInput').fill(SNAPSHOT_PRIMARY_MARKER);
    await page.locator('#sendBtn').click();
    await page.evaluate(payload => {
        Object.assign(state.settings, {
            apiEndpoint: payload.newEndpoint, model: 'new-model', maxTokens: 32,
            twoStageSystemPrompt: payload.marker, twoStageIncludeRecentContext: true
        });
    }, generationFixture);
    await page.waitForFunction(() => !state.isGenerating && getActiveConv().messages.some(message => message.stage === 'second' && String(message.content).includes('<options>')), null, { timeout: 30000 });
    const snapshotRequests = requests.slice(requestsBeforeSecondStage);
    const snapshotMain = snapshotRequests.find(request => request.messages.some(message => String(message.content).includes(SNAPSHOT_PRIMARY_MARKER)));
    const staged = snapshotRequests.filter(isSecondStageRequest);
    assert.equal(snapshotMain.requestEndpoint, endpointFixture.oldEndpoint, '同次主请求必须使用旧 endpoint');
    assert.equal(snapshotMain.model, 'old-model', '同次主请求必须使用旧 model');
    assert.equal(snapshotMain.max_tokens, 4096, '同次主请求必须保留 4096 预算');
    assert.equal(staged.length, 2, `默认二阶段必须恰好发出一次原始请求与一次纠正请求，实际 ${staged.length}`);
    for (const request of staged) {
        assert.equal(request.requestEndpoint, endpointFixture.oldEndpoint, '同次二阶段与纠正必须使用旧 endpoint');
        assert.equal(request.model, 'old-model', '同次二阶段与纠正必须使用旧 model');
        assert.equal(request.max_tokens, 1024, '同次二阶段与纠正预算必须是 1024');
    }
    const firstStageRequest = staged[0];
    assert.equal(firstStageRequest.messages.at(-1).role, 'user', '默认二阶段请求最后一条必须是 user 选项指令');
    assert.ok(String(firstStageRequest.messages.at(-1).content).includes(OPTIONS_REQUEST_MARKER), '默认二阶段请求必须要求生成 2-4 个 <options> 选项');
    const firstStageRequestText = firstStageRequest.messages.map(message => String(message.content || '')).join('\n');
    assert.ok(firstStageRequestText.includes('主回复开头') && firstStageRequestText.includes('<options><option><title>这是示例</title>') && firstStageRequestText.includes('主回复结尾'),
        '二阶段实际请求载荷必须保留主回复中的 fenced XML 示例及前后正文');
    assert.ok(firstStageRequestText.includes('正文开头<options>') && firstStageRequestText.includes('说明：<options>是选项容器</options>。后文'),
        '二阶段实际请求载荷必须保留跨保护区的不确定块和说明文字中的字面标签');
    const correctionRequest = staged[1];
    assert.equal(correctionRequest.messages.at(-1).role, 'user', '纠正请求最后一条必须是 user 提醒');
    assert.ok(String(correctionRequest.messages.at(-1).content).includes(RETRY_REQUEST_MARKER), '纠正请求必须提醒上次格式无效');
    const secondMessages = await page.evaluate(() => getActiveConv().messages.filter(message => message.stage === 'second').map(message => message.content));
    assert.equal(secondMessages.length, 1, '无效续写不得保存成第二阶段，只保存纠正后的完整选项');
    assert.ok(secondMessages[0].includes('纠正选项'), '必须保存纠正请求返回的完整选项');
    const primarySaved = await page.evaluate(marker => {
        const message = getActiveConv().messages.find(item => item.stage === 'main' && String(item.content).includes(marker));
        const bubble = message && document.querySelector(`[data-message-id="${message.id}"] .msg-bubble`);
        return {
            content: message ? message.content : '',
            text: bubble ? bubble.textContent : '',
            code: bubble ? (bubble.querySelector('pre code') || {}).textContent || '' : '',
            optionButtons: bubble ? bubble.querySelectorAll('.message-option-choice').length : -1,
        };
    }, '主回复开头');
    assert.equal(primarySaved.content, PRIMARY_CODE_EXAMPLE, '主回复原始代码示例不得被显示清理回写');
    assert.ok(primarySaved.text.includes('主回复开头') && primarySaved.text.includes('主回复结尾'), '主回复显示必须保留 fenced XML 示例前后的正文');
    assert.match(primarySaved.code, /<options><option><title>这是示例<\/title>/, '主回复中的 XML 示例必须继续显示为代码');
    assert.equal(primarySaved.optionButtons, 0, '主回复代码示例不得变成可点击选项');
    await page.waitForTimeout(400);
    assert.equal(requests.slice(requestsBeforeSecondStage).filter(isSecondStageRequest).length, 2, '纠正只允许一次，不得继续追加请求');

    // ---------- B2) 自定义二阶段提示词：不追加默认指令、不重试 ----------
    await page.evaluate(payload => {
        Object.assign(state.settings, {
            apiEndpoint: payload.newEndpoint, model: 'new-model', maxTokens: 32,
            twoStageSystemPrompt: payload.marker, twoStageIncludeRecentContext: true
        });
        const conv = getActiveConv();
        conv.messages = [{ role: 'user', content: '自定义验收' }];
        normalizeConversation(conv);
        requestFullRender();
    }, generationFixture);
    const requestsBeforeCustom = requests.length;
    await page.locator('#messageInput').fill(SNAPSHOT_PRIMARY_MARKER + ' 下一操作');
    await page.locator('#sendBtn').click();
    await page.waitForFunction(() => !state.isGenerating && getActiveConv().messages.some(message => message.stage === 'second'), null, { timeout: 30000 });
    const customRequests = requests.slice(requestsBeforeCustom);
    const customMain = customRequests.find(request => !isSecondStageRequest(request));
    const customStage = customRequests.filter(isSecondStageRequest);
    assert.equal(customMain.requestEndpoint, endpointFixture.newEndpoint, '下一操作主请求必须使用新 endpoint');
    assert.equal(customMain.model, 'new-model', '下一操作主请求必须使用新 model');
    assert.equal(customMain.max_tokens, 32, '下一操作主请求预算必须是 32');
    assert.equal(customStage.length, 1, '自定义提示词不得追加纠正请求');
    assert.equal(customStage[0].requestEndpoint, endpointFixture.newEndpoint, '下一操作二阶段必须使用新 endpoint');
    assert.equal(customStage[0].model, 'new-model', '下一操作二阶段必须使用新 model');
    assert.equal(customStage[0].max_tokens, 32, '下一操作二阶段预算必须是 32');
    const customLastRole = customStage[0].messages.at(-1).role;
    assert.notEqual(customLastRole, 'user', '自定义提示词请求不得追加默认 user 选项指令');
    assert.ok(!customStage[0].messages.some(message => String(message.content).includes(OPTIONS_REQUEST_MARKER)), '自定义提示词请求不得包含默认选项专用指令');
    const customSecond = await page.evaluate(() => getActiveConv().messages.filter(message => message.stage === 'second').map(message => message.content));
    assert.ok(customSecond[0].includes('自定义状态栏内容'), '自定义二阶段输出必须原样保留');

    // ---------- 视觉：390/1280 浅暗、无横向溢出 ----------
    await page.evaluate(() => {
        const conv = getActiveConv();
        conv.messages = [
            { role: 'user', content: '看看这段包装' },
            { id: 'visual-dream', role: 'assistant', content: '<dream_plot>\n<dream_body>\n截图正文。\n</dream_body>\n<dream_after_format>\n<details><summary>状态栏</summary><div>精力：80</div></details>\n</dream_after_format>\n</dream_plot>' }
        ];
        normalizeConversation(conv);
        conv._showAllMessages = true;
        requestFullRender();
    });
    for (const width of [390, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        for (const theme of ['new-light', 'new-dark']) {
            await page.evaluate(payload => applyUiTheme(payload.theme), { theme });
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${width} ${theme} 不得横向溢出`);
            await page.screenshot({ path: path.join(output, `generation-format-${width}-${theme}.png`), animations: 'disabled' });
        }
    }
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ passed: true, screenshots: output, ...(await captureBrowserEvidence(page, output)), workerLoads, requests: requests.length, chaosMs: Math.round(chaos.drainMs), chaosTicks: chaos.ticks }));
} catch (error) {
    await page.screenshot({ path: path.join(output, 'failure.png'), animations: 'disabled' }).catch(() => {});
    throw error;
} finally {
    await browser.close();
}
