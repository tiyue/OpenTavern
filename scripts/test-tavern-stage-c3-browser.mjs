import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAIAAAABQCAYAAADRAH3kAAACNUlEQVR4AeyUwW0DMQwEDy4pPaSZPFOBK0hPaSAtJbiHPgIUkhL94HIMCIc7kQR3d+DH98f7L6evB4+LX2sHAKB1/NcFAADQ3IHm8vkHAIDmDjSXzz9AUwCGbBOAt8/nFTljsPcZmX3XeueOursnckaf9xmZfdd65466uydyRp/3aQLgHURdTQcAoGZuaVsDQJqVNQcBQM3c0rYGgDQraw4CgJq5pW0NAGlW1hg0bwkAsyPN3gGgWeCzXACYHWn2DgDNAp/lAsDsSLN3AGgW+CwXAGZHmr0DQJPAVzIBYOVMk+8A0CTolUwAWDnT5DsANAl6JRMAVs40+Q4ATYJeyQSAlTNNvgOAeNCWPACwHBK/BwDxgC15AGA5JH4PAOIBW/IAwHJI/B4AxAO25AGA5ZD4PQCIBuyVBQBep0TrAEA0WK8sAPA6JVoHAKLBemUBgNcp0ToAEA3WKwsAvE6J1gGAWLBROQAQdUysHgDEAo3KAYCoY2L1ACAWaFQOAEQdE6sHALFAo3IAIOqYWD0AiAS6KwMAdp0T6QMAkSB3ZQDArnMifQAgEuSuDADYdU6kDwBEgtyVAQC7zon0AUDxIE/XB4BTB4v3A0DxAE/XB4BTB4v3A0DxAE/XB4BTB4v3A0DxAE/XB4BTB4v3A0DRALPWNgH4+XpekRNdLDL7rmX+/3lE/TEBiA6kvpYDAFArr/RtASDd0loDAaBWXunbAkC6pbUGAkCtvNK3BYB0S187MHv6HwAAAP//6uBn/wAAAAZJREFUAwDNRuwwkkAgiwAAAABJRU5ErkJggg==';
const modulePath = process.env.OPENTAVERN_PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = await import(path.isAbsolute(modulePath) ? pathToFileURL(modulePath).href : modulePath);
const url = process.env.OPENTAVERN_TEST_URL || 'http://127.0.0.1:8765/.sites-public/opentavern.html';
const requestedOutput = process.env.OPENTAVERN_TEST_OUTPUT || process.env.OPENTAVERN_OUTPUT;
const output = requestedOutput ? path.resolve(requestedOutput) : await mkdtemp(path.join(os.tmpdir(), 'opentavern-stage-c3-'));
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
async function captureModuleUi(name, selector) {
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
    for (const id of ['contentModuleDetail', 'contentModuleBindingEditor', 'contentModuleCreate', 'contentModuleImportPreview', 'contentModuleAssembly', 'contentModuleManager']) {
        const dialog = page.locator('#' + id);
        if (await dialog.count()) await dialog.locator('[data-dialog-cancel]').last().click({ force: true }).catch(() => {});
    }
    if (await page.locator('#settingsModal').isVisible()) await page.locator('#settingsDoneBtn').click();
}
async function openModulePanel() {
    await page.locator('#topSettingsBtn').click();
    await page.locator('#settingsTabExtensions').click();
    await page.locator('#contentModuleManageBtn').click();
    await page.locator('#contentModuleManager').waitFor();
}
async function grantFirstModule() {
    const grant = page.locator('#contentModuleManager [data-content-module-grant]').first();
    if (await grant.count()) {
        await grant.click();
        await page.locator('#contentModuleManager').waitFor();
        await page.waitForFunction(() => getContentModules().some(module => isContentModuleAuthorized(module)));
    }
}
async function bindModule(scope, targetId) {
    await page.locator('#contentModuleManager [data-content-module-bind]').first().click();
    await page.locator('#contentModuleBindingEditor').waitFor();
    await page.locator('#contentModuleBindingScope').selectOption(scope);
    if (scope !== 'global') await page.locator('#contentModuleBindingTarget').selectOption(targetId);
    await page.locator('#contentModuleBindingEditor [type="submit"]').click();
    await page.locator('#contentModuleBindingEditor').waitFor({ state: 'detached' });
    await page.locator('#contentModuleManager').waitFor();
}
async function submitUpdateFile(file) {
    await page.locator('#contentModuleUpdateFile').setInputFiles(file);
    await page.locator('#contentModuleImportPreview').waitFor();
}
async function submitImportFile(file) {
    await page.locator('#contentModuleImportFile').setInputFiles(file);
    await page.locator('#contentModuleImportPreview').waitFor();
}
async function moduleState() {
    return page.evaluate(() => ({
        modules: getContentModules().map(module => ({
            id: module.id, version: module.version, name: module.name,
            authorized: isContentModuleAuthorized(module), previous: (module.previousVersions || []).length,
            items: contentModuleItemCount(module), assets: (module.assets || []).length
        })),
        bindings: getContentModuleBindings().map(binding => ({ moduleId: binding.moduleId, scope: binding.scope, targetId: binding.targetId, enabled: binding.enabled })),
        disabled: JSON.parse(JSON.stringify(state.settings.contentModuleConversationDisabled || {})),
        effectiveA: getContentModuleEffectiveModules(state.conversations['c3-a']).map(entry => entry.module.id),
        effectiveB: getContentModuleEffectiveModules(state.conversations['c3-b']).map(entry => entry.module.id)
    }));
}

