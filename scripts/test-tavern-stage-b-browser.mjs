import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const modulePath = process.env.OPENTAVERN_PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = await import(path.isAbsolute(modulePath) ? pathToFileURL(modulePath).href : modulePath);
const url = process.env.OPENTAVERN_TEST_URL || 'http://127.0.0.1:8765/.sites-public/opentavern.html';
const requestedOutput = process.env.OPENTAVERN_TEST_OUTPUT || process.env.OPENTAVERN_OUTPUT;
const output = requestedOutput ? path.resolve(requestedOutput) : await mkdtemp(path.join(os.tmpdir(), 'opentavern-stage-b-'));
await mkdir(output, { recursive: true });
const reportPath = path.join(output, 'report.json');
const browser = await chromium.launch({ channel: 'chrome', headless: true });

let embeddingMode = 'ok';
let embeddingDimensions = 8;
let embeddingRequests = [];
let chatRequests = [];
const embeddingGates = [];
const pageErrors = [];
const dialogs = [];
const screenshots = [];
const steps = [];

function fakeEmbedding(text, dimensions) {
    const value = String(text || '');
    const vector = new Array(dimensions).fill(0);
    if (/北境|风雪|雪|冬/.test(value)) vector[0] += 1;
    if (/龙|星辰|星/.test(value)) vector[1 % dimensions] += 1;
    if (/旧日|秘密|记忆|守夜/.test(value)) vector[2 % dimensions] += 1;
    if (/资料|设定/.test(value)) vector[3 % dimensions] += 1;
    for (let index = 0; index < value.length; index += 1) {
        vector[(index + 4) % dimensions] += (value.charCodeAt(index) % 17) / 1000;
    }
    const length = Math.sqrt(vector.reduce((sum, item) => sum + item * item, 0)) || 1;
    return vector.map(item => item / length);
}

async function safeFulfill(route, options) {
    try {
        return await route.fulfill(options);
    } catch (error) {
        if (/aborted|already handled|Target closed|ERR_ABORTED/i.test(error.message || '')) return undefined;
        throw error;
    }
}

async function installRoutes(browserContext, page) {
    await page.addInitScript(() => {
        localStorage.setItem('opentavern_onboarding_completed_v1', '1');
        localStorage.setItem('opentavern_announce_dismissed_v1', '1');
    });
    await browserContext.route('**/*', async route => {
        const target = new URL(route.request().url());
        if (target.pathname.endsWith('/assets/js/app.js')) {
            const response = await route.fetch();
            const bundle = await response.text();
            const end = bundle.lastIndexOf('})();');
            const probe = `Object.assign(window, { state, appStore, StorageService, getActiveConv, normalizeConversation, persistState, applyUiTheme, requestFullRender, switchView, updateInputState, loadConversation, openSettings, ensureConnectionProfiles, ensurePresetLibrary, ensureRetrievalSettings, ensureDocumentsState, getActiveConnectionProfile, getConnectionProfileCredential, setConnectionProfileCredential, getRetrievalIndexStatus, clearRetrievalIndexDatabase, getRetrievalReadiness, buildAllConversationsExportData, getConversationExportRecords, normalizeConversationMessageIdentity, writeRetrievalIndexSource, refreshOpenSettingsControlsAfterCloudSyncApply, notifyCloudSyncSnapshotApplied, documentExportMimeType, documentExportFileName });\nObject.defineProperty(window, "recentDiagnostics", {get:()=>recentRequestDiagnostics});\nwindow.__getFormatMessageAsync = function() { return formatMessageAsync; };\nwindow.__setFormatMessageAsync = function(next) { formatMessageAsync = next; };\n`;
            return safeFulfill(route, { response, body: bundle.slice(0, end) + probe + bundle.slice(end) });
        }
        if (target.pathname.startsWith('/__mock_embed/') && target.pathname.endsWith('/embeddings')) {
            if (embeddingMode === 'hang') {
                await new Promise(resolve => embeddingGates.push(resolve));
            }
            const body = route.request().postDataJSON();
            embeddingRequests.push({ url: route.request().url(), headers: route.request().headers(), body });
            if (embeddingMode === 'httpError') {
                return safeFulfill(route, { status: 500, json: { error: { message: 'synthetic embedding failure' } } });
            }
            const inputs = Array.isArray(body.input) ? body.input : [body.input];
            const dimensions = embeddingMode === 'wrongDims' ? 6 : embeddingDimensions;
            const data = inputs.map((text, index) => ({
                index,
                embedding: fakeEmbedding(text, dimensions),
            }));
            if (embeddingMode === 'malformed') data[0].embedding[0] = 'not-a-number';
            return safeFulfill(route, { json: { object: 'list', data } });
        }
        if (target.pathname.startsWith('/__mock_model')) {
            if (target.pathname.endsWith('/models')) return safeFulfill(route, { json: { data: [{ id: 'mock-model' }] } });
            chatRequests.push({ url: route.request().url(), body: route.request().postDataJSON() });
            return safeFulfill(route, { json: { choices: [{ message: { content: '合成模型回复：资料与记忆已参考。' }, finish_reason: 'stop' }], usage: { prompt_tokens: 30, completion_tokens: 8 } } });
        }
        if (target.origin !== new URL(url).origin) return route.abort();
        return route.continue();
    });
}

