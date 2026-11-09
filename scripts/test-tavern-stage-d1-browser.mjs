import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const modulePath = process.env.OPENTAVERN_PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = await import(path.isAbsolute(modulePath) ? pathToFileURL(modulePath).href : modulePath);
const url = process.env.OPENTAVERN_TEST_URL || 'http://127.0.0.1:8765/.sites-public/opentavern.html';
const requestedOutput = process.env.OPENTAVERN_TEST_OUTPUT || process.env.OPENTAVERN_OUTPUT;
const output = requestedOutput ? path.resolve(requestedOutput) : await mkdtemp(path.join(os.tmpdir(), 'opentavern-stage-d1-'));
await mkdir(output, { recursive: true });
const reportPath = path.join(output, 'report.json');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 960 }, acceptDownloads: true });
const page = await context.newPage();
const errors = [], requests = [], dialogs = [], screenshots = [], steps = [];
const evidence = { url, output, report: reportPath, startedAt: new Date().toISOString(), screenshots, pageErrors: errors, dialogs, steps };
page.on('pageerror', error => errors.push(error.message));
page.on('dialog', dialog => { dialogs.push(dialog.message()); dialog.accept(); });
async function writeReport(passed, extra) {
    await writeFile(reportPath, JSON.stringify(Object.assign({}, evidence, { passed, finishedAt: new Date().toISOString(), requestCount: requests.length }, extra), null, 2));
}
async function capture(name) {
    const file = path.join(output, name + '.png');
    await page.screenshot({ path: file, animations: 'disabled' });
    screenshots.push(path.basename(file));
}
async function waitIdle(timeout = 30000) {
    await page.waitForFunction(() => !state.isGenerating && !window.composerBusy && !(getActiveConv() && getActiveConv()._messageCommitInProgress), undefined, { timeout });
}
async function openExtensions() {
    await page.locator('#topSettingsBtn').click();
    await page.locator('#settingsTabExtensions').click();
    await page.locator('#modelToolsSettingsStatus').waitFor();
}
async function setGrant(enabled) {
    await openExtensions();
    const checkbox = page.locator('#modelToolsConversationEnabled');
    if ((await checkbox.isChecked()) !== enabled) await checkbox.click({ force: true });
    await page.locator('#settingsDoneBtn').click();
}
function mockToolCall(body) {
    const lastUser = body.messages.filter(message => message.role === 'user').slice(-1)[0];
    const lastUserText = lastUser && (typeof lastUser.content === 'string' ? lastUser.content : (Array.isArray(lastUser.content) ? lastUser.content.filter(block => block && block.type === 'text').map(block => block.text || '').join('') : ''));
    const query = String(lastUserText || '保留原文').replace(/^.*?搜索[:：]?/s, '').trim() || '保留原文';
    const anthropic = body.system !== undefined || (Array.isArray(body.tools) && body.tools[0] && body.tools[0].input_schema) || (body.messages && Array.isArray(body.messages[0] && body.messages[0].content));
    if (anthropic) {
        return {
            type: 'message',
            content: [
                { type: 'thinking', thinking: 'synthetic-browser-thinking', signature: 'synthetic-browser-signature' },
                { type: 'text', text: 'Searching.' },
                { type: 'tool_use', id: 'toolu_browser_1', name: 'search_conversation', input: { query: query.slice(0, 40), maxResults: 2 } }
            ],
            stop_reason: 'tool_use'
        };
    }
    return {
        choices: [{
            message: { content: null, tool_calls: [{ id: 'call_browser_1', type: 'function', function: { name: 'search_conversation', arguments: JSON.stringify({ query: query.slice(0, 40), maxResults: 2 }) } }], reasoning_content: 'synthetic-browser-reasoning' },
            finish_reason: 'tool_calls'
        }]
    };
}
function mockFinal(body) {
    const anthropic = body.system !== undefined || (Array.isArray(body.tools) && body.tools[0] && body.tools[0].input_schema) || (body.messages && Array.isArray(body.messages[0] && body.messages[0].content));
    if (anthropic) {
        return { type: 'message', content: [{ type: 'thinking', thinking: 'synthetic-final-thinking', signature: 'synthetic-final-signature' }, { type: 'text', text: '最终正文（含工具箱结果）' }], stop_reason: 'end_turn' };
    }
    return { choices: [{ message: { content: '最终正文（含工具箱结果）', reasoning_content: 'synthetic-final-reasoning' }, finish_reason: 'stop' }], usage: { prompt_tokens: 20, completion_tokens: 8 } };
}

