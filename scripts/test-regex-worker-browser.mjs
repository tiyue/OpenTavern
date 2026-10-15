import { captureBrowserEvidence } from './check-release.mjs';
/**
 * 真实浏览器冒烟：正则 Worker 内嵌启动、断网复用、真实超时终止后自动重建、Blob 缺失同源回退与提示词结果不串号。
 *
 * 关键点：本 bundle 把 assets/js/regex-worker.js 的源码内嵌进 runtime，执行期用 Blob Worker，不再额外抓取任何脚本。
 * 因此这里从一开始就阻断全部外部域与 /assets/js/regex-worker.js 脚本请求（模拟同源脚本不可达的网络故障），断言正则仍
 * 从内嵌字节启动、正常结果复用同一个 Worker 且不 terminate。随后用真实 runRegexReplacement 触发灾难正则（/(a+)+$/ 与
 * 20000 个 a），验证约 500ms 的隔离超时终止并在错误里报告规则名，再在断网条件下运行正常规则验证自动新建重建（而不是手工
 * resetRegexWorker）。最后用一个新页面删除 Blob，验证回退同源 Worker 的兼容分支。
 *
 * 使用已有 Playwright/Chrome（OPENTAVERN_PLAYWRIGHT_MODULE 指定模块路径），不自动安装依赖；
 * 入口默认 /.sites-public/opentavern.html，可被 OPENTAVERN_TEST_URL 覆盖；需先运行 npm run build 与 npm run prepare:sites。
 * 隔离 context + 合成数据，绝不调用真实模型。
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const modulePath = process.env.OPENTAVERN_PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = await import(path.isAbsolute(modulePath) ? pathToFileURL(modulePath).href : modulePath);
const url = process.env.OPENTAVERN_TEST_URL || 'http://127.0.0.1:8765/.sites-public/opentavern.html';
const output = process.env.OPENTAVERN_TEST_OUTPUT || await mkdtemp(path.join(os.tmpdir(), 'opentavern-regex-worker-'));
await mkdir(output, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const errors = [];
const external = [];
const workerScriptRequests = [];
// 只有「Blob 不可用回退同源 Worker」这一段允许真正请求 assets/js/regex-worker.js；其余阶段必须一次都不请求。
let serveWorkerScript = false;

const handleRoute = async route => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.pathname.endsWith('/assets/js/app.js')) {
        const response = await route.fetch();
        const bundle = await response.text();
        const end = bundle.lastIndexOf('})();');
        assert.ok(end > 0, 'app.js 必须是 IIFE，才能注入测试 probe');
        const probe = 'Object.assign(window, {' +
            ' state, dom, getActiveConv, normalizeConversation, requestFullRender, switchView, applyUiTheme, runRegexReplacement,' +
            ' __regexWorkerProbe: function() { return {' +
            ' pending: typeof regexPendingTasks === "undefined" ? -1 : regexPendingTasks.size,' +
            ' renderPending: regexRenderScheduled || regexDeferredRenderTimer != null,' +
            ' ready: typeof regexWorkerReady === "undefined" ? null : regexWorkerReady,' +
            ' hasInstance: typeof regexWorkerInstance !== "undefined" && !!regexWorkerInstance,' +
            ' embedded: typeof REGEX_WORKER_SOURCE === "string" && REGEX_WORKER_SOURCE.length > 0 }; }' +
            '});\n';
        return route.fulfill({ response, body: bundle.slice(0, end) + probe + bundle.slice(end) });
    }
    if (requestUrl.pathname.endsWith('/assets/js/regex-worker.js')) {
        workerScriptRequests.push(requestUrl.href);
        return serveWorkerScript ? route.continue() : route.abort();
    }
    if (requestUrl.origin !== new URL(url).origin) { external.push(requestUrl.href); return route.abort(); }
    return route.continue();
};
await context.route('**/*', handleRoute);

