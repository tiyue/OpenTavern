import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const modulePath = process.env.OPENTAVERN_PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = await import(path.isAbsolute(modulePath) ? pathToFileURL(modulePath).href : modulePath);
const url = process.env.OPENTAVERN_TEST_URL || 'http://127.0.0.1:8765/.sites-public/opentavern.html';
const requestedOutput = process.env.OPENTAVERN_TEST_OUTPUT || process.env.OPENTAVERN_OUTPUT;
const output = requestedOutput
    ? path.resolve(requestedOutput)
    : await mkdtemp(path.join(os.tmpdir(), 'opentavern-stage-a-'));
await mkdir(output, { recursive: true });
const reportPath = path.join(output, 'report.json');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 960 } });
const page = await context.newPage();
const errors = [], requests = [], dialogs = [], screenshots = [], steps = [];
const slowRequestGates = [];
const evidence = { url, output, report: reportPath, startedAt: new Date().toISOString(), screenshots, pageErrors: errors, dialogs, steps };
page.on('pageerror', error => errors.push(error.message));
page.on('dialog', dialog => { dialogs.push(dialog.message()); dialog.accept(); });
async function writeReport(passed, extra) {
    await writeFile(reportPath, JSON.stringify(Object.assign({}, evidence, { passed, finishedAt: new Date().toISOString(), requestCount: requests.length }, extra), null, 2));
}
async function capture(name, options) {
    const file = path.join(output, name + '.png');
    await page.screenshot(Object.assign({ path: file, animations: 'disabled' }, options || {}));
    screenshots.push(path.basename(file));
}
async function captureDialogViews(name) {
    const viewport = page.viewportSize();
    const theme = await page.evaluate(() => state.settings.uiTheme);
    for (const width of [390, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        for (const value of ['new-light', 'new-dark']) {
            await page.evaluate(value => applyUiTheme(value, { cache: false }), value);
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${name} overflow at ${width}/${value}`);
            await capture(`${name}-${width}-${value}`);
        }
    }
    await page.setViewportSize(viewport);
    await page.evaluate(value => applyUiTheme(value, { cache: false }), theme);
}
async function waitForSlowRequest() {
    const deadline = Date.now() + 5000;
    while (!slowRequestGates.length) {
        if (Date.now() > deadline) throw new Error('The synthetic slow model request did not start.');
        await new Promise(resolve => setTimeout(resolve, 20));
    }
}
function releaseSlowRequest() {
    const release = slowRequestGates.shift();
    if (!release) throw new Error('No synthetic slow model request is waiting to be released.');
    release();
}
async function openChatSidebar(width) {
    if (width > 767) return;
    const alreadyOpen = await page.evaluate(() => document.getElementById('sidebar').classList.contains('open'));
    if (alreadyOpen) return;
    await page.locator('#hamburgerBtn').click();
    await page.waitForFunction(() => document.getElementById('sidebar').classList.contains('open'));
}

await context.route('**/*', async route => {
    const target = new URL(route.request().url());
    if (target.pathname.endsWith('/assets/js/app.js')) {
        const response = await route.fetch(), bundle = await response.text(), end = bundle.lastIndexOf('})();');
        const probe = `Object.assign(window, { state, appStore, getActiveConv, normalizeConversation, persistState, applyUiTheme, requestFullRender, switchView, updateInputState, loadConversation, openSettings, buildAppDataSnapshot, StorageService, ensureConnectionProfiles, ensureQuickReplyGroups, ensurePresetLibrary, getActiveConnectionProfile, getConnectionProfileCredential, setConnectionProfileCredential, renderQuickReplyBar, openQuickReplyManager, openConnectionProfileManager, openGroupStrategyDialog, openConversationBranchDialog, openPresetDiffDialog, buildConversationBranchTree, getConnectionProfileById, getGroupSpeakerForMode, startGroupAutoRounds, cancelGroupAutoRounds, isGroupAutoRoundsActive, stopGeneration });\nObject.defineProperty(window, "draft", {get:()=>settingsFormDraft});\nObject.defineProperty(window, "autoState", {get:()=>groupAutoRoundState});\nObject.defineProperty(window, "currentViewName", {get:()=>currentView});\n`;
        return route.fulfill({ response, body: bundle.slice(0, end) + probe + bundle.slice(end) });
    }
    if (target.pathname.startsWith('/__mock_model')) {
        if (target.pathname.endsWith('/models')) {
            return route.fulfill({ json: { data: [{ id: 'mock-model' }, { id: 'mock-other' }] } });
        }
        requests.push(route.request().postDataJSON());
        return route.fulfill({ json: { choices: [{ message: { content: '合成模型回复' }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 4 } } });
    }
    if (target.pathname.startsWith('/__slow_model')) {
        if (target.pathname.endsWith('/models')) {
            return route.fulfill({ json: { data: [{ id: 'mock-model' }] } });
        }
        requests.push(route.request().postDataJSON());
        await new Promise(resolve => slowRequestGates.push(resolve));
        try {
            return await route.fulfill({ json: { choices: [{ message: { content: '慢速合成回复' }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 4 } } });
        } catch (error) {
            if (!/Target page, context or browser has been closed|already handled|Target closed|ERR_ABORTED/i.test(error.message)) throw error;
        }
    }
    if (target.pathname.startsWith('/__fail_model')) {
        requests.push(route.request().postDataJSON());
        return route.fulfill({ status: 500, json: { error: { message: 'synthetic provider failure' } } });
    }
    if (target.origin !== new URL(url).origin) return route.abort();
    return route.continue();
});
await page.addInitScript(() => { localStorage.setItem('opentavern_onboarding_completed_v1', '1'); localStorage.setItem('opentavern_announce_dismissed_v1', '1'); });

const endpoint = new URL('/__mock_model/v1/chat/completions', url).href;
try {
    await page.goto(url);
    await page.waitForFunction(() => typeof persistState === 'function' && getActiveConv());
    await page.evaluate(async endpoint => {
        Object.assign(state.settings, {
            apiEndpoint: endpoint, apiKey: 'mock', saveApiKey: true, model: 'mock-model', summaryEnabled: false,
            streamEnabled: false, twoStageEnabled: false, restoreLastChat: true, uiTheme: 'new-light'
        });
        ensureConnectionProfiles(state.settings);
        ensureQuickReplyGroups(state.settings);
        ensurePresetLibrary(state.settings);
        const alice = { name: 'Alice', description: 'Alice card' };
        const bob = { name: 'Bob', description: 'Bob card' };
        state.characters.alice = alice; state.characters.bob = bob;
        const rootMessages = Array.from({ length: 200 }, (_, index) => ({
            id: 'root-' + index, role: index % 2 ? 'assistant' : 'user', content: index === 10 ? '分叉消息内容' : 'root message ' + index
        }));
        const branchMessages = Array.from({ length: 200 }, (_, index) => ({
            id: 'branch-' + index, role: index % 2 ? 'assistant' : 'user', content: 'branch message ' + index
        }));
        const root = { id: 'root', title: '根会话', character: alice, messages: rootMessages, summaries: [], created: 1, updated: 1 };
        const branchB = { id: 'branchB', title: '分支 B', character: alice, branchOf: { conversationId: 'root', userMessageId: 'root-10' }, messages: [{ id: 'root-10', role: 'user', content: '分支 B 分叉' }, ...branchMessages], summaries: [], created: 2, updated: 2 };
        const branchC = { id: 'branchC', title: '分支 C', character: alice, branchOf: { conversationId: 'root', userMessageId: 'root-10' }, messages: [{ id: 'root-10', role: 'user', content: '分支 C 分叉' }, ...branchMessages], summaries: [], created: 3, updated: 3 };
        const branchD = { id: 'branchD', title: '分支 D', character: alice, branchOf: { conversationId: 'branchB', userMessageId: 'root-10' }, messages: [{ id: 'root-10', role: 'user', content: '分支 D 分叉' }], summaries: [], created: 4, updated: 4 };
        const group = { id: 'groupConv', title: '群聊测试', character: alice, group: { members: [{ character: alice, muted: false, order: 0 }, { character: bob, muted: false, order: 1 }] }, messages: [{ id: 'group-u1', role: 'user', content: '开始群聊' }], summaries: [], created: 5, updated: 5 };
        state.conversations = { root, branchB, branchC, branchD, groupConv: group };
        state.conversationOrder = ['root', 'branchB', 'branchC', 'branchD', 'groupConv'];
        state.activeConvId = 'branchB';
        Object.values(state.conversations).forEach(normalizeConversation);
        state.settings.presetLibrary = [
            { id: 'p1', name: '预设甲', prompts: [{ id: 'one', identifier: 'one', name: 'System', role: 'system', content: '第一行\n第二行', enabled: true, position: 'before_history', depth: 0 }], promptOrder: [{ identifier: 'one', order: 0 }], regexScripts: [], temperature: 0.7, squashSystemMessages: false },
            { id: 'p2', name: '预设乙', prompts: [{ id: 'one', identifier: 'one', name: 'System', role: 'system', content: '第一行\n第二行 <img src=x onerror=window.__xss=1>', enabled: false, position: 'in_chat', depth: 3 }], promptOrder: [{ identifier: 'one', order: 0 }], regexScripts: [], temperature: 0.9, squashSystemMessages: true }
        ];
        state.settings.activePresetId = 'p1'; state.settings.sillyTavernPreset = state.settings.presetLibrary[0];
        await persistState(true);
        requestFullRender(); switchView('chat'); updateInputState();
    }, endpoint);

    steps.push('03 connection profiles');
    // 03 Connection profile management, credential pairing and reliable apply.
    await page.locator('#topSettingsBtn').click();
    await page.locator('#manageConnectionProfilesBtn').click();
    await page.locator('#connectionProfileManager').waitFor();
    await page.locator('#connectionProfileManager [data-profile-new]').click();
    await page.locator('#connectionProfileEditor').waitFor();
    await page.locator('#connectionProfileName').fill('档案 A');
    await page.locator('#connectionProfileEndpoint').fill(new URL('/__mock_model/v1', url).href);
    await page.locator('#connectionProfileModel').fill('mock-model');
    await page.locator('#connectionProfileApiKey').fill('profile-a-key');
    await page.locator('#connectionProfileParam_temperature').fill('0.2');
    await page.locator('#connectionProfileParam_maxTokens').fill('1024');
    await page.locator('#connectionProfileParam_contextLength').fill('10');
    await page.locator('#connectionProfileEditor [type="submit"]').click();
    await page.locator('#connectionProfileEditor').waitFor({ state: 'detached' });
    await page.locator('#connectionProfileManager').waitFor();
    assert.ok(await page.locator('#connectionProfileManager').getByText('档案 A').first().isVisible());
    await page.locator('#connectionProfileManager [data-dialog-cancel]').last().click();
    await page.locator('#connectionProfileManager').waitFor({ state: 'detached' });
    await page.locator('#mainConnectionProfileSelect').selectOption({ label: '档案 A' });
    await page.waitForFunction(() => state.settings.model === 'mock-model' && state.settings.temperature === 0.2);
    assert.equal(await page.evaluate(() => state.settings.apiEndpoint), new URL('/__mock_model/v1', url).href);
    assert.equal(await page.evaluate(() => state.settings.apiKey), 'profile-a-key');
    await page.locator('#manageConnectionProfilesBtn').click();
    await page.locator('#connectionProfileManager [data-profile-new]').click();
    await page.locator('#connectionProfileEditor').waitFor();
    await page.locator('#connectionProfileName').fill('档案 B');
    await page.locator('#connectionProfileEndpoint').fill(new URL('/__mock_model/v1', url).href);
    await page.locator('#connectionProfileModel').fill('mock-other');
    await page.locator('#connectionProfileApiKey').fill('profile-b-key');
    await page.locator('#connectionProfileEditor [type="submit"]').click();
    await page.locator('#connectionProfileEditor').waitFor({ state: 'detached' });
    await page.locator('#connectionProfileManager').getByText('档案 B').first().waitFor();
    await page.locator('#connectionProfileManager [data-dialog-cancel]').last().click();
    await page.locator('#mainConnectionProfileSelect').selectOption({ label: '档案 B' });
    await page.waitForFunction(() => state.settings.model === 'mock-other');
    assert.equal(await page.evaluate(() => state.settings.apiKey), 'profile-b-key');
    await page.locator('#mainConnectionProfileSelect').selectOption({ label: '档案 A' });
    await page.waitForFunction(() => state.settings.model === 'mock-model');
    const durableKeys = await page.evaluate(() => localStorage.getItem('opentavern_connection_profile_credentials'));
    assert.ok(durableKeys && durableKeys.includes('profile-a-key') && durableKeys.includes('profile-b-key'));

    steps.push('03b credential write failure');
    // 03b A device-store write failure stays in the editor instead of claiming a saved credential.
    await page.locator('#manageConnectionProfilesBtn').click();
    await page.locator('#connectionProfileManager [data-profile-new]').click();
    await page.locator('#connectionProfileEditor').waitFor();
    await page.locator('#connectionProfileName').fill('写入失败档案');
    await page.locator('#connectionProfileEndpoint').fill(new URL('/__mock_model/v1', url).href);
    await page.locator('#connectionProfileModel').fill('mock-model');
    await page.locator('#connectionProfileApiKey').fill('profile-fail-key');
    await page.evaluate(() => {
        const originalSetItem = Storage.prototype.setItem;
        window.__restoreCredentialWrite = () => { Storage.prototype.setItem = originalSetItem; };
        Storage.prototype.setItem = function(key, value) {
            if (key === 'opentavern_connection_profile_credentials') throw new Error('synthetic quota');
            return originalSetItem.call(this, key, value);
        };
    });
    await page.locator('#connectionProfileEditor [type="submit"]').click();
    await page.waitForFunction(() => {
        const node = document.querySelector('#connectionProfileEditor .feature-error');
        return !!(node && node.textContent.trim());
    });
    assert.ok((await page.locator('#connectionProfileEditor .feature-error').textContent()).trim().length > 0, 'A failed credential write must be reported in the editor.');
    assert.equal(await page.evaluate(() => state.settings.connectionProfiles.some(profile => profile.name === '写入失败档案')), false, 'A failed credential write must not claim the profile was saved.');
    await page.evaluate(() => window.__restoreCredentialWrite());
    await page.locator('#connectionProfileEditor [data-dialog-cancel]').last().click();
    await page.locator('#connectionProfileManager [data-dialog-cancel]').last().click();
    await page.locator('#settingsDoneBtn').click();

    steps.push('04 quick replies');
    // 04 Quick replies: real group/button management, insertion, direct send and double-click guard.
    await page.locator('#quickReplyEntry').click();
    await page.locator('#quickReplyManager').waitFor();
    await page.locator('#quickReplyManager [data-quick-group-new]').click();
    await page.locator('#quickReplyGroupEditor').waitFor();
    await page.locator('#quickReplyGroupName').fill('测试组');
    await page.locator('#quickReplyGroupEditor [type="submit"]').click();
    await page.locator('#quickReplyGroupEditor').waitFor({ state: 'detached' });
    await page.locator('#quickReplyManager').getByText('测试组').first().waitFor();
    await page.locator('#quickReplyManager [data-quick-group-edit]').click();
    await page.locator('#quickReplyGroupEditor [data-quick-button-new]').click();
    await page.locator('#quickReplyButtonEditor').waitFor();
    await page.locator('#quickReplyButtonName').fill('问候');
    await page.locator('#quickReplyButtonContent').fill('你好 {{char}}，我是 {{user}}');
    await page.locator('#quickReplyButtonEditor [type="submit"]').click();
    await page.locator('#quickReplyButtonEditor').waitFor({ state: 'detached' });
    await page.locator('#quickReplyGroupEditor [type="submit"]').click();
    await page.locator('#quickReplyGroupEditor').waitFor({ state: 'detached' });
    await page.locator('#quickReplyManager [data-dialog-cancel]').last().click();
    await page.locator('#quickReplyManager').waitFor({ state: 'detached' });
    await page.locator('#quickReplyBar .quick-reply-chip').waitFor();
    const requestsBeforeInsert = requests.length;
    await page.locator('#quickReplyBar .quick-reply-chip').click();
    assert.equal(await page.locator('#messageInput').inputValue(), '你好 Alice，我是 User');
    assert.equal(requests.length, requestsBeforeInsert, 'Inserting a quick reply must not call the model.');
    await page.locator('#messageInput').fill('原草稿');
    await page.locator('#quickReplyBar .quick-reply-chip').click();
    assert.equal(await page.locator('#messageInput').inputValue(), '原草稿\n你好 Alice，我是 User', 'Inserting must not silently overwrite a non-empty draft.');
    await page.locator('#messageInput').fill('');
    await page.locator('#quickReplyEntry').click();
    await page.locator('#quickReplyManager [data-quick-group-edit]').click();
    await page.locator('#quickReplyGroupEditor [data-quick-button-edit]').click();
    await page.locator('#quickReplyButtonEditor').waitFor();
    await page.locator('#quickReplyButtonAction').selectOption('send');
    await page.locator('#quickReplyButtonEditor [type="submit"]').click();
    await page.locator('#quickReplyButtonEditor').waitFor({ state: 'detached' });
    await page.locator('#quickReplyGroupEditor [type="submit"]').click();
    await page.locator('#quickReplyGroupEditor').waitFor({ state: 'detached' });
    await page.locator('#quickReplyManager [data-dialog-cancel]').last().click();
    await page.locator('#quickReplyManager').waitFor({ state: 'detached' });
    await page.locator('#messageInput').fill('');
    const requestsBeforeSend = requests.length;
    const messagesBeforeSend = await page.evaluate(() => getActiveConv().messages.length);
    await page.evaluate(() => { const button = document.querySelector('#quickReplyBar .quick-reply-chip'); button.click(); button.click(); });
    await page.waitForFunction(count => getActiveConv().messages.length >= count + 2 && !state.isGenerating, messagesBeforeSend, { timeout: 15000 });
    assert.equal(requests.length, requestsBeforeSend + 1, 'Direct send must call the model exactly once on double click.');

    steps.push('refresh restore');
    // Persist and refresh: profile selection and quick replies survive a reload.
    await page.evaluate(() => persistState(true));
    await page.reload();
    await page.waitForFunction(() => typeof state !== 'undefined' && getActiveConv());
    assert.equal(await page.evaluate(() => window.currentViewName), 'chat', 'The restore-last-chat fixture must reopen the chat view before asserting chat-only UI.');
    assert.equal(await page.evaluate(() => state.settings.connectionProfiles.find(profile => profile.id === state.settings.activeConnectionProfileIds.main).name), '档案 A');
    assert.equal(await page.evaluate(() => state.settings.quickReplyGroups.length), 1);
    assert.equal(await page.evaluate(() => state.settings.quickReplyGroups[0].buttons[0].action), 'send');
    await page.locator('#quickReplyBar .quick-reply-chip').waitFor();

    steps.push('09 group strategies');
    // 09 Group strategy and bounded auto rounds through the real generation lifecycle.
    await page.evaluate(async () => { await loadConversation('groupConv'); switchView('chat'); });
    await page.locator('#groupStrategyEntry').click();
    await page.locator('#groupStrategyDialog').waitFor();
    await captureDialogViews('group-strategy');
    await page.locator('#groupStrategyMode').selectOption('probability');
    await page.locator('[data-group-weight="Bob"]').fill('1');
    await page.locator('[data-group-weight="Alice"]').fill('0');
    await page.locator('#groupStrategyRounds').fill('2');
    await page.locator('#groupStrategyInterval').fill('1');
    const groupStartCount = await page.evaluate(() => getActiveConv().messages.length);
    await page.locator('[data-group-strategy-start]').click();
    await page.waitForFunction(count => !window.autoState && getActiveConv().messages.length >= count + 2, groupStartCount, { timeout: 20000 });
    assert.equal(await page.evaluate(() => getActiveConv().messages.filter(message => message.role === 'assistant' && message.speaker === 'Bob').length >= 2), true);
    await page.locator('[data-group-strategy-start]').click();
    await page.locator('[data-group-strategy-stop]').click();
    assert.equal(await page.evaluate(() => window.autoState), null);
    await page.waitForFunction(() => !state.isGenerating, null, { timeout: 15000 });
    await page.locator('#groupStrategyDialog [data-dialog-cancel]').last().click();

    steps.push('09b auto round stop/abort/switch');
    // 09b Stopping auto rounds keeps the owned reply, the ordinary stop aborts, and a cancelled
    // conversation switch leaves the run alone.
    const slowEndpoint = new URL('/__slow_model/v1/chat/completions', url).href;
    const failEndpoint = new URL('/__fail_model/v1/chat/completions', url).href;
    await page.evaluate(async endpoint => { state.settings.apiEndpoint = endpoint; await loadConversation('groupConv'); switchView('chat'); }, slowEndpoint);
    await page.locator('#groupStrategyEntry').click();
    await page.locator('#groupStrategyDialog').waitFor();
    await page.locator('#groupStrategyRounds').fill('3');
    await page.locator('#groupStrategyInterval').fill('1');
    await page.locator('[data-group-strategy-start]').click();
    await page.waitForFunction(() => !!window.autoState && state.isGenerating, null, { timeout: 15000 });
    await waitForSlowRequest();
    const beforeAutoCancel = await page.evaluate(() => getActiveConv().messages.length);
    await page.locator('[data-group-strategy-stop]').click();
    assert.equal(await page.evaluate(() => window.autoState), null, 'Stopping auto rounds must cancel future rounds only.');
    releaseSlowRequest();
    await page.waitForFunction(count => !state.isGenerating && getActiveConv().messages.length === count + 1, beforeAutoCancel, { timeout: 15000 });
    const afterAutoCancel = await page.evaluate(() => getActiveConv().messages.length);
    await page.waitForTimeout(2400);
    assert.equal(await page.evaluate(() => getActiveConv().messages.length), afterAutoCancel, 'Cancelled auto rounds must not start another turn.');
    assert.equal(await page.evaluate(() => state.isGenerating), false);

    await page.locator('[data-group-strategy-start]').click();
    await page.waitForFunction(() => !!window.autoState && state.isGenerating, null, { timeout: 15000 });
    await waitForSlowRequest();
    await page.locator('#groupStrategyDialog [data-dialog-cancel]').last().click();
    await page.locator('#groupStrategyDialog').waitFor({ state: 'detached' });
    await page.locator('#stopBtn').click();
    releaseSlowRequest();
    await page.waitForFunction(() => !state.isGenerating && !window.autoState, null, { timeout: 15000 });

    await page.locator('#groupStrategyEntry').click();
    await page.locator('#groupStrategyDialog').waitFor();
    await page.locator('[data-group-strategy-start]').click();
    await page.waitForFunction(() => !!window.autoState && state.isGenerating, null, { timeout: 15000 });
    await waitForSlowRequest();
    await page.locator('#groupStrategyDialog [data-dialog-cancel]').last().click();
    await page.locator('#groupStrategyDialog').waitFor({ state: 'detached' });
    // Keyed rows bind their inner content node; use the actual clickable conversation content.
    await page.locator('#convList .conv-item[data-conv-id="root"] > [data-conv-id="root"]').click();
    // loadConversation asks through showGlassConfirm while the slow request is still in flight.
    await page.locator('#appDialogModal').waitFor({ state: 'visible' });
    await page.locator('#appDialogCancelBtn').click();
    await page.locator('#appDialogModal').waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => state.activeConvId), 'groupConv', 'Cancelling the switch keeps the current conversation.');
    assert.equal(await page.evaluate(() => !!window.autoState), true, 'Cancelling the switch must keep the auto run.');
    await page.locator('#groupStrategyEntry').click();
    await page.locator('#groupStrategyDialog').waitFor();
    await page.locator('[data-group-strategy-stop]').click();
    assert.equal(await page.evaluate(() => window.autoState), null);
    releaseSlowRequest();
    await page.waitForFunction(() => !state.isGenerating, null, { timeout: 15000 });

    const beforeFailure = await page.evaluate(() => getActiveConv().messages.length);
    const failRequestsBefore = requests.length;
    await page.evaluate(endpoint => { state.settings.apiEndpoint = endpoint; }, failEndpoint);
    await page.locator('[data-group-strategy-start]').click();
    await page.waitForFunction(() => {
        const error = document.querySelector('#groupStrategyDialog .feature-error');
        return !!error && error.textContent.includes('synthetic provider failure') && !state.isGenerating && !window.autoState;
    }, null, { timeout: 15000 });
    assert.ok((await page.locator('#groupStrategyDialog .feature-error').textContent()).includes('synthetic provider failure'), 'A failed auto round must surface its actual error in the open configuration dialog.');
    assert.equal(await page.locator('#groupStrategyDialog .feature-error').isVisible(), true, 'The configuration error must be visible inside the open dialog.');
    assert.equal(await page.locator('#appDialogModal').isVisible(), false, 'A failed auto round must not stack an unreachable glass alert behind the HTML dialog.');
    assert.equal(requests.length, failRequestsBefore + 1, 'A failed auto round must actually issue its request.');
    assert.equal(await page.evaluate(() => state.isGenerating), false, 'A failed auto round must release the generation lock.');
    assert.equal(await page.evaluate(() => window.autoState), null, 'A failed auto round must cancel future rounds.');
    assert.equal(await page.evaluate(() => getActiveConv().messages.length), beforeFailure, 'A failed auto round must not save an assistant reply.');
    await page.locator('#groupStrategyDialog [data-dialog-cancel]').last().click();
    await page.locator('#groupStrategyDialog').waitFor({ state: 'detached' });
    await page.evaluate(endpoint => { state.settings.apiEndpoint = endpoint; }, failEndpoint);

    // With no secondary dialog open, the existing glass alert path stays operable.
    const glassFailRequestsBefore = requests.length;
    await page.evaluate(() => startGroupAutoRounds(getActiveConv(), 1, 1));
    await page.locator('#appDialogModal').waitFor({ state: 'visible' });
    assert.ok((await page.locator('#appDialogMessage').textContent()).includes('synthetic provider failure'), 'A failed auto round without a secondary dialog must keep the existing glass alert.');
    assert.equal(requests.length, glassFailRequestsBefore + 1, 'The glass alert failure path must issue exactly one request.');
    await page.locator('#appDialogOkBtn').click();
    await page.locator('#appDialogModal').waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => state.isGenerating), false);
    assert.equal(await page.evaluate(() => window.autoState), null);
    await page.evaluate(endpoint => { state.settings.apiEndpoint = endpoint; }, endpoint);

    steps.push('10 branch graph');
    // 10 Branch graph: sibling/nested nodes, fork navigation and bottom entry for another branch.
    await page.evaluate(async () => { await loadConversation('branchB'); switchView('chat'); });
    await page.locator('#conversationBranchEntry').click();
    await page.locator('#conversationBranchDialog').waitFor();
    assert.equal(await page.locator('#conversationBranchDialog .branch-node').count() >= 4, true);
    assert.equal(await page.locator('#conversationBranchDialog .branch-node-current').count(), 1);
    await captureDialogViews('branch-graph');
    await page.locator('#conversationBranchDialog').getByText('分叉处').first().waitFor();
    await page.locator('#conversationBranchDialog').getByRole('button', { name: '查看分叉处' }).first().click();
    await page.waitForFunction(() => state.activeConvId === 'root');
    await page.waitForFunction(() => !!document.querySelector('.message-jump-target'));
    assert.equal(await page.evaluate(() => !!document.querySelector('[data-message-id="root-10"]')), true);
    await page.locator('#conversationBranchEntry').click();
    await page.locator('#conversationBranchDialog').waitFor();
    const openButtons = page.locator('#conversationBranchDialog').getByRole('button', { name: '打开会话' });
    assert.equal(await openButtons.count() >= 2, true);
    await openButtons.nth(1).click();
    await page.waitForFunction(() => state.activeConvId !== 'root');
    await page.waitForFunction(() => { const box = document.getElementById('messagesContainer'); return box.scrollHeight <= box.clientHeight || box.scrollTop + box.clientHeight >= box.scrollHeight - 12; });

    steps.push('13 preset diff');
    // 13 Preset diff: two stored presets, safe text and import candidate save.
    await page.locator('#topSettingsBtn').click();
    await page.locator('#settingsTabPrompts').click();
    await page.locator('#managePresetLibrary').click();
    await page.locator('#presetLibraryDialog').waitFor();
    await page.locator('#presetLibraryDialog [data-library-action="compare"]').click();
    await page.locator('#presetDiffDialog').waitFor();
    assert.equal(await page.locator('#presetDiffDialog .preset-diff-line-add').count() > 0, true);
    assert.equal(await page.locator('#presetDiffDialog img').count(), 0, 'Malicious preset text must be rendered as text, not HTML.');
    await captureDialogViews('preset-diff');
    assert.equal(await page.evaluate(() => window.__xss), undefined);
    await page.locator('#presetDiffDialog [data-dialog-cancel]').last().click();
    await page.locator('#presetLibraryDialog [data-dialog-cancel]').last().click();
    const presetCount = await page.evaluate(() => state.settings.presetLibrary.length);
    const importedPreset = { name: '导入候选', prompts: [{ identifier: 'one', name: 'Imported <img src=x onerror=window.__xss=2>', role: 'system', content: '导入正文\n<img src=x onerror=window.__xss=2>', insertion_position: 0 }], prompt_order: [{ order: [{ identifier: 'one', enabled: true }] }] };
    await page.locator('#stPresetImportFile').setInputFiles({ name: 'import.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(importedPreset)) });
    await page.locator('#presetDiffDialog').waitFor();
    assert.equal(await page.locator('#presetDiffDialog').getByText('导入候选', { exact: false }).count() > 0, true);
    assert.equal(await page.evaluate(() => window.__xss), undefined);
    await page.locator('#presetDiffDialog [type="submit"]').click();
    await page.locator('#presetDiffDialog').waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => state.settings.presetLibrary.length), presetCount + 1);
    await page.locator('#appDialogModal').waitFor({ state: 'visible' });
    await page.locator('#appDialogOkBtn').click();
    await page.locator('#appDialogModal').waitFor({ state: 'hidden' });
    await page.locator('#settingsDoneBtn').click();

    steps.push('responsive themes');
    // Responsive/light-dark/system checks and evidence for the new secondary dialogs.
    for (const width of [390, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        for (const theme of ['new-light', 'new-dark', 'system']) {
            if (theme === 'system') {
                await page.evaluate(() => { state.settings.uiTheme = 'system'; applyUiTheme('system', { cache: false }); });
                await page.emulateMedia({ colorScheme: 'dark' });
            } else await page.evaluate(value => applyUiTheme(value, { cache: false }), theme);
            await openChatSidebar(width);
            await page.locator('#quickReplyEntry').click();
            await page.locator('#quickReplyManager').waitFor();
            await capture(`quick-replies-${width}-${theme}`);
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Overflow at ${width}/${theme}`);
            await page.locator('#quickReplyManager [data-dialog-cancel]').last().click();
            await page.locator('#sidebarSettingsBtn').click();
            await page.locator('#manageConnectionProfilesBtn').click();
            await page.locator('#connectionProfileManager').waitFor();
            await capture(`connection-profiles-${width}-${theme}`);
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Profile overflow at ${width}/${theme}`);
            await page.locator('#connectionProfileManager [data-dialog-cancel]').last().click();
            await page.locator('#settingsDoneBtn').click();
        }
    }
    assert.deepEqual(errors, []);
    await writeReport(true);
    console.log(JSON.stringify({ passed: true, report: reportPath, screenshots: output, requests: requests.length }));
} catch (error) {
    const diagnostics = {};
    try {
        await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true, animations: 'disabled' });
        screenshots.push('failure.png');
    } catch (screenshotError) {
        diagnostics.screenshotError = screenshotError.message;
    }
    try {
        Object.assign(diagnostics, await page.evaluate(() => ({
            view: typeof window.currentViewName === 'string' ? window.currentViewName : '',
            activeConvId: typeof state !== 'undefined' ? state.activeConvId : '',
            isGenerating: typeof state !== 'undefined' ? state.isGenerating : null,
            autoRoundsActive: typeof isGroupAutoRoundsActive === 'function' ? isGroupAutoRoundsActive() : null,
            openDialogs: Array.from(document.querySelectorAll('dialog[open]')).map(dialog => dialog.id),
            quickReplyBarHidden: !!(document.getElementById('quickReplyBar') && document.getElementById('quickReplyBar').classList.contains('hidden'))
        })));
    } catch (probeError) {
        diagnostics.probeError = probeError.message;
    }
    await writeReport(false, { error: error.message, stack: error.stack, diagnostics });
    console.error(JSON.stringify({ passed: false, report: reportPath, error: error.message, diagnostics }));
    throw error;
} finally {
    await context.close();
    await browser.close();
}