async function writeReport(passed, extra) {
    await writeFile(reportPath, JSON.stringify(Object.assign({
        url, output, report: reportPath, startedAt: new Date().toISOString(), passed,
        pageErrors, dialogs, screenshots, steps, embeddingRequests: embeddingRequests.length, chatRequests: chatRequests.length,
    }, extra || {}), null, 2));
}

async function capture(page, name) {
    const file = path.join(output, name + '.png');
    await page.screenshot({ path: file, animations: 'disabled' });
    screenshots.push(path.basename(file));
}

async function openSettingsMemory(page) {
    const width = await page.evaluate(() => innerWidth);
    if (width <= 767) {
        const open = await page.evaluate(() => document.getElementById('sidebar').classList.contains('open'));
        if (!open) await page.locator('#hamburgerBtn').click();
        await page.waitForFunction(() => document.getElementById('sidebar').classList.contains('open'));
        await page.locator('#sidebarSettingsBtn').click();
    } else {
        await page.locator('#topSettingsBtn').click();
    }
    await page.locator('#settingsTabSummary').click();
}

async function closeSettings(page) {
    await page.locator('#settingsDoneBtn').click();
}

async function releaseEmbeddingGate() {
    while (embeddingGates.length) embeddingGates.shift()();
}

const context = await browser.newContext({ viewport: { width: 1280, height: 960 }, acceptDownloads: true });
const page = await context.newPage();
page.on('pageerror', error => pageErrors.push(error.message));
page.on('dialog', dialog => { dialogs.push(dialog.message()); dialog.accept(); });
await installRoutes(context, page);