// 每个页面都装上 Worker 计数代理：记录实例数、终止数、提交数与构造地址，用于验证复用与重建。
const installInitScript = target => target.addInitScript(() => {
    localStorage.setItem('opentavern_onboarding_completed_v1', '1');
    localStorage.setItem('opentavern_announce_dismissed_v1', '1');
    window.__workerInstances = 0;
    window.__workerTerminates = 0;
    window.__workerPosts = 0;
    window.__workerUrls = [];
    const post = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (...args) { window.__workerPosts += 1; return post.apply(this, args); };
    const terminate = Worker.prototype.terminate;
    Worker.prototype.terminate = function (...args) { window.__workerTerminates += 1; return terminate.apply(this, args); };
    const OrigWorker = window.Worker;
    window.Worker = new Proxy(OrigWorker, {
        construct(target, args) {
            window.__workerInstances += 1;
            window.__workerUrls.push(String(args[0]));
            return Reflect.construct(target, args);
        }
    });
});

const counters = target => target.evaluate(() => ({ instances: window.__workerInstances, terminates: window.__workerTerminates, posts: window.__workerPosts, urls: window.__workerUrls }));
const resetCounters = target => target.evaluate(() => { window.__workerInstances = 0; window.__workerTerminates = 0; window.__workerPosts = 0; window.__workerUrls = []; });
const waitSettled = target => target.waitForFunction(() => __regexWorkerProbe().pending === 0 && !__regexWorkerProbe().renderPending, null, { timeout: 60000 });
const visibleText = target => target.evaluate(() => dom.messagesContainer ? dom.messagesContainer.textContent : '');

const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message));
page.on('dialog', dialog => dialog.dismiss());
await installInitScript(page);

