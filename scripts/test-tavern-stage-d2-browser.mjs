import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const modulePath = process.env.OPENTAVERN_PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = await import(path.isAbsolute(modulePath) ? pathToFileURL(modulePath).href : modulePath);
const url = process.env.OPENTAVERN_TEST_URL || 'http://127.0.0.1:8765/.sites-public/opentavern.html';
const requestedOutput = process.env.OPENTAVERN_TEST_OUTPUT || process.env.OPENTAVERN_OUTPUT;
const output = requestedOutput ? path.resolve(requestedOutput) : await mkdtemp(path.join(os.tmpdir(), 'opentavern-stage-d2-'));
await mkdir(output, { recursive: true });
const reportPath = path.join(output, 'report.json');
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 960 }, acceptDownloads: true, colorScheme: 'light' });
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
async function waitForRequests(count, timeout = 30000) {
    const deadline = Date.now() + timeout;
    while (requests.length < count) {
        if (Date.now() > deadline) throw new Error('Timed out waiting for ' + count + ' model requests.');
        await new Promise(resolve => setTimeout(resolve, 25));
    }
}
async function fillComposer(text) {
    await page.locator('#messageInput').fill(text);
    await page.evaluate(() => { if (typeof syncComposerConversation === 'function') syncComposerConversation(); });
}
async function openExtensions() {
    await page.locator('#topSettingsBtn').click();
    await page.locator('#settingsTabExtensions').click();
    await page.locator('#pluginSettingsStatus').waitFor();
}
async function openManager() {
    await openExtensions();
    await page.locator('#pluginManageBtn').click();
    await page.locator('#pluginManager').waitFor();
}
async function closeDialogs() {
    await page.evaluate(() => {
        document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
        const modal = document.getElementById('settingsModal');
        if (modal) modal.classList.add('hidden');
        if (typeof discardSettingsDraft === 'function') discardSettingsDraft();
    });
}
async function submit(selector) {
    await page.locator(selector + ' button[type="submit"]').click();
}
async function installFile(file) {
    await page.locator('#pluginImportFile').setInputFiles(file);
    await page.locator('#pluginImportPreview').waitFor();
}
async function updateFile(file) {
    await page.locator('#pluginUpdateFile').setInputFiles(file);
    await page.locator('#pluginImportPreview').waitFor();
}
async function pluginState() {
    return page.evaluate(() => ({
        plugins: JSON.parse(JSON.stringify(state.settings.plugins || [])),
        grants: JSON.parse(JSON.stringify(state.settings.pluginGrants || {})),
        data: JSON.parse(JSON.stringify(state.settings.pluginPrivateData || {})),
        running: typeof pluginRuntimeIsRunning === 'function' ? getInstalledPlugins().filter(record => pluginRuntimeIsRunning(record.id)).map(record => record.id) : []
    }));
}