await context.route('**/*', async route => {
    const target = new URL(route.request().url());
    if (target.pathname.endsWith('/assets/js/app.js')) {
        const response = await route.fetch(), bundle = await response.text(), end = bundle.lastIndexOf('})();');
        const probe = `Object.assign(window, { state, appStore, getActiveConv, normalizeConversation, persistState, applyUiTheme, requestFullRender, switchView, updateInputState, loadConversation, newConversation, openSettings, activateSettingsTab, sendMessage, syncComposerConversation,
            getMessageRevision, getResponseVersions, prepareResponseVersions, flushStreamDraftWrites, streamDraftStorage, recoverStreamDraft, buildAllConversationsExportData, getCloudSyncPortableSettings,
            getModelToolDefinition, isModelToolAuthorizedForConversation, setModelToolConversationGrant, hasModelToolTrace, normalizeModelToolTrace,
            renderModelToolTrace, renderMessagesOnly, StorageService });
            Object.defineProperty(window,'composerBusy',{get:()=>composerSendInProgress});
`;
        return route.fulfill({ response, body: bundle.slice(0, end) + probe + bundle.slice(end) });
    }
    if (target.pathname.startsWith('/__mock_model')) {
        const body = route.request().postDataJSON();
        requests.push({ url: target.pathname, body });
        const lastMessage = (body.messages || []).at(-1);
        const hasToolResult = !!(lastMessage && (lastMessage.role === 'tool' || (Array.isArray(lastMessage.content) && lastMessage.content.some(block => block && block.type === 'tool_result'))));
        const hasTools = Array.isArray(body.tools) && body.tools.length;
        return route.fulfill({ json: hasToolResult ? mockFinal(body) : (hasTools ? mockToolCall(body) : mockFinal(body)) });
    }
    if (target.origin !== new URL(url).origin) return route.abort();
    return route.continue();
});
await page.addInitScript(() => {
    localStorage.setItem('opentavern_onboarding_completed_v1', '1');
    localStorage.setItem('opentavern_announce_dismissed_v1', '1');
});