await context.route('**/*', async route => {
    const target = new URL(route.request().url());
    if (target.pathname.endsWith('/assets/js/app.js')) {
        const response = await route.fetch(), bundle = await response.text(), end = bundle.lastIndexOf('})();');
        const probe = `Object.assign(window, { state, appStore, getActiveConv, normalizeConversation, persistState, applyUiTheme, requestFullRender, switchView, updateInputState, loadConversation, newConversation, openSettings, activateSettingsTab, sendMessage,
            getContentModules, getContentModuleById, getContentModuleBindings, getContentModuleEffectiveModules, getContentModuleAssembly, getContentModuleAssemblyStamp,
            getContentModuleWorldBookEntries, getContentModuleRegexScripts, getContentModuleAutomationRules, getContentModuleScenePackages, contentModuleItemCount, contentModuleFingerprint,
            isContentModuleAuthorized, setContentModuleGrant, ensureContentModuleSettings, saveContentModulesChange, exportContentModuleData, importContentModuleData,
            getAutomationRules, getScenePackages, getActivatedWorldInfo, applyRegexScriptsAsync, dispatchAutomationEvent, takeAutomationPromptFragments,
            runSceneDispatchEvent, getSceneProgress, getMvuDataForMessage, getMessageRevision, ensureConversationMvu, buildAllConversationsExportData,
            buildBackupRestorePlan, commitBackupRestorePlan, getCloudSyncPortableSettings, ensureAutomationSettings, setAutomationRuleGrant,
            ensureSceneSettings, setScenePackageGrant });
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
const assetPath = path.join(output, 'pixel.png');
await writeFile(assetPath, Buffer.from(PNG_BASE64, 'base64'));
try {
    await page.goto(url);
    await page.waitForFunction(() => typeof persistState === 'function' && getActiveConv());
    await page.evaluate(async endpoint => {
        Object.assign(state.settings, {
            apiEndpoint: endpoint, apiKey: 'mock', saveApiKey: true, model: 'mock-model', summaryEnabled: false,
            streamEnabled: false, twoStageEnabled: false, restoreLastChat: true, uiTheme: 'new-light',
            globalRegexEnabled: true, globalRegexScripts: [{ findRegex: 'foo', replaceString: 'bar', placement: [2], flags: 'g' }],
            automationRules: [{ id: 'host-rule', revision: 1, name: 'Host rule', enabled: true, event: 'worldbook-activated', scope: 'global', targetId: '', order: 0, conditions: [], actions: [{ id: 'a', type: 'prompt-fragment', text: 'HOST RULE' }] }],
            scenePackages: [{ id: 'host-scene', revision: 1, name: 'Host scene', enabled: true, scope: 'global', targetId: '', order: 0, events: [{ id: 'host-event', revision: 1, name: 'Host event', order: 0, trigger: 'user-message-saved', once: true, conditions: [], text: 'HOST SCENE', mvu: [] }] }]
        });
        ensureAutomationSettings(state.settings);
        setAutomationRuleGrant(state.settings, 'host-rule', 1, false);
        ensureSceneSettings(state.settings);
        setScenePackageGrant(state.settings, 'host-scene', 1, true);
        ensureContentModuleSettings(state.settings);
        state.settings.contentModules = [];
        state.settings.contentModuleBindings = [];
        state.settings.contentModuleConversationDisabled = {};
        state.settings.contentModuleGrants = {};
        const alice = { name: 'Alice', description: 'Alice card' };
        const bob = { name: 'Bob', description: 'Bob card' };
        state.characters.alice = alice;
        state.characters.bob = bob;
        state.worldBooks.host = { id: 'host', name: 'Host Book', entries: { 0: { content: 'HOST ENTRY alpha', key: ['alpha'], uid: 0 } } };
        const makeConv = (id, title, character, messages) => {
            const conv = { id, title, character, messages, summaries: [], worldBookIds: ['host'], created: 1, updated: 1 };
            normalizeConversation(conv);
            return conv;
        };
        state.conversations = {
            'c3-a': makeConv('c3-a', 'C3 A', alice, [{ id: 'a0', role: 'assistant', content: 'alpha' }]),
            'c3-b': makeConv('c3-b', 'C3 B', bob, [{ id: 'b0', role: 'assistant', content: 'alpha' }])
        };
        state.conversationOrder = ['c3-a', 'c3-b'];
        state.activeConvId = 'c3-a';
        await persistState(true);
        requestFullRender(); switchView('chat'); updateInputState();
    }, endpoint);
    await waitIdle();
    const characterHash = await page.evaluate(() => JSON.stringify(state.characters));

    steps.push('create a module from existing world book, regex, rule, scene and a local PNG through the real manager');
    await openModulePanel();
    await page.locator('#contentModuleManager [data-content-module-new]').click();
    await page.locator('#contentModuleCreate').waitFor();
    await page.locator('#contentModuleName').fill('跨角色模块');
    await page.locator('#contentModuleVersion').fill('1.0.0');
    await page.locator('#contentModuleDescription').fill('C3 browser module');
    await page.locator('[data-content-module-worldbook="host"]').check();
    await page.locator('[data-content-module-regex-layer="global"][data-content-module-regex-index="0"]').check();
    await page.locator('[data-content-module-rule="host-rule"]').check();
    await page.locator('[data-content-module-scene="host-scene"]').check();
    await page.locator('#contentModuleAssetFiles').setInputFiles(assetPath);
    await page.locator('#contentModuleCreate [type="submit"]').click();
    await page.locator('#contentModuleCreate').waitFor({ state: 'detached' });
    await page.locator('#contentModuleManager').waitFor();
    let stateA = await moduleState();
    assert.equal(stateA.modules.length, 1);
    assert.equal(stateA.modules[0].assets, 1);
    assert.equal(stateA.modules[0].authorized, false, 'created modules stay unauthorized until the local grant');
    await grantFirstModule();
    stateA = await moduleState();
    assert.equal(stateA.modules[0].authorized, true);
    steps.push('module asset is previewed from saved bytes');
    await page.locator('#contentModuleManager [data-content-module-detail]').first().click();
    await page.locator('#contentModuleDetail').waitFor();
    assert.match(await page.locator('#contentModuleDetail .content-module-asset img').getAttribute('src'), /^data:image\/png;base64,/);
    steps.push('detail asset heading interpolates the count in every language without placeholder leftovers');
    const detailLanguage = await page.evaluate(() => state.settings.lang);
    for (const [lang, expectedAssetsTitle] of [['zh-CN', '1 个素材'], ['zh-TW', '1 個素材'], ['en', '1 assets']]) {
        await page.evaluate(lang => { state.settings.lang = lang; }, lang);
        await page.locator('#contentModuleDetail [data-dialog-cancel]').last().click();
        await page.locator('#contentModuleDetail').waitFor({ state: 'detached' });
        await page.locator('#contentModuleManager [data-content-module-detail]').first().click();
        await page.locator('#contentModuleDetail').waitFor();
        assert.equal((await page.locator('#contentModuleDetail .feature-section-title').last().textContent()).trim(), expectedAssetsTitle, `${lang} detail asset heading must interpolate the count`);
        assert.doesNotMatch(await page.locator('#contentModuleDetail').innerText(), /\{[a-zA-Z_]+\}/, `${lang} detail must not show unreplaced placeholders`);
    }
    await page.evaluate(lang => { state.settings.lang = lang; }, detailLanguage);
    await page.locator('#contentModuleDetail [data-dialog-cancel]').last().click();
    await page.locator('#contentModuleDetail').waitFor({ state: 'detached' });
    await page.locator('#contentModuleManager [data-content-module-detail]').first().click();
    await page.locator('#contentModuleDetail').waitFor();
    await captureModuleUi('c3-module-detail', '#contentModuleDetail');
    await page.locator('#contentModuleDetail [data-dialog-cancel]').last().click();

    steps.push('bind the same module to global, a conversation and a character; dedupe and conversation-level disable inheritance');
    await bindModule('global', '');
    await bindModule('conversation', 'c3-b');
    await bindModule('character', 'bob');
    stateA = await moduleState();
    assert.equal(stateA.effectiveA.length, 1);
    assert.equal(stateA.effectiveB.length, 1, 'the same module in several scopes must assemble once');
    const inherit = page.locator('#contentModuleManager [data-content-module-conv-off]').first();
    await inherit.uncheck();
    await page.waitForFunction(() => getContentModuleEffectiveModules(state.conversations['c3-a']).length === 0);
    stateA = await moduleState();
    assert.equal(stateA.effectiveA.length, 0, 'the active conversation can stop inheriting the module');
    assert.equal(stateA.bindings.length, 3, 'disabling inheritance must not delete other bindings');
    await inherit.check();
    await page.waitForFunction(() => getContentModuleEffectiveModules(state.conversations['c3-a']).length === 1);
    stateA = await moduleState();
    assert.equal(stateA.effectiveA.length, 1);

    steps.push('actual world book, regex, automation and scene effects');
    const effects = await page.evaluate(async () => {
        const conv = state.conversations['c3-a'];
        const world = getActivatedWorldInfo(conv).entries || [];
        const worldText = world.map(entry => entry.content).join('\n');
        state.settings.globalRegexEnabled = false;
        const regexText = await applyRegexScriptsAsync('foo', conv.character, { conv, sourcePlacement: 'AI_OUTPUT', processingPhase: 'prompt' });
        const moduleEntries = getContentModuleWorldBookEntries(conv);
        await dispatchAutomationEvent('worldbook-activated', conv, { worldbookEntries: moduleEntries.map(entry => ({ worldBookId: entry._sourceWorldBookId, uid: entry.uid, automationId: entry.automationId })) });
        const fragments = takeAutomationPromptFragments(conv, {}).map(fragment => fragment.content);
        return { worldText, regexText, fragments,
            activatedModuleEntries: world.filter(entry => entry._moduleId).map(entry => ({ id: entry.uid, content: entry.content })),
            moduleEntries: moduleEntries.map(entry => entry.uid), ruleIds: getContentModuleAutomationRules(conv).map(rule => rule.id) };
    });
    evidence.effects = effects;
    assert.ok(effects.activatedModuleEntries.some(entry => entry.content === 'HOST ENTRY alpha'), 'the selected actual host entry participates as module content in the real activation set');
    assert.equal(effects.regexText, 'bar');
    assert.ok(effects.fragments.includes('HOST RULE'));
    assert.ok(effects.ruleIds.some(id => id.startsWith('cm:')));
    await page.evaluate(() => {
        state.settings.automationRules = state.settings.automationRules.filter(rule => rule.id !== 'host-rule');
        state.settings.scenePackages = state.settings.scenePackages.filter(pkg => pkg.id !== 'host-scene');
        ensureAutomationSettings(state.settings);
        ensureSceneSettings(state.settings);
    });
    await closeDialogs();
    await page.locator('#messageInput').fill('alpha go');
    await page.locator('#sendBtn').click();
    await waitIdle();
    const sceneAfter = await page.evaluate(() => ({ progress: getSceneProgress(state.conversations['c3-a']).map(entry => entry.text), messages: state.conversations['c3-a'].messages.map(message => message.content) }));
    assert.ok(sceneAfter.messages.includes('HOST SCENE'), 'the module scene executes through the real saved-message path');

    steps.push('update preview keeps the old version on failure, then switches after a reliable candidate and can roll back');
    await openModulePanel();
    const download = await Promise.all([page.waitForEvent('download'), page.locator('#contentModuleManager [data-content-module-export]').first().click()]).then(([item]) => item);
    const exportPath = path.join(output, 'module-export.json');
    await download.saveAs(exportPath);
    const exported = JSON.parse(await readFile(exportPath, 'utf8'));
    exported.module.items.scenePackages[0].events[0].text = 'UPDATED SCENE';
    const badUpdate = path.join(output, 'module-bad-update.json');
    await writeFile(badUpdate, JSON.stringify(exported));
    const updateModuleId = (await moduleState()).modules[0].id;
    await page.evaluate(id => { document.querySelector('#contentModuleUpdateFile').dataset.moduleId = id; }, updateModuleId);
    await submitUpdateFile(badUpdate);
    assert.equal(await page.locator('#contentModuleImportAsUpdate').isChecked(), true);
    await page.locator('#contentModuleImportPreview [type="submit"]').click();
    await page.locator('#contentModuleImportPreview .feature-error').waitFor();
    assert.match(await page.locator('#contentModuleImportPreview .feature-error').textContent(), /version|版本/);
    await page.locator('#contentModuleImportPreview [data-dialog-cancel]').last().click();
    assert.equal((await moduleState()).modules[0].version, '1.0.0', 'failed update keeps the old version');
    exported.module.version = '1.0.1';
    const goodUpdate = path.join(output, 'module-good-update.json');
    await writeFile(goodUpdate, JSON.stringify(exported));
    await submitUpdateFile(goodUpdate);
    await page.locator('#contentModuleImportPreview [type="submit"]').click();
    await page.locator('#contentModuleImportPreview').waitFor({ state: 'detached' });
    stateA = await moduleState();
    assert.equal(stateA.modules[0].version, '1.0.1');
    assert.equal(stateA.modules[0].previous, 1);
    assert.equal(stateA.modules[0].authorized, false, 'a new version needs a fresh local grant');
    await grantFirstModule();
    assert.equal((await moduleState()).modules[0].authorized, true);
    await page.locator('#contentModuleManager [data-content-module-rollback]').first().click();
    await page.locator('#featureConfirmDialog [type="submit"]').click();
    await page.locator('#featureConfirmDialog').waitFor({ state: 'detached' });
    stateA = await moduleState();
    assert.equal(stateA.modules[0].version, '1.0.0');
    assert.equal(stateA.modules[0].authorized, true, 'the locally approved old version may be restored');

    steps.push('export/import copy through the same real entry');
    const beforeCopy = await moduleState();
    const originalModule = beforeCopy.modules[0];
    const originalBindings = beforeCopy.bindings;
    const exportAgain = await Promise.all([page.waitForEvent('download'), page.locator('#contentModuleManager [data-content-module-export]').first().click()]).then(([item]) => item);
    const copyPath = path.join(output, 'module-copy.json');
    await exportAgain.saveAs(copyPath);
    await submitImportFile(copyPath);
    if (await page.locator('#contentModuleImportAsUpdate').isChecked()) await page.locator('#contentModuleImportAsUpdate').uncheck();
    await page.locator('#contentModuleImportPreview [type="submit"]').click();
    await page.locator('#contentModuleImportPreview').waitFor({ state: 'detached' });
    stateA = await moduleState();
    assert.equal(stateA.modules.length, 2, 'an exported package re-imports as a distinct copy');
    assert.notEqual(stateA.modules[0].id, stateA.modules[1].id);
    const originalAfterImport = stateA.modules.find(module => module.id === originalModule.id);
    const copiedModule = stateA.modules.find(module => module.id !== originalModule.id);
    assert.ok(originalAfterImport && copiedModule, 'the original module and the imported copy must both be present');
    assert.equal(originalAfterImport.authorized, true, 'the imported copy must not change the original grant');
    assert.equal(copiedModule.authorized, false, 'an imported copy must not inherit the original local grant');
    assert.equal(copiedModule.previous, 0, 'an imported copy must not inherit old version state');
    assert.deepEqual(stateA.bindings, originalBindings, 'an imported copy must not inherit or pollute bindings');

    steps.push('assembly preview, overflow/theme screenshots and outside-click close');
    await page.locator('#contentModuleManager [data-content-module-assembly]').click();
    await page.locator('#contentModuleAssembly').waitFor();
    await captureModuleUi('c3-module-assembly', '#contentModuleAssembly');
    await page.locator('#contentModuleAssembly [data-dialog-cancel]').last().click();
    await captureModuleUi('c3-module-manager', '#contentModuleManager');
    await page.mouse.click(5, 5);
    await page.waitForTimeout(100);
    assert.equal(await page.locator('#contentModuleManager').count(), 0, 'clicking outside must close the manager');

    steps.push('refresh persistence, backup restore and local-only grants');
    await page.reload();
    await page.waitForFunction(() => typeof getContentModules === 'function' && getActiveConv());
    stateA = await moduleState();
    assert.equal(stateA.modules.length, 2);
    assert.equal(stateA.modules[0].authorized, true, 'local grants persist across refresh');
    assert.ok(stateA.bindings.length >= 3, 'bindings persist across refresh');
    const originalAfterReload = stateA.modules.find(module => module.id === originalModule.id);
    const copiedAfterReload = stateA.modules.find(module => module.id === copiedModule.id);
    assert.ok(originalAfterReload && copiedAfterReload, 'the copy keeps its distinct id after refresh');
    assert.equal(originalAfterReload.authorized, true, 'the original grant stays local across refresh');
    assert.equal(copiedAfterReload.authorized, false, 'the imported copy stays unauthorized after refresh');
    assert.deepEqual(stateA.bindings, originalBindings, 'bindings stay attached to the original module after refresh');
    const backupResult = await page.evaluate(async () => {
        const backup = buildAllConversationsExportData(Object.values(state.conversations), new Date().toISOString());
        const portable = getCloudSyncPortableSettings(state.settings);
        const before = { portableModules: (portable.contentModules || []).length, portableGrants: portable.contentModuleGrants };
        await saveContentModulesChange(candidate => { candidate.contentModuleBindings = []; });
        const plan = buildBackupRestorePlan(backup, { settings: true, conversations: true });
        await commitBackupRestorePlan(plan);
        return { before, bindings: getContentModuleBindings().length, modules: getContentModules().length, grants: state.settings.contentModuleGrants };
    });
    assert.equal(backupResult.before.portableModules, 2, 'full export carries module definitions');
    assert.equal(backupResult.before.portableGrants, undefined, 'full export excludes local grants');
    assert.ok(backupResult.bindings >= 3, 'backup restore brings module bindings back');
    assert.ok(Object.keys(backupResult.grants).length >= 1, 'restore keeps device-local grants');

    assert.equal(await page.evaluate(() => JSON.stringify(state.characters)), characterHash, 'module operations must not mutate original character data');
    assert.equal(errors.length, 0, 'no pageerror: ' + errors.join(' | '));
    await writeReport(true, { steps, final: await moduleState() });
    console.log('C3 browser passed: real module manager create/grant/bind/inheritance, worldbook/regex/rule/scene effects, update failure/success/rollback, export/import, refresh, backup restore, themes and screenshots.');
} catch (error) {
    const visibleErrors = await page.locator('dialog[open] .feature-error').allTextContents().catch(() => []);
    await capture('failed-state').catch(() => {});
    await writeReport(false, { steps, visibleErrors, error: error && error.stack || String(error) });
    throw error;
} finally {
    await browser.close();
}
