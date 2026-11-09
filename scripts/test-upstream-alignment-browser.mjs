import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { captureBrowserEvidence } from './check-release.mjs';

const modulePath = process.env.OPENTAVERN_PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = await import(path.isAbsolute(modulePath) ? pathToFileURL(modulePath).href : modulePath);
const url = process.env.OPENTAVERN_TEST_URL || 'http://127.0.0.1:8765/.sites-public/opentavern.html';
const output = process.env.OPENTAVERN_TEST_OUTPUT || await mkdtemp(path.join(os.tmpdir(), 'opentavern-upstream-browser-'));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
const page = await context.newPage();
const errors = [], requests = [];
let failModel = false;
page.on('pageerror', error => errors.push(error.message));
page.on('dialog', dialog => dialog.dismiss());
await context.route('**/*', async route => {
    const target = new URL(route.request().url());
    if (target.pathname.endsWith('/assets/js/app.js')) {
        const response = await route.fetch(), bundle = await response.text(), end = bundle.lastIndexOf('})();');
        const probe = `Object.assign(window, { state, appStore, getActiveConv, normalizeConversation, persistState, StorageService, applyUiTheme, requestFullRender, switchView, updateInputState, loadConversation, getComposerDraft, queueStreamDraft, flushStreamDraftWrites, streamDraftStorage, refreshStreamDraftRecoveryNotice, getEffectiveWorldBookIds, getWorldBookDisplayIds, getWorldBookEntryDisplayIds, closeWorldBookModal });\n`;
        return route.fulfill({ response, body: bundle.slice(0, end) + probe + bundle.slice(end) });
    }
    if (target.pathname.startsWith('/__alignment/')) {
        const request = route.request();
        requests.push({ url: target.pathname, headers: request.headers(), body: request.method() === 'POST' ? request.postDataJSON() : null });
        if (failModel) return route.fulfill({ status: 503, json: { type: 'error', error: { message: 'synthetic outage' } } });
        if (target.pathname.endsWith('/models')) return route.fulfill({ json: { data: [{ id: 'alignment-vision', display_name: 'Alignment vision' }] } });
        const text = `已看到图片并保留消息。回复 ${requests.length}`;
        const events = [
            { type: 'message_start', message: { usage: { input_tokens: 12, output_tokens: 0 } } },
            { type: 'content_block_delta', delta: { type: 'text_delta', text } },
            { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 8 } }, { type: 'message_stop' }
        ];
        return route.fulfill({ contentType: 'text/event-stream', body: events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join('') });
    }
    if (target.origin !== new URL(url).origin) return route.abort();
    return route.continue();
});
await page.addInitScript(() => {
    localStorage.setItem('opentavern_onboarding_completed_v1', '1');
    localStorage.setItem('opentavern_announce_dismissed_v1', '1');
});
const ready = async () => { await page.waitForFunction(() => typeof persistState === 'function' && getActiveConv()); };
const dismissAlert = async () => { if (await page.locator('#appDialogOkBtn').isVisible()) await page.locator('#appDialogOkBtn').click(); };
const capturePanel = async name => {
    for (const width of [390, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        for (const theme of ['new-light', 'new-dark']) {
            await page.evaluate(theme => applyUiTheme(theme, { cache: false }), theme);
            if (name === 'preset-controls') await page.locator('#presetLibraryControls').scrollIntoViewIfNeeded();
            if (name === 'worldbooks' && width === 390) assert.ok((await page.locator('#wiEntryList').boundingBox()).height >= 220, 'Mobile book controls need a usable scroll area.');
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, name + ' must fit ' + width);
            await page.screenshot({ path: path.join(output, `${name}-${width}-${theme}.png`), animations: 'disabled' });
        }
    }
    await page.setViewportSize({ width: 1280, height: 900 });
};
try {
    await page.goto(url); await ready();
    await page.evaluate(async endpoint => {
        Object.assign(state.settings, { apiProtocol: 'anthropic', apiEndpoint: endpoint, apiKey: 'synthetic-browser-key', saveApiKey: true, model: 'alignment-vision', summaryEnabled: false, streamEnabled: true, twoStageEnabled: false, restoreLastChat: true, requestCotEnabled: true, systemPrompt: '保持上下文。' });
        const conv = getActiveConv(); conv.title = '主站功能对齐验收'; conv.character = { name: '验收助手', description: '协助验证聊天功能', extensions: {} }; conv.messages = []; conv.summaries = []; normalizeConversation(conv);
        await persistState(true); requestFullRender(); switchView('chat'); updateInputState();
    }, new URL('/__alignment/v1', url).href);
    const originalId = await page.evaluate(() => state.activeConvId);
    await page.locator('#topSettingsBtn').click();
    assert.equal(await page.locator('#apiProtocol').inputValue(), 'anthropic');
    await page.locator('#apiProtocol').selectOption('openai');
    await page.locator('#settingsDiscardBtn').click();
    assert.equal(await page.evaluate(() => state.settings.apiProtocol), 'anthropic');
    const image = { name: 'test.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j8T8AAAAASUVORK5CYII=', 'base64') };
    await page.locator('#composerImageInput').setInputFiles(image);
    await page.waitForFunction(() => getComposerDraft(getActiveConv()).images.length === 1 && !getComposerDraft(getActiveConv()).pending);
    assert.equal(await page.locator('#composerImagePreview img').count(), 1);
    await page.locator('#sendBtn').click();
    await page.waitForFunction(() => getActiveConv().messages.length === 2 && !state.isGenerating);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].headers['x-api-key'], 'synthetic-browser-key');
    assert.equal(requests[0].headers.authorization, undefined);
    assert.equal(requests[0].body.messages.at(-1).content[0].type, 'image');
    assert.equal(await page.evaluate(() => getActiveConv().messages[0].content), '');
    assert.equal(await page.evaluate(() => getActiveConv().messages[1].usage.promptTokens), 12);
    assert.equal(await page.evaluate(() => getActiveConv().messages[1].usage.completionTokens), 8);
    await page.reload(); await ready();
    assert.equal(await page.evaluate(() => getActiveConv().messages[0].attachments[0].source), 'user');
    assert.equal(await page.locator('.msg-wrapper img').count() > 0, true);

    // Text editing, linked versions and branching through the actual message controls.
    await page.locator('#messageInput').fill('第一版问题'); await page.locator('#sendBtn').click();
    await page.waitForFunction(() => getActiveConv().messages.length === 4 && !state.isGenerating);
    await page.locator('[data-action="edit"][data-msg-idx="2"]').click();
    await page.locator('.msg-bubble textarea').fill('第二版问题');
    await capturePanel('user-editor');
    await page.getByRole('button', { name: '仅保存', exact: true }).click();
    await page.waitForFunction(() => getActiveConv().messages[2].content === '第二版问题');
    await page.locator('[data-action="version-history"][data-msg-idx="2"]').click();
    assert.equal(await page.locator('#messageVersionHistoryDialog .feature-row').count(), 2);
    await page.locator('#messageVersionHistoryDialog').getByRole('button', { name: '使用此版本' }).first().click();
    await page.waitForFunction(() => getActiveConv().messages[2].content === '第一版问题');
    await page.locator('#messageInput').fill('后续问题'); await page.locator('#sendBtn').click();
    await page.waitForFunction(() => getActiveConv().messages.length === 6 && !state.isGenerating);
    await page.locator('[data-action="edit"][data-msg-idx="2"]').click();
    await page.locator('.msg-bubble textarea').fill('分支问题');
    await page.getByRole('button', { name: '保存并重新生成', exact: true }).click();
    await page.locator('#featureConfirmDialog [type="submit"]').click();
    await page.waitForFunction(original => state.activeConvId !== original && !state.isGenerating, originalId);
    assert.equal(await page.evaluate(original => state.conversations[original].messages.length, originalId), 6);
    assert.equal(await page.evaluate(() => getActiveConv().messages[2].content), '分支问题');
    assert.equal(await page.evaluate(() => getActiveConv().messages.some(message => message.content === '后续问题')), false);

    // No automatic replay; an explicit retry must keep its source and connection pair.
    failModel = true;
    await page.locator('#messageInput').fill('测试重试'); await page.locator('#sendBtn').click();
    await page.locator('#failedRequestRetryNotice').waitFor(); await dismissAlert();
    const failedCount = requests.length; await page.waitForTimeout(100);
    assert.equal(requests.length, failedCount);
    await page.evaluate(() => { state.settings.model = 'changed-model'; });
    await page.locator('#failedRequestRetryNotice').getByRole('button', { name: '重试上次请求' }).click();
    assert.equal(requests.length, failedCount);
    assert.equal(await page.locator('#failedRequestRetryNotice').getByRole('button', { name: '重试上次请求' }).isDisabled(), true);
    await page.locator('#failedRequestRetryNotice').getByRole('button', { name: '关闭', exact: true }).click();
    await page.evaluate(() => { state.settings.model = 'alignment-vision'; });
    await page.locator('#messageInput').fill('再次测试重试'); await page.locator('#sendBtn').click();
    await page.locator('#failedRequestRetryNotice').waitFor(); await dismissAlert();
    failModel = false;
    const retryBefore = requests.length;
    await page.locator('#failedRequestRetryNotice').getByRole('button', { name: '重试上次请求' }).click();
    await page.waitForFunction(() => !state.isGenerating && getActiveConv().messages.at(-1).role === 'assistant');
    assert.equal(requests.length, retryBefore + 1);

    await page.evaluate(() => { Object.assign(state.settings, { twoStageEnabled: true, twoStageSystemPrompt: 'SECOND_STAGE_ALIGNMENT', maxTokens: 2048, thinking: { type: 'enabled', budget_tokens: 1024 } }); });
    const twoStageBefore = requests.length;
    await page.locator('#messageInput').fill('验证两阶段手动思考预算'); await page.locator('#sendBtn').click();
    await page.waitForFunction(() => !state.isGenerating && getActiveConv().messages.at(-1).stage === 'second');
    assert.equal(requests.length, twoStageBefore + 2);
    assert.equal(requests.at(-1).body.max_tokens, 2048);
    assert.equal(requests.at(-1).body.thinking.budget_tokens, 1024);
    assert.equal(await page.evaluate(async () => (await streamDraftStorage('getAll')).length), 0, 'Both confirmed stages must clear their own recovery records.');
    await page.evaluate(() => { state.settings.twoStageEnabled = false; state.settings.thinking = null; });

    // The separate IndexedDB record survives a real reload and is removed only after ACK.
    await page.evaluate(async () => { queueStreamDraft({ conversation: getActiveConv(), stage: 'main' }, '刷新后保留的未完成回复', '恢复思考'); await flushStreamDraftWrites(); });
    await page.reload(); await ready();
    await page.locator('#streamDraftRecoveryBtn').click();
    await page.locator('#streamDraftRecoveryDialog').getByRole('button', { name: '保存到原会话', exact: true }).click();
    await page.waitForFunction(() => getActiveConv().messages.some(message => message.content === '刷新后保留的未完成回复' && message.interrupted));
    assert.equal(await page.evaluate(async () => (await streamDraftStorage('getAll')).length), 0);
    await page.keyboard.press('Escape');

    // A real storage failure leaves the confirmed preset unchanged and exposes a retryable draft.
    await page.locator('#topSettingsBtn').click(); await page.locator('#settingsTabPrompts').click();
    await page.locator('#managePresetLibrary').click();
    const oldPresetId = await page.evaluate(() => state.settings.activePresetId);
    await page.evaluate(() => { window.originalSaveAll = StorageService.saveAll; StorageService.saveAll = async function() { throw new Error('synthetic quota'); }; });
    await page.locator('#presetLibraryDialog [data-library-action="new"]').click();
    await page.waitForFunction(() => document.querySelector('#presetLibraryDialog .feature-error').textContent.includes('quota'));
    assert.equal(await page.evaluate(() => state.settings.activePresetId), oldPresetId);
    await page.evaluate(() => { StorageService.saveAll = window.originalSaveAll; });
    await page.keyboard.press('Escape');
    await page.locator('#presetDraftRecovery').getByRole('button', { name: '重试保存' }).click();
    await page.waitForFunction(id => state.settings.activePresetId !== id, oldPresetId);
    await page.locator('#presetLibraryControls').getByLabel('合并连续 System 消息').check();
    await page.waitForFunction(() => state.settings.sillyTavernPreset.squashSystemMessages === true);
    await capturePanel('preset-controls');
    await page.locator('#settingsDiscardBtn').click();

    const rows = [{ user_name: '用户', character_name: '导入角色', chat_metadata: { note_prompt: '导入的剧情提示' } }, { is_user: true, mes: 'JSONL 问题' }, { is_user: false, mes: '选中回复', swipes: ['旧回复', '选中回复'], swipe_id: 1, extra: { reasoning: '导入的思考' } }];
    await page.locator('#convImportFile').setInputFiles({ name: 'chat.jsonl', mimeType: 'application/x-ndjson', buffer: Buffer.from(rows.map(row => JSON.stringify(row)).join('\n')) });
    await page.locator('#backupRestoreDialog').waitFor();
    await page.locator('#backupRestoreDialog [type="submit"]').click();
    await page.locator('#backupRestoreDialog').waitFor({ state: 'detached' });
    const imported = await page.evaluate(() => Object.values(state.conversations).find(conv => conv.messages.some(message => message.content === 'JSONL 问题')));
    assert.equal(imported.messages[1].responseVersions.length, 2);
    assert.equal(imported.messages[1].cot, '导入的思考');
    assert.equal(imported.authorNoteOverride.content, '导入的剧情提示');

    const characterCard = { spec: 'chara_card_v3', spec_version: '3.0', data: { name: '世界书往返验收角色', first_mes: '欢迎验证世界书。', character_book: { name: '角色主书', entries: [{ uid: 1, content: '角色主书条目', keys: ['主书'] }] }, extensions: { opentavern: { world_books: [{ name: '角色额外书', entries: [{ uid: 1, content: '角色额外条目', keys: ['额外'] }] }] } } } };
    const cardFile = { name: 'character.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(characterCard)) };
    await page.locator('#importFileInput').setInputFiles(cardFile);
    await page.waitForFunction(() => getActiveConv().character?.name === '世界书往返验收角色' && getActiveConv().character.linkedExtraWorldBookIds?.length === 1);
    const cardBindings = await page.evaluate(() => ({ primary: getActiveConv().character.linkedWorldBookId, extra: getActiveConv().character.linkedExtraWorldBookIds, count: Object.keys(state.worldBooks).length }));
    assert.equal(cardBindings.count, 2);
    const firstCardConvId = await page.evaluate(() => state.activeConvId);
    await page.locator('#importFileInput').setInputFiles(cardFile);
    await page.waitForFunction(id => state.activeConvId !== id && getActiveConv().character?.name === '世界书往返验收角色', firstCardConvId);
    assert.deepEqual(await page.evaluate(() => ({ primary: getActiveConv().character.linkedWorldBookId, extra: getActiveConv().character.linkedExtraWorldBookIds, count: Object.keys(state.worldBooks).length })), cardBindings);

    await page.evaluate(async () => {
        state.worldBooks.alpha = { id: 'alpha', name: '对齐世界书甲', entries: { '1': { uid: 1, key: [], content: '甲内容', comment: '甲条目', order: 100, constant: true }, '2': { uid: 2, key: [], content: '乙内容', comment: '乙条目', order: 50, constant: true } } };
        state.worldBooks.beta = { id: 'beta', name: '对齐世界书乙', entries: { '1': { uid: 1, key: [], content: '独立书内容', order: 100, constant: true } } };
        getActiveConv().worldBookIds = ['alpha']; state.settings.worldBookOrder = ['alpha', 'beta'].concat(Object.keys(state.worldBooks)); await persistState(true); requestFullRender();
    });
    await page.locator('#worldBookBtn').click();
    const beta = page.locator('#worldBookModal .group').filter({ hasText: '对齐世界书乙' }).first();
    await beta.getByRole('button', { name: '用于全局', exact: true }).click();
    await page.waitForFunction(() => state.settings.globalWorldBookIds?.includes('beta'));
    assert.deepEqual(await page.evaluate(() => getEffectiveWorldBookIds(getActiveConv())), ['alpha', 'beta']);
    assert.equal(await page.locator('#wiEntryCount').textContent(), '3');
    await beta.getByRole('button', { name: '上移显示位置', exact: true }).click();
    await page.waitForFunction(() => getWorldBookDisplayIds()[0] === 'beta');
    await capturePanel('worldbooks');
    await page.locator('#worldBookModal').getByText('对齐世界书甲', { exact: true }).click();
    await page.locator('#worldBookModal .group').filter({ hasText: '乙条目' }).getByRole('button', { name: '上移显示位置', exact: true }).click();
    await page.waitForFunction(() => getWorldBookEntryDisplayIds(state.worldBooks.alpha)[0] === '2');
    assert.equal(await page.evaluate(() => state.worldBooks.alpha.entries['2'].order), 50);
    await capturePanel('worldbook-entries');
    await page.evaluate(() => closeWorldBookModal());
    await page.evaluate(async () => { await persistState(true); });
    await page.reload(); await ready();
    assert.equal(await page.evaluate(() => state.settings.globalWorldBookIds.includes('beta')), true);
    assert.equal(await page.evaluate(() => getWorldBookDisplayIds()[0]), 'beta');
    await page.locator('#composerImageInput').setInputFiles(image);
    await page.waitForFunction(() => getComposerDraft(getActiveConv()).images.length === 1);
    const visual = await captureBrowserEvidence(page, output);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ passed: true, screenshots: output, ...visual, requests: requests.length, coverage: ['native-vision-SSE', 'image-only-send/reload', 'user-version/branch', 'guarded-retry', 'IndexedDB-recovery', 'preset-quota/retry', 'JSONL-preview-ACK', 'global-worldbook/order'] }));
} catch (error) {
    await page.screenshot({ path: path.join(output, 'failure.png'), animations: 'disabled' }).catch(() => {});
    console.error('Alignment browser evidence:', output);
    throw error;
} finally { await context.close(); await browser.close(); }
