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
const output = process.env.OPENTAVERN_TEST_OUTPUT || await mkdtemp(path.join(os.tmpdir(), 'opentavern-storage-timeout-'));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const errors = [];
const dialogs = [];
const requests = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('dialog', (dialog) => {
    dialogs.push(dialog.message());
    dialog.dismiss().catch(() => {});
});

await context.route('**/*', async (route) => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.pathname.endsWith('/assets/js/app.js')) {
        // Test-only probes inside the private bundle scope. Production source and artifact are not changed.
        const response = await route.fetch();
        const bundle = await response.text();
        const end = bundle.lastIndexOf('})();');
        assert.ok(end > 0, 'Expected the existing app bundle scope.');
        const probe = `Object.assign(window, { state, StorageService, IDBStorage, getActiveConv, normalizeConversation, captureSummarySources, applyUiTheme, applyTranslations, requestFullRender, renderMessagesOnly, openSummaryManager, getSummaryValidity, switchView, updateInputState, syncComposerConversation, persistState });\n` +
            `Object.defineProperty(window, '__composerBusy', { get() { return composerSendInProgress; }, configurable: true });\n`;
        return route.fulfill({ response, body: bundle.slice(0, end) + probe + bundle.slice(end) });
    }
    if (requestUrl.pathname.startsWith('/__mock_model')) {
        requests.push(requestUrl.pathname);
        return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ choices: [{ message: { content: '测试接口的回复 / 摘要结果' } }], usage: { prompt_tokens: 10, completion_tokens: 5 } })
        });
    }
    if (requestUrl.origin !== new URL(url).origin) return route.abort();
    return route.continue();
});

await page.addInitScript(() => {
    localStorage.setItem('opentavern_onboarding_completed_v1', '1');
    localStorage.setItem('opentavern_announce_dismissed_v1', '1');
});

// Inject a no-callback fault at the real IndexedDB transaction boundary. The production
// transaction deadline must fire, while reads, StorageService, persist, send and summary stay real.
async function injectStorageDeadlineFailure() {
    await page.evaluate(() => {
        if (window.__storageTimeoutHooks) throw new Error('Storage deadline fault already installed.');
        const originalTransaction = IDBDatabase.prototype.transaction;
        const originalTryWriteLocalSnapshot = StorageService._tryWriteLocalSnapshot;
        const originalOPFSMirrorAvailable = StorageService._opfsMirrorAvailable;
        IDBDatabase.prototype.transaction = function(storeName, mode) {
            if (mode !== 'readwrite') return originalTransaction.apply(this, arguments);
            return {
                error: null,
                oncomplete: null,
                onerror: null,
                onabort: null,
                abort() {},
                objectStore() {
                    return {
                        put() { return {}; },
                        delete() { return {}; },
                        get() { return {}; },
                    };
                },
            };
        };
        // Only the emergency canonical writer fails; disable the optional OPFS mirror so the
        // synthetic all-canonical failure cannot schedule a recovery candidate.
        StorageService._tryWriteLocalSnapshot = () => false;
        StorageService._opfsMirrorAvailable = false;
        window.__storageTimeoutHooks = {
            restore() {
                IDBDatabase.prototype.transaction = originalTransaction;
                StorageService._tryWriteLocalSnapshot = originalTryWriteLocalSnapshot;
                StorageService._opfsMirrorAvailable = originalOPFSMirrorAvailable;
                delete window.__storageTimeoutHooks;
            },
        };
    });
}

async function restoreStorageDeadlineFailure() {
    await page.evaluate(() => {
        if (window.__storageTimeoutHooks) window.__storageTimeoutHooks.restore();
    });
}

async function waitForAppDialogIncludes(text) {
    await page.waitForSelector('#appDialogModal:not(.hidden)', { timeout: 25000 });
    const message = await page.locator('#appDialogMessage').innerText();
    assert.ok(message.includes(text), `App dialog should report "${text}", received: ${message}`);
    await page.locator('#appDialogOkBtn').click();
    return message;
}

async function readCanonicalLocalSnapshot() {
    return page.evaluate(() => localStorage.getItem('opentavern-data-v1'));
}

