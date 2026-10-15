import { captureBrowserEvidence } from './check-release.mjs';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';

// Optional visual smoke. Use an existing Playwright install; no dependency or browser is downloaded.
const modulePath = process.env.OPENTAVERN_PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = await import(path.isAbsolute(modulePath) ? pathToFileURL(modulePath).href : modulePath);
const url = process.env.OPENTAVERN_TEST_URL || 'http://127.0.0.1:8765/opentavern.html';
const output = process.env.OPENTAVERN_TEST_OUTPUT || await mkdtemp(path.join(os.tmpdir(), 'opentavern-m1-'));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('dialog', (dialog) => dialog.dismiss());
let responseMode = 'success';
const requests = [];
await context.route('**/*', async (route) => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.pathname.endsWith('/assets/js/app.js')) {
        // Test-only probes inside the private bundle scope. Production source and artifact are not changed.
        const response = await route.fetch();
        const bundle = await response.text();
        const end = bundle.lastIndexOf('})();');
        assert.ok(end > 0, 'Expected the existing app bundle scope.');
        const probe = 'Object.assign(window, { state, StorageService, getActiveConv, normalizeConversation, captureSummarySources, applyUiTheme, applyTranslations, requestFullRender, renderMessagesOnly, openSummaryManager, getSummaryValidity, switchView, updateInputState });\n';
        return route.fulfill({ response, body: bundle.slice(0, end) + probe + bundle.slice(end) });
    }
    if (requestUrl.pathname.startsWith('/__mock_model')) {
        const body = route.request().postDataJSON();
        requests.push(body);
        if (responseMode === 'failure') return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Mock failure' } }) });
        if (responseMode === 'length' || responseMode === 'content_filter') {
            return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: `未完整的新回复 ${responseMode}` }, finish_reason: responseMode }], usage: { prompt_tokens: 10, completion_tokens: 5 } }) });
        }
        if (responseMode === 'stream-length' || responseMode === 'stream-content_filter') {
            const finishReason = responseMode.slice('stream-'.length);
            return route.fulfill({ status: 200, contentType: 'text/event-stream', body: `data: {"choices":[{"delta":{"content":"未完整的新回复 ${finishReason}"}}],"usage":{"prompt_tokens":10,"completion_tokens":5}}\n\ndata: {"choices":[{"finish_reason":"${finishReason}"}]}\n\ndata: [DONE]\n\n` });
        }
        if (responseMode === 'stream-error') {
            return route.fulfill({ status: 200, contentType: 'text/event-stream', body: 'data: {"choices":[{"delta":{"content":"错误前正文"}}]}\n\ndata: {"error":{"message":"upstream_overloaded"}}\n\ndata: [DONE]\n\n' });
        }
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: '测试接口的新回复 / 自动摘要' } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }) });
    }
    if (requestUrl.origin !== new URL(url).origin) return route.abort();
    return route.continue();
});
await page.addInitScript(() => {
    localStorage.setItem('opentavern_onboarding_completed_v1', '1');
    localStorage.setItem('opentavern_announce_dismissed_v1', '1');
});
try {
    await page.goto(url);
    await page.waitForFunction(() => typeof state !== 'undefined' && state.settings && typeof renderMessagesOnly === 'function' && getActiveConv() && document.body.classList.contains('theme-new-light'));
    await page.evaluate((endpoint) => {
        Object.assign(state.settings, { lang: 'zh-CN', apiEndpoint: endpoint, apiKey: 'mock-local-key', model: 'mock', streamEnabled: false, twoStageEnabled: false, summaryEnabled: false, showReplyAvatar: true, showMsgTokenUsage: true });
        const conv = { id: 'visual-smoke', title: 'M1 可靠性验收', character: { name: '测试角色', description: '测试角色' }, messages: [{ role: 'user', content: '测试问题' }, { id: 'main', role: 'assistant', content: '保留的原回复', cot: '原思考内容', usage: { promptTokens: 10, completionTokens: 4 } }, { id: 'second', role: 'assistant', stage: 'second', parentId: 'main', content: '<options><option><title>原选项</title><description>与原回复关联的选项。</description></option></options>' }], summaries: [], created: Date.now(), updated: Date.now() };
        state.conversations = { [conv.id]: conv }; state.conversationOrder = [conv.id]; state.activeConvId = conv.id;
        normalizeConversation(conv);
        const verified = { id: 'valid', text: '有来源的摘要', summaryVersion: 2, sourceMessages: captureSummarySources(conv.messages.slice(0, 2)), coveredStart: 0, coveredEnd: 1, created: Date.now() };
        conv.summaries = [verified, { ...JSON.parse(JSON.stringify(verified)), id: 'invalid', text: '来源已改变的摘要', sourceMessages: [{ id: 'main', revision: 'stale' }, { id: 'missing', revision: 'stale' }] }, { id: 'legacy', text: '旧摘要保留', coveredStart: 0, coveredEnd: 1, created: Date.now() }];
        applyUiTheme('new-light'); applyTranslations(); requestFullRender(); switchView('chat');
    }, new URL('/__mock_model', url).href);
    await page.waitForSelector('[data-action="retry"][data-msg-idx="1"]');
    responseMode = 'failure';
    await page.locator('[data-action="retry"][data-msg-idx="1"]').click({ force: true });
    await page.waitForFunction(() => !state.isGenerating);
    assert.equal(await page.evaluate(() => getActiveConv().messages[1].content), '保留的原回复');
    assert.equal(await page.evaluate(() => getActiveConv().messages[2].id), 'second');
    await page.locator('#appDialogOkBtn').click();
    responseMode = 'success';
    await page.locator('[data-action="retry"][data-msg-idx="1"]').click({ force: true });
    await page.waitForFunction(() => !state.isGenerating && getActiveConv().messages[1].responseVersions?.length === 2);
    assert.equal(await page.evaluate(() => getActiveConv().messages.length), 2);
    await page.locator('[data-action="version-prev"][data-msg-idx="1"]').click({ force: true });
    await page.waitForFunction(() => !state.isGenerating && getActiveConv().messages[1].content === '保留的原回复');
    assert.equal(await page.evaluate(() => getActiveConv().messages[2].id), 'second');
    let expectedVersionCount = 2;
    for (const finishReason of ['length', 'content_filter']) {
        responseMode = finishReason;
        await page.locator('[data-action="retry"][data-msg-idx="1"]').click({ force: true });
        await page.waitForFunction(() => !state.isGenerating);
        assert.equal(await page.evaluate(() => getActiveConv().messages[1].content), '保留的原回复');
        expectedVersionCount += 1;
        assert.equal(await page.evaluate(() => getActiveConv().messages[1].responseVersions?.length), expectedVersionCount);
        assert.equal(await page.evaluate(() => getActiveConv().messages[1].responseVersions?.at(-1)?.interrupted), true);
        await page.locator('#appDialogOkBtn').click();
    }
    await page.evaluate(() => { state.settings.streamEnabled = true; });
    for (const finishReason of ['length', 'content_filter']) {
        responseMode = `stream-${finishReason}`;
        await page.locator('[data-action="retry"][data-msg-idx="1"]').click({ force: true });
        await page.waitForFunction(() => !state.isGenerating);
        assert.equal(await page.evaluate(() => getActiveConv().messages[1].content), '保留的原回复');
        expectedVersionCount += 1;
        assert.equal(await page.evaluate(() => getActiveConv().messages[1].responseVersions?.length), expectedVersionCount);
        assert.equal(await page.evaluate(() => getActiveConv().messages[1].responseVersions?.at(-1)?.interrupted), true);
        await page.locator('#appDialogOkBtn').click();
    }
    responseMode = 'stream-error';
    await page.locator('[data-action="retry"][data-msg-idx="1"]').click({ force: true });
    await page.waitForFunction(() => !state.isGenerating);
    assert.equal(await page.evaluate(() => getActiveConv().messages[1].content), '保留的原回复');
    assert.equal(await page.evaluate(() => getActiveConv().messages[1].responseVersions?.length), expectedVersionCount, 'Provider errors must not commit partial regenerated content.');
    assert.ok((await page.locator('#appDialogMessage').innerText()).includes('upstream_overloaded'));
    await page.locator('#appDialogOkBtn').click();
    responseMode = 'success';
    await page.evaluate(() => { state.settings.streamEnabled = false; });
    await page.reload();
    await page.waitForFunction((count) => typeof getActiveConv === 'function' && getActiveConv()?.id === 'visual-smoke' && getActiveConv().messages[1].responseVersions?.length === count, expectedVersionCount);
    await page.evaluate(() => { state.settings.streamEnabled = false; });
    await page.evaluate(() => switchView('chat'));
    assert.equal(await page.evaluate(() => getActiveConv().messages[1].content), '保留的原回复');
    for (const width of [1280, 390]) {
        await page.setViewportSize({ width, height: 900 });
        for (const theme of ['new-light', 'new-dark']) {
            await page.evaluate((value) => { applyUiTheme(value); renderMessagesOnly(); }, theme);
            await page.locator('[data-msg-idx="1"][data-action="copy"]').hover();
            await page.screenshot({ path: path.join(output, `chat-${width}-${theme}.png`), animations: 'disabled' });
            await page.evaluate(() => openSummaryManager());
            await page.waitForSelector('#summaryManagerModal:not(.hidden)');
            const labels = await page.locator('#summaryManagerList').innerText();
            assert.ok(labels.includes('来源已核验') && labels.includes('已失效') && labels.includes('未验证'));
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'M1 controls must not cause horizontal page overflow.');
            await page.screenshot({ path: path.join(output, `summary-${width}-${theme}.png`), animations: 'disabled' });
            await page.locator('#summaryManagerCloseBtn').click();
        }
    }
    await page.evaluate(() => {
        const conv = getActiveConv();
        conv.messages = Array.from({ length: 12 }, (_, index) => ({ role: index % 2 ? 'assistant' : 'user', content: `自动总结测试消息 ${index}` }));
        conv.summaries = []; normalizeConversation(conv);
        Object.assign(state.settings, { summaryEnabled: true, summaryThreshold: 12, contextLength: 12, summarizeUseMainAPI: true, apiKey: 'mock-local-key' });
        renderMessagesOnly(); updateInputState();
    });
    await page.locator('#messageInput').fill('浏览器发送后自动总结');
    await page.locator('#sendBtn').click();
    await page.waitForFunction(() => getActiveConv().summaries.some((summary) => getSummaryValidity(summary, getActiveConv()) === 'valid'));
    assert.ok(requests.length >= 4, 'Regeneration, normal chat and automatic summary must reach the local mocked request boundary.');
    await page.waitForFunction(() => !state.isGenerating);
    await page.evaluate(() => {
        state.settings.summaryEnabled = false;
        const originalSave = StorageService.saveAll.bind(StorageService);
        let held = false;
        StorageService.saveAll = async (snapshot, options) => {
            const result = await originalSave(snapshot, options);
            if (!held) {
                held = true;
                await new Promise((resolve) => { window.releaseSavedCandidate = resolve; });
            }
            return result;
        };
    });
    await page.locator('[data-action="retry"]').last().click({ force: true });
    await page.waitForFunction(() => typeof releaseSavedCandidate === 'function');
    await page.evaluate(() => {
        delete state.conversations['visual-smoke'];
        state.conversationOrder = []; state.activeConvId = null;
        releaseSavedCandidate();
    });
    await page.waitForFunction(() => !state.isGenerating);
    assert.ok(await page.evaluate(() => Number(localStorage.getItem('opentavern-cleared-at')) > 0), 'Deleting the last conversation after a late write must establish the stale-backend guard.');
    assert.equal(await page.evaluate(async () => !!(await StorageService.loadAll({ sync: false }))?.conversations?.['visual-smoke']), false, 'Actual browser storage must not revive a deleted conversation after a late saved candidate.');
    await page.reload();
    await page.waitForFunction(() => typeof getActiveConv === 'function' && state.settings);
    assert.equal(await page.evaluate(() => !!state.conversations['visual-smoke']), false, 'Reload must not prefer stale browser backend data over the acknowledged correction.');
    assert.equal(errors.length, 0, errors.join('\n'));
    console.log(JSON.stringify({ passed: true, screenshots: output, ...(await captureBrowserEvidence(page, output)), actualRequests: requests.length }));
    console.log(`Browser smoke passed: failure preservation, version controls/reload, real send → auto-summary, late-save deletion/reload, 390/1280 px light/dark. Screenshots: ${output}`);
} catch (error) {
    console.error('Browser diagnostic:', errors, requests, await page.evaluate(() => ({ stateAvailable: typeof state, active: typeof getActiveConv === 'function' ? getActiveConv()?.id : null, classes: document.body.className, alert: document.getElementById('appDialogMessage')?.textContent })));
    throw error;
} finally {
    await browser.close();
}
