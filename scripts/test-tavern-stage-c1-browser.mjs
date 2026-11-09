import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const modulePath = process.env.OPENTAVERN_PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = await import(path.isAbsolute(modulePath) ? pathToFileURL(modulePath).href : modulePath);
const url = process.env.OPENTAVERN_TEST_URL || 'http://127.0.0.1:8765/.sites-public/opentavern.html';
const requestedOutput = process.env.OPENTAVERN_TEST_OUTPUT || process.env.OPENTAVERN_OUTPUT;
const output = requestedOutput ? path.resolve(requestedOutput) : await mkdtemp(path.join(os.tmpdir(), 'opentavern-stage-c1-'));
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
async function capture(name) {
    const file = path.join(output, name + '.png');
    await page.screenshot({ path: file, animations: 'disabled' });
    screenshots.push(path.basename(file));
}
async function captureRuleUi(name, selector) {
    const viewport = page.viewportSize();
    const theme = await page.evaluate(() => state.settings.uiTheme);
    for (const width of [390, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        for (const value of ['new-light', 'new-dark', 'system']) {
            await page.evaluate(value => applyUiTheme(value, { cache: false }), value);
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${name} overflow at ${width}/${value}`);
            await page.locator(selector).waitFor();
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
    if (!release) throw new Error('No synthetic slow model request is waiting.');
    release();
}
async function waitIdle(timeout = 20000) {
    await page.waitForFunction(() => !state.isGenerating && !window.composerBusy && !(getActiveConv() && getActiveConv()._messageCommitInProgress), undefined, { timeout });
}
async function setRules(rules) {
    await page.evaluate(async rules => {
        state.settings.automationRules = rules;
        ensureAutomationSettings(state.settings);
        getAutomationRules().forEach(rule => {
            const wanted = rules.find(item => item.id === rule.id);
            setAutomationRuleGrant(state.settings, rule.id, rule.revision, !!(wanted && wanted.allowSend));
        });
        await persistState(true);
    }, rules);
}
async function runCount(ruleId, event) {
    return page.evaluate(({ ruleId, event }) => getAutomationRecentRuns().filter(entry => entry.ruleId === ruleId && (!event || entry.event === event)).length, { ruleId, event });
}
async function openAutomationPanel() {
    await page.locator('#topSettingsBtn').click();
    await page.locator('#settingsTabExtensions').click();
    await page.locator('#automationManageBtn').click();
    await page.locator('#automationManager').waitFor();
}
async function closeSettings() {
    if (await page.locator('#automationManager').count()) await page.locator('#automationManager [data-dialog-cancel]').last().click().catch(() => {});
    if (await page.locator('#settingsModal').isVisible()) await page.locator('#settingsDoneBtn').click();
}
async function sendThroughComposer(text) {
    await page.locator('#messageInput').fill(text);
    await page.locator('#sendBtn').click();
    await waitIdle();
}

await context.route('**/*', async route => {
    const target = new URL(route.request().url());
    if (target.pathname.endsWith('/assets/js/app.js')) {
        const response = await route.fetch(), bundle = await response.text(), end = bundle.lastIndexOf('})();');
        const probe = `Object.assign(window, { state, appStore, getActiveConv, normalizeConversation, persistState, applyUiTheme, requestFullRender, switchView, updateInputState, loadConversation, newConversation, openSettings, activateSettingsTab, buildAppDataSnapshot, StorageService,
            openAutomationManager, openAutomationRuleEditor, openAutomationDryRun, openAutomationRuns, getAutomationRules, getAutomationRuleById, dispatchAutomationEvent, runAutomationBeforeSend, settleAutomationAfterTurn, cancelAutomationRuntime, takeAutomationPromptFragments, getAutomationRecentRuns, exportAutomationRulesData, importAutomationRulesData, buildAutomationDryRunContext, evaluateAutomationConditions, ensureAutomationSettings, setAutomationRuleGrant, isAutomationRuleAuthorized, isAutomationSendAuthorized, getMvuDataForMessage, getMessageRevision, stopGeneration, cancelGroupAutoRounds, isGroupAutoRoundsActive, getComposerDraft, sendMessage, buildMessagesForAPIAsync });
            Object.defineProperty(window, 'composerBusy', {get:()=>composerSendInProgress});
Object.defineProperty(window, "automationPending", {get:()=>automationPendingSends});
Object.defineProperty(window, "automationScheduled", {get:()=>automationScheduledSends});
Object.defineProperty(window, "automationPrompts", {get:()=>automationPromptFragments});
`;
        return route.fulfill({ response, body: bundle.slice(0, end) + probe + bundle.slice(end) });
    }
    if (target.pathname.startsWith('/__mock_model')) {
        requests.push({ url: target.pathname, body: route.request().postDataJSON() });
        const content = target.pathname.includes('second') ? '<options><option><title>继续</title><description>继续行动</description></option></options>' : '合成模型回复';
        return route.fulfill({ json: { choices: [{ message: { content }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 4 } } });
    }
    if (target.pathname.startsWith('/__stream_model')) {
        requests.push({ url: target.pathname, body: route.request().postDataJSON() });
        const chunks = ['合成', '流式', '回复'];
        const body = chunks.map(piece => `data: ${JSON.stringify({ choices: [{ delta: { content: piece } }] })}\n\n`).join('') +
            `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 3, completion_tokens: 3 } })}\n\ndata: [DONE]\n\n`;
        return route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body });
    }
    if (target.pathname.startsWith('/__slow_model')) {
        requests.push({ url: target.pathname, body: route.request().postDataJSON() });
        await new Promise(resolve => slowRequestGates.push(resolve));
        try {
            return await route.fulfill({ json: { choices: [{ message: { content: '慢速合成回复' }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 4 } } });
        } catch (error) {
            if (!/Target page, context or browser has been closed|already handled|Target closed|ERR_ABORTED/i.test(error.message)) throw error;
        }
    }
    if (target.origin !== new URL(url).origin) return route.abort();
    return route.continue();
});
await page.addInitScript(() => {
    localStorage.setItem('opentavern_onboarding_completed_v1', '1');
    localStorage.setItem('opentavern_announce_dismissed_v1', '1');
});

const endpoint = new URL('/__mock_model/v1/chat/completions', url).href;
const slowEndpoint = new URL('/__slow_model/v1/chat/completions', url).href;
const streamEndpoint = new URL('/__stream_model/v1/chat/completions', url).href;
try {
    await page.goto(url);
    await page.waitForFunction(() => typeof persistState === 'function' && getActiveConv());
    await page.evaluate(async endpoint => {
        Object.assign(state.settings, {
            apiEndpoint: endpoint, apiKey: 'mock', saveApiKey: true, model: 'mock-model', summaryEnabled: false,
            streamEnabled: false, twoStageEnabled: false, restoreLastChat: true, uiTheme: 'new-light'
        });
        const alice = { name: 'Alice', description: 'Alice card' };
        state.characters.alice = alice;
        const conv = { id: 'c1-main', title: 'C1 主会话', character: alice, messages: [{ id: 'welcome', role: 'assistant', content: '欢迎' }], summaries: [], created: 1, updated: 1 };
        state.conversations = { 'c1-main': conv };
        state.conversationOrder = ['c1-main'];
        state.activeConvId = 'c1-main';
        normalizeConversation(conv);
        ensureAutomationSettings(state.settings);
        state.settings.quickReplyGroups = [{
            id: 'qr-group', name: '自动化按钮组', enabled: true, scope: 'global', targetId: '', order: 0,
            buttons: [{ id: 'qr-button', name: '问候', content: '快捷回复正文', action: 'insert', enabled: true, order: 0 }]
        }];
        await persistState(true);
        requestFullRender(); switchView('chat'); updateInputState();
    }, endpoint);

    steps.push('rule UI CRUD and content-bound grant');
    await openAutomationPanel();
    await page.locator('#automationManager [data-automation-new]').click();
    await page.locator('#automationRuleEditor').waitFor();
    await page.locator('#automationRuleName').fill('保存后追加草稿');
    await page.locator('#automationRuleEvent').selectOption('user-message-saved');
    await page.locator('#automationRuleEnabled').check();
    await page.locator('#automationRuleEditor [data-automation-add-condition]').click();
    await page.locator('#automationConditionEditor').waitFor();
    await page.locator('#automationConditionSource').selectOption('event-text');
    await page.locator('#automationConditionValue').fill('你好');
    await page.locator('#automationConditionEditor [type="submit"]').click();
    await page.locator('#automationConditionEditor').waitFor({ state: 'detached' });
    await page.locator('#automationRuleEditor [data-automation-add-action]').click();
    await page.locator('#automationActionEditor').waitFor();
    await page.locator('#automationActionType').selectOption('append-draft');
    await page.locator('#automationActionText').fill('RULE_DRAFT');
    await page.locator('#automationActionEditor [type="submit"]').click();
    await page.locator('#automationActionEditor').waitFor({ state: 'detached' });
    await page.locator('#automationRuleEditor [type="submit"]').click();
    await page.locator('#automationRuleEditor').waitFor({ state: 'detached' });
    await page.waitForFunction(() => getAutomationRules().some(rule => rule.name === '保存后追加草稿' && rule.enabled));
    const savedRule = await page.evaluate(() => {
        const rule = getAutomationRules().find(item => item.name === '保存后追加草稿');
        return { id: rule.id, revision: rule.revision, authorized: isAutomationRuleAuthorized(rule) };
    });
    assert.equal(savedRule.authorized, true, 'A locally saved rule must bind its local run grant to the executable content.');
    steps.push('dry-run action review is read-only');
    const drySnapshot = () => page.evaluate(() => JSON.stringify({
        messages: getActiveConv().messages, mvu: getActiveConv().mvu,
        draft: getComposerDraft(getActiveConv()), rules: getAutomationRules(), runs: getAutomationRecentRuns()
    }));
    const beforeDry = await drySnapshot();
    await page.locator(`#automationManager [data-automation-dry="${savedRule.id}"]`).click();
    await page.locator('#automationDryRun').waitFor();
    const dryText = await page.locator('#automationDryRun').textContent();
    assert.ok(dryText.includes('保存后追加草稿'), 'Dry-run must show the rule name under review.');
    assert.ok(dryText.includes('RULE_DRAFT'), 'Dry-run must show the proposed draft body for review.');
    assert.equal(await drySnapshot(), beforeDry, 'Dry-run must not write messages, variables, drafts, rules or run records.');
    await page.locator('#automationDryRun [data-dialog-cancel]').last().click();
    await page.locator('#automationDryRun').waitFor({ state: 'detached' });
    await captureRuleUi('automation-manager', '#automationManager');
    await page.locator('#automationManager [data-automation-edit]').first().click();
    await page.locator('#automationRuleEditor').waitFor();
    await captureRuleUi('automation-rule-editor', '#automationRuleEditor');
    await page.locator('#automationRuleEditor [data-dialog-cancel]').last().click();
    await page.locator('#automationRuleEditor').waitFor({ state: 'detached' });
    await page.keyboard.press('Escape');
    await page.locator('#automationManager').waitFor({ state: 'detached' });
    await closeSettings();

    steps.push('no-rule send clears the real composer');
    await setRules([]);
    const beforeNoRule = requests.length;
    await page.locator('#messageInput').fill('无规则发送');
    await page.locator('#sendBtn').click();
    await waitIdle();
    const noRuleState = await page.evaluate(() => ({ draft: getComposerDraft(getActiveConv()).text, input: document.getElementById('messageInput').value }));
    assert.equal(requests.length, beforeNoRule + 1, 'A no-rule send must still call the model once.');
    assert.equal(noRuleState.draft, '', 'No-rule sends must keep the real capture revision consistent and clear the draft.');
    assert.equal(noRuleState.input, '', 'No-rule sends must clear the composer input.');

    steps.push('real user-saved draft action and assistant-saved event');
    await setRules([
        { id: 'draft-rule', revision: 1, name: 'draft rule', enabled: true, event: 'user-message-saved', scope: 'global', targetId: '', order: 0, conditions: [{ id: 'c', source: 'event-text', op: 'contains', value: '你好' }], actions: [{ id: 'a', type: 'append-draft', text: 'RULE_DRAFT' }] },
        { id: 'assistant-count', revision: 1, name: 'assistant count', enabled: true, event: 'assistant-message-saved', scope: 'global', targetId: '', order: 1, conditions: [], actions: [{ id: 'a', type: 'append-draft', text: 'ASSISTANT' }] }
    ]);
    await sendThroughComposer('你好，测试自动化');
    assert.equal(await page.evaluate(() => getComposerDraft(getActiveConv()).text), 'RULE_DRAFT', 'A saved-event draft action must survive the original composer clear.');
    assert.equal(await runCount('draft-rule', 'user-message-saved'), 1, 'A real send must emit user-message-saved exactly once.');
    assert.equal(await runCount('assistant-count', 'assistant-message-saved'), 1, 'A real reply must emit assistant-message-saved exactly once.');
    const savedEventId = await page.evaluate(() => getAutomationRecentRuns().find(entry => entry.ruleId === 'assistant-count').eventId);
    const beforeDedupe = await runCount('assistant-count', 'assistant-message-saved');
    await page.evaluate(async eventId => {
        const conv = getActiveConv();
        const last = conv.messages.filter(message => message.role === 'assistant' && message.stage !== 'second').slice(-1)[0];
        await dispatchAutomationEvent('assistant-message-saved', conv, { eventId, role: 'assistant', text: last.content, messageId: last.id, messageRevision: getMessageRevision(last) });
    }, savedEventId);
    assert.equal(await runCount('assistant-count', 'assistant-message-saved'), beforeDedupe, 'Repeated delivery of the same saved event must be deduped.');

    steps.push('actual create / navigate lifecycle events');
    await setRules([
        { id: 'created-rule', revision: 1, name: 'created', enabled: true, event: 'conversation-created', scope: 'global', targetId: '', order: 0, conditions: [], actions: [{ id: 'a', type: 'append-draft', text: 'CREATED' }] },
        { id: 'entered-rule', revision: 1, name: 'entered', enabled: true, event: 'conversation-entered', scope: 'global', targetId: '', order: 1, conditions: [], actions: [{ id: 'a', type: 'append-draft', text: 'ENTERED' }] }
    ]);
    await page.evaluate(async () => { await newConversation(state.characters.alice); });
    await page.waitForFunction(() => getAutomationRules().length === 2);
    await page.waitForTimeout(100);
    assert.equal(await runCount('created-rule', 'conversation-created'), 1, 'An explicit new chat must emit conversation-created.');
    await page.evaluate(() => loadConversation('c1-main'));
    await page.waitForTimeout(100);
    assert.equal(await runCount('entered-rule', 'conversation-entered'), 1, 'Real navigation must emit conversation-entered.');
    assert.equal(await page.evaluate(() => getActiveConv().id), 'c1-main');

    steps.push('prompt preview is zero-execution, real send owns fragments and world book');
    await setRules([
        { id: 'fragment-rule', revision: 1, name: 'before fragment', enabled: true, event: 'before-send', scope: 'global', targetId: '', order: 0, conditions: [], actions: [{ id: 'a', type: 'prompt-fragment', role: 'system', text: 'BEFORE_FRAGMENT' }] },
        { id: 'wb-rule', revision: 1, name: 'world book fragment', enabled: true, event: 'worldbook-activated', scope: 'global', targetId: '', order: 1, conditions: [{ id: 'c', source: 'worldbook-entry', op: 'contains', value: 'wb-auto' }], actions: [{ id: 'a', type: 'prompt-fragment', role: 'system', text: 'WORLD_FRAGMENT' }] }
    ]);
    await page.evaluate(async () => {
        const conv = getActiveConv();
        state.worldBooks['book-1'] = { id: 'book-1', name: 'Book', entries: { '1': { uid: 1, key: ['wbtoken'], content: '世界书正文', automationId: 'wb-auto', disable: false, selective: false, constant: false, position: 0, order: 0, scanDepth: 4 } } };
        conv.worldBookIds = ['book-1'];
        conv.worldInfo = { entries: {} };
        delete conv._wiCache;
        await persistState(true);
    });
    const previewBody = await page.evaluate(async () => {
        const conv = getActiveConv();
        const messages = await buildMessagesForAPIAsync(conv, { preview: true });
        return JSON.stringify(messages);
    });
    assert.ok(!previewBody.includes('WORLD_FRAGMENT') && !previewBody.includes('BEFORE_FRAGMENT'), 'Prompt preview must not consume or execute automation fragments.');
    assert.equal(await runCount('wb-rule', 'worldbook-activated'), 0, 'Prompt preview must not dispatch the world-book automation event.');
    const beforeWorldbookSend = requests.length;
    await sendThroughComposer('wbtoken 请求');
    const worldbookRequest = JSON.stringify(requests[beforeWorldbookSend].body);
    assert.ok(worldbookRequest.includes('BEFORE_FRAGMENT'), 'A real before-send fragment must reach the dispatched request.');
    assert.ok(worldbookRequest.includes('WORLD_FRAGMENT'), 'A world book activated by a real request must reach the same dispatched request.');
    assert.equal(await runCount('wb-rule', 'worldbook-activated'), 1, 'A real request must dispatch worldbook-activated exactly once.');

    steps.push('auto-send uses the rule body and waits for the original turn');
    await page.evaluate(async slowEndpoint => {
        Object.assign(state.settings, { apiEndpoint: slowEndpoint, streamEnabled: false, twoStageEnabled: false });
        state.settings.automationRules = [{
            id: 'auto-send', revision: 1, name: 'auto send', enabled: true, event: 'user-message-saved',
            scope: 'global', targetId: '', order: 0, conditions: [], actions: [
                { id: 'd', type: 'set-draft', text: 'AUTO_BODY' },
                { id: 's', type: 'send-message', text: '' }
            ]
        }];
        ensureAutomationSettings(state.settings);
        setAutomationRuleGrant(state.settings, 'auto-send', 1, true);
        const draft = getComposerDraft(getActiveConv());
        draft.text = ''; draft.revision++;
        document.getElementById('messageInput').value = '';
        await persistState(true);
    }, slowEndpoint);
    const autoRequestsBefore = requests.length;
    await page.locator('#messageInput').fill('自动发送测试');
    await page.locator('#sendBtn').click();
    await waitForSlowRequest();
    assert.equal(requests.length, autoRequestsBefore + 1, 'Auto-send must not preempt the first request.');
    releaseSlowRequest();
    await waitForSlowRequest();
    assert.equal(requests.length, autoRequestsBefore + 2, 'Auto-send must start a second request only after the first turn settles.');
    assert.ok(JSON.stringify(requests[autoRequestsBefore + 1].body).includes('AUTO_BODY'), 'The automatic send must use the rule-prepared body.');
    releaseSlowRequest();
    await waitIdle();
    await page.waitForTimeout(300);
    assert.equal(requests.length, autoRequestsBefore + 2, 'The causal chain must prevent the same rule from sending again.');

    steps.push('second-stage ordering before auto-send');
    const secondStageBefore = requests.length;
    await page.evaluate(async () => {
        Object.assign(state.settings, {
            apiEndpoint: new URL('/__mock_model/v1/chat/completions', location.href).href,
            streamEnabled: false, twoStageEnabled: true, twoStageSystemPrompt: 'options'
        });
        state.settings.automationRules = [{
            id: 'second-stage-auto', revision: 1, name: 'second stage auto', enabled: true, event: 'assistant-message-saved',
            scope: 'global', targetId: '', order: 0, conditions: [], actions: [{ id: 'a', type: 'send-message', text: '二阶段后自动发送' }]
        }];
        ensureAutomationSettings(state.settings);
        setAutomationRuleGrant(state.settings, 'second-stage-auto', 1, true);
        const conv = getActiveConv();
        const draft = getComposerDraft(conv);
        draft.text = '带图片的消息';
        draft.images = [{
            type: 'image', source: 'user', mime: 'image/png',
            dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
            bytes: 68
        }];
        draft.revision++;
        document.getElementById('messageInput').value = draft.text;
        await sendMessage();
    });
    await waitIdle(25000);
    await page.waitForTimeout(500);
    assert.equal(requests.length, secondStageBefore + 4, 'Second stage must settle before the automation send starts its own main/second-stage requests.');
    assert.ok(JSON.stringify(requests[secondStageBefore].body).includes('image_url'), 'The attachment must survive the normal user message path.');
    assert.ok(JSON.stringify(requests[secondStageBefore + 2].body).includes('二阶段后自动发送'), 'The automation send must use the configured text after the second stage settles.');

    steps.push('late typing / stop / revoke cancel scheduled sends');
    await page.evaluate(async () => {
        Object.assign(state.settings, { apiEndpoint: new URL('/__mock_model/v1/chat/completions', location.href).href, streamEnabled: false, twoStageEnabled: false });
        state.settings.automationRules = [{
            id: 'late-race', revision: 1, name: 'late race', enabled: true, event: 'assistant-message-saved',
            scope: 'global', targetId: '', order: 0, conditions: [], actions: [{ id: 'a', type: 'send-message', text: 'RACE_BODY' }]
        }];
        ensureAutomationSettings(state.settings);
        setAutomationRuleGrant(state.settings, 'late-race', 1, true);
        const conv = getActiveConv();
        const draft = getComposerDraft(conv);
        draft.text = ''; draft.revision++;
        document.getElementById('messageInput').value = '';
        await dispatchAutomationEvent('assistant-message-saved', conv, { eventId: 'late-race-event', role: 'assistant', text: 'x' });
        settleAutomationAfterTurn(conv);
        draft.text = '用户迟到输入'; draft.revision++;
        document.getElementById('messageInput').value = draft.text;
    });
    await page.waitForTimeout(150);
    const lateRace = await page.evaluate(() => ({ requests: 0, draft: getComposerDraft(getActiveConv()).text }));
    assert.equal(lateRace.draft, '用户迟到输入', 'Late typing must win over the scheduled rule send.');

    await page.evaluate(async () => {
        state.settings.automationRules = [{
            id: 'stop-rule', revision: 1, name: 'stop', enabled: true, event: 'assistant-message-saved',
            scope: 'global', targetId: '', order: 0, conditions: [], actions: [{ id: 'a', type: 'send-message', text: 'STOP_BODY' }]
        }];
        ensureAutomationSettings(state.settings);
        setAutomationRuleGrant(state.settings, 'stop-rule', 1, true);
        const conv = getActiveConv();
        const draft = getComposerDraft(conv);
        draft.text = ''; draft.revision++;
        document.getElementById('messageInput').value = '';
        await dispatchAutomationEvent('assistant-message-saved', conv, { eventId: 'stop-event', role: 'assistant', text: 'x' });
        settleAutomationAfterTurn(conv);
        stopGeneration();
    });
    await page.waitForTimeout(150);

    await page.evaluate(async () => {
        state.settings.automationRules = [{
            id: 'revoke-rule', revision: 1, name: 'revoke', enabled: true, event: 'assistant-message-saved',
            scope: 'global', targetId: '', order: 0, conditions: [], actions: [{ id: 'a', type: 'send-message', text: 'REVOKE_BODY' }]
        }];
        ensureAutomationSettings(state.settings);
        setAutomationRuleGrant(state.settings, 'revoke-rule', 1, true);
        const conv = getActiveConv();
        const draft = getComposerDraft(conv);
        draft.text = ''; draft.revision++;
        document.getElementById('messageInput').value = '';
        await dispatchAutomationEvent('assistant-message-saved', conv, { eventId: 'revoke-event', role: 'assistant', text: 'x' });
        settleAutomationAfterTurn(conv);
        setAutomationRuleGrant(state.settings, 'revoke-rule', 1, false);
    });
    await page.waitForTimeout(150);
    const cancelled = await page.evaluate(() => ({ pending: automationPending.length, scheduled: automationScheduled.length }));
    assert.equal(cancelled.pending, 0);
    assert.equal(cancelled.scheduled, 0, 'Stop and revoke must cancel scheduled timers, not only queued work.');

    steps.push('MVU real save, source change and save failure');
    const mvuBefore = requests.length;
    await page.evaluate(async () => {
        Object.assign(state.settings, { apiEndpoint: new URL('/__mock_model/v1/chat/completions', location.href).href, streamEnabled: false, twoStageEnabled: false });
        state.settings.automationRules = [{
            id: 'mvu-rule', revision: 1, name: 'mvu', enabled: true, event: 'assistant-message-saved',
            scope: 'global', targetId: '', order: 0, conditions: [], actions: [{ id: 'm', type: 'mvu-set', path: 'stat_data.hp', valueType: 'number', value: 42 }]
        }];
        ensureAutomationSettings(state.settings);
        setAutomationRuleGrant(state.settings, 'mvu-rule', 1, false);
        const conv = getActiveConv();
        await dispatchAutomationEvent('assistant-message-saved', conv, { eventId: 'mvu-source-missing', role: 'assistant', text: 'x', messageId: 'missing-message', messageRevision: 'missing' });
    });
    const mvuMissing = await page.evaluate(() => getAutomationRecentRuns().find(entry => entry.ruleId === 'mvu-rule').actions);
    assert.ok(mvuMissing.some(action => action.type === 'mvu-set' && action.status === 'failed'), 'A changed/missing source message must prevent the MVU write.');
    await sendThroughComposer('MVU 真实保存');
    const mvuSaved = await page.evaluate(() => {
        const conv = getActiveConv();
        const last = conv.messages.filter(message => message.role === 'assistant' && message.stage !== 'second').slice(-1)[0];
        return last && last.mvuManualData ? last.mvuManualData.stat_data.hp : null;
    });
    assert.equal(mvuSaved, 42, 'Authorized MVU writes must bind to the real saved message version.');

    const saveFailure = await page.evaluate(async () => {
        const conv = getActiveConv();
        state.settings.automationRules = [{
            id: 'save-guard', revision: 1, name: 'save guard', enabled: true, event: 'user-message-saved',
            scope: 'global', targetId: '', order: 0, conditions: [], actions: [{ id: 'a', type: 'append-draft', text: 'should-not-run' }]
        }];
        ensureAutomationSettings(state.settings);
        setAutomationRuleGrant(state.settings, 'save-guard', 1, false);
        const before = getAutomationRecentRuns().filter(entry => entry.ruleId === 'save-guard').length;
        const originalSaveAll = StorageService.saveAll;
        StorageService.saveAll = async () => { throw new Error('synthetic quota'); };
        document.getElementById('messageInput').value = '保存失败测试';
        getComposerDraft(conv).text = '保存失败测试';
        try { await sendMessage(); } catch (error) { /* the normal alert path */ }
        StorageService.saveAll = originalSaveAll;
        return {
            after: getAutomationRecentRuns().filter(entry => entry.ruleId === 'save-guard').length,
            before,
            messages: conv.messages.filter(message => message.content === '保存失败测试').length
        };
    });
    assert.equal(saveFailure.after, saveFailure.before, 'A failed save must not emit the saved event.');
    assert.equal(saveFailure.messages, 0, 'A failed save must not write the user message.');
    await page.locator('#appDialogModal').waitFor({ state: 'visible' });
    assert.match(await page.locator('#appDialogModal').textContent(), /synthetic quota/, 'The actual failure notice must describe the injected save failure.');
    await page.locator('#appDialogOkBtn').click();
    await page.locator('#appDialogModal').waitFor({ state: 'hidden' });

    steps.push('streaming produces exactly one saved event');
    await page.evaluate(async streamEndpoint => {
        Object.assign(state.settings, { apiEndpoint: streamEndpoint, streamEnabled: true, twoStageEnabled: false });
        state.settings.automationRules = [{
            id: 'stream-count', revision: 1, name: 'stream count', enabled: true, event: 'assistant-message-saved',
            scope: 'global', targetId: '', order: 0, conditions: [], actions: [{ id: 'a', type: 'append-draft', text: 'STREAM' }]
        }];
        ensureAutomationSettings(state.settings);
        setAutomationRuleGrant(state.settings, 'stream-count', 1, false);
        const draft = getComposerDraft(getActiveConv());
        draft.text = ''; draft.revision++;
        document.getElementById('messageInput').value = '';
        await persistState(true);
    }, streamEndpoint);
    const streamBefore = requests.length;
    await sendThroughComposer('流式测试');
    assert.equal(requests.length, streamBefore + 1);
    assert.equal(await runCount('stream-count', 'assistant-message-saved'), 1, 'A streamed reply must emit assistant-message-saved once, not once per token.');
    assert.equal(await page.evaluate(() => getAutomationRecentRuns().filter(entry => entry.ruleId === 'stream-count' && entry.status === 'sent').length), 0);

    steps.push('content-bound grant survives refresh and rejects same-id content changes');
    const grantReport = await page.evaluate(async () => {
        const before = isAutomationRuleAuthorized(getAutomationRuleById('stream-count'));
        const original = getAutomationRuleById('stream-count').actions[0].text;
        getAutomationRuleById('stream-count').actions[0].text = 'remote changed executable content';
        const changed = isAutomationRuleAuthorized(getAutomationRuleById('stream-count'));
        getAutomationRuleById('stream-count').actions[0].text = original;
        setAutomationRuleGrant(state.settings, 'stream-count', 1, false);
        const regranted = isAutomationRuleAuthorized(getAutomationRuleById('stream-count'));
        await persistState(true);
        return { before, changed, regranted };
    });
    assert.deepEqual(grantReport, { before: true, changed: false, regranted: true }, 'Local consent must bind the executable content, not only the revision; a changed rule needs explicit re-authorization.');
    await page.reload();
    await page.waitForFunction(() => typeof getAutomationRules === 'function' && getActiveConv());
    const afterReload = await page.evaluate(() => {
        const rule = getAutomationRuleById('stream-count');
        return { rules: getAutomationRules().length, pending: automationPending.length, runs: getAutomationRecentRuns().length, authorized: isAutomationRuleAuthorized(rule) };
    });
    assert.ok(afterReload.rules >= 1, 'Rule definitions must survive refresh.');
    assert.equal(afterReload.pending, 0, 'Refresh must not replay old queued work.');
    assert.ok(afterReload.runs >= 1, 'Readable results must survive refresh.');
    assert.equal(afterReload.authorized, true, 'A content-bound local grant must survive refresh for unchanged content.');

    await openAutomationPanel();
    await captureRuleUi('automation-manager-final', '#automationManager');
    await page.locator('#automationManager [data-automation-runs]').click();
    await page.locator('#automationRuns').waitFor();
    await capture('automation-runs');
    await page.locator('#automationRuns [data-dialog-cancel]').last().click();
    await page.locator('#automationRuns').waitFor({ state: 'detached' });
    await page.locator('#automationManager [data-dialog-cancel]').last().click();
    await page.locator('#automationManager').waitFor({ state: 'detached' });
    await closeSettings();
    assert.deepEqual(errors, [], 'The automation browser flow must not raise page errors.');
    await writeReport(true);
    console.log('Tavern stage C1 browser passed: rule UI, content-bound grants, read-only dry-run action review, real composer clearing, real user/assistant/create/enter/world-book events, prompt preview isolation, rule-body auto-send ordering, two-stage settlement, late typing/stop/revoke timer cancellation, MVU writes and source changes, save failure, streaming dedupe and refresh.');
} catch (error) {
    await writeReport(false, { error: error.message, stack: error.stack });
    throw error;
} finally {
    await browser.close();
}
