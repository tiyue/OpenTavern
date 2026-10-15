import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const modulePath = process.env.OPENTAVERN_PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = await import(path.isAbsolute(modulePath) ? pathToFileURL(modulePath).href : modulePath);
const url = process.env.OPENTAVERN_TEST_URL || 'http://127.0.0.1:8765/.sites-public/opentavern.html';
const output = await mkdtemp(path.join(os.tmpdir(), 'opentavern-m5-'));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const errors = [], requests = [];
let fail = false, delay = false, release;
page.on('pageerror', error => errors.push(error.message));
page.on('dialog', dialog => dialog.dismiss());
await context.route('**/*', async route => {
    const target = new URL(route.request().url());
    if (target.pathname.endsWith('/assets/js/app.js')) {
        const response = await route.fetch(), bundle = await response.text(), end = bundle.lastIndexOf('})();');
        const probe = 'Object.assign(window, { state, appStore, getActiveConv, normalizeConversation, persistState, applyUiTheme, requestFullRender, switchView, updateInputState, loadConversation, openSettings, buildAppDataSnapshot, applyReadingAppearance, StorageService, toggleMessageFavorite, applyCloudSyncSnapshot, getCloudSyncPortableSettings });\nObject.defineProperty(window, "draft", {get:()=>settingsFormDraft});\nconst oldPersist=persistState; window.saveCalls=0; persistState=function(...args){window.saveCalls++; return oldPersist(...args);};\n';
        return route.fulfill({ response, body: bundle.slice(0, end) + probe + bundle.slice(end) });
    }
    if (target.pathname.startsWith('/__mock_model')) {
        requests.push(target.pathname.endsWith('/models') ? { models: true } : route.request().postDataJSON());
        if (delay) await new Promise(resolve => { release = resolve; });
        return route.fulfill({ status: fail ? 500 : 200, json: fail ? { error: { message: 'failure' } } : target.pathname.endsWith('/models') ? { data: [{ id: 'discovered' }] } : { choices: [{ message: { content: '<think>隐藏思考</think>用户生成草稿' } }] } });
    }
    if (target.origin !== new URL(url).origin) return route.abort();
    return route.continue();
});
await page.addInitScript(() => { localStorage.setItem('opentavern_onboarding_completed_v1', '1'); localStorage.setItem('opentavern_announce_dismissed_v1', '1'); });
try {
    await page.goto(url); await page.waitForFunction(() => typeof persistState === 'function' && getActiveConv());
    await page.evaluate(async endpoint => {
        Object.assign(state.settings, { apiEndpoint: endpoint, apiKey: 'mock', saveApiKey: true, model: 'mock', summaryEnabled: false, streamEnabled: false, twoStageEnabled: false, systemPrompt: '已保存提示词', readingWidth: 'medium', readingFontSize: 'default', restoreLastChat: false });
        const conv = getActiveConv(); conv.character = { name: 'Alice', description: '聊天对方', extensions: {} }; conv.messages = [{ id: 'reply', role: 'assistant', content: '下一站去哪？' }]; normalizeConversation(conv);
        state.conversations.other = { id: 'other', title: '另一会话', character: { name: 'Bob' }, messages: [], summaries: [] }; normalizeConversation(state.conversations.other); state.conversationOrder.push('other');
        await persistState(true); requestFullRender(); switchView('chat'); updateInputState();
    }, new URL('/__mock_model/chat/completions', url).href);
    const id = await page.evaluate(() => state.activeConvId);
    const input = page.locator('#messageInput');
    await input.fill('原草稿'); await page.locator('#userDraftBtn').click();
    await page.waitForFunction(() => document.getElementById('messageInput').value === '用户生成草稿');
    assert.equal(await page.evaluate(() => getActiveConv().messages.length), 1);
    assert.equal(await page.evaluate(() => state.isGenerating), false);
    assert.equal(requests.at(-1).stream, false);
    assert.equal(JSON.parse(requests.at(-1).messages.at(-1).content).draft, '原草稿');
    await input.fill('保留输入'); fail = true; await page.locator('#userDraftBtn').click();
    await page.waitForFunction(() => document.getElementById('userDraftBtn').textContent === '代写');
    assert.equal(await input.inputValue(), '保留输入'); fail = false;
    if (await page.locator('#appDialogOkBtn').isVisible()) await page.locator('#appDialogOkBtn').click();
    delay = true;
    for (const change of ['edit-back', 'switch-back', 'cancel', 'generation']) {
        await input.fill('保留输入'); const before = requests.length; await page.locator('#userDraftBtn').click();
        await page.waitForFunction(() => document.getElementById('userDraftBtn').textContent === '取消');
        while (requests.length === before) await page.waitForTimeout(10);
        if (change === 'edit-back') { await input.fill('新输入'); await input.fill('保留输入'); }
        if (change === 'switch-back') { await page.evaluate(async original => { await loadConversation('other'); await loadConversation(original); }, id); }
        if (change === 'cancel') await page.locator('#userDraftBtn').click();
        if (change === 'generation') await page.evaluate(() => { state.isGenerating = true; appStore.notify('isGenerating'); state.isGenerating = false; appStore.notify('isGenerating'); });
        release(); await page.waitForTimeout(100); assert.equal(await input.inputValue(), '保留输入');
    }
    delay = false;
    await page.locator('#topSettingsBtn').click();
    await page.locator('#apiKey').fill('draft-key');
    await page.locator('#settingsTabPrompts').click(); await page.locator('#systemPrompt').fill('未提交提示词');
    await page.locator('#fillRoleplayPromptBtn').click();
    await page.locator('#settingsTabSummary').click(); await page.locator('#summaryEnabled').check({ force: true }); await page.locator('#summaryMaxWords').fill('123');
    assert.equal(await page.evaluate(() => state.settings.summaryEnabled), false);
    assert.equal(await page.evaluate(() => buildAppDataSnapshot().settings.systemPrompt), '已保存提示词');
    await page.locator('#settingsTabWorkspace').click();
    const cachedTheme = await page.evaluate(() => localStorage.getItem('opentavern-ui-theme'));
    await page.locator('#uiTheme').selectOption('taoxin'); await page.locator('#readingWidth').selectOption('narrow'); await page.locator('#readingFontSize').selectOption('18');
    assert.equal(await page.evaluate(() => localStorage.getItem('opentavern-ui-theme')), cachedTheme);
    assert.equal(await page.evaluate(() => document.body.classList.contains('theme-taoxin')), true);
    const beforeDiscard = await page.evaluate(() => saveCalls);
    await page.locator('#settingsDiscardBtn').click();
    assert.equal(await page.evaluate(() => saveCalls), beforeDiscard); assert.equal(await page.evaluate(() => state.settings.apiKey), 'mock'); assert.equal(await page.evaluate(() => state.settings.readingWidth), 'medium');
    assert.equal(await page.evaluate(() => document.body.classList.contains('theme-taoxin')), false);
    await page.locator('#topSettingsBtn').click();
    await page.locator('#settingsTabPrompts').click();
    await page.locator('#defaultAuthorNoteSettings').click(); await page.keyboard.press('Escape');
    assert.equal(await page.locator('#settingsModal').isVisible(), true);
    await page.locator('#userPersonaNewBtn').click(); const personaCount = await page.evaluate(() => state.settings.userPersonas.length);
    await page.locator('#settingsDiscardBtn').click(); assert.equal(await page.evaluate(() => state.settings.userPersonas.length), personaCount);
    await page.locator('#topSettingsBtn').click(); await page.locator('#settingsTabSummary').click(); await page.locator('#summaryTemperature').fill('999');
    const invalidBefore = await page.evaluate(() => saveCalls); await page.locator('#settingsDoneBtn').click();
    assert.equal(await page.evaluate(() => saveCalls), invalidBefore); assert.equal(await page.locator('#settingsModal').isVisible(), true); assert.equal(await page.locator('#settingsDraftError').isVisible(), true);
    await page.locator('#summaryTemperature').fill('0'); await page.locator('#settingsTabModel').click();
    await page.locator('#temperature').evaluate(element => { element.value = '0'; element.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.locator('#topP').evaluate(element => { element.value = '0'; element.dispatchEvent(new Event('input', { bubbles: true })); });
    const beforeDone = await page.evaluate(() => saveCalls); await page.locator('#settingsDoneBtn').click();
    assert.equal(await page.evaluate(() => saveCalls), beforeDone + 1);
    assert.equal(await page.evaluate(() => state.settings.temperature), 0); assert.equal(await page.evaluate(() => state.settings.topP), 0); assert.equal(await page.evaluate(() => state.settings.summaryTemperature), 0);
    await page.locator('#topSettingsBtn').click(); delay = true; const beforeModels = requests.length; await page.locator('#apiConnectBtn').click();
    while (requests.length === beforeModels) await page.waitForTimeout(10);
    const beforeLate = await page.evaluate(() => saveCalls); await page.locator('#settingsDiscardBtn').click(); release(); await page.waitForTimeout(100); delay = false;
    assert.equal(await page.evaluate(() => saveCalls), beforeLate); assert.deepEqual(await page.evaluate(() => state.settings.apiModelCatalog), []);
    await page.locator('#topSettingsBtn').click(); await page.locator('#settingsTabWorkspace').click();
    await page.locator('#chatBackgroundFile').setInputFiles({ name: 'too-big.png', mimeType: 'image/png', buffer: Buffer.alloc(2 * 1024 * 1024 + 1) });
    await page.waitForFunction(() => document.getElementById('chatBackgroundStatus').textContent.includes('2 MiB'));
    assert.equal(await page.evaluate(() => draft.chatBackground), '');
    await page.locator('#chatBackgroundFile').setInputFiles({ name: 'fake.png', mimeType: 'image/png', buffer: Buffer.from('<svg onload="attack()"/>') });
    await page.waitForFunction(() => document.getElementById('chatBackgroundStatus').textContent.includes('不符'));
    const imageData = await page.evaluate(() => { const canvas = document.createElement('canvas'); canvas.width = canvas.height = 4; canvas.getContext('2d').fillRect(0, 0, 4, 4); return canvas.toDataURL().split(',')[1]; });
    await page.locator('#chatBackgroundFile').setInputFiles({ name: 'safe.png', mimeType: 'image/png', buffer: Buffer.from(imageData, 'base64') });
    await page.waitForFunction(() => draft.chatBackground.startsWith('data:image/png;'));
    await page.locator('#chatBackgroundClear').click(); assert.equal(await page.evaluate(() => draft.chatBackground), '');
    for (const width of [390, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        for (const theme of ['new-light', 'new-dark', 'taoxin']) {
            await page.locator('#uiTheme').selectOption(theme);
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
            await page.screenshot({ path: path.join(output, `settings-${width}-${theme}.png`), animations: 'disabled' });
        }
    }
    await page.locator('#uiTheme').selectOption('system'); await page.locator('#restoreLastChat').check(); await page.locator('#settingsDoneBtn').click();
    await page.emulateMedia({ colorScheme: 'dark' }); await page.waitForFunction(() => document.body.classList.contains('theme-new-dark'));
    await page.emulateMedia({ colorScheme: 'light' }); await page.waitForFunction(() => document.body.classList.contains('theme-new-light'));
    await page.evaluate(() => persistState(true)); await page.reload(); await page.waitForFunction(() => typeof state !== 'undefined' && getActiveConv());
    assert.equal(await page.locator('#chatView').isVisible(), true); assert.equal(await page.evaluate(() => state.activeConvId), id);
    // Exercise the real file-import entry, preview, failed write and durable ACK.
    const backup = { type: 'opentavern-full-export', version: 3, conversations: [{ id, title: '恢复副本', messages: [{ id: 'restored-message', role: 'assistant', content: '备份正文' }], summaries: [], favoriteMessageIds: ['restored-message'] }], conversationOrder: [id], activeConvId: id,
        characters: { imported: { name: 'Imported' } }, worldBooks: { imported: { id: 'imported', name: 'Imported', entries: {} } },
        settings: { systemPrompt: '恢复后的提示词', apiKey: 'must-not-import', presetLibrary: [{ id: 'backup-preset', name: '备份预设', prompts: [], promptOrder: [], regexScripts: [] }], activePresetId: 'backup-preset', globalRegexScripts: [], globalRegexEnabled: false } };
    const file = data => ({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
    await page.locator('#topSettingsBtn').click(); await page.locator('#settingsTabWorkspace').click();
    const original = await page.evaluate(() => JSON.stringify(state.conversations));
    await page.locator('#convImportFile').setInputFiles(file({ ...backup, conversations: [...backup.conversations, null] }));
    await page.locator('#backupRestoreDialog').waitFor(); assert.equal(await page.locator('#backupRestoreDialog [type="submit"]').isDisabled(), true);
    assert.equal(await page.evaluate(() => JSON.stringify(state.conversations)), original);
    await page.locator('#backupRestoreDialog [data-dialog-cancel]').last().click();
    await page.locator('#convImportFile').setInputFiles(file(backup)); await page.locator('#backupRestoreDialog').waitFor();
    assert.equal(await page.locator('[data-restore-section]').count(), 6);
    for (const width of [390, 1280]) for (const theme of ['new-light', 'new-dark']) {
        await page.setViewportSize({ width, height: 900 }); await page.evaluate(theme => applyUiTheme(theme, { cache: false }), theme);
        await page.screenshot({ path: path.join(output, `restore-${width}-${theme}.png`), animations: 'disabled' });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    }
    for (const name of ['characters', 'worldBooks', 'settings', 'presets', 'regex']) await page.locator(`[data-restore-section="${name}"]`).uncheck();
    await page.evaluate(() => { window.oldSaveAll = StorageService.saveAll.bind(StorageService); StorageService.saveAll = async (...args) => { if (window.restoreFail) throw new Error('quota-test'); const result = await window.oldSaveAll(...args); if (window.restoreHold) { window.restoreReady = true; await new Promise(resolve => window.releaseRestore = resolve); } return result; }; window.restoreFail = true; });
    await page.locator('#backupRestoreDialog [type="submit"]').click(); await page.waitForFunction(() => document.querySelector('#backupRestoreDialog .feature-error').textContent.includes('quota-test'));
    assert.equal(await page.evaluate(() => JSON.stringify(state.conversations)), original);
    await page.evaluate(() => { window.restoreFail = false; window.restoreHold = true; });
    await page.locator('#backupRestoreDialog [type="submit"]').click(); await page.waitForFunction(() => window.restoreReady);
    await page.keyboard.press('Escape'); assert.equal(await page.locator('#backupRestoreDialog').isVisible(), true); assert.equal(await page.locator('#backupRestoreDialog [data-dialog-cancel]').last().isDisabled(), true);
    await page.evaluate(() => { state.conversations.concurrent = { id: 'concurrent', title: '保存期间新聊天', character: { name: 'Concurrent' }, messages: [], summaries: [] }; normalizeConversation(state.conversations.concurrent); state.conversationOrder.unshift('concurrent'); state.activeConvId = 'concurrent'; window.laterSave = persistState(true); window.restoreHold = false; window.releaseRestore(); });
    await page.locator('#backupRestoreDialog').waitFor({ state: 'detached' }); await page.evaluate(() => window.laterSave);
    const restored = await page.evaluate(() => Object.values(state.conversations).find(conv => conv.title === '恢复副本'));
    assert.notEqual(restored.id, id); assert.deepEqual(restored.favoriteMessageIds, ['restored-message']);
    assert.equal(await page.evaluate(() => state.activeConvId), 'concurrent'); assert.equal(await page.evaluate(() => !!state.characters.imported), false); assert.equal(await page.evaluate(() => !!state.worldBooks.imported), false);
    assert.notEqual(await page.evaluate(() => state.settings.apiKey), 'must-not-import'); assert.equal(await page.evaluate(() => !!draft), true);
    const durable = await page.evaluate(async () => { const saved = await StorageService.loadAll(); return { ids: Object.keys(saved.conversations), active: saved.activeConvId }; });
    assert.equal(durable.ids.includes(restored.id), true); assert.equal(durable.ids.includes('concurrent'), true); assert.equal(durable.active, 'concurrent');
    // Restoring ordinary settings explicitly discards the old form on successful ACK.
    await page.locator('#convImportFile').setInputFiles(file(backup)); await page.locator('#backupRestoreDialog').waitFor();
    for (const name of ['conversations', 'characters', 'worldBooks', 'presets', 'regex']) await page.locator(`[data-restore-section="${name}"]`).uncheck();
    await page.locator('#backupRestoreDialog [type="submit"]').click(); await page.locator('#backupRestoreDialog').waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => state.settings.systemPrompt), '恢复后的提示词'); assert.equal(await page.evaluate(() => draft), null); assert.equal(await page.locator('#settingsModal').isVisible(), false);
    await page.evaluate(() => { StorageService.saveAll = window.oldSaveAll; });
    await page.locator('#convImportFile').setInputFiles(file({ type: 'opentavern-export', version: 1, conversations: [{ id: '__proto__', title: '特殊 ID 会话', messages: [{ id: 'constructor', role: 'user', content: '保留特殊 ID' }], summaries: [] }] }));
    await page.locator('#backupRestoreDialog').waitFor(); await page.locator('#backupRestoreDialog [type="submit"]').click(); await page.locator('#backupRestoreDialog').waitFor({ state: 'detached' });
    await page.evaluate(() => toggleMessageFavorite(state.conversations.__proto__, 'constructor'));
    const specialSaved = await page.evaluate(async () => (await StorageService.loadAll()).conversations.__proto__);
    assert.equal(specialSaved.id, '__proto__'); assert.deepEqual(specialSaved.favoriteMessageIds, ['constructor']);
    await page.evaluate(async () => {
        const endpoint = state.settings.apiEndpoint, key = state.settings.apiKey;
        const snapshot = buildAppDataSnapshot();
        Object.assign(snapshot.settings, { apiKey: 'remote-test-key', apiEndpoint: 'https://remote.invalid/v1', futureAccessToken: 'remote-test-token', cardRuntime: { enabled: true }, cardRuntimeEnabled: true, cardRuntimeGrants: ['remote'], cardRuntimePermissions: ['network'] });
        state.settings.futureToken = 'local-test-token';
        applyCloudSyncSnapshot(snapshot); await persistState(true);
        const stored = await StorageService.loadAll();
        for (const settings of [state.settings, stored.settings]) {
            for (const field of ['futureAccessToken', 'cardRuntime', 'cardRuntimeEnabled', 'cardRuntimeGrants', 'cardRuntimePermissions']) if (settings[field] !== undefined) throw new Error('Cloud adopted device-only field: ' + field);
            if (settings.apiEndpoint !== endpoint || settings.apiKey !== key || settings.futureToken !== 'local-test-token') throw new Error('Cloud lost local credentials or endpoint pair.');
        }
        if (getCloudSyncPortableSettings(state.settings).futureToken !== undefined) throw new Error('Outgoing settings leaked local token.');
    });
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ passed: true, screenshots: output, requests: requests.length }));
} finally { if (release) release(); await context.close(); await browser.close(); }
