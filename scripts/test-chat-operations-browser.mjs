import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const modulePath = process.env.OPENTAVERN_PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = await import(path.isAbsolute(modulePath) ? pathToFileURL(modulePath).href : modulePath);
const url = process.env.OPENTAVERN_TEST_URL || 'http://127.0.0.1:8765/.sites-public/opentavern.html';
const output = await mkdtemp(path.join(os.tmpdir(), 'opentavern-m3-'));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const errors = [], requests = [];
let fail = false;
page.on('pageerror', error => errors.push(error.message));
page.on('dialog', dialog => dialog.dismiss());
await context.route('**/*', async route => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.pathname.endsWith('/assets/js/app.js')) {
        const response = await route.fetch(), bundle = await response.text(), end = bundle.lastIndexOf('})();');
        const probe = 'Object.assign(window, { state, getActiveConv, normalizeConversation, persistState, applyUiTheme, requestFullRender, switchView, renderMessagesOnly, getMessageSpeakerCharacter, jumpToConversationMessage, extractCharaFromPng, openCharacterEditor });\n';
        return route.fulfill({ response, body: bundle.slice(0, end) + probe + bundle.slice(end) });
    }
    if (requestUrl.pathname.startsWith('/__mock_model')) {
        requests.push(route.request().postDataJSON());
        return route.fulfill({ status: fail ? 500 : 200, json: fail ? { error: { message: 'failure' } } : { choices: [{ message: { content: '\n续写段落' } }] } });
    }
    if (requestUrl.origin !== new URL(url).origin) return route.abort();
    return route.continue();
});
await page.addInitScript(() => { localStorage.setItem('opentavern_onboarding_completed_v1', '1'); localStorage.setItem('opentavern_announce_dismissed_v1', '1'); });
try {
    await page.goto(url); await page.waitForFunction(() => typeof persistState === 'function' && getActiveConv());
    await page.evaluate(async endpoint => {
        Object.assign(state.settings, { apiEndpoint: endpoint, apiKey: 'mock', model: 'mock', summaryEnabled: false, streamEnabled: false, twoStageEnabled: false });
        const alice = { name: 'Alice', first_mes: '最早的 needle 消息', alternate_greetings: ['另一种开场'], group_only_greetings: ['群聊开场'], extensions: {} }, bob = { name: 'Bob', extensions: {} };
        state.characters = { alice, bob };
        const conv = getActiveConv(); conv.character = alice; conv.title = '长会话定位验收'; conv.group = { members: [{ character: alice, order: 0 }, { character: bob, order: 1 }] };
        conv.messages = Array.from({ length: 320 }, (_, i) => ({ role: i === 0 || i % 2 ? 'assistant' : 'user', content: i === 0 ? alice.first_mes : '历史 ' + i, speaker: i === 0 || i % 2 ? 'Alice' : undefined }));
        conv.messages.push({ id: 'latest', role: 'assistant', content: '待续正文', speaker: 'Alice' }); normalizeConversation(conv);
        state.conversations.other = { id: 'other', title: '另一会话', character: bob, messages: [{ id: 'other-msg', role: 'assistant', content: 'other needle' }], summaries: [] }; normalizeConversation(state.conversations.other);
        state.conversationOrder.push('other'); await persistState(true); requestFullRender(); switchView('chat');
    }, new URL('/__mock_model', url).href);
    await page.locator('#messageSearchEntry').click();
    await page.locator('#messageFindQuery').fill('needle');
    await page.waitForFunction(() => document.querySelector('[data-find-count]').textContent.startsWith('1 '));
    for (const width of [390, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        for (const theme of ['new-light', 'new-dark']) {
            await page.evaluate(value => applyUiTheme(value), theme);
            assert.equal(await page.locator('#messageFinderDialog').evaluate(element => element.scrollWidth <= element.clientWidth), true);
            await page.screenshot({ path: path.join(output, `search-${width}-${theme}.png`), animations: 'disabled' });
        }
    }
    await page.locator('[data-find-result="0"]').click();
    await page.waitForSelector('.message-jump-target');
    const targetId = await page.evaluate(() => getActiveConv().messages[0].id);
    const target = page.locator('[data-message-id="' + targetId + '"]');
    assert.ok((await target.boundingBox()).y >= 0, 'Jump must reveal history outside the initial 150-message window.');
    await target.hover(); await target.locator('[data-action="favorite"]').click();
    await page.waitForFunction(id => getActiveConv().favoriteMessageIds.includes(id), targetId);
    await page.locator('#messageFavoritesEntry').click();
    assert.equal(await page.locator('[data-find-result]').count(), 1);
    await page.locator('#messageFinderDialog [data-dialog-cancel]').first().click();
    await page.evaluate(() => jumpToConversationMessage(getActiveConv().id, 'latest'));
    const latest = page.locator('[data-message-id="latest"]'); await latest.hover();
    fail = true; await latest.locator('[data-action="continue"]').click();
    await page.waitForFunction(() => !state.isGenerating);
    assert.equal(await page.evaluate(() => getActiveConv().messages.at(-1).content), '待续正文');
    await page.locator('#appDialogOkBtn').click();
    fail = false; await latest.hover(); await latest.locator('[data-action="continue"]').click();
    await page.waitForFunction(() => !state.isGenerating && getActiveConv().messages.at(-1).content.includes('续写段落'));
    assert.equal(await page.evaluate(() => getActiveConv().messages.at(-1).content), '待续正文\n续写段落');
    assert.ok(requests.at(-1).messages.some(message => message.content.includes('待续正文')));
    assert.equal(await page.evaluate(() => getActiveConv().messages.filter(message => message.role === 'user' && message.content === '继续').length), 0);
    await page.evaluate(() => jumpToConversationMessage(getActiveConv().id, getActiveConv().messages[0].id));
    await target.hover(); await target.locator('[data-action="greeting"]').click();
    await page.locator('#greetingChoice').selectOption('1');
    await page.locator('#conversationGreetingsDialog button[type="submit"]').click();
    await page.locator('#featureConfirmDialog button[type="submit"]').click();
    await page.waitForSelector('#conversationGreetingsDialog', { state: 'detached' });
    assert.equal(await page.evaluate(() => getActiveConv().messages[0].content), '另一种开场');
    await page.locator('#conversationMembersEntry').click();
    await page.locator('[data-member-remove="0"]').click();
    await page.locator('#conversationMembersDialog button[type="submit"]').click();
    await page.waitForSelector('#conversationMembersDialog', { state: 'detached' });
    assert.equal(await page.evaluate(() => getMessageSpeakerCharacter(getActiveConv().messages[0], getActiveConv()).name), 'Alice');
    assert.equal(await page.evaluate(() => getActiveConv().character.name), 'Bob');
    await page.locator('#charEditBtn').click();
    await page.locator('[data-greetings-kind="alternate_greetings"]').click();
    await page.locator('[data-greetings-add]').click();
    await page.locator('#greetingText0').fill('Bob 的备选开场');
    await page.screenshot({ path: path.join(output, 'greeting-editor-1280-new-dark.png'), animations: 'disabled' });
    await page.locator('#greetingsEditorDialog button[type="submit"]').click();
    await page.locator('#charEditorSaveBtn').click();
    await page.locator('#charExportBtn').click();
    await page.locator('#characterExportFormat').selectOption('png');
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#characterExportDialog button[type="submit"]').click();
    const download = await downloadPromise, bytes = await readFile(await download.path());
    const extracted = await page.evaluate(async data => {
        const bytes = Uint8Array.from(atob(data), character => character.charCodeAt(0)), blob = new Blob([bytes], { type: 'image/png' });
        const image = new Image(), src = URL.createObjectURL(blob); image.src = src; await image.decode(); URL.revokeObjectURL(src);
        return { card: await extractCharaFromPng(blob), width: image.naturalWidth };
    }, bytes.toString('base64'));
    assert.equal(extracted.card.data.name, 'Bob'); assert.ok(extracted.width > 0);
    assert.deepEqual(extracted.card.data.alternate_greetings, ['Bob 的备选开场']);
    await page.locator('#messageSearchEntry').click(); await page.locator('#messageFindScope').selectOption('all'); await page.locator('#messageFindQuery').fill('other needle');
    await page.waitForFunction(() => document.querySelectorAll('[data-find-result]').length === 1);
    await page.locator('[data-find-result="0"]').click();
    await page.waitForFunction(() => state.activeConvId === 'other' && !!document.querySelector('[data-message-id="other-msg"]'));
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ passed: true, screenshots: output, requests: requests.length }));
} finally { await context.close(); await browser.close(); }