try {
    await page.goto(url);
    await page.waitForFunction(() => typeof state !== 'undefined' && state.settings && typeof getActiveConv === 'function' && getActiveConv() && document.body.classList.contains('theme-new-light'));
    await page.evaluate((endpoint) => {
        Object.assign(state.settings, {
            lang: 'zh-CN',
            apiEndpoint: endpoint,
            apiKey: 'mock-local-key',
            model: 'mock',
            streamEnabled: false,
            twoStageEnabled: false,
            summaryEnabled: false,
            summarizeUseMainAPI: true,
            summaryThreshold: 99,
            showReplyAvatar: true,
            showMsgTokenUsage: true,
        });
        const conv = {
            id: 'storage-timeout-smoke',
            title: '存储超时验收',
            character: { name: '测试角色', description: '测试角色' },
            messages: [],
            summaries: [],
            created: Date.now(),
            updated: Date.now(),
        };
        state.conversations = { [conv.id]: conv };
        state.conversationOrder = [conv.id];
        state.activeConvId = conv.id;
        normalizeConversation(conv);
        syncComposerConversation();
        applyUiTheme('new-light');
        applyTranslations();
        requestFullRender();
        switchView('chat');
    }, new URL('/__mock_model', url).href);
    await page.waitForSelector('#messageInput');

    // Normal save and reload.
    await page.locator('#messageInput').fill('正常保存消息');
    await page.locator('#sendBtn').click();
    await page.waitForFunction(() => getActiveConv().messages.some((message) => message.role === 'user' && message.content === '正常保存消息')
        && getActiveConv().messages.some((message) => message.role === 'assistant')
        && !state.isGenerating);
    assert.ok(requests.length >= 1, 'Normal save/reload setup must reach the mocked model.');
    await page.reload();
    await page.waitForFunction(() => typeof getActiveConv === 'function' && getActiveConv()?.id === 'storage-timeout-smoke'
        && getActiveConv().messages.some((message) => message.content === '正常保存消息'));
    await page.evaluate(() => {
        Object.assign(state.settings, { apiEndpoint: new URL('/__mock_model', location.href).href, apiKey: 'mock-local-key', model: 'mock', streamEnabled: false, summaryEnabled: false, summarizeUseMainAPI: true });
        switchView('chat');
        updateInputState();
    });
    await page.waitForSelector('#messageInput');
    await page.evaluate(() => persistState(true, { throwOnError: true }));

    // Hung storage rejected by the bounded layer: send must retain input, commit no bubble and issue no request.
    const requestCountBeforeFailure = requests.length;
    const canonicalBeforeSendFailure = await readCanonicalLocalSnapshot();
    await page.waitForTimeout(200);
    await injectStorageDeadlineFailure();
    await page.locator('#messageInput').fill('故障发送消息');
    await page.locator('#sendBtn').click();
    await waitForAppDialogIncludes('IndexedDB save timed out');
    assert.equal(await page.locator('#messageInput').inputValue(), '故障发送消息', 'Send failure must retain the unsent text.');
    assert.equal(await page.evaluate(() => getActiveConv().messages.some((message) => message.content === '故障发送消息')), false, 'Send failure must not commit a user bubble.');
    assert.equal(requests.length, requestCountBeforeFailure, 'Send failure must not issue a model request.');
    assert.equal(await page.evaluate(() => state.isGenerating), false);
    assert.equal(await page.evaluate(() => window.__composerBusy), false, 'Send failure must release composerSendInProgress.');
    assert.equal(await readCanonicalLocalSnapshot(), canonicalBeforeSendFailure, 'Synthetic emergency-writer failure must not alter stored user records.');

    await restoreStorageDeadlineFailure();
    await page.locator('#sendBtn').click();
    await page.waitForFunction(() => getActiveConv().messages.some((message) => message.content === '故障发送消息')
        && getActiveConv().messages.some((message) => message.role === 'assistant')
        && !state.isGenerating);
    assert.equal(await page.locator('#messageInput').inputValue(), '', 'Healthy retry must clear the committed composer text.');
    assert.equal(requests.length, requestCountBeforeFailure + 1, 'Healthy retry must issue exactly one model request.');

    // Prepare history and a previous valid summary, then fail only the summary persistence.
    await page.evaluate(() => {
        const conv = getActiveConv();
        conv.messages.push(
            { id: 'extra-user', role: 'user', content: '补充问题' },
            { id: 'extra-assistant', role: 'assistant', content: '补充回答' }
        );
        normalizeConversation(conv);
        const previous = {
            id: 'previous-summary',
            text: '已有摘要',
            summaryVersion: 2,
            sourceMessages: captureSummarySources(conv.messages.slice(0, 2)),
            coveredStart: 0,
            coveredEnd: 1,
            created: Date.now(),
        };
        conv.summaries = [previous];
        requestFullRender();
    });
    await page.evaluate(() => persistState(true, { throwOnError: true }));
    await page.evaluate(() => openSummaryManager());
    await page.waitForSelector('#summaryManagerModal:not(.hidden)');
    const summaryCountBeforeFailure = await page.evaluate(() => getActiveConv().summaries.length);
    const messageCountBeforeFailure = await page.evaluate(() => getActiveConv().messages.length);
    const requestCountBeforeSummary = requests.length;
    const canonicalBeforeSummaryFailure = await readCanonicalLocalSnapshot();
    await page.waitForTimeout(200);
    await injectStorageDeadlineFailure();
    await page.locator('#summaryGenerateBtn').click();
    await waitForAppDialogIncludes('Summary error');
    assert.equal(await page.evaluate(() => getActiveConv().summaries.length), summaryCountBeforeFailure, 'Summary persistence failure must preserve previous summaries.');
    assert.equal(await page.evaluate(() => getActiveConv().messages.length), messageCountBeforeFailure, 'Summary persistence failure must preserve source messages.');
    assert.equal(await page.evaluate(() => document.getElementById('summaryGenerateBtn').disabled), false, 'Summary failure must release the generate button.');
    assert.equal(await page.evaluate(() => document.getElementById('summaryManagerStatus').textContent), '');
    assert.ok(requests.length > requestCountBeforeSummary, 'The summary model request must have reached the mocked boundary before its save failed.');
    assert.equal(await readCanonicalLocalSnapshot(), canonicalBeforeSummaryFailure, 'Synthetic emergency-writer failure must not alter stored user records.');

    await restoreStorageDeadlineFailure();
    await page.locator('#summaryGenerateBtn').click();
    await page.waitForFunction((count) => getActiveConv().summaries.length === count + 1
        && getActiveConv().summaries.some((summary) => getSummaryValidity(summary, getActiveConv()) === 'valid'), summaryCountBeforeFailure);
    assert.equal(await page.evaluate(() => document.getElementById('summaryGenerateBtn').disabled), false);
    await page.locator('#summaryManagerCloseBtn').click();

    // Visual coverage: mobile/desktop, light/dark/system.
    for (const width of [1280, 390]) {
        await page.setViewportSize({ width, height: 900 });
        for (const theme of ['new-light', 'new-dark', 'system']) {
            await page.emulateMedia({ colorScheme: theme === 'new-dark' || theme === 'system' ? 'dark' : 'light' });
            await page.evaluate((value) => { applyUiTheme(value); applyTranslations(); renderMessagesOnly(); }, theme);
            await page.waitForTimeout(60);
            await page.screenshot({ path: path.join(output, `chat-${width}-${theme}.png`), animations: 'disabled' });
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Storage recovery UI must not cause horizontal overflow.');
            await page.evaluate(() => openSummaryManager());
            await page.waitForSelector('#summaryManagerModal:not(.hidden)');
            await page.screenshot({ path: path.join(output, `summary-${width}-${theme}.png`), animations: 'disabled' });
            await page.locator('#summaryManagerCloseBtn').click();
        }
    }
    await page.emulateMedia({ colorScheme: 'light' });
    assert.equal(errors.length, 0, errors.join('\n'));
    console.log(JSON.stringify({ passed: true, screenshots: output, ...(await captureBrowserEvidence(page, output)), actualRequests: requests.length }));
    console.log(`Browser smoke passed: normal save/reload, bounded send failure/recovery, bounded summary failure/recovery, 390/1280 px light/dark/system. Screenshots: ${output}`);
} catch (error) {
    console.error('Browser diagnostic:', errors, dialogs, requests, await page.evaluate(() => ({
        stateAvailable: typeof state,
        active: typeof getActiveConv === 'function' ? getActiveConv()?.id : null,
        messages: typeof getActiveConv === 'function' ? getActiveConv()?.messages?.length : null,
        classes: document.body.className,
        alert: document.getElementById('appDialogMessage')?.textContent,
    })).catch(() => null));
    throw error;
} finally {
    await browser.close();
}
