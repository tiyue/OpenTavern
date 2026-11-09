import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const modulePath = process.env.OPENTAVERN_PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = await import(path.isAbsolute(modulePath) ? pathToFileURL(modulePath).href : modulePath);
const url = process.env.OPENTAVERN_TEST_URL || 'http://127.0.0.1:8765/.sites-public/opentavern.html';
const requestedOutput = process.env.OPENTAVERN_TEST_OUTPUT || process.env.OPENTAVERN_OUTPUT;
const output = requestedOutput ? path.resolve(requestedOutput) : await mkdtemp(path.join(os.tmpdir(), 'opentavern-stage-c2-'));
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
async function captureSceneUi(name, selector) {
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
async function waitIdle(timeout = 25000) {
    await page.waitForFunction(() => !state.isGenerating && !window.composerBusy && !(getActiveConv() && getActiveConv()._messageCommitInProgress), undefined, { timeout });
}
async function closeDialogs() {
    for (const id of ['sceneEventEditor', 'sceneConditionEditor', 'sceneMvuChangeEditor', 'scenePackageEditor', 'scenePreflight', 'sceneProgress', 'sceneRuns', 'sceneImportPreview', 'sceneManager']) {
        const dialog = page.locator('#' + id);
        if (await dialog.count()) await dialog.locator('[data-dialog-cancel]').last().click({ force: true }).catch(() => {});
    }
    if (await page.locator('#settingsModal').isVisible()) await page.locator('#settingsDoneBtn').click();
}
async function openScenePanel() {
    await page.locator('#topSettingsBtn').click();
    await page.locator('#settingsTabExtensions').click();
    await page.locator('#sceneManageBtn').click();
    await page.locator('#sceneManager').waitFor();
}
async function sendThroughComposer(text) {
    await page.locator('#messageInput').fill(text);
    await page.locator('#sendBtn').click();
    await waitIdle();
}
async function addCondition(source, op, value) {
    await page.locator('#sceneEventEditor [data-scene-add-condition]').click();
    await page.locator('#sceneConditionEditor').waitFor();
    await page.locator('#sceneConditionSource').selectOption(source);
    await page.locator('#sceneConditionOp').selectOption(op);
    if (source === 'mvu') {
        await page.locator('#sceneConditionPath').fill(value.path);
        await page.locator('#sceneConditionValueType').selectOption(value.valueType);
        await page.locator('#sceneConditionValue').fill(String(value.value));
    } else {
        await page.locator('#sceneConditionValue').fill(String(value));
    }
    await page.locator('#sceneConditionEditor [type="submit"]').click();
    await page.locator('#sceneConditionEditor').waitFor({ state: 'detached' });
}
async function addMvu(path, valueType, value) {
    await page.locator('#sceneEventEditor [data-scene-add-mvu]').click();
    await page.locator('#sceneMvuChangeEditor').waitFor();
    await page.locator('#sceneMvuPath').fill(path);
    await page.locator('#sceneMvuValueType').selectOption(valueType);
    await page.locator('#sceneMvuValue').fill(String(value));
    await page.locator('#sceneMvuChangeEditor [type="submit"]').click();
    await page.locator('#sceneMvuChangeEditor').waitFor({ state: 'detached' });
}
async function addEvent({ name, trigger, once, text, conditions = [], mvu = [] }) {
    await page.locator('#scenePackageEditor [data-scene-add-event]').click();
    await page.locator('#sceneEventEditor').waitFor();
    await page.locator('#sceneEventName').fill(name);
    await page.locator('#sceneEventTrigger').selectOption(trigger);
    if (once) await page.locator('#sceneEventOnce').check();
    else await page.locator('#sceneEventOnce').uncheck();
    await page.locator('#sceneEventText').fill(text);
    for (const condition of conditions) await addCondition(condition.source, condition.op, condition.value);
    for (const change of mvu) await addMvu(change.path, change.valueType, change.value);
    await page.locator('#sceneEventEditor [type="submit"]').click();
    await page.locator('#sceneEventEditor').waitFor({ state: 'detached' });
}
async function editPackage() {
    await page.locator('#sceneManager [data-scene-edit]').first().click();
    await page.locator('#scenePackageEditor').waitFor();
}
async function savePackage() {
    await page.locator('#scenePackageEditor [type="submit"]').click();
    await page.locator('#scenePackageEditor').waitFor({ state: 'detached' });
    await page.locator('#sceneManager').waitFor();
}
async function sceneState() {
    return page.evaluate(() => ({
        progress: getSceneProgress(getActiveConv()).map(entry => ({ text: entry.text, event: entry.eventName, at: entry.at, source: entry.sourceMessageId })),
        runs: getSceneRecentRuns().filter(entry => entry.conversationId === getActiveConv().id).map(entry => ({ status: entry.status, event: entry.eventName, detail: entry.detail })),
        failure: !!getSceneFailure(getActiveConv().id),
        hp: getMvuDataForMessage(getActiveConv(), null).stat_data.hp,
        messages: getActiveConv().messages.map(message => ({ id: message.id, role: message.role, stage: message.stage || '', content: message.content }))
    }));
}

await context.route('**/*', async route => {
    const target = new URL(route.request().url());
    if (target.pathname.endsWith('/assets/js/app.js')) {
        const response = await route.fetch(), bundle = await response.text(), end = bundle.lastIndexOf('})();');
        const probe = `Object.assign(window, { state, appStore, getActiveConv, normalizeConversation, persistState, applyUiTheme, requestFullRender, switchView, updateInputState, loadConversation, newConversation, openSettings, activateSettingsTab, StorageService,
            openSceneManager, openScenePackageEditor, openSceneEventEditor, openScenePreflight, openSceneProgress, openSceneRuns,
            getScenePackages, getScenePackageById, getSceneEventById, getSceneProgress, getSceneRecentRuns, getSceneFailure, retrySceneFailure, runSceneOpeningForConversation,
            setScenePackageGrant, isScenePackageAuthorized, ensureSceneSettings, saveScenePackagesChange, dispatchAutomationEvent, getMvuDataForMessage, getMessageRevision,
            sendMessage, exportScenePackagesData, importScenePackagesData, getComposerDraft, stopGeneration, deleteMessage, switchResponseVersion, isScenePackageAuthorized, ensureConversationMvu });
            Object.defineProperty(window, 'composerBusy', {get:()=>composerSendInProgress});
`;
        return route.fulfill({ response, body: bundle.slice(0, end) + probe + bundle.slice(end) });
    }
    if (target.pathname.startsWith('/__mock_model')) {
        requests.push({ url: target.pathname, body: route.request().postDataJSON() });
        return route.fulfill({ json: { choices: [{ message: { content: '合成模型回复' }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 4 } } });
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
            streamEnabled: false, twoStageEnabled: false, restoreLastChat: true, uiTheme: 'new-light'
        });
        const alice = { name: 'Alice', description: 'Alice card', extensions: { mvu: { initvar: { stat_data: { hp: 1 } } } } };
        state.characters.alice = alice;
        const conv = { id: 'c2-main', title: 'C2 主会话', character: alice, messages: [{ id: 'welcome', role: 'assistant', content: '欢迎' }], summaries: [], created: 1, updated: 1 };
        state.conversations = { 'c2-main': conv };
        state.conversationOrder = ['c2-main'];
        state.activeConvId = 'c2-main';
        normalizeConversation(conv);
        ensureSceneSettings(state.settings);
        state.settings.scenePackages = [];
        state.settings.scenePackageGrants = {};
        await persistState(true);
        requestFullRender(); switchView('chat'); updateInputState();
    }, endpoint);
    await page.evaluate(async () => { await newConversation(state.characters.alice); });
    await page.evaluate(async () => {
        const conv = getActiveConv();
        ensureConversationMvu(conv, { initial: { stat_data: { hp: 1 } } });
        await persistState(true);
    });
    await waitIdle();
    const boundConversationId = await page.evaluate(() => getActiveConv().id);

    steps.push('real scene manager CRUD and opening event');
    await openScenePanel();
    await page.locator('#sceneManager [data-scene-new]').click();
    await page.locator('#scenePackageEditor').waitFor();
    await page.locator('#scenePackageName').fill('开场与顺序');
    await page.locator('#scenePackageScope').selectOption('conversation');
    await page.locator('#scenePackageTarget').selectOption(boundConversationId);
    await page.locator('#scenePackageEnabled').check();
    await page.locator('#scenePackageGranted').check();
    await addEvent({
        name: '开场事件', trigger: 'opening', once: true, text: 'OPENING_SCENE',
        conditions: [
            { source: 'message-count', op: 'gte', value: 1 },
            { source: 'away-minutes', op: 'gte', value: 0 },
            { source: 'mvu', op: 'equals', value: { path: 'stat_data.hp', valueType: 'number', value: 1 } }
        ],
        mvu: [{ path: 'stat_data.hp', valueType: 'number', value: 2 }]
    });
    await savePackage();
    const savedPackage = await page.evaluate(() => {
        const pkg = getScenePackages()[0];
        return { id: pkg.id, enabled: pkg.enabled, scope: pkg.scope, targetId: pkg.targetId, authorized: isScenePackageAuthorized(pkg), events: pkg.events.length };
    });
    assert.equal(savedPackage.enabled, true);
    assert.equal(savedPackage.scope, 'conversation');
    assert.equal(savedPackage.targetId, boundConversationId);
    assert.equal(savedPackage.authorized, true);
    assert.equal(savedPackage.events, 1);

    steps.push('read-only preflight');
    const beforePreflight = await page.evaluate(() => JSON.stringify({ messages: getActiveConv().messages, settings: state.settings, runs: getSceneRecentRuns() }));
    const requestsBeforePreflight = requests.length;
    await page.locator('#sceneManager [data-scene-preflight]').first().click();
    await page.locator('#scenePreflight').waitFor();
    const preflightText = await page.locator('#scenePreflight').textContent();
    assert.ok(preflightText.includes('OPENING_SCENE'), 'Preflight must show narrative text.');
    assert.ok(preflightText.includes('stat_data.hp'), 'Preflight must show variable changes.');
    assert.equal(await page.evaluate(() => JSON.stringify({ messages: getActiveConv().messages, settings: state.settings, runs: getSceneRecentRuns() })), beforePreflight, 'Preflight must not write history, settings or runs.');
    assert.equal(requests.length, requestsBeforePreflight, 'Preflight must not call the model.');
    await page.locator('#scenePreflight [data-dialog-cancel]').last().click();
    await page.locator('#scenePreflight').waitFor({ state: 'detached' });
    await captureSceneUi('scene-manager', '#sceneManager');
    await editPackage();
    await captureSceneUi('scene-package-editor', '#scenePackageEditor');
    await page.locator('#scenePackageEditor [data-dialog-cancel]').last().click();
    await page.locator('#scenePackageEditor').waitFor({ state: 'detached' });
    await closeDialogs();

    steps.push('opening runs once through the real first saved message');
    const requestBeforeOpening = requests.length;
    await sendThroughComposer('开场测试');
    let stateAfterOpening = await sceneState();
    assert.equal(requests.length, requestBeforeOpening + 1, 'A normal reply must still be requested once.');
    assert.equal(stateAfterOpening.progress.filter(entry => entry.text === 'OPENING_SCENE').length, 1);
    assert.equal(stateAfterOpening.hp, 2, 'Opening MVU changes must be ACKed with the narrative.');
    const openingMessage = stateAfterOpening.messages.find(message => message.content === 'OPENING_SCENE');
    assert.ok(openingMessage && openingMessage.stage === 'scene');
    await page.evaluate(() => { requestFullRender(); });
    await page.waitForTimeout(100);
    assert.equal((await sceneState()).progress.filter(entry => entry.text === 'OPENING_SCENE').length, 1, 'Re-render must not replay opening.');

    steps.push('ordered repeatable and one-shot saved-message events');
    await openScenePanel();
    await editPackage();
    await addEvent({ name: '顺序 A', trigger: 'user-message-saved', once: false, text: 'ORDER_A', conditions: [{ source: 'message-count', op: 'gte', value: 1 }], mvu: [{ path: 'stat_data.hp', valueType: 'number', value: 3 }] });
    await addEvent({ name: '顺序 B', trigger: 'user-message-saved', once: true, text: 'ORDER_B', conditions: [{ source: 'mvu', op: 'equals', value: { path: 'stat_data.hp', valueType: 'number', value: 3 } }], mvu: [{ path: 'stat_data.hp', valueType: 'number', value: 4 }] });
    await savePackage();
    await closeDialogs();
    await sendThroughComposer('第二条');
    let ordered = await sceneState();
    assert.equal(JSON.stringify(ordered.progress.slice(-2).map(entry => entry.text)), JSON.stringify(['ORDER_A', 'ORDER_B']));
    assert.equal(ordered.hp, 4);
    await sendThroughComposer('第三条');
    ordered = await sceneState();
    assert.equal(ordered.progress.filter(entry => entry.text === 'ORDER_A').length, 2, 'Repeatable events run for a new source message.');
    assert.equal(ordered.progress.filter(entry => entry.text === 'ORDER_B').length, 1, 'One-shot events do not repeat.');

    steps.push('assistant-save scene keeps the legitimate second stage alive');
    await openScenePanel();
    await editPackage();
    await addEvent({ name: '二阶段场景', trigger: 'assistant-message-saved', once: true, text: 'TWO_STAGE_SCENE', conditions: [], mvu: [] });
    await savePackage();
    await closeDialogs();
    await page.evaluate(() => { Object.assign(state.settings, { twoStageEnabled: true, twoStageSystemPrompt: 'options' }); });
    const secondStageBefore = requests.length;
    await sendThroughComposer('二阶段场景测试');
    const twoStageState = await sceneState();
    assert.equal(requests.length, secondStageBefore + 2, 'The legitimate second-stage request must still run after a scene transaction.');
    assert.equal(twoStageState.progress.some(entry => entry.text === 'TWO_STAGE_SCENE'), true);
    assert.equal(twoStageState.messages.some(message => message.stage === 'second'), true, 'A scene message saved after the assistant reply must not drop the second-stage result.');
    await page.evaluate(() => { state.settings.twoStageEnabled = false; });

    steps.push('failed scene save is atomic and retryable from the manager');
    await openScenePanel();
    await editPackage();
    await addEvent({ name: '失败场景', trigger: 'assistant-message-saved', once: true, text: 'FAIL_SCENE', mvu: [{ path: 'stat_data.hp', valueType: 'number', value: 9 }] });
    await savePackage();
    await closeDialogs();
    await page.evaluate(() => {
        const original = StorageService.saveAll.bind(StorageService);
        window.__sceneOriginalSaveAll = original;
        StorageService.saveAll = async function(snapshot) {
            const failedScene = Object.values(snapshot.conversations || {}).some(conv =>
                (conv.messages || []).some(message => message.stage === 'scene' && message.content === 'FAIL_SCENE'));
            if (failedScene) throw new Error('synthetic scene quota');
            return original(snapshot);
        };
    });
    await sendThroughComposer('失败保存测试');
    const failedState = await sceneState();
    assert.equal(failedState.messages.filter(message => message.content === 'FAIL_SCENE').length, 0, 'A failed scene must not append narrative text.');
    assert.notEqual(failedState.hp, 9, 'A failed scene must not apply variables.');
    assert.equal(failedState.progress.filter(entry => entry.text === 'FAIL_SCENE').length, 0, 'A failed scene must not record one-shot progress.');
    assert.equal(failedState.failure, true);
    assert.ok(failedState.runs.some(entry => entry.status === 'failed'));
    await page.evaluate(() => { StorageService.saveAll = window.__sceneOriginalSaveAll; });
    await openScenePanel();
    await page.locator('#sceneManager [data-scene-failure] button').first().click();
    await page.waitForFunction(() => getSceneProgress(getActiveConv()).some(entry => entry.text === 'FAIL_SCENE'));
    const retriedState = await sceneState();
    assert.equal(retriedState.progress.filter(entry => entry.text === 'FAIL_SCENE').length, 1);
    assert.equal(retriedState.hp, 9);
    await closeDialogs();

    steps.push('source edit invalidates progress and selected version restores it');
    const failedSceneInfo = await page.evaluate(() => {
        const conv = getActiveConv();
        const scene = conv.messages.find(message => message.content === 'FAIL_SCENE');
        return { sceneId: scene.id, sourceId: scene.sceneEvent.sourceMessageId };
    });
    const beforeEditProgress = (await sceneState()).progress.length;
    const sourceWrapper = page.locator(`[data-message-id="${failedSceneInfo.sourceId}"]`);
    await sourceWrapper.locator('[data-action="edit"]').click({ force: true });
    const editArea = sourceWrapper.locator('textarea');
    await editArea.waitFor();
    await editArea.fill('编辑后的来源回复');
    await sourceWrapper.locator('button', { hasText: '保存' }).click();
    await page.waitForFunction(id => {
        const conv = getActiveConv();
        const source = conv.messages.find(message => message.id === id);
        return source && source.content === '编辑后的来源回复';
    }, failedSceneInfo.sourceId);
    assert.equal((await sceneState()).progress.length, beforeEditProgress - 1, 'Editing the source message must invalidate its scene progress.');
    await sourceWrapper.locator('[data-action="edit"]').click({ force: true });
    const restoreSourceArea = sourceWrapper.locator('textarea');
    await restoreSourceArea.waitFor();
    await restoreSourceArea.fill('合成模型回复');
    await sourceWrapper.locator('button', { hasText: '保存' }).click();
    await page.waitForFunction(count => getSceneProgress(getActiveConv()).length === count, beforeEditProgress);
    assert.equal((await sceneState()).progress.length, beforeEditProgress, 'Restoring the source revision must restore scene progress.');
    const sceneWrapper = page.locator(`[data-message-id="${failedSceneInfo.sceneId}"]`);
    await sceneWrapper.locator('[data-action="edit"]').click({ force: true });
    const sceneEditArea = sceneWrapper.locator('textarea');
    await sceneEditArea.waitFor();
    await sceneEditArea.fill('改写场景正文');
    await sceneWrapper.locator('button', { hasText: '保存' }).click();
    await page.waitForFunction(count => getSceneProgress(getActiveConv()).length === count, beforeEditProgress - 1);
    assert.equal((await sceneState()).progress.length, beforeEditProgress - 1, 'Editing scene narrative must remove its progress record.');
    await sceneWrapper.locator('[data-action="version-history"]').click({ force: true });
    await page.locator('#messageVersionHistoryDialog').waitFor();
    await page.locator('#messageVersionHistoryDialog button', { hasText: '使用此版本' }).first().click();
    await page.locator('#messageVersionHistoryDialog').waitFor({ state: 'detached' });
    await page.waitForFunction(count => getSceneProgress(getActiveConv()).length === count, beforeEditProgress);
    assert.equal((await sceneState()).progress.length, beforeEditProgress, 'Selecting the old scene version must restore progress and variables.');

    steps.push('branch keeps only progress before the fork');
    const firstUserId = await page.evaluate(() => getActiveConv().messages.find(message => message.role === 'user').id);
    const firstUserWrapper = page.locator(`[data-message-id="${firstUserId}"]`);
    await firstUserWrapper.locator('[data-action="edit"]').click({ force: true });
    const userEditArea = firstUserWrapper.locator('textarea');
    await userEditArea.waitFor();
    await userEditArea.fill('分支起点');
    await firstUserWrapper.locator('button', { hasText: '保存并重新生成' }).click();
    await page.locator('#featureConfirmDialog').waitFor();
    await page.locator('#featureConfirmDialog [type="submit"]').click();
    await waitIdle();
    const branchInfo = await page.evaluate(() => ({ branch: getActiveConv().branchOf, contents: getActiveConv().messages.map(message => message.content) }));
    assert.ok(branchInfo.branch && branchInfo.branch.conversationId, 'Editing an earlier user turn must create a branch.');
    assert.equal(branchInfo.contents.includes('ORDER_A'), false, 'A branch must not inherit future scene narrative.');
    assert.equal(branchInfo.contents.includes('FAIL_SCENE'), false, 'A branch must not inherit future scene narrative.');

    steps.push('deleting a scene message removes its progress');
    await page.evaluate(async id => { await loadConversation(id); }, boundConversationId);
    await waitIdle();
    const orderBId = await page.evaluate(() => {
        const conv = getActiveConv();
        const scene = conv.messages.find(message => message.content === 'ORDER_B');
        return scene && scene.id;
    });
    assert.ok(orderBId, 'The ordered one-shot scene message must exist before deletion.');
    const wrapper = page.locator(`[data-message-id="${orderBId}"]`);
    await wrapper.locator('[data-action="delete"]').click({ force: true });
    await page.waitForFunction(() => !getActiveConv().messages.some(message => message.content === 'ORDER_B'));
    assert.equal((await sceneState()).progress.some(entry => entry.text === 'ORDER_B'), false);

    steps.push('refresh does not replay opening or scenes');
    const beforeReload = await sceneState();
    const requestCountBeforeReload = requests.length;
    await page.reload();
    await page.waitForFunction(() => typeof getSceneProgress === 'function' && getActiveConv());
    await waitIdle();
    const afterReload = await sceneState();
    assert.equal(afterReload.progress.length, beforeReload.progress.length, 'Refresh must not replay scene events.');
    assert.equal(requests.length, requestCountBeforeReload, 'Refresh must not call the model.');

    steps.push('scene progress and editor screenshots');
    await openScenePanel();
    await page.locator('#sceneManager [data-scene-progress]').click();
    await page.locator('#sceneProgress').waitFor();
    await captureSceneUi('scene-progress', '#sceneProgress');
    await page.locator('#sceneProgress [data-dialog-cancel]').last().click();
    await page.locator('#sceneProgress').waitFor({ state: 'detached' });

    steps.push('import preview and export');
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#sceneManager [data-scene-export]').click();
    const download = await downloadPromise;
    const exportPath = path.join(output, 'exported-scene-packages.json');
    await download.saveAs(exportPath);
    const packageCountBeforeImport = await page.evaluate(() => getScenePackages().length);
    await page.locator('#sceneImportFile').setInputFiles(exportPath);
    await page.locator('#sceneImportPreview').waitFor();
    await page.locator('#sceneImportPreview [type="submit"]').click();
    await page.locator('#sceneImportPreview').waitFor({ state: 'detached' });
    const imported = await page.evaluate(() => {
        const packages = getScenePackages();
        return { count: packages.length, last: packages[packages.length - 1], authorized: isScenePackageAuthorized(packages[packages.length - 1]) };
    });
    assert.equal(imported.count, packageCountBeforeImport + 1);
    assert.equal(imported.last.enabled, false, 'Imported scene packages must stay disabled.');
    assert.equal(imported.authorized, false, 'Imported scene packages must not gain local permission.');
    await closeDialogs();

    assert.deepEqual(errors, [], 'The scene browser flow must not raise page errors.');
    await writeReport(true);
    console.log('Tavern stage C2 browser passed: real manager/package/event UI, conversation binding, content-bound grant, opening lifecycle, ordered repeatable/one-shot events, ACKed MVU, atomic save failure with manager retry, source edit/version restoration, branch boundary, delete invalidation, refresh zero replay, read-only preflight, import/export, screenshots and no page errors.');
} catch (error) {
    evidence.finalState = await page.evaluate(() => ({
        conversationId: getActiveConv() && getActiveConv().id,
        messages: getActiveConv() && getActiveConv().messages,
        progress: getSceneProgress(getActiveConv()),
        failure: getSceneFailure(getActiveConv().id),
        runs: getSceneRecentRuns()
    })).catch(() => null);
    await capture('failed-state').catch(() => {});
    await writeReport(false, { error: error.message, stack: error.stack });
    throw error;
} finally {
    await browser.close();
}