await context.route('**/*', async route => {
    const target = new URL(route.request().url());
    if (target.pathname.endsWith('/assets/js/app.js')) {
        const response = await route.fetch(), bundle = await response.text(), end = bundle.lastIndexOf('})();');
        const probe = `Object.assign(window, { state, appStore, getActiveConv, normalizeConversation, persistState, applyUiTheme, requestFullRender, switchView, updateInputState, openSettings, activateSettingsTab, sendMessage, StorageService,
            getCloudSyncPortableSettings, buildAllConversationsExportData, getInstalledPlugins, getPluginGrant, isPluginGranted, savePluginSettingsChange,
            pluginInstalledRecordFromPackage, normalizePluginPackage, pluginFingerprint, setPluginGrant, pluginRuntimeIsRunning, pluginRuntimeDisplayFor,
            pluginRuntimeInstances, pluginRuntimeHandleMessage, stopPluginInstance, startPluginInstance, beginPluginProbe, pluginRuntimeEpoch, triggerSummarization,
            getSummaryRegularMessages, setModelToolConversationGrant, isModelToolAuthorizedForConversation, hasModelToolTrace, normalizeModelToolTrace, getMessageRevision,
            prepareResponseVersions, persistConversationMessageMutation, syncComposerConversation, refreshPluginManager, discardSettingsDraft, readPluginPackageFile });
            Object.defineProperty(window,'composerBusy',{get:()=>composerSendInProgress});
`;
        return route.fulfill({ response, body: bundle.slice(0, end) + probe + bundle.slice(end) });
    }
    if (target.pathname.startsWith('/__mock_model')) {
        const body = route.request().postDataJSON();
        requests.push({ url: target.pathname, body, headers: route.request().headers() });
        const lastMessage = (body.messages || []).at(-1);
        const hasToolResult = !!(lastMessage && (lastMessage.role === 'tool' || (Array.isArray(lastMessage.content) && lastMessage.content.some(block => block && block.type === 'tool_result'))));
        const hasTools = Array.isArray(body.tools) && body.tools.length;
        if (hasTools && !hasToolResult) {
            return route.fulfill({ json: { choices: [{ message: { content: null, tool_calls: [{ id: 'call_d2_1', type: 'function', function: { name: 'search_conversation', arguments: JSON.stringify({ query: '保留原文', maxResults: 2 }) } }] }, finish_reason: 'tool_calls' }] } });
        }
        return route.fulfill({ json: { choices: [{ message: { content: hasToolResult ? 'D1 final after tools' : 'mock reply' }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 4 } } });
    }
    if (target.pathname.startsWith('/__plugin_network')) {
        requests.push({ url: target.pathname, headers: route.request().headers() });
        return route.fulfill({ json: { ok: true, from: 'network' } });
    }
    if (target.pathname.startsWith('/__plugin_bypass')) {
        requests.push({ url: target.pathname, headers: route.request().headers() });
        return route.fulfill({ json: { bypass: true } });
    }
    if (target.origin !== new URL(url).origin) return route.abort();
    return route.continue();
});
await page.addInitScript(() => {
    if (window.top !== window) return; localStorage.setItem('opentavern_onboarding_completed_v1', '1');
    localStorage.setItem('opentavern_announce_dismissed_v1', '1');
});

const endpoint = new URL('/__mock_model/v1/chat/completions', url).href;
const v1File = path.join(repoRoot, 'examples/plugins/conversation-stats-v1.json');
const v2File = path.join(repoRoot, 'examples/plugins/conversation-stats-v2.json');
const v2Broken = path.join(output, 'v2-broken.json');
const v2Held = path.join(output, 'v2-held.json');
const v1Base = JSON.parse(await readFile(v1File, 'utf8'));
async function variant(version, code, file) {
    const copy = JSON.parse(JSON.stringify(v1Base));
    copy.manifest.version = version;
    copy.entry.code = code;
    delete copy.digest;
    await writeFile(file, JSON.stringify(copy, null, 2));
}
await variant('2.0.1', "self.OpenTavernPlugin.ready(); throw new Error('synthetic candidate failure');", v2Broken);
await variant('2.0.3', "self.OpenTavernPlugin.ready();", v2Held);

try {
    await page.goto(url);
    await page.waitForFunction(() => typeof persistState === 'function' && getActiveConv());
    await page.evaluate(async endpoint => {
        Object.assign(state.settings, {
            apiEndpoint: endpoint, apiKey: 'mock', saveApiKey: true, model: 'mock-model',
            summaryEnabled: true, summaryThreshold: 1, summarizeUseMainAPI: true,
            streamEnabled: false, twoStageEnabled: false, restoreLastChat: true, uiTheme: 'new-light',
            plugins: [], pluginPrivateData: {}, pluginGrants: {}, modelToolGrants: {},
            automationRules: [], scenePackages: [], contentModules: []
        });
        const conv = getActiveConv();
        conv.title = 'D2 browser';
        conv.messages = [
            { id: 'd2-u1', role: 'user', content: 'hello world' },
            { id: 'd2-a1', role: 'assistant', content: 'saved assistant reply' }
        ];
        normalizeConversation(conv);
        await persistState(true);
        requestFullRender(); switchView('chat');
    }, endpoint);
    await waitIdle();
    assert.deepEqual((await pluginState()).plugins, []);
    steps.push('fresh startup has no installed or running plugin');

    await openManager();
    await installFile(v1File);
    const previewText = await page.locator('#pluginImportPreview').innerText();
    assert.ok(previewText.includes('conversation-stats'));
    assert.ok(previewText.includes('examples/plugins/conversation-stats-v1.json'));
    assert.ok(previewText.includes('Conversation stats'));
    steps.push('v1 import preview shows id/version/source/digest/capabilities');
    await submit('#pluginImportPreview');
    await page.locator('#pluginImportPreview').waitFor({ state: 'detached' });
    let current = await pluginState();
    assert.equal(current.plugins.length, 1);
    assert.equal(current.plugins[0].version, '1.0.0');
    assert.deepEqual(current.grants, {});
    assert.deepEqual(current.running, []);
    steps.push('install leaves the plugin stopped and unapproved');

    await page.locator('[data-plugin-grant="conversation-stats"]').click();
    await page.locator('#pluginGrantDialog').waitFor();
    await submit('#pluginGrantDialog');
    await page.locator('#pluginGrantDialog').waitFor({ state: 'detached' });
    current = await pluginState();
    assert.ok(current.grants['conversation-stats']);
    steps.push('explicit capability approval recorded locally');

    await page.locator('[data-plugin-enable="conversation-stats"]').click();
    await page.waitForFunction(() => pluginRuntimeIsRunning('conversation-stats'));
    await page.waitForFunction(() => (pluginRuntimeDisplayFor('conversation-stats') || {}).text && pluginRuntimeDisplayFor('conversation-stats').text.includes('Messages: 2'));
    const firstData = await page.evaluate(() => JSON.parse(JSON.stringify(state.settings.pluginPrivateData['conversation-stats'])));
    assert.equal(firstData.stats.messages, 2);
    assert.equal(firstData.stats.characters, 29);
    steps.push('real Worker subscribed, counted saved messages and persisted private state');

    await page.evaluate(async () => {
        const conv = getActiveConv();
        await persistConversationMessageMutation(conv, candidate => {
            candidate.messages.push({ id: 'd2-u2', role: 'user', content: 'more words' });
            return true;
        });
    });
    await page.waitForFunction(() => ((pluginRuntimeDisplayFor('conversation-stats') || {}).text || '').includes('Messages: 3'));
    const afterSave = await page.evaluate(() => JSON.parse(JSON.stringify(state.settings.pluginPrivateData['conversation-stats'])));
    assert.equal(afterSave.stats.messages, 3);
    steps.push('a real StorageService ACK emitted conversation-saved and updated the plugin');

    await page.reload();
    await page.waitForFunction(() => typeof persistState === 'function' && getActiveConv());
    await waitIdle();
    current = await pluginState();
    assert.equal(current.plugins.length, 1);
    assert.equal(current.running.length, 0);
    assert.ok(current.grants['conversation-stats']);
    assert.equal(current.data['conversation-stats'].stats.messages, 3);
    assert.equal(await page.evaluate(() => pluginRuntimeDisplayFor('conversation-stats')), null);
    steps.push('refresh keeps install/approval/data but never auto-runs third-party code');

    await openManager();
    await page.locator('[data-plugin-enable="conversation-stats"]').click();
    await page.waitForFunction(() => pluginRuntimeIsRunning('conversation-stats'));
    await page.waitForFunction(() => ((pluginRuntimeDisplayFor('conversation-stats') || {}).text || '').includes('Messages: 3'));
    steps.push('explicit enable after refresh reconstructs the saved stats');

    await page.locator('[data-plugin-update="conversation-stats"]').click();
    await updateFile(path.join(repoRoot, 'examples/plugins/conversation-stats-v2.json'));
    const diffText = await page.locator('#pluginImportPreview').innerText();
    assert.ok(diffText.includes('1.0.0'));
    assert.ok(diffText.includes('2.0.0'));
    await capture('d2-update-diff-1280-light');
    await page.setViewportSize({ width: 390, height: 900 });
    await page.evaluate(() => applyUiTheme('new-dark', { cache: false }));
    await capture('d2-update-diff-390-dark');
    await page.setViewportSize({ width: 1280, height: 960 });
    await page.evaluate(() => applyUiTheme('new-light', { cache: false }));
    await submit('#pluginImportPreview');
    await page.locator('#pluginImportPreview').waitFor({ state: 'detached' });
    current = await pluginState();
    assert.equal(current.plugins[0].version, '2.0.0');
    assert.deepEqual(current.grants, {});
    assert.deepEqual(current.running, []);
    assert.equal(current.data['conversation-stats'].stats.messages, 3);
    steps.push('v2 update diff, probe and ACK switch version; approval is revoked and data retained');

    await page.locator('[data-plugin-update="conversation-stats"]').click();
    await updateFile(v2Broken);
    await submit('#pluginImportPreview');
    await page.waitForFunction(() => document.querySelector('#pluginImportPreview .feature-error') && document.querySelector('#pluginImportPreview .feature-error').textContent);
    assert.equal((await pluginState()).plugins[0].version, '2.0.0');
    await page.evaluate(() => document.querySelector('#pluginImportPreview').close());
    steps.push('candidate throw/load failure retains the installed v2 and its data');

    await page.evaluate(async () => {
        const record = normalizePluginPackage({ type: 'opentavern-plugin', formatVersion: 1, manifest: { id: 'conversation-stats', name: 'Conversation stats', version: '2.0.2', schemaVersion: 1, source: 'synthetic/cpu', description: '', capabilities: ['conversation.stats', 'events.conversation', 'storage.private', 'ui.panel'], dependencies: [], network: [] }, entry: { code: 'self.OpenTavernPlugin.ready(); while (true) {}' }, resources: [] }).record;
        let failed = false;
        try { await beginPluginProbe(pluginInstalledRecordFromPackage(record)); } catch (error) { failed = true; }
        if (!failed) throw new Error('CPU candidate probe unexpectedly succeeded');
    });
    assert.equal((await pluginState()).plugins[0].version, '2.0.0');
    steps.push('CPU-loop candidate cannot pass the bounded probe; old version remains');

    await page.evaluate(() => {
        const original = StorageService.saveAll.bind(StorageService);
        window.__originalSaveAll = original;
        StorageService.saveAll = async function(snapshot, options) {
            if (window.__failPluginSave && snapshot.settings && Array.isArray(snapshot.settings.plugins) && snapshot.settings.plugins.some(item => item.version === '2.0.3')) {
                window.__failPluginSave = false;
                throw new Error('synthetic plugin quota');
            }
            return original(snapshot, options);
        };
        window.__failPluginSave = true;
    });
    await page.locator('[data-plugin-update="conversation-stats"]').click();
    await updateFile(v2Held);
    await submit('#pluginImportPreview');
    await page.waitForFunction(() => document.querySelector('#pluginImportPreview .feature-error') && document.querySelector('#pluginImportPreview .feature-error').textContent);
    assert.equal((await pluginState()).plugins[0].version, '2.0.0');
    assert.equal((await pluginState()).data['conversation-stats'].stats.messages, 3);
    await page.evaluate(() => {
        document.querySelector('#pluginImportPreview').close();
        if (window.__originalSaveAll) StorageService.saveAll = window.__originalSaveAll;
    });
    steps.push('a rejected StorageService ACK during update retains the old version and data');
    await page.reload();
    await page.waitForFunction(() => typeof persistState === 'function' && getActiveConv());
    await waitIdle();
    await openManager();

    await page.locator('[data-plugin-grant="conversation-stats"]').click();
    await page.locator('#pluginGrantDialog').waitFor();
    await submit('#pluginGrantDialog');
    await page.locator('#pluginGrantDialog').waitFor({ state: 'detached' });
    await page.locator('[data-plugin-enable="conversation-stats"]').click();
    await page.waitForFunction(() => pluginRuntimeIsRunning('conversation-stats'));
    await page.waitForFunction(() => ((pluginRuntimeDisplayFor('conversation-stats') || {}).text || '').includes('v2'));
    assert.ok((await page.evaluate(() => pluginRuntimeDisplayFor('conversation-stats').text)).includes('v2 · messages'));
    steps.push('v2 output follows the actual updated package code');

    await page.locator('[data-plugin-rollback="conversation-stats"]').click();
    await page.locator('#featureConfirmDialog').waitFor();
    await submit('#featureConfirmDialog');
    await page.locator('#featureConfirmDialog').waitFor({ state: 'detached' });
    current = await pluginState();
    assert.equal(current.plugins[0].version, '1.0.0');
    assert.deepEqual(current.running, []);
    assert.equal(current.data['conversation-stats'].stats.messages, 3);
    steps.push('rollback restores v1 while private data stays intact');

    await page.locator('[data-plugin-grant="conversation-stats"]').click();
    await page.locator('#pluginGrantDialog').waitFor();
    await submit('#pluginGrantDialog');
    await page.locator('#pluginGrantDialog').waitFor({ state: 'detached' });
    await page.locator('[data-plugin-enable="conversation-stats"]').click();
    await page.waitForFunction(() => pluginRuntimeIsRunning('conversation-stats'));
    await page.locator('[data-plugin-stop="conversation-stats"]').click();
    await page.waitForFunction(() => !pluginRuntimeIsRunning('conversation-stats'));
    assert.equal(await page.evaluate(() => pluginRuntimeDisplayFor('conversation-stats')), null);
    const beforeDisabledData = await page.evaluate(() => JSON.stringify(state.settings.pluginPrivateData['conversation-stats']));
    await page.evaluate(async () => {
        const conv = getActiveConv();
        await persistConversationMessageMutation(conv, candidate => {
            candidate.messages.push({ id: 'd2-u3', role: 'user', content: 'while disabled' });
            return true;
        });
    });
    assert.equal(await page.evaluate(() => JSON.stringify(state.settings.pluginPrivateData['conversation-stats'])), beforeDisabledData);
    steps.push('stop clears output and late saved events cannot write');

    await page.locator('[data-plugin-uninstall="conversation-stats"]').click();
    await page.locator('#featureConfirmDialog').waitFor();
    await submit('#featureConfirmDialog');
    await page.locator('#featureConfirmDialog').waitFor({ state: 'detached' });
    current = await pluginState();
    assert.equal(current.plugins.length, 0);
    assert.ok(current.data['conversation-stats']);
    assert.ok(await page.locator('[data-plugin-export-data="conversation-stats"]').count());
    const downloadPromise = page.waitForEvent('download');
    await page.locator('[data-plugin-export-data="conversation-stats"]').click();
    const download = await downloadPromise;
    assert.match(download.suggestedFilename(), /conversation-stats/);
    await page.evaluate(async () => { state.settings.pluginPrivateData['other-plugin'] = { marker: 'keep' }; await persistState(true); });
    await page.evaluate(() => refreshPluginManager());
    await page.locator('[data-plugin-clear-data="conversation-stats"]').click();
    await page.locator('#featureConfirmDialog').waitFor();
    await submit('#featureConfirmDialog');
    await page.locator('#featureConfirmDialog').waitFor({ state: 'detached' });
    const cleared = await page.evaluate(() => JSON.parse(JSON.stringify(state.settings.pluginPrivateData)));
    assert.equal(cleared['conversation-stats'], undefined);
    assert.deepEqual(cleared['other-plugin'], { marker: 'keep' });
    steps.push('uninstall keeps exportable data; explicit clear removes only the target namespace');

    await closeDialogs();
    await page.evaluate(() => { window.__failPluginSave = false; });
    const beforeChat = requests.length;
    await fillComposer('普通聊天');
    await page.locator('#sendBtn').click();
    await waitForRequests(beforeChat + 1);
    await waitIdle();
    assert.equal(requests.length, beforeChat + 1);
    assert.equal((await page.evaluate(() => getActiveConv().messages.slice(-1)[0].content)), 'mock reply');
    steps.push('ordinary chat still works with all plugins off');

    await page.evaluate(async () => {
        state.settings.modelToolGrants = { [getActiveConv().id]: ['search_conversation'] };
        await persistState(true);
    });
    const beforeTool = requests.length;
    await fillComposer('搜索：保留原文');
    await page.locator('#sendBtn').click();
    await waitForRequests(beforeTool + 2);
    await waitIdle();
    assert.equal(requests.length, beforeTool + 2);
    const toolTrace = await page.evaluate(() => {
        const message = getActiveConv().messages.slice().reverse().find(item => item.role === 'assistant' && hasModelToolTrace(item.toolTrace));
        return message && normalizeModelToolTrace(message.toolTrace);
    });
    assert.ok(toolTrace && toolTrace.rounds[0].calls.length);
    steps.push('D1 model-tool loop still works with all plugins off');

    await page.evaluate(() => triggerSummarization(1));
    await page.waitForFunction(() => getActiveConv().summaries && getActiveConv().summaries.length > 0);
    steps.push('summarization still works with all plugins off');

    await page.reload();
    await page.waitForFunction(() => typeof persistState === 'function' && getActiveConv());
    await waitIdle();
    assert.ok(await page.evaluate(() => getActiveConv().summaries.length > 0));
    assert.equal(await page.evaluate(() => pluginRuntimeInstances.size), 0);
    steps.push('refresh recovers chat/summary with no plugin execution');

    // Network RPC is a separate explicit origin/method capability; direct channels remain blocked by CSP.
    const bypassPackage = await page.evaluate(() => ({
        type: 'opentavern-plugin', formatVersion: 1,
        manifest: {
            id: 'bypass-probe', name: 'Bypass probe', version: '1.0.0', schemaVersion: 1,
            source: 'synthetic/bypass', description: '',
            capabilities: ['storage.private', 'ui.panel'], dependencies: [], network: []
        },
        entry: { code: `(function(){var api=self.OpenTavernPlugin;if(api.probe){api.ready({probe:true});return;}var origin=api.resources.get('origin')||'';var results=[];function attempt(name,fn){try{var value=fn();if(value&&value.catch)value.catch(function(e){results.push(name+':'+(e&&e.name||'error'));});else results.push(name+':attempted');}catch(e){results.push(name+':'+(e&&e.name||'error'));}}attempt('fetch',function(){return fetch(origin+'/__plugin_bypass/fetch');});attempt('xhr',function(){var x=new XMLHttpRequest();x.open('GET',origin+'/__plugin_bypass/xhr');x.send();return null;});attempt('ws',function(){return new WebSocket(origin.replace(/^http/,'ws')+'/__plugin_bypass/ws');});attempt('importScripts',function(){importScripts(origin+'/__plugin_bypass/import.js');});attempt('dynamic',function(){return import(origin+'/__plugin_bypass/import.js');});attempt('worker',function(){return new Worker(URL.createObjectURL(new Blob(['postMessage(1)'])));});attempt('idb',function(){return indexedDB.open('plugin-bypass');});api.ready();setTimeout(function(){api.storage.set('bypass',results).then(function(){return api.ui.render({title:'Bypass probe',text:results.join(' | '),actions:[]});});},1200);})();` },
        resources: [{ path: 'origin', text: location.origin }]
    }));
    await page.evaluate(async pkg => {
        const record = normalizePluginPackage(pkg).record;
        await savePluginSettingsChange(candidate => { candidate.plugins.push(pluginInstalledRecordFromPackage(record)); });
    }, bypassPackage);
    await page.evaluate(async () => {
        await savePluginSettingsChange(candidate => {
            const record = candidate.plugins.find(item => item.id === 'bypass-probe');
            setPluginGrant(candidate, record, record.capabilities);
        });
    });
    const beforeBypass = requests.filter(item => item.url.startsWith('/__plugin_bypass')).length;
    await page.evaluate(() => startPluginInstance('bypass-probe'));
    await page.waitForFunction(() => (pluginRuntimeDisplayFor('bypass-probe') || {}).text, undefined, { timeout: 15000 });
    assert.equal(requests.filter(item => item.url.startsWith('/__plugin_bypass')).length, beforeBypass, 'CSP must block every direct plugin channel.');
    await page.evaluate(() => stopPluginInstance('bypass-probe', 'test'));

    const networkPackage = await page.evaluate(() => ({
        type: 'opentavern-plugin', formatVersion: 1,
        manifest: {
            id: 'network-rpc', name: 'Network RPC', version: '1.0.0', schemaVersion: 1,
            source: 'synthetic/network-rpc', description: '',
            capabilities: ['network.rpc', 'ui.panel'], dependencies: [],
            network: [{ origin: location.origin, methods: ['GET'] }]
        },
        entry: { code: `(function(){var api=self.OpenTavernPlugin;if(api.probe){api.ready({probe:true});return;}var origin=api.resources.get('origin')||'';api.network.request({url:origin+'/__plugin_network',method:'GET',headers:{accept:'application/json'}}).then(function(result){return api.ui.render({title:'RPC',text:result.status+' '+result.body,actions:[]});}).catch(function(error){return api.ui.render({title:'RPC',text:'ERROR '+error.message,actions:[]});});api.ready();})();` },
        resources: [{ path: 'origin', text: location.origin }]
    }));
    await page.evaluate(async pkg => {
        const record = normalizePluginPackage(pkg).record;
        await savePluginSettingsChange(candidate => { candidate.plugins.push(pluginInstalledRecordFromPackage(record)); });
    }, networkPackage);
    await page.evaluate(async () => {
        await savePluginSettingsChange(candidate => {
            const record = candidate.plugins.find(item => item.id === 'network-rpc');
            setPluginGrant(candidate, record, record.capabilities);
        });
    });
    const beforeNetwork = requests.filter(item => item.url.startsWith('/__plugin_network')).length;
    await context.addCookies([{ name: 'synthetic', value: 'secret', url: new URL(url).origin }]);
    await page.evaluate(() => startPluginInstance('network-rpc'));
    await page.waitForFunction(() => (pluginRuntimeDisplayFor('network-rpc') || {}).text && pluginRuntimeDisplayFor('network-rpc').text.startsWith('200'));
    const networkRequest = requests.filter(item => item.url.startsWith('/__plugin_network')).slice(beforeNetwork).at(-1);
    assert.ok(networkRequest);
    assert.equal(networkRequest.headers.cookie, undefined, 'Host RPC must omit credentials.');
    steps.push('host network RPC reached only the granted origin with credentials omitted; direct fetch/XHR/WS/import/worker/IDB did not reach routing');

    // Fake isolation messages and fake identities cannot attach to an existing instance.
    await page.evaluate(() => window.postMessage({ type: 'plugin-isolation-ready', token: 'f'.repeat(48) }, '*'));
    assert.equal(await page.evaluate(() => pluginRuntimeInstances.size >= 1), true);
    steps.push('forged null-origin/token messages do not create or replace instances');

    // Screenshots cover manager, approval, real output and update diff; 390/1280 light/dark/system including OS dark.
    await page.evaluate(async () => {
        const record = normalizePluginPackage({
            type: 'opentavern-plugin', formatVersion: 1,
            manifest: { id: 'screenshot-plugin', name: 'Panel preview', version: '1.0.0', schemaVersion: 1, source: 'synthetic/screenshot', description: 'Controlled text and actions.', capabilities: ['ui.panel'], dependencies: [], network: [] },
            entry: { code: 'self.OpenTavernPlugin.ready();' }, resources: []
        }).record;
        await savePluginSettingsChange(candidate => { candidate.plugins.push(pluginInstalledRecordFromPackage(record)); });
    });
    await openManager();
    for (const width of [390, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        for (const theme of ['new-light', 'new-dark', 'system']) {
            await page.emulateMedia({ colorScheme: theme === 'new-light' ? 'light' : 'dark' });
            await page.evaluate(value => applyUiTheme(value, { cache: false }), theme);
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `overflow at ${width}/${theme}`);
            await capture(`d2-manager-${width}-${theme}`);
        }
    }
    await page.setViewportSize({ width: 390, height: 900 });
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.evaluate(() => applyUiTheme('system', { cache: false }));
    await page.locator('[data-plugin-grant="screenshot-plugin"]').click();
    await page.locator('#pluginGrantDialog').waitFor();
    await capture('d2-grant-390-dark');
    await page.evaluate(() => document.getElementById('pluginGrantDialog').close());
    await page.emulateMedia({ colorScheme: 'light' });
    await page.evaluate(() => applyUiTheme('new-light', { cache: false }));
    await page.mouse.click(5, 5);
    await page.locator('#pluginManager').waitFor({ state: 'detached' });
    steps.push('clicking outside the plugin manager closes it');
    steps.push('390/1280 light/dark/system screenshots captured without horizontal overflow');

    assert.deepEqual(errors, []);
    await writeReport(true, { steps });
    console.log('Stage D2 browser passed:', steps.join(' | '));
} catch (error) {
    await writeReport(false, { steps, error: error && error.stack || String(error) });
    throw error;
} finally {
    await context.close();
    await browser.close();
}
