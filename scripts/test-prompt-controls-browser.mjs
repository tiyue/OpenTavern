import { captureBrowserEvidence } from './check-release.mjs';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const modulePath = process.env.OPENTAVERN_PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = await import(path.isAbsolute(modulePath) ? pathToFileURL(modulePath).href : modulePath);
const url = process.env.OPENTAVERN_TEST_URL || 'http://127.0.0.1:8765/index.html';
const output = process.env.OPENTAVERN_TEST_OUTPUT || await mkdtemp(path.join(os.tmpdir(), 'opentavern-m2-'));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext();
const page = await context.newPage();
const errors = [], requests = [];
let requestStopGate = null;
page.on('pageerror', error => errors.push(error.message));
page.on('dialog', dialog => dialog.dismiss());
await context.route('**/*', async route => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.pathname.endsWith('/assets/js/app.js')) {
        const response = await route.fetch(), bundle = await response.text(), end = bundle.lastIndexOf('})();');
        const probe = 'Object.assign(window, { state, getActiveConv, normalizeConversation, ensureConversationMvu, applyUiTheme, requestFullRender, switchView, openSettings, openPresetLibrary, openRegexManager, buildMessagesForAPIAsync, streamChat, stopGeneration, openConversationPromptControls, recentRequestDiagnostics, showFullPrompt });\n' +
            '(function(){ var realFormatMessageAsync = formatMessageAsync; var waits = new Map(); window.__armPromptFormatPause = function(marker) { var startedResolve, releaseResolve; var started = new Promise(function(resolve) { startedResolve = resolve; }); var released = new Promise(function(resolve) { releaseResolve = resolve; }); waits.set(marker, { startedResolve: startedResolve, released: released }); return { started: started, release: function() { releaseResolve(); } }; }; formatMessageAsync = async function(text, formatContext) { var marker = Array.from(waits.keys()).find(function(value) { return String(text).includes(value); }); if (marker) { var wait = waits.get(marker); waits.delete(marker); wait.startedResolve(); await wait.released; } return realFormatMessageAsync(text, formatContext); }; })();\n';
        return route.fulfill({ response, body: bundle.slice(0, end) + probe + bundle.slice(end) });
    }
    if (requestUrl.pathname.startsWith('/__mock_model')) {
        const body = route.request().postDataJSON();
        requests.push(body);
        if (requestStopGate && body.messages.some(message => String(message.content).includes('UNIQUE_REQUEST_STOP_INPUT'))) {
            requestStopGate.startedResolve();
            await requestStopGate.release;
        }
        return route.fulfill({ json: { choices: [{ message: { content: '测试实际回复' } }] } });
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
    await page.waitForFunction(() => typeof openSettings === 'function' && getActiveConv());
    await page.evaluate(endpoint => {
        Object.assign(state.settings, { apiEndpoint: endpoint, apiKey: 'mock-key', model: 'mock', summaryEnabled: false, streamEnabled: false });
        const conv = getActiveConv(); conv.character = { name: '测试角色', extensions: {} }; conv.title = 'M2 验收';
        conv.messages = [
            { role: 'assistant', content: '<initvar>{"stat_data":{"name":"earlier"}}</initvar>初始化' },
            { role: 'assistant', content: 'AAA' },
            { role: 'assistant', content: '<UpdateVariable><JSONPatch>[{"op":"replace","path":"/stat_data/name","value":"latest"}]</JSONPatch></UpdateVariable>后续更新' }
        ]; normalizeConversation(conv); ensureConversationMvu(conv);
        state.settings.systemPrompt = 'latest=<%= stat_data.name %>';
        state.settings.globalRegexEnabled = true;
        state.settings.globalRegexScripts = [{ findRegex: 'AAA', replaceString: '<%= stat_data.name %>', placement: [2], promptOnly: true, flags: 'g' }];
        requestFullRender(); switchView('chat');
    }, new URL('/__mock_model', url).href);
    await page.evaluate(() => openSettings());
    await page.locator('#settingsTabPrompts').click();
    await page.locator('#managePresetLibrary').click();
    await page.locator('[data-library-action="new"]').click();
    await page.locator('#libraryPresetName').fill('长预设名称用于移动端截断与表单验收');
    await page.locator('[data-library-action="rename"]').click();
    await page.locator('[data-library-action="prompt"]').click();
    await page.locator('#presetPromptName').fill('测试条目');
    await page.locator('#presetPromptContent').fill('实际请求中出现的预设正文');
    await page.locator('#presetPromptEditor button[type="submit"]').click();
    await page.waitForSelector('#presetPromptEditor', { state: 'detached' });
    assert.equal(await page.evaluate(() => state.settings.sillyTavernPreset.prompts[0].content), '实际请求中出现的预设正文');
    for (const width of [360, 390, 768, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        for (const theme of ['new-light', 'new-dark']) {
            await page.evaluate(value => applyUiTheme(value), theme);
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
            assert.equal(await page.locator('#presetLibraryDialog').evaluate(element => element.scrollWidth <= element.clientWidth), true);
            await page.screenshot({ path: path.join(output, `library-${width}-${theme}.png`), animations: 'disabled' });
        }
    }
    await page.locator('#presetLibraryDialog [data-dialog-cancel]').first().click();
    await page.locator('#settingsTabExtensions').click();
    await page.locator('#globalRegexSettings').click();
    await page.locator('[data-regex-action="new"]').click();
    await page.locator('#regexName').fill('捕获替换');
    await page.locator('#regexFind').fill('(hello)');
    await page.locator('#regexReplace').fill('$1 已格式化');
    await page.locator('#regexFlags').fill('gz');
    await page.locator('#regexScriptEditor button[type="submit"]').click();
    assert.ok((await page.locator('#regexScriptEditor .feature-error').innerText()).includes('标志'));
    await page.locator('#regexFlags').fill('g');
    await page.locator('#regexScriptEditor button[type="submit"]').click();
    await page.waitForSelector('#regexScriptEditor', { state: 'detached' });
    await page.locator('#regexLayerEnabled').check();
    await page.screenshot({ path: path.join(output, 'regex-1280-new-dark.png'), animations: 'disabled' });
    await page.locator('#regexManagerDialog [data-dialog-cancel]').first().click();
    await page.locator('#settingsCloseBtn').click();
    await page.evaluate(() => openConversationPromptControls());
    await page.locator('#conversationWorldBookMode').selectOption('constant');
    await page.locator('#conversationPromptDialog button[type="submit"]').click();
    assert.equal(await page.evaluate(() => getActiveConv().worldBookMode), 'constant');
    const before = await page.evaluate(() => JSON.stringify(getActiveConv()));
    await page.evaluate(() => showFullPrompt());
    await page.waitForFunction(() => document.getElementById('promptViewerContent').textContent.includes('实际请求中出现的预设正文'));
    assert.equal(await page.evaluate(() => JSON.stringify(getActiveConv())), before);
    await page.locator('#promptViewerCloseBtn').click();
    await page.locator('#messageInput').fill('请求验收');
    await page.locator('#sendBtn').click();
    await page.waitForFunction(() => !state.isGenerating && recentRequestDiagnostics.length > 0);
    const actual = await page.evaluate(() => recentRequestDiagnostics.at(-1));
    assert.deepEqual(actual.payload, requests.at(-1));
    const payloadMessages = actual.payload.messages;
    assert.ok(payloadMessages.some(message => message.content === 'earlier'));
    assert.ok(payloadMessages.every(message => Object.keys(message).sort().join(',') === 'content,role'));
    assert.ok(!JSON.stringify(payloadMessages).includes('__promptSource'));
    assert.ok(actual.payload.messages.some(message => message.content.includes('实际请求中出现的预设正文')));
    assert.ok(!JSON.stringify(actual).includes('mock-key'));
    await page.evaluate(() => showFullPrompt());
    await page.locator('#promptViewSource').selectOption('actual');
    await page.waitForFunction(() => document.getElementById('promptViewerContent').textContent.includes('beforeMessages'));
    await page.screenshot({ path: path.join(output, 'diagnostic-1280-new-dark.png'), animations: 'disabled' });
    const beforeCancelRequests = requests.length;
    const cancelResult = await page.evaluate(async () => {
        const conv = getActiveConv();
        conv.messages = [{ role: 'user', content: 'UNIQUE_CANCEL_INPUT' }];
        conv.stLocalVars = { auditStopped: 'initial' };
        normalizeConversation(conv);
        state.settings.systemPrompt = '{{setvar::auditStopped::from_cancelled_build}}';
        state.settings.streamEnabled = false;
        const events = { completed: 0, errors: 0 };
        const pause = __armPromptFormatPause('UNIQUE_CANCEL_INPUT');
        const build = streamChat(() => {}, () => { events.completed++; }, () => { events.errors++; }, conv);
        await pause.started;
        stopGeneration();
        conv.stLocalVars.auditStopped = 'user_change_after_stop';
        pause.release();
        await build;
        return { value: conv.stLocalVars.auditStopped, events, generating: state.isGenerating, pending: state._promptBuildPendingSequence };
    });
    assert.equal(requests.length, beforeCancelRequests, 'A stopped browser prompt build must not call the model.');
    assert.equal(cancelResult.value, 'user_change_after_stop');
    assert.equal(cancelResult.events.completed, 1);
    assert.equal(cancelResult.events.errors, 0);
    assert.equal(cancelResult.generating, false);
    assert.equal(cancelResult.pending, null);

    const beforeRaceRequests = requests.length;
    const raceResult = await page.evaluate(async () => {
        const conv = getActiveConv();
        conv.messages = [{ role: 'user', content: 'UNIQUE_A_INPUT' }];
        conv.stLocalVars = { race: 'initial' };
        normalizeConversation(conv);
        state.settings.systemPrompt = '{{setvar::race::from_A}}';
        const pauseA = __armPromptFormatPause('UNIQUE_A_INPUT');
        const eventsA = { completed: 0, errors: 0 };
        const buildA = streamChat(() => {}, () => { eventsA.completed++; }, () => { eventsA.errors++; }, conv);
        await pauseA.started;
        stopGeneration();
        conv.messages[0].content = 'UNIQUE_B_INPUT';
        normalizeConversation(conv);
        state.settings.systemPrompt = '{{setvar::race::from_B}}';
        const pauseB = __armPromptFormatPause('UNIQUE_B_INPUT');
        const eventsB = { completed: 0, errors: 0 };
        let resolveB, rejectB;
        const terminalB = new Promise((resolve, reject) => { resolveB = resolve; rejectB = reject; });
        const buildB = streamChat(() => {}, () => { eventsB.completed++; resolveB(); }, error => { eventsB.errors++; rejectB(error); }, conv);
        await pauseB.started;
        const pendingB = state._promptBuildPendingSequence;
        pauseA.release();
        await buildA;
        const afterLateA = { race: conv.stLocalVars.race, pending: state._promptBuildPendingSequence, generating: state.isGenerating };
        pauseB.release();
        await terminalB;
        await buildB;
        return { afterLateA, pendingB, finalRace: conv.stLocalVars.race, eventsA, eventsB, pending: state._promptBuildPendingSequence, generating: state.isGenerating };
    });
    assert.equal(raceResult.afterLateA.race, 'initial');
    assert.equal(raceResult.afterLateA.pending, raceResult.pendingB);
    assert.equal(raceResult.afterLateA.generating, true);
    assert.equal(raceResult.finalRace, 'from_B');
    assert.equal(raceResult.eventsA.completed + raceResult.eventsA.errors, 0);
    assert.equal(raceResult.eventsB.completed, 1);
    assert.equal(raceResult.eventsB.errors, 0);
    assert.equal(raceResult.pending, null);
    assert.equal(raceResult.generating, false);
    assert.equal(requests.length, beforeRaceRequests + 1, 'Only the current browser build may call the model.');

    const beforeRequestStopRequests = requests.length;
    let startedResolve, releaseResolve;
    const started = new Promise(resolve => { startedResolve = resolve; });
    const release = new Promise(resolve => { releaseResolve = resolve; });
    requestStopGate = { startedResolve, started, releaseResolve, release };
    await page.evaluate(() => {
        const conv = getActiveConv();
        conv.messages = [{ role: 'user', content: 'UNIQUE_REQUEST_STOP_INPUT' }];
        normalizeConversation(conv);
        state.settings.systemPrompt = 'request stop';
        const events = { completed: 0, errors: 0 };
        let resolveTerminal, rejectTerminal;
        const terminal = new Promise((resolve, reject) => { resolveTerminal = resolve; rejectTerminal = reject; });
        const build = streamChat(() => {}, () => { events.completed++; resolveTerminal(events); }, error => { events.errors++; rejectTerminal(error); }, conv);
        window.__requestStopRun = { build, terminal, events };
    });
    await requestStopGate.started;
    await page.evaluate(() => stopGeneration());
    requestStopGate.releaseResolve();
    const requestStopEvents = await page.evaluate(() => window.__requestStopRun.terminal);
    await page.evaluate(() => window.__requestStopRun.build);
    requestStopGate = null;
    assert.equal(requestStopEvents.completed, 1);
    assert.equal(requestStopEvents.errors, 0);
    assert.equal(requests.length, beforeRequestStopRequests + 1, 'Stopping after request send must keep one actual request.');
    assert.equal(await page.evaluate(() => state.isGenerating), false);
    assert.equal(await page.evaluate(() => state._promptBuildPendingSequence), null);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ passed: true, screenshots: output, ...(await captureBrowserEvidence(page, output)), actualRequests: requests.length, cancelledPromptBuild: true, lateBuildGuard: true }));
} finally { await browser.close(); }
