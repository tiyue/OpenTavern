import { captureBrowserEvidence } from './check-release.mjs';
/**
 * 真实浏览器冒烟：显示积压下的提示词优先、实际发送 payload 的正则替换、编辑/关闭规则、移动端浅暗视觉与无 pageerror。
 *
 * 使用已有 Playwright/Chrome（OPENTAVERN_PLAYWRIGHT_MODULE 指定模块路径），不自动安装依赖。
 * 入口默认 /.sites-public/opentavern.html，可被 OPENTAVERN_TEST_URL 覆盖；需先运行 npm run build 与 npm run prepare:sites。
 * 关键点：先制造 >256 的显示积压，再立即发送，用请求时刻抓取的 backlog 快照证明 prompt 优先而不是等待整个显示队列。
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const modulePath = process.env.OPENTAVERN_PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = await import(path.isAbsolute(modulePath) ? pathToFileURL(modulePath).href : modulePath);
const url = process.env.OPENTAVERN_TEST_URL || 'http://127.0.0.1:8765/.sites-public/opentavern.html';
const output = process.env.OPENTAVERN_TEST_OUTPUT || await mkdtemp(path.join(os.tmpdir(), 'opentavern-regex-'));
await mkdir(output, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext();
const page = await context.newPage();
const errors = [];
const requests = [];
const warnings = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'warning') warnings.push(message.text()); });
page.on('dialog', dialog => dialog.dismiss());

await context.route('**/*', async route => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.pathname.endsWith('/assets/js/app.js')) {
        const response = await route.fetch();
        const bundle = await response.text();
        const end = bundle.lastIndexOf('})();');
        assert.ok(end > 0, 'app.js 必须是 IIFE，才能注入测试 probe');
        const probe = 'Object.assign(window, {' +
            ' state, dom, getActiveConv, normalizeConversation, requestFullRender, switchView, applyUiTheme, buildMessagesForAPIAsync,' +
            ' updateStreamingBubble, removeGenerationStreamingBubble, getRegexDisplayChainState,' +
            ' __regexProbe: function() { return {' +
            ' pending: typeof regexPendingTasks === "undefined" ? -1 : regexPendingTasks.size,' +
            ' promptQueue: typeof regexPromptQueue === "undefined" ? -1 : regexPromptQueue.length,' +
            ' displayQueue: typeof regexDisplayQueue === "undefined" ? -1 : regexDisplayQueue.length,' +
            ' waiting: typeof regexWaitingDisplayTasks === "undefined" ? -1 : regexWaitingDisplayTasks.length,' +
            ' renderPending: regexRenderScheduled || regexDeferredRenderTimer != null }; }' +
            '});\n' +
            'window.__messageRenderTimes = [];\n' +
            'var originalMessageRender = renderMessagesOnly; renderMessagesOnly = function() { var start = performance.now(); var result = originalMessageRender(); window.__messageRenderTimes.push(performance.now() - start); return result; };\n' +
            'window.__requestBacklogs = [];\n' +
            'if (typeof window.fetch === "function") {\n' +
            '  var __origFetch = window.fetch.bind(window);\n' +
            '  window.fetch = function(input) {\n' +
            '    var target = typeof input === "string" ? input : (input && input.url) || "";\n' +
            '    if (target.indexOf("/__mock_model") !== -1) { try { window.__requestBacklogs.push(window.__regexProbe()); } catch (_) {} }\n' +
            '    return __origFetch.apply(null, arguments);\n' +
            '  };\n' +
            '}\n';
        return route.fulfill({ response, body: bundle.slice(0, end) + probe + bundle.slice(end) });
    }
    if (requestUrl.pathname.startsWith('/__mock_model')) {
        try { requests.push(route.request().postDataJSON()); } catch (_) { requests.push(null); }
        return route.fulfill({ json: { choices: [{ message: { content: '模型回复 foo' } }] } });
    }
    if (requestUrl.origin !== new URL(url).origin) return route.abort();
    return route.continue();
});