try {
    await page.goto(url);
    await page.waitForFunction(() => typeof persistState === 'function' && getActiveConv());
    const chatEndpoint = new URL('/__mock_model/v1/chat/completions', url).href;
    const embedEndpoint = new URL('/__mock_embed/v1', url).href;
    await page.evaluate(async ({ chatEndpoint, embedEndpoint }) => {
        Object.assign(state.settings, {
            apiEndpoint: chatEndpoint, apiKey: 'mock', saveApiKey: true, model: 'mock-model',
            summaryEnabled: false, streamEnabled: false, twoStageEnabled: false, restoreLastChat: true, uiTheme: 'new-light',
        });
        ensureConnectionProfiles(state.settings);
        ensurePresetLibrary(state.settings);
        const embeddingProfile = {
            id: 'embedding-stage-b', name: 'Mock Embedding', purpose: 'embedding', protocol: 'openai',
            endpoint: embedEndpoint, model: 'mock-embed', description: 'stage B mock',
            parameters: { embeddingDimensions: 8 },
        };
        state.settings.connectionProfiles = state.settings.connectionProfiles.filter(profile => profile.purpose !== 'embedding').concat(embeddingProfile);
        state.settings.activeConnectionProfileIds.embedding = embeddingProfile.id;
        setConnectionProfileCredential(embeddingProfile, 'embedding-key');
        ensureRetrievalSettings(state.settings);
        ensureDocumentsState();
        const alice = { name: 'Alice', description: 'Alice card' };
        state.characters.alice = alice;
        const current = { id: 'c1', title: '当前会话', character: alice, messages: [
            { id: 'u1', role: 'user', content: '我想回忆北境风雪和守夜人的旧日故事。' },
            { id: 'a1', role: 'assistant', content: '旧日记录写下了北境风雪。' },
        ], summaries: [], created: 1, updated: 1 };
        const linked = { id: 'c2', title: '关联记忆', character: alice, messages: [
            { id: 'm1', role: 'user', content: '北境风雪里藏着守夜人的秘密。' },
            { id: 'm2', role: 'assistant', content: '守夜人把秘密写进了旧日记录。' },
        ], summaries: [], created: 2, updated: 2 };
        const unlinked = { id: 'c3', title: '未关联', character: alice, messages: [
            { id: 'x1', role: 'user', content: '未绑定会话的禁忌内容。' },
        ], summaries: [], created: 3, updated: 3 };
        current.memorySourceConversationIds = ['c2'];
        state.conversations = { c1: current, c2: linked, c3: unlinked };
        state.conversationOrder = ['c1', 'c2', 'c3'];
        state.activeConvId = 'c1';
        Object.values(state.conversations).forEach(normalizeConversation);
        await persistState(true);
        requestFullRender();
        switchView('chat');
        updateInputState();
    }, { chatEndpoint, embedEndpoint });

    steps.push('retrieval settings draft, discard, invalid input and completion');
    await openSettingsMemory(page);
    assert.ok((await page.locator('#retrievalEmbeddingProfileStatus').textContent()).includes('mock-embed'));
    assert.equal(await page.evaluate(() => state.settings.retrieval.memoryEnabled), false);
    await page.locator('#retrievalMemoryEnabled').check();
    await page.locator('#retrievalDocumentsEnabled').check();
    assert.equal(await page.evaluate(() => state.settings.retrieval.memoryEnabled), false, 'Editing retrieval settings must not change committed settings before Done.');
    await page.locator('#settingsDiscardBtn').click();
    assert.equal(await page.evaluate(() => state.settings.retrieval.memoryEnabled), false, 'Discard must not save retrieval settings.');
    await openSettingsMemory(page);
    await page.locator('#retrievalMemoryEnabled').check();
    await page.locator('#retrievalDocumentsEnabled').check();
    await page.locator('#retrievalTopK').fill('0');
    await page.locator('#settingsDoneBtn').click();
    await page.waitForFunction(() => {
        const error = document.getElementById('settingsDraftError');
        return error && !error.hidden && /数值|范围|片段|range|invalid/i.test(error.textContent || '');
    });
    assert.equal(await page.evaluate(() => state.settings.retrieval.memoryEnabled), false, 'Invalid retrieval input must not commit settings.');
    assert.equal(await page.evaluate(() => document.getElementById('settingsModal').classList.contains('hidden')), false, 'Invalid retrieval input must keep the settings dialog open.');
    await page.locator('#retrievalTopK').fill('6');
    await page.locator('#settingsDiscardBtn').click();
    assert.equal(await page.evaluate(() => state.settings.retrieval.memoryEnabled), false, 'Discard after invalid input must keep committed settings unchanged.');
    await openSettingsMemory(page);
    await page.locator('#retrievalMemoryEnabled').check();
    await page.locator('#retrievalDocumentsEnabled').check();
    await page.locator('#settingsDoneBtn').click();
    await page.waitForFunction(() => state.settings.retrieval.memoryEnabled && state.settings.retrieval.documentsEnabled);
    await openSettingsMemory(page);
    const testRequestsBefore = embeddingRequests.length;
    await page.locator('#retrievalTestEmbeddingBtn').click();
    await page.waitForFunction(() => /测试成功|Test succeeded/.test(document.getElementById('retrievalIndexStatus').textContent || ''));
    assert.equal(embeddingRequests.length, testRequestsBefore + 1, 'The explicit embedding test must make exactly one embedding request.');
    assert.equal(embeddingRequests.at(-1).url, new URL('/__mock_embed/v1/embeddings', url).href);
    assert.ok(embeddingRequests.at(-1).headers.authorization.includes('embedding-key'));

    steps.push('document import, validation, binding and preview');
    await page.locator('#retrievalOpenDocumentsBtn').click();
    await page.locator('#documentLibraryDialog').waitFor();
    const importInput = page.locator('body > input[type="file"][accept*=".txt"]').first();
    const documentText = '# 北境设定\n\n守夜人记录着北境风雪中的秘密与旧日传说。';
    await importInput.setInputFiles({ name: '北境设定.md', mimeType: 'text/markdown', buffer: Buffer.from(documentText) });
    await page.waitForFunction(() => Object.keys(state.documents).length === 1);
    assert.ok((await page.locator('#documentLibraryList').textContent()).includes('北境设定.md'));
    const docId = await page.evaluate(() => Object.keys(state.documents)[0]);

    const countBeforeInvalid = await page.evaluate(() => Object.keys(state.documents).length);
    await importInput.setInputFiles({ name: 'bad.pdf', mimeType: 'application/pdf', buffer: Buffer.from('pdf') });
    await page.waitForFunction(() => /只支持|Only UTF-8/.test(document.getElementById('documentLibraryStatus').textContent || ''));
    await importInput.setInputFiles({ name: 'bad.txt', mimeType: 'text/plain', buffer: Buffer.from([0xff, 0xfe, 0x00]) });
    await page.waitForFunction(() => /不是有效.*UTF-8|not valid UTF-8/i.test(document.getElementById('documentLibraryStatus').textContent || ''));
    await importInput.setInputFiles({ name: 'empty.txt', mimeType: 'text/plain', buffer: Buffer.from('   ') });
    await page.waitForFunction(() => /不能为空|cannot be empty/i.test(document.getElementById('documentLibraryStatus').textContent || ''));
    assert.equal(await page.evaluate(() => Object.keys(state.documents).length), countBeforeInvalid, 'Invalid imports must not create documents.');

    await page.locator(`[data-document-bind="${docId}"]`).click();
    await page.locator('#documentBindingDialog').waitFor();
    await page.locator('#documentBindingScope').selectOption('conversation');
    await page.locator('#documentBindingTarget').selectOption('c1');
    await page.locator('#documentAddBindingBtn').click();
    await page.waitForFunction(() => state.documents[Object.keys(state.documents)[0]].bindings.length === 1);
    await page.locator('#documentBindingDialog [data-dialog-cancel]').last().click();
    await page.locator(`[data-document-preview="${docId}"]`).click();
    await page.locator('#documentPreviewDialog').waitFor();
    assert.ok((await page.locator('#documentPreviewDialog .document-preview-text').textContent()).includes('守夜人'));
    assert.equal(await page.locator('#documentPreviewDialog img').count(), 0, 'Document text must never execute or render as HTML.');
    await page.locator('#documentPreviewDialog [data-dialog-cancel]').last().click();

    steps.push('document rename validation and export/reimport round trip');
    const revisionBeforeRename = await page.evaluate(id => state.documents[id].revision, docId);
    await page.locator(`#documentLibraryDialog [data-document-rename="${docId}"]`).click();
    await page.locator('#documentRenameDialog').waitFor();
    assert.ok(await page.locator('#documentRenameDialog label[for="documentRenameInput"]').count(), 'Rename form must use a semantic label.');
    await page.locator('#documentRenameInput').fill('   ');
    await page.locator('#documentRenameDialog [type="submit"]').click();
    await page.waitForFunction(() => /不能为空|cannot be empty/i.test(document.querySelector('#documentRenameDialog .feature-error').textContent || ''));
    assert.equal(await page.evaluate(id => state.documents[id].name, docId), '北境设定.md', 'Blank rename must keep the saved name.');
    await page.locator('#documentRenameInput').fill('名'.repeat(181));
    await page.locator('#documentRenameDialog [type="submit"]').click();
    await page.waitForFunction(() => /最多 180|at most 180/i.test(document.querySelector('#documentRenameDialog .feature-error').textContent || ''));
    assert.equal(await page.evaluate(id => state.documents[id].name, docId), '北境设定.md', 'Overlong rename must keep the saved name.');
    await page.locator('#documentRenameInput').fill('北境设定-重命名.md');
    await page.locator('#documentRenameDialog [type="submit"]').click();
    await page.locator('#documentRenameDialog').waitFor({ state: 'detached' });
    await page.waitForFunction(id => state.documents[id].name === '北境设定-重命名.md', docId);
    assert.ok((await page.locator('#documentLibraryList').textContent()).includes('北境设定-重命名.md'));
    assert.equal(await page.evaluate(id => state.documents[id].revision, docId), revisionBeforeRename, 'Renaming must not change the text revision.');
    assert.equal(await page.evaluate(() => documentExportMimeType(state.documents[Object.keys(state.documents)[0]])), 'text/markdown;charset=utf-8');
    const documentDownloadPromise = page.waitForEvent('download');
    await page.locator(`[data-document-export="${docId}"]`).click();
    const documentDownload = await documentDownloadPromise;
    assert.equal(documentDownload.suggestedFilename(), '北境设定-重命名.md', 'Export filename must follow the renamed document.');
    const exportPath = path.join(output, 'document-export.md');
    await documentDownload.saveAs(exportPath);
    assert.equal(await readFile(exportPath, 'utf8'), documentText, 'Export must deliver the saved UTF-8 original, not a wrapper.');
    const documentCountBeforeReimport = await page.evaluate(() => Object.keys(state.documents).length);
    await importInput.setInputFiles({ name: documentDownload.suggestedFilename(), mimeType: 'text/markdown', buffer: Buffer.from(await readFile(exportPath)) });
    await page.waitForFunction(count => Object.keys(state.documents).length === count + 1, documentCountBeforeReimport);
    assert.equal(await page.evaluate(() => Object.values(state.documents).some(doc => doc.name === '北境设定-重命名 (2).md' && doc.content.includes('守夜人'))), true,
        'Reimporting the exported original must create a second same-content document.');

    await page.locator('#documentLibraryDialog [data-dialog-cancel]').last().click();
    await closeSettings(page);

    steps.push('index and send with actual retrieval');
    const indexRequestsBefore = embeddingRequests.length;
    await openSettingsMemory(page);
    await page.locator('#retrievalIndexCurrentBtn').click();
    await page.waitForFunction(() => getRetrievalIndexStatus().phase === 'ready', null, { timeout: 15000 });
    assert.ok(embeddingRequests.length > indexRequestsBefore, 'Indexing must use the configured embedding endpoint.');
    const readiness = await page.evaluate(() => getRetrievalReadiness(getActiveConv()));
    assert.ok(readiness.ready > 0);
    await closeSettings(page);
    let chatRequestsBefore = chatRequests.length;
    await page.locator('#messageInput').fill('你还记得北境风雪和守夜人的旧日秘密吗？');
    await page.locator('#sendBtn').click();
    await page.waitForFunction(() => !state.isGenerating && getActiveConv().messages.some(message => message.role === 'assistant' && message.content.includes('合成模型回复')));
    assert.equal(chatRequests.length, chatRequestsBefore + 1, 'Sending must issue exactly one chat request.');
    const chatBody = JSON.stringify(chatRequests.at(-1).body);
    assert.ok(chatBody.includes('本地语义检索参考'), 'The actual request must include the labeled retrieval block.');
    assert.ok(chatBody.includes('北境设定-重命名.md'), 'The actual request must include the renamed bound document source.');
    assert.ok(!chatBody.includes('未绑定会话的禁忌内容'), 'Unbound conversation content must never be retrieved.');
    const diagnostic = await page.evaluate(() => recentDiagnostics.filter(item => item.conversationId === 'c1' && item.stage !== 'second').slice(-1)[0]);
    assert.ok(diagnostic && diagnostic.retrieval && diagnostic.retrieval.sources.some(source => source.type === 'document'));
    assert.ok(diagnostic.retrieval.requests >= 1);

    steps.push('actual sources and preview zero embedding');
    await page.locator('#viewPromptBtn').click();
    await page.locator('#promptViewSource').selectOption('actual');
    await page.waitForFunction(() => (document.getElementById('promptRetrievalSources').textContent || '').includes('北境设定-重命名.md'));
    await page.locator('#promptViewerCloseBtn').click();
    const previewRequestsBefore = embeddingRequests.length;
    await page.locator('#viewPromptBtn').click();
    await page.locator('#promptViewSource').selectOption('preview');
    await page.waitForFunction(() => (document.getElementById('promptRetrievalSources').textContent || '').length > 0);
    assert.equal(embeddingRequests.length, previewRequestsBefore, 'Preview must not send hidden embedding requests.');
    await page.locator('#promptViewerCloseBtn').click();

    steps.push('source revision invalidation');
    await page.evaluate(async () => {
        const linked = state.conversations.c2;
        linked.messages[0].content = '完全无关的新内容。';
        normalizeConversationMessageIdentity(linked);
        await persistState(true);
    });
    chatRequestsBefore = chatRequests.length;
    await page.locator('#messageInput').fill('北境风雪和守夜人的旧日秘密还记得吗？');
    await page.locator('#sendBtn').click();
    await page.waitForFunction(() => !state.isGenerating && getActiveConv().messages.filter(message => message.role === 'assistant').length >= 3);
    assert.ok(!JSON.stringify(chatRequests.at(-1).body).includes('北境风雪里藏着守夜人的秘密'), 'Edited source revisions must not re-enter the prompt.');

    steps.push('retrieval references stay literal while ordinary macros still run');
    const macroDocumentText = '检索边界：北境风雪里的 {{setvar::retrieval_probe::changed}} {{getvar::host_private_marker}} {{char}}';
    await openSettingsMemory(page);
    await page.locator('#retrievalOpenDocumentsBtn').click();
    await page.locator('#documentLibraryDialog').waitFor();
    const macroImportInput = page.locator('body > input[type="file"][accept*=".txt"]').first();
    const macroDocumentsBefore = await page.evaluate(() => Object.keys(state.documents).length);
    await macroImportInput.setInputFiles({ name: '边界资料.md', mimeType: 'text/markdown', buffer: Buffer.from(macroDocumentText) });
    await page.waitForFunction(count => Object.keys(state.documents).length === count + 1, macroDocumentsBefore);
    const macroDocumentId = await page.evaluate(() => Object.values(state.documents).find(doc => doc.content.includes('retrieval_probe')).id);
    await page.locator(`[data-document-bind="${macroDocumentId}"]`).click();
    await page.locator('#documentBindingDialog').waitFor();
    await page.locator('#documentBindingScope').selectOption('conversation');
    await page.locator('#documentBindingTarget').selectOption('c1');
    await page.locator('#documentAddBindingBtn').click();
    await page.waitForFunction(id => state.documents[id].bindings.some(binding => binding.targetId === 'c1'), macroDocumentId);
    await page.locator('#documentBindingDialog [data-dialog-cancel]').last().click();
    await page.locator('#documentLibraryDialog [data-dialog-cancel]').last().click();
    await page.locator('#retrievalIndexCurrentBtn').click();
    await page.waitForFunction(() => getRetrievalIndexStatus().phase === 'ready', null, { timeout: 15000 });
    await closeSettings(page);
    await page.evaluate(async () => {
        const conv = getActiveConv();
        conv.stLocalVars = Object.assign({}, conv.stLocalVars || {}, { host_private_marker: 'synthetic-host-private-value' });
        state.characters.alice.description = '普通角色宏 {{char}} 与 {{user}}';
        await persistState(true);
    });
    const assistantCountBeforeMacroSend = await page.evaluate(() => getActiveConv().messages.filter(message => message.role === 'assistant').length);
    await page.locator('#messageInput').fill('检索边界北境风雪问题');
    await page.locator('#sendBtn').click();
    await page.waitForFunction(count => !state.isGenerating && getActiveConv().messages.filter(message => message.role === 'assistant').length >= count + 1, assistantCountBeforeMacroSend);
    const macroChatBody = JSON.stringify(chatRequests.at(-1).body);
    assert.ok(macroChatBody.includes('{{setvar::retrieval_probe::changed}}'), 'Retrieval setvar must remain literal in the actual request.');
    assert.ok(macroChatBody.includes('{{getvar::host_private_marker}}'), 'Retrieval getvar must remain literal in the actual request.');
    assert.ok(macroChatBody.includes('{{char}}'), 'Retrieval char macro must remain literal in the actual request.');
    assert.ok(!macroChatBody.includes('synthetic-host-private-value'), 'Retrieval references must not read host variables.');
    assert.equal(await page.evaluate(() => getActiveConv().stLocalVars.retrieval_probe), undefined, 'Retrieval references must not write host variables.');
    assert.ok(macroChatBody.includes('普通角色宏 Alice 与 User'), 'Ordinary character macros must keep expanding.');
    await page.evaluate(async () => {
        const conv = getActiveConv();
        delete conv.stLocalVars.host_private_marker;
        delete conv.stLocalVars.retrieval_probe;
        state.characters.alice.description = 'Alice card';
        await persistState(true);
    });

    steps.push('model switch isolation and preview');
    await page.evaluate(async () => {
        const profile = getActiveConnectionProfile('embedding');
        profile.model = 'mock-embed-2';
        await persistState(true);
    });
    const modelPreviewBefore = embeddingRequests.length;
    await page.locator('#viewPromptBtn').click();
    await page.locator('#promptViewSource').selectOption('preview');
    await page.waitForFunction(() => (document.getElementById('promptRetrievalSources').textContent || '').length > 0);
    assert.equal(embeddingRequests.length, modelPreviewBefore, 'A model switch must invalidate cached preview retrieval without a hidden embedding call.');
    await page.locator('#promptViewerCloseBtn').click();

    steps.push('malformed vectors, dimension changes and quota');
    await page.evaluate(async () => { await clearRetrievalIndexDatabase(); });
    embeddingMode = 'malformed';
    await openSettingsMemory(page);
    await page.locator('#retrievalIndexCurrentBtn').click();
    await page.waitForFunction(() => /非法向量|invalid vector/i.test(document.getElementById('retrievalIndexStatus').textContent || ''));
    embeddingMode = 'wrongDims';
    await page.locator('#retrievalIndexCurrentBtn').click();
    await page.waitForFunction(() => /维度|dimension/i.test(document.getElementById('retrievalIndexStatus').textContent || ''));
    embeddingMode = 'ok';
    await page.evaluate(() => {
        const originalPut = IDBObjectStore.prototype.put;
        window.__restoreRetrievalQuota = () => { IDBObjectStore.prototype.put = originalPut; window.__forceRetrievalQuota = false; };
        window.__forceRetrievalQuota = true;
        IDBObjectStore.prototype.put = function(value) {
            if (window.__forceRetrievalQuota && (this.name === 'sources' || this.name === 'chunks')) {
                const error = new Error('quota exceeded');
                error.name = 'QuotaExceededError';
                throw error;
            }
            return originalPut.apply(this, arguments);
        };
    });
    await page.locator('#retrievalIndexCurrentBtn').click();
    await page.waitForFunction(() => /空间不足|storage is full/i.test(document.getElementById('retrievalIndexStatus').textContent || ''));
    await page.evaluate(() => window.__restoreRetrievalQuota());
    await page.locator('#retrievalIndexCurrentBtn').click();
    await page.waitForFunction(() => getRetrievalIndexStatus().phase === 'ready', null, { timeout: 15000 });
    await closeSettings(page);

    steps.push('save failure keeps original and retry');
    await openSettingsMemory(page);
    await page.locator('#retrievalOpenDocumentsBtn').click();
    await page.locator('#documentLibraryDialog').waitFor();
    const docsBeforeFailure = await page.evaluate(() => Object.keys(state.documents).length);
    await page.evaluate(() => {
        const original = StorageService.saveAll;
        window.__restoreSave = () => { StorageService.saveAll = original; };
        StorageService.saveAll = async () => { throw new Error('synthetic document save failure'); };
    });
    const libraryImportInput = page.locator('body > input[type="file"][accept*=".txt"]').first();
    await libraryImportInput.setInputFiles({ name: '失败资料.txt', mimeType: 'text/plain', buffer: Buffer.from('保存失败时不应切换。') });
    await page.waitForFunction(() => /synthetic document save failure/.test(document.getElementById('documentLibraryStatus').textContent || ''));
    assert.equal(await page.evaluate(() => Object.keys(state.documents).length), docsBeforeFailure, 'Failed document saves must keep the original library.');
    assert.equal(await page.locator('[data-document-retry]').isVisible(), true);
    await page.evaluate(() => window.__restoreSave());
    await page.locator('[data-document-retry]').click();
    await page.waitForFunction(n => Object.keys(state.documents).length === n + 1, docsBeforeFailure);
    await page.locator('#documentLibraryDialog [data-dialog-cancel]').last().click();
    await closeSettings(page);

    steps.push('cancel late indexing');
    embeddingMode = 'hang';
    await page.evaluate(async () => { await clearRetrievalIndexDatabase(); });
    await openSettingsMemory(page);
    await page.locator('#retrievalIndexCurrentBtn').click();
    await page.waitForTimeout(150);
    await page.locator('#retrievalCancelIndexBtn').click();
    await page.waitForFunction(() => /已取消|取消/.test(document.getElementById('retrievalIndexStatus').textContent || ''));
    await releaseEmbeddingGate();
    embeddingMode = 'ok';
    await page.locator('#retrievalIndexCurrentBtn').click();
    await page.waitForFunction(() => getRetrievalIndexStatus().phase === 'ready', null, { timeout: 15000 });
    await closeSettings(page);

    steps.push('stop during retrieval');
    embeddingMode = 'hang';
    const chatBeforeStop = chatRequests.length;
    await page.locator('#messageInput').fill('停止检索测试');
    await page.locator('#sendBtn').click();
    await page.locator('#stopBtn').waitFor({ state: 'visible' });
    await page.waitForTimeout(150);
    await page.locator('#stopBtn').click();
    await releaseEmbeddingGate();
    await page.waitForFunction(() => !state.isGenerating);
    assert.equal(chatRequests.length, chatBeforeStop, 'Stopping during retrieval must not send a chat request.');
    embeddingMode = 'ok';

    steps.push('late formatting ownership change');
    const retrievalModelBeforeLate = await page.evaluate(() => getActiveConnectionProfile('embedding').model);
    const messagesBeforeLate = await page.evaluate(() => getActiveConv().messages.map(message => ({ id: message.id, content: message.content })));
    await page.evaluate(() => {
        const original = window.__getFormatMessageAsync();
        let blocked = false;
        window.__formatGate = null;
        window.__formatOriginal = original;
        window.__setFormatMessageAsync(async function(...args) {
            if (!blocked) {
                blocked = true;
                await new Promise(resolve => { window.__formatGate = resolve; });
            }
            return original.apply(this, args);
        });
    });
    const chatBeforeLateFormat = chatRequests.length;
    await page.locator('#messageInput').fill('北境风雪与守夜人的旧日秘密');
    await page.locator('#sendBtn').click();
    await page.waitForFunction(() => typeof window.__formatGate === 'function');
    await page.evaluate(async () => {
        const profile = getActiveConnectionProfile('embedding');
        profile.model = 'mock-embed-late';
        await persistState(true);
    });
    await page.evaluate(() => window.__formatGate());
    await page.waitForFunction(() => !state.isGenerating);
    assert.equal(chatRequests.length, chatBeforeLateFormat, 'A connection change during asynchronous formatting must not send a chat request.');
    const messagesAfterLate = await page.evaluate(() => getActiveConv().messages.map(message => ({ id: message.id, content: message.content })));
    assert.deepEqual(messagesAfterLate.slice(0, messagesBeforeLate.length), messagesBeforeLate, 'The original conversation messages must stay unchanged.');
    assert.equal(messagesAfterLate.length, messagesBeforeLate.length + 1, 'Only the attempted user message may remain after a cancelled late build.');
    assert.equal(await page.evaluate(() => state.isGenerating), false, 'The generation lock must be released.');
    await page.evaluate(async originalModel => {
        const profile = getActiveConnectionProfile('embedding');
        profile.model = originalModel;
        window.__setFormatMessageAsync(window.__formatOriginal);
        await persistState(true);
    }, retrievalModelBeforeLate);

    steps.push('external settings replacement during draft');
    await openSettingsMemory(page);
    await page.locator('#retrievalDocumentsEnabled').uncheck();
    await page.evaluate(async () => {
        state.settings.retrieval.memoryEnabled = false;
        await persistState(true);
        notifyCloudSyncSnapshotApplied();
    });
    await page.waitForFunction(() => /数据已被云恢复/.test((document.getElementById('settingsDraftError') || {}).textContent || ''));
    assert.equal(await page.evaluate(() => state.settings.retrieval.memoryEnabled), false, 'External replacement must update committed settings.');
    assert.equal(await page.evaluate(() => document.getElementById('settingsModal').classList.contains('hidden')), false, 'The draft must stay open after external replacement.');
    await page.locator('#settingsDiscardBtn').click();
    assert.equal(await page.evaluate(() => state.settings.retrieval.memoryEnabled), false, 'Discarding must not undo the external replacement.');
    await openSettingsMemory(page);
    await page.locator('#retrievalMemoryEnabled').check();
    await page.locator('#settingsDoneBtn').click();
    await page.waitForFunction(() => state.settings.retrieval.memoryEnabled);

    steps.push('refresh persistence');
    await page.reload();
    await page.waitForFunction(() => typeof persistState === 'function' && Object.keys(state.documents).length >= 2);
    assert.equal(await page.evaluate(() => state.settings.retrieval.memoryEnabled), true, 'Completed retrieval settings must survive refresh.');
    assert.ok(await page.evaluate(() => Object.values(state.documents).some(document => document.name === '北境设定-重命名.md' && document.bindings.some(binding => binding.scope === 'conversation'))));
    const readinessAfterReload = await page.evaluate(() => getRetrievalReadiness(getActiveConv()));
    assert.ok(readinessAfterReload.ready > 0, 'The independent local index should survive refresh.');

    steps.push('full export and second isolated client');
    const backup = await page.evaluate(() => buildAllConversationsExportData(getConversationExportRecords(), new Date().toISOString()));
    assert.ok(Object.keys(backup.documents || {}).length >= 2);
    const backupPath = path.join(output, 'stage-b-full-export.json');
    await writeFile(backupPath, JSON.stringify(backup, null, 2));
    const context2 = await browser.newContext({ viewport: { width: 1280, height: 960 } });
    const page2 = await context2.newPage();
    page2.on('pageerror', error => pageErrors.push('second-client: ' + error.message));
    page2.on('dialog', dialog => { dialogs.push(dialog.message()); dialog.accept(); });
    await installRoutes(context2, page2);
    await page2.goto(url);
    await page2.waitForFunction(() => typeof persistState === 'function' && getActiveConv());
    await page2.locator('#convImportFile').setInputFiles({ name: 'stage-b-full-export.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
    await page2.locator('#backupRestoreDialog').waitFor();
    await page2.locator('#backupRestoreDialog [type="submit"]').click();
    await page2.locator('#backupRestoreDialog').waitFor({ state: 'detached' });
    await page2.waitForFunction(() => Object.keys(state.documents).length >= 2);
    const secondDocuments = await page2.evaluate(() => Object.values(state.documents));
    const secondConversationIds = await page2.evaluate(() => Object.keys(state.conversations));
    assert.ok(secondDocuments.some(document => document.content.includes('守夜人记录着北境风雪中的秘密')));
    assert.ok(secondDocuments.some(document => document.bindings.some(binding => binding.scope === 'conversation' && secondConversationIds.includes(binding.targetId))));
    await context2.close();

    steps.push('source interface fixture');
    const assistantsBeforeSourceFixture = await page.evaluate(() => getActiveConv().messages.filter(message => message.role === 'assistant').length);
    await page.locator('#messageInput').fill('北境风雪资料与记忆来源');
    await page.locator('#sendBtn').click();
    await page.waitForFunction(count => !state.isGenerating && getActiveConv().messages.filter(message => message.role === 'assistant').length >= count + 1, assistantsBeforeSourceFixture);

    steps.push('responsive themes');
    for (const width of [390, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        for (const theme of ['new-light', 'new-dark', 'system']) {
            if (theme === 'system') {
                await page.evaluate(() => { state.settings.uiTheme = 'system'; applyUiTheme('system', { cache: false }); });
                await page.emulateMedia({ colorScheme: 'dark' });
            } else {
                await page.evaluate(value => applyUiTheme(value, { cache: false }), theme);
            }
            await openSettingsMemory(page);
            await page.locator('.retrieval-settings').scrollIntoViewIfNeeded();
            await page.evaluate(() => document.querySelector('.retrieval-settings').scrollIntoView({ block: 'start' }));
            const retrievalBox = await page.locator('.retrieval-settings').boundingBox();
            assert.ok(retrievalBox && retrievalBox.y < 900 && retrievalBox.y + retrievalBox.height > 0, `Retrieval settings must be in view at ${width}/${theme}`);
            await capture(page, `retrieval-settings-${width}-${theme}`);
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Settings overflow at ${width}/${theme}`);
            await page.locator('#retrievalOpenDocumentsBtn').click();
            await page.locator('#documentLibraryDialog').waitFor();
            await capture(page, `document-library-${width}-${theme}`);
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Document library overflow at ${width}/${theme}`);
            await page.locator('#documentLibraryDialog [data-document-preview]').first().click();
            await page.locator('#documentPreviewDialog').waitFor();
            await capture(page, `document-preview-${width}-${theme}`);
            assert.equal(await page.evaluate(() => Array.from(document.querySelectorAll('dialog[open]')).every(dialog => dialog.scrollWidth <= dialog.clientWidth + 1)), true,
                `Document preview overflow at ${width}/${theme}`);
            await page.locator('#documentPreviewDialog [data-dialog-cancel]').last().click();
            await page.locator('#documentLibraryDialog [data-dialog-cancel]').last().click();
            await closeSettings(page);
            if (width <= 767) {
                const sidebarOpen = await page.evaluate(() => document.getElementById('sidebar').classList.contains('open'));
                if (!sidebarOpen) {
                    await page.locator('#hamburgerBtn').click();
                    await page.waitForFunction(() => document.getElementById('sidebar').classList.contains('open'));
                }
            }
            await page.locator('#viewPromptBtn').click();
            await page.locator('#promptViewSource').selectOption('actual');
            await page.waitForFunction(() => (document.getElementById('promptRetrievalSources').textContent || '').includes('北境'));
            await capture(page, `retrieval-sources-${width}-${theme}`);
            assert.equal(await page.evaluate(() => Array.from(document.querySelectorAll('dialog[open]')).every(dialog => dialog.scrollWidth <= dialog.clientWidth + 1)), true,
                `Retrieval sources overflow at ${width}/${theme}`);
            await page.locator('#promptViewerCloseBtn').click();
        }
    }

    assert.deepEqual(pageErrors, []);
    await writeReport(true);
    console.log(JSON.stringify({ passed: true, report: reportPath, screenshots: output, embeddingRequests: embeddingRequests.length, chatRequests: chatRequests.length }));
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
            activeConvId: typeof state !== 'undefined' ? state.activeConvId : null,
            isGenerating: typeof state !== 'undefined' ? state.isGenerating : null,
            documents: typeof state !== 'undefined' ? Object.keys(state.documents || {}) : [],
            retrieval: typeof getRetrievalIndexStatus === 'function' ? getRetrievalIndexStatus() : null,
            openDialogs: Array.from(document.querySelectorAll('dialog[open]')).map(dialog => dialog.id),
            settingsOpen: !document.getElementById('settingsModal').classList.contains('hidden'),
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