const endpoint = new URL('/__mock_model/v1/chat/completions', url).href;
try {
    await page.goto(url);
    await page.waitForFunction(() => typeof persistState === 'function' && getActiveConv());
    await page.evaluate(async endpoint => {
        Object.assign(state.settings, {
            apiEndpoint: endpoint, apiKey: 'mock', saveApiKey: true, model: 'mock-model', summaryEnabled: false,
            streamEnabled: false, twoStageEnabled: false, restoreLastChat: true, uiTheme: 'new-light',
            modelToolGrants: {}, automationRules: [], scenePackages: [], contentModules: [], contentModuleBindings: []
        });
        const conv = getActiveConv();
        conv.title = 'D1 browser';
        conv.messages = [{ id: 'saved-u1', role: 'user', content: '已保存 保留原文 {{user}} <script>globalThis.pwned=true</script>' }];
        normalizeConversation(conv);
        await persistState(true);
        requestFullRender(); switchView('chat'); syncComposerConversation(); updateInputState();
    }, endpoint);
    await waitIdle();

    await setGrant(true);
    await page.evaluate(() => renderMessagesOnly());
    steps.push('granted current conversation through the Extensions settings UI');

    const beforeRequests = requests.length;
    await page.locator('#messageInput').fill('搜索：保留原文');
    await page.locator('#sendBtn').click();
    await waitIdle();
    assert.equal(requests.length, beforeRequests + 2, 'One tool round and one final model round');
    assert.equal(requests[beforeRequests].body.tools.length, 1);
    assert.equal(requests[beforeRequests].body.tool_choice, undefined);
    const toolMessage = requests[beforeRequests + 1].body.messages.find(message => message.role === 'tool');
    assert.equal(toolMessage.tool_call_id, 'call_browser_1');
    assert.ok(toolMessage.content.includes('{{user}}'));
    assert.ok(toolMessage.content.includes('<script>globalThis.pwned=true</script>'));
    const saved = await page.evaluate(() => {
        const conv = getActiveConv();
        const message = conv.messages.slice().reverse().find(item => item.role === 'assistant');
        return { content: message.content, trace: message.toolTrace, id: message.id, revision: getMessageRevision(message), versions: prepareResponseVersions(conv, message).versions.length, versionTrace: prepareResponseVersions(conv, message).current.message.toolTrace, pwned: globalThis.pwned };
    });
    assert.equal(saved.content, '最终正文（含工具箱结果）');
    assert.equal(saved.trace.status, 'completed');
    assert.equal(saved.trace.rounds[0].calls[0].id, 'call_browser_1');
    assert.ok(saved.versions >= 1);
    assert.deepEqual(saved.versionTrace, saved.trace, 'The actual effective response-version snapshot retains its trace.');
    assert.equal(saved.pwned, undefined);
    assert.equal(await page.locator('.model-tool-trace').count() >= 1, true);
    steps.push('OpenAI JSON tool round, exact tool_call_id result and one durable final reply');

    await page.reload();
    await page.waitForFunction(() => typeof persistState === 'function' && getActiveConv());
    await waitIdle();
    const afterReload = await page.evaluate(() => {
        const message = getActiveConv().messages.slice().reverse().find(item => item.role === 'assistant');
        return { trace: message && message.toolTrace, content: message && message.content, revisions: getResponseVersions(message || {}).length };
    });
    assert.equal(afterReload.trace.status, 'completed');
    assert.equal(afterReload.content, '最终正文（含工具箱结果）');
    assert.equal(requests.length, beforeRequests + 2, 'Refresh must not replay the tool or model request');
    steps.push('refresh preserved the trace without re-executing tools');

    const portable = await page.evaluate(() => {
        const data = buildAllConversationsExportData(Object.values(state.conversations), new Date().toISOString());
        return { hasTrace: JSON.stringify(data.conversations).includes('"toolTrace"'), grants: getCloudSyncPortableSettings(state.settings).modelToolGrants };
    });
    assert.equal(portable.hasTrace, true);
    assert.equal(portable.grants, undefined);
    steps.push('export carries trace but not local grants');

    await setGrant(false);
    const beforeOff = requests.length;
    await page.locator('#messageInput').fill('普通聊天');
    await page.locator('#sendBtn').click();
    await waitIdle();
    assert.equal(requests[beforeOff].body.tools, undefined);
    const offMessage = await page.evaluate(() => {
        const message = getActiveConv().messages.slice().reverse().find(item => item.role === 'assistant');
        return { trace: message && message.toolTrace, content: message && message.content };
    });
    assert.equal(offMessage.trace, undefined);
    steps.push('off path sends no tools and writes no trace');

    await page.evaluate(async endpoint => {
        Object.assign(state.settings, { apiProtocol: 'anthropic', apiEndpoint: endpoint, streamEnabled: false });
        await persistState(true);
        updateInputState();
    }, endpoint);
    await setGrant(true);
    const beforeAnthropic = requests.length;
    await page.locator('#messageInput').fill('搜索：保留原文');
    await page.locator('#sendBtn').click();
    await waitIdle();
    assert.equal(requests.length, beforeAnthropic + 2);
    assert.equal(requests[beforeAnthropic].body.tools[0].input_schema.required[0], 'query');
    const anthropicAssistant = requests[beforeAnthropic + 1].body.messages.find(message => message.role === 'assistant' && Array.isArray(message.content) && message.content.some(block => block.type === 'tool_use'));
    assert.equal(anthropicAssistant.content[0].type, 'thinking');
    assert.equal(anthropicAssistant.content[0].signature, 'synthetic-browser-signature');
    const anthropicResult = requests[beforeAnthropic + 1].body.messages.find(message => message.role === 'user' && Array.isArray(message.content) && message.content.some(block => block.type === 'tool_result'));
    assert.equal(anthropicResult.content.find(block => block.type === 'tool_result').tool_use_id, 'toolu_browser_1');
    const anthropicSaved = await page.evaluate(() => {
        const message = getActiveConv().messages.slice().reverse().find(item => item.role === 'assistant');
        return { protocol: message.toolTrace.protocol, id: message.toolTrace.rounds[0].calls[0].id };
    });
    assert.equal(anthropicSaved.protocol, 'anthropic');
    assert.equal(anthropicSaved.id, 'toolu_browser_1');
    steps.push('Anthropic native thinking/tool_use/tool_result wire round');

    await setGrant(true);
    const beforeFail = requests.length;
    await page.evaluate(() => {
        const original = StorageService.saveAll.bind(StorageService);
        const oldIds = new Set(getActiveConv().messages.map(message => message.id));
        window.__failedToolAssistantIds = [];
        StorageService.saveAll = async function(snapshot) {
            const pending = Object.values(snapshot.conversations || {}).flatMap(conv => conv.messages || []).find(message => !oldIds.has(message.id) && message.role === 'assistant' && message.toolTrace);
            if (pending) { StorageService.saveAll = original; window.__failedToolAssistantIds.push(pending.id); throw new Error('synthetic quota'); }
            return original(snapshot);
        };
    });
    await page.locator('#messageInput').fill('搜索：保留原文');
    await page.locator('#sendBtn').click();
    await waitIdle();
    assert.equal(requests.length >= beforeFail + 2, true);
    const afterFail = await page.evaluate(() => ({ generating: state.isGenerating, last: getActiveConv().messages.slice(-1)[0] }));
    assert.equal(afterFail.generating, false);
    const recovery = await page.evaluate(async () => { await flushStreamDraftWrites(); const records = await streamDraftStorage('getAll'); return { records, failed: window.__failedToolAssistantIds, liveIds: getActiveConv().messages.map(message => message.id) }; });
    assert.equal(recovery.failed.length, 1, 'fault must target a newly generated assistant candidate');
    assert.ok(!recovery.liveIds.includes(recovery.failed[0]), 'failed final reply cannot appear as saved');
    const record = recovery.records.find(record => record.toolTrace); assert.ok(record, 'actual local draft retains the trace after final save failure');
    if (await page.locator('#appDialogModal').isVisible()) await page.locator('#appDialogOkBtn').click();
    const beforeRecoveryRequests = requests.length;
    await page.evaluate(async record => { await recoverStreamDraft(record); }, record);
    assert.equal(requests.length, beforeRecoveryRequests, 'explicit draft recovery cannot execute another tool or model request');
    assert.equal(await page.evaluate(id => getActiveConv().messages.some(message => message.recoveryDraftId === id && message.interrupted && message.toolTrace), record.id), true);
    steps.push('actual assistant saveAll quota failure preserves a recoverable trace; explicit recovery saves without repeating tools');

    const viewport = page.viewportSize();
    for (const width of [390, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        for (const theme of ['new-light', 'new-dark', 'system']) {
            await page.evaluate(value => applyUiTheme(value, { cache: false }), theme);
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `overflow at ${width}/${theme}`);
            await capture(`d1-chat-${width}-${theme}`);
        }
    }
    await page.setViewportSize(viewport);
    await page.evaluate(() => applyUiTheme('new-light', { cache: false }));
    await openExtensions();
    await capture('d1-settings-extensions');
    await page.locator('#settingsDoneBtn').click();
    steps.push('390/1280px light/dark/system screenshots captured');

    assert.deepEqual(errors, []);
    await writeReport(true, { steps });
    console.log('Stage D1 browser passed:', steps.join(' | '));
} catch (error) {
    await writeReport(false, { steps, error: error && error.stack || String(error) });
    throw error;
} finally {
    await context.close();
    await browser.close();
}