await page.addInitScript(() => {
    localStorage.setItem('opentavern_onboarding_completed_v1', '1');
    localStorage.setItem('opentavern_announce_dismissed_v1', '1');
    window.__workerPosts = 0;
    const post = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function(...args) { window.__workerPosts += 1; return post.apply(this, args); };
});

try {
    await page.goto(url);
    await page.waitForFunction(() => typeof buildMessagesForAPIAsync === 'function' && typeof getActiveConv === 'function' && getActiveConv());

    const endpoint = new URL('/__mock_model', url).href;
    const backlog = await page.evaluate(ep => {
        Object.assign(state.settings, {
            apiEndpoint: ep, apiKey: 'mock-key', model: 'mock',
            summaryEnabled: false, streamEnabled: false, contextLength: 14,
            globalRegexEnabled: true,
            globalRegexScripts: [
                { name: 'output', placement: [2], findRegex: 'foo', replaceString: 'bar', flags: 'g' },
                { name: 'input', placement: [1], findRegex: 'ping', replaceString: 'pong', flags: 'g' }
            ]
        });
        const conv = getActiveConv();
        conv.character = { name: '测试角色', extensions: {} };
        conv.title = '正则队列验收';
        conv.messages = [{ role: 'user', content: 'ping hello' }];
        for (let i = 0; i < 300; i += 1) conv.messages.push({ role: 'assistant', content: 'foo ' + i });
        conv.messages.push({ role: 'user', content: 'ping final' });
        normalizeConversation(conv);
        conv._showAllMessages = true;
        switchView('chat');
        requestFullRender();
        return __regexProbe();
    }, endpoint);
    assert.ok(backlog.pending > 256, `显示积压应超过 256，实际 ${JSON.stringify(backlog)}（需先 npm run build 重新生成 bundle）`);

    // 与实际用户一致：积压仍在时立即发送，不先等待完成。
    await page.locator('#messageInput').fill('ping again');
    await page.locator('#sendBtn').click();

    const deadline = Date.now() + 60000;
    while (requests.length === 0 && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
    assert.ok(requests.length > 0, '应捕获到真实模型请求');

    // 请求时刻抓取的 backlog 快照证明提示词优先：请求发出时显示积压远未清空。
    const backlogAtRequest = await page.evaluate(() => window.__requestBacklogs[0] || null);
    assert.ok(backlogAtRequest, '应记录请求时刻的显示积压快照');
    assert.ok(backlogAtRequest.pending > 0, `提示词请求应在显示积压未清空时发出（prompt 优先），实际 ${JSON.stringify(backlogAtRequest)}`);

    const payload = requests.at(-1) || {};
    const payloadText = (payload.messages || []).map(message => message.content).join('\n');
    assert.ok(payloadText.includes('pong again'), '实际发送 payload 的用户输入已被正则处理');
    assert.ok(payloadText.includes('bar 299'), '实际发送 payload 的历史输出已被正则处理');

    // 所有可见消息最终全部完成（真实 UI 目标）。
    await page.waitForFunction(() => __regexProbe().pending === 0 && !__regexProbe().renderPending, null, { timeout: 60000 });
    const visible = await page.evaluate(() => dom.messagesContainer ? dom.messagesContainer.textContent : '');
    assert.ok(visible.includes('bar 299'), '显示层最终完整完成正则替换');
    const bodies = (await page.locator('[data-message-id] .msg-bubble').allTextContents()).map(text => text.trim());
    for (let i = 0; i < 300; i += 1) assert.ok(bodies.includes('bar ' + i), `可见消息 ${i} 应完成替换`);

    // 清空积压后重复渲染不得重新执行 Worker。
    const postsBefore = await page.evaluate(() => window.__workerPosts);
    await page.evaluate(() => requestFullRender());
    await page.waitForTimeout(400);
    const postsAfter = await page.evaluate(() => window.__workerPosts);
    assert.equal(postsAfter, postsBefore, '积压清空后重复渲染不得再执行 Worker');

    // 编辑消息内容后应使该消息的显示链失效重算。
    await page.evaluate(() => {
        const conv = getActiveConv();
        const target = conv.messages.find(message => message.content === 'foo 299');
        if (target) target.content = 'foo edited';
        requestFullRender();
    });
    await page.waitForFunction(() => __regexProbe().pending === 0 && !__regexProbe().renderPending, null, { timeout: 60000 });
    const visibleEdited = await page.evaluate(() => dom.messagesContainer ? dom.messagesContainer.textContent : '');
    assert.ok(visibleEdited.includes('bar edited'), '编辑后的消息应重新执行正则替换');

    // 生成期间无消息显示链完成不得销毁正在生成的流式气泡（真实 updateStreamingBubble 调用）。
    const streamCreated = await page.evaluate(() => {
        const conv = getActiveConv();
        state.settings.globalRegexEnabled = true;
        state.isGenerating = true;
        // 含 Markdown 的正文走完整渲染路径，确保真实触发一次无消息对象的显示链。
        updateStreamingBubble('foo **stream** bubble', conv, '生成中', '', undefined);
        window.__streamEl = document.getElementById('streamingMsg');
        window.__streamContentEl = document.getElementById('streamingContent');
        return !!window.__streamEl;
    });
    assert.equal(streamCreated, true, '应能创建流式气泡');
    await page.waitForFunction(() => __regexProbe().pending === 0, null, { timeout: 60000 });
    const bubbleState = await page.evaluate(() => ({
        connected: !!(window.__streamEl && window.__streamEl.isConnected),
        text: window.__streamContentEl ? window.__streamContentEl.textContent : ''
    }));
    assert.equal(bubbleState.connected, true, '生成期间显示链完成不得删除流式气泡');
    assert.ok(bubbleState.text.includes('foo'), '生成期间显示链完成不得清空流式气泡内容');

    // 生成结束后最终消息能完成显示。
    await page.evaluate(() => {
        state.isGenerating = false;
        if (typeof removeGenerationStreamingBubble === 'function') removeGenerationStreamingBubble('main');
        const conv = getActiveConv();
        conv.messages.push({ role: 'assistant', content: 'foo 299 final' });
        normalizeConversation(conv);
        requestFullRender();
    });
    await page.waitForFunction(() => __regexProbe().pending === 0 && !__regexProbe().renderPending, null, { timeout: 60000 });
    const visibleFinal = await page.evaluate(() => dom.messagesContainer ? dom.messagesContainer.textContent : '');
    assert.ok(visibleFinal.includes('bar 299 final'), '生成结束后最终消息应完成显示');

    // 关闭规则后显示保持原文。
    await page.evaluate(() => { state.settings.globalRegexEnabled = false; requestFullRender(); });
    await page.waitForTimeout(300);
    const visibleRaw = await page.evaluate(() => dom.messagesContainer ? dom.messagesContainer.textContent : '');
    assert.ok(visibleRaw.includes('foo edited'), '关闭规则后显示保持原文');
    assert.ok(!visibleRaw.includes('bar edited'), '关闭规则后不得再替换');

    for (const theme of ['new-light', 'new-dark']) {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.evaluate(value => applyUiTheme(value), theme);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        await page.screenshot({ path: path.join(output, `regex-queue-390-${theme}.png`), animations: 'disabled' });
    }
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ passed: true, screenshots: output, ...(await captureBrowserEvidence(page, output)), actualRequests: requests.length, backlog, backlogAtRequest }));
} catch (error) {
    const diagnostic = await page.evaluate(() => ({
        probe: __regexProbe(),
        renderTimes: window.__messageRenderTimes,
        raw: Array.from(dom.messagesContainer.querySelectorAll('.msg-bubble')).map(element => element.textContent.trim()).filter(text => /^foo /.test(text)).slice(0, 12),
        failed: getActiveConv().messages.filter(message => message.role === 'assistant').map(message => {
            const chain = getRegexDisplayChainState({ msg: message, conv: getActiveConv() }, 2, false);
            return chain && chain.status === 'error' ? { content: message.content, status: chain.status } : null;
        }).filter(Boolean).slice(0, 12)
    }));
    console.log(JSON.stringify({ diagnostic, warnings }));
    await page.screenshot({ path: path.join(output, 'failure.png'), animations: 'disabled' });
    throw error;
} finally {
    await browser.close();
}