try {
    await page.goto(url);
    await page.waitForFunction(() => typeof getActiveConv === 'function' && getActiveConv() && typeof __regexWorkerProbe === 'function' && typeof runRegexReplacement === 'function');

    // 建立合成会话并关闭规则，等首屏稳定后再统计本次断言范围内的 Worker 行为。
    await page.evaluate(() => {
        state.settings.globalRegexEnabled = false;
        const conv = getActiveConv();
        conv.character = { name: '正则Worker验收', extensions: {} };
        conv.title = '正则 Worker 复用验收';
        conv.messages = [
            { role: 'user', content: '开始' },
            { role: 'assistant', content: 'foo 0' },
            { role: 'assistant', content: 'foo 1' }
        ];
        normalizeConversation(conv);
        conv._showAllMessages = true;
        switchView('chat');
        requestFullRender();
    });
    await waitSettled(page);
    assert.equal(await page.evaluate(() => __regexWorkerProbe().embedded), true, '本次 bundle 必须内嵌 Worker 源码');

    // 阶段 A：首个任务前将整个 context 断网，正则仍须从内嵌字节启动并正确替换。
    await context.setOffline(true);
    await resetCounters(page);
    external.length = 0;
    await page.evaluate(() => {
        Object.assign(state.settings, {
            globalRegexEnabled: true,
            globalRegexScripts: [
                { name: 'foo->bar', placement: [2], findRegex: 'foo', replaceString: 'bar', flags: 'g' },
                { name: 'bar->baz', placement: [2], findRegex: 'bar', replaceString: 'baz', flags: 'g' }
            ]
        });
        requestFullRender();
    });
    await waitSettled(page);
    let text = await visibleText(page);
    assert.ok(text.includes('baz 0') && text.includes('baz 1'), '网络全断时正则仍须从内嵌字节正确执行');
    const phaseA = await counters(page);
    assert.equal(phaseA.instances, 1, `仅创建一个 Worker，实际 ${JSON.stringify(phaseA)}`);
    assert.equal(phaseA.terminates, 0, '正常结果不得 terminate 复用的 Worker');
    assert.ok(phaseA.urls.every(target => target.startsWith('blob:')), '必须用 Blob URL 构造 Worker，而不是同源脚本');
    assert.deepEqual(workerScriptRequests, [], '执行期不得请求 assets/js/regex-worker.js 脚本');

    // 阶段 B：首个任务成功后同源脚本仍不可达，不同规则复用同一 Worker（不重建、不 terminate）。
    await page.evaluate(() => {
        const conv = getActiveConv();
        conv.messages.push({ role: 'assistant', content: 'alpha 2' });
        state.settings.globalRegexScripts = [
            { name: 'alpha->omega', placement: [2], findRegex: 'alpha', replaceString: 'omega', flags: 'g' }
        ];
        normalizeConversation(conv);
        conv._showAllMessages = true;
        requestFullRender();
    });
    await waitSettled(page);
    text = await visibleText(page);
    assert.ok(text.includes('omega 2'), '同源脚本不可达时后续不同规则仍须完成');
    const phaseB = await counters(page);
    assert.equal(phaseB.instances, 1, '同源脚本不可达不得重复创建 Worker');
    assert.equal(phaseB.terminates, 0, '正常复用不得 terminate');
    assert.deepEqual(workerScriptRequests, [], '整个执行期都不得请求 Worker 脚本');

    // 阶段 C：真实灾难正则经 runRegexReplacement 触发执行超时——约 500ms 后终止并报告规则名，随后仍在断网条件下运行
    // 正常规则验证自动新建 Worker 恢复（而不是手工 resetRegexWorker）。
    const catastrophic = await page.evaluate(async () => {
        const started = performance.now();
        try {
            await runRegexReplacement('a'.repeat(20000) + '!', /(a+)+$/, 'x', { name: '灾难回溯规则', trimStrings: [] }, { priority: 'prompt' });
            return { ok: true, elapsed: performance.now() - started };
        } catch (error) {
            return { ok: false, message: String(error && error.message), elapsed: performance.now() - started };
        }
    });
    assert.equal(catastrophic.ok, false, '灾难正则必须被终止而不是正常返回');
    assert.ok(catastrophic.elapsed >= 480, `超时必须约 500ms 后触发，实际 ${catastrophic.elapsed}ms`);
    assert.match(catastrophic.message, /500ms/, '超时错误必须说明已超过 500ms');
    assert.match(catastrophic.message, /灾难回溯规则/, '超时错误必须报告规则名');
    const afterCrash = await page.evaluate(() => __regexWorkerProbe());
    assert.equal(afterCrash.pending, 0, '超时后不得残留 pending 任务');
    assert.equal(afterCrash.hasInstance, false, '超时必须清空失效的 Worker 实例');

    await page.evaluate(() => {
        const conv = getActiveConv();
        conv.messages.push({ role: 'assistant', content: 'beta 3' });
        state.settings.globalRegexScripts = [
            { name: 'beta->gamma', placement: [2], findRegex: 'beta', replaceString: 'gamma', flags: 'g' }
        ];
        normalizeConversation(conv);
        conv._showAllMessages = true;
        requestFullRender();
    });
    await waitSettled(page);
    text = await visibleText(page);
    assert.ok(text.includes('gamma 3'), '终止清空后后续任务必须能自动新建 Worker 恢复');
    const phaseC = await counters(page);
    assert.equal(phaseC.instances, 2, '终止后必须重建一个 Worker，而不是复用失效实例');
    assert.ok(phaseC.terminates >= 1, '灾难超时必须 terminate 失效实例');
    assert.equal((await page.evaluate(() => __regexWorkerProbe())).ready, true, '恢复后的 Worker 必须就绪');
    assert.deepEqual(workerScriptRequests, [], '恢复过程同样不得请求 Worker 脚本');

    // 结果不串号：两个不同的提示词任务各自得到自己的结果（复用 Worker 的编号关联生效）。
    const promptPair = await page.evaluate(async () => {
        const first = await runRegexReplacement('p1-p1', /p1/g, 'ONE', { name: '串号-1', trimStrings: [] }, { priority: 'prompt' });
        const second = await runRegexReplacement('p2-p2', /p2/g, 'TWO', { name: '串号-2', trimStrings: [] }, { priority: 'prompt' });
        return { first, second };
    });
    assert.equal(promptPair.first, 'ONE-ONE', '第一个提示词任务结果必须正确');
    assert.equal(promptPair.second, 'TWO-TWO', '第二个提示词任务结果必须正确');

    // 阶段 D：Blob 不可用时的同源 Worker 兼容分支——干净的独立 context 里删除 Blob 后回退到同源脚本地址，仍能加载并执行。
    const bloblessContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await bloblessContext.route('**/*', handleRoute);
    const bloblessPage = await bloblessContext.newPage();
    bloblessPage.on('pageerror', error => errors.push(error.message));
    bloblessPage.on('dialog', dialog => dialog.dismiss());
    await installInitScript(bloblessPage);
    await bloblessPage.goto(url);
    await bloblessPage.waitForFunction(() => typeof runRegexReplacement === 'function');
    // 干净 context 且未运行任何规则：确认没有既有 Worker，从而真正验证「新建」时的 Blob 回退分支，而不是复用现成实例。
    assert.equal(await bloblessPage.evaluate(() => __regexWorkerProbe().hasInstance), false, 'Blob 回退分支必须在无既有 Worker 的干净页面里验证');
    await bloblessPage.evaluate(() => { Object.defineProperty(window, 'Blob', { value: undefined, configurable: true }); });
    const requestsBeforeFallback = workerScriptRequests.length;
    serveWorkerScript = true;
    const fallback = await bloblessPage.evaluate(async () => {
        try {
            const value = await runRegexReplacement('zzz', /z/g, 'Q', { name: '回退规则', trimStrings: [] }, { priority: 'prompt' });
            return { ok: true, output: value };
        } catch (error) {
            return { ok: false, message: String(error && error.message) };
        }
    });
    serveWorkerScript = false;
    assert.equal(fallback.ok, true, `Blob 缺失时必须回退同源 Worker 并成功：${fallback.message || ''}`);
    assert.equal(fallback.output, 'QQQ', '回退同源 Worker 的结果必须正确');
    const fallbackCounters = await counters(bloblessPage);
    assert.equal(fallbackCounters.instances, 1, `Blob 缺失时只创建一个 Worker，实际 ${JSON.stringify(fallbackCounters)}`);
    assert.ok(fallbackCounters.urls[0].includes('assets/js/regex-worker.js'), 'Blob 缺失时必须用同源脚本地址构造 Worker');
    assert.ok(/[?&]v=/.test(fallbackCounters.urls[0]), '同源回退地址必须带版本参数');
    assert.equal(workerScriptRequests.length, requestsBeforeFallback + 1, 'Blob 回退分支必须且只请求一次同源 Worker 脚本');
    await bloblessContext.close();

    // 移动端浅暗视觉冒烟；captureBrowserEvidence 另外覆盖 390/1280 浅暗与系统主题跟随证据。
    for (const theme of ['new-light', 'new-dark']) {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.evaluate(value => applyUiTheme(value), theme);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        await page.screenshot({ path: path.join(output, `regex-worker-390-${theme}.png`), animations: 'disabled' });
    }
    assert.deepEqual(external, [], '验收期间不得访问任何外部域');
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({
        passed: true,
        screenshots: output,
        phaseA,
        phaseB,
        phaseC,
        promptPair,
        fallback,
        workerScriptRequests,
        ...(await captureBrowserEvidence(page, output))
    }));
} catch (error) {
    const diagnostic = await page.evaluate(() => ({
        probe: __regexWorkerProbe(),
        instances: window.__workerInstances,
        terminates: window.__workerTerminates,
        posts: window.__workerPosts,
        urls: window.__workerUrls,
        text: dom.messagesContainer ? dom.messagesContainer.textContent : ''
    })).catch(() => null);
    console.log(JSON.stringify({ diagnostic, external, workerScriptRequests, errors }));
    await page.screenshot({ path: path.join(output, 'failure.png'), animations: 'disabled' }).catch(() => {});
    throw error;
} finally {
    await browser.close();
}
