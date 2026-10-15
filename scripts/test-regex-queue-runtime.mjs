/**
 * 正则执行队列回归：提示词优先、pending 去重、失败可重试、显示链顺序与稳定、失效规则。
 *
 * 说明：FakeWorker 复用真实 assets/js/regex-worker.js 的求值逻辑，断言里的期望值由测试
 * 手写推导，因此结果来自真实正则语义，而不是镜像队列实现。
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const readSource = name => fs.readFileSync(new URL('../src/app/' + name, import.meta.url), 'utf8');
const workerSource = fs.readFileSync(new URL('../assets/js/regex-worker.js', import.meta.url), 'utf8');

let unhandledRejections = 0;
process.on('unhandledRejection', () => { unhandledRejections += 1; });

// 真实 Worker 求值器：直接在 VM 中执行 regex-worker.js，得到真实的 { result, elapsedMs } / { error }。
// sandbox 提供 performance，以便 Worker 计算实际执行耗时。
function createWorkerEvaluator() {
    let captured = null;
    const sandbox = { performance, self: { postMessage: message => { captured = message; } } };
    vm.createContext(sandbox);
    vm.runInContext(workerSource, sandbox);
    return data => { captured = null; sandbox.self.onmessage({ data }); return captured; };
}

// 用真实脚本验证 prepare 握手：装载后不主动发消息，收到 prepare 才回 ready；并提供一次普通请求的第一条消息。
function captureWorkerMessages() {
    const messages = [];
    const sandbox = { performance, self: { postMessage: message => { messages.push(message); } } };
    vm.createContext(sandbox);
    vm.runInContext(workerSource, sandbox);
    return {
        messages,
        send: data => { sandbox.self.onmessage({ data }); }
    };
}

function createHarness() {
    const evaluateWorker = createWorkerEvaluator();
    const posted = [];
    const instances = [];

    // FakeWorker 遵守真实 prepare 握手：构造后不主动发消息，收到 { type: 'regex-worker-prepare' } 才按模式回 ready；
    // 只有真正的正则任务进入 posted，prepare 不记录；响应按真实 regex-worker.js 语义原样回带任务编号 id。
    class FakeWorker {
        constructor(url) {
            this.terminated = false;
            this.onmessage = null;
            this.onerror = null;
            this.url = typeof url === 'string' ? url : String(url);
            this.prepares = 0;
            if (FakeWorker.failBlob && this.url.indexOf('blob:') === 0) throw new Error('fake-blob-reject');
            if (FakeWorker.mode === 'ctorerror') throw new Error('fake-ctor-error');
            instances.push(this);
        }
        sendReady() { if (!this.terminated) this.deliver({ ready: true }); }
        postMessage(data) {
            if (data && data.type === 'regex-worker-prepare') {
                this.prepares += 1;
                if (FakeWorker.mode === 'loaderror') queueMicrotask(() => { if (!this.terminated && this.onerror) this.onerror({ message: 'fake-load-error' }); });
                else if (FakeWorker.mode === 'noready') { /* 永不就绪：用于验证真实 Worker 装载超时 */ }
                else if (FakeWorker.loadDelayMs > 0) this.readyTimer = setTimeout(() => this.sendReady(), FakeWorker.loadDelayMs);
                else queueMicrotask(() => this.sendReady());
                // 重复 ready：验证第二次 ready 不得重置 500ms 执行期限。
                if (FakeWorker.mode === 'duplicateReady') setTimeout(() => this.sendReady(), 300);
                return;
            }
            const entry = { worker: this, data, delivered: false };
            posted.push(entry);
            if (FakeWorker.mode === 'manual') return;
            if (FakeWorker.mode === 'error') { queueMicrotask(() => { entry.delivered = true; this.deliver({ id: data.id, error: 'fake-worker-error' }); }); return; }
            if (FakeWorker.mode === 'overrun') { queueMicrotask(() => { entry.delivered = true; this.deliver({ id: data.id, result: evaluateWorker(data).result, elapsedMs: 900 }); }); return; }
            if (FakeWorker.mode === 'duplicateResult') { queueMicrotask(() => { entry.delivered = true; const message = evaluateWorker(data); this.deliver(message); this.deliver(message); }); return; }
            // 旧任务重复编号（严格小于当前任务编号）先到：必须被忽略，随后的当前结果照常结算。
            if (FakeWorker.mode === 'staleThenOk') { queueMicrotask(() => { entry.delivered = true; this.deliver({ id: data.id - 1, result: 'stale-wrong', elapsedMs: 1 }); this.deliver(evaluateWorker(data)); }); return; }
            // 非法响应：缺失编号/未来编号/缺失或非有限 elapsedMs/无结果也无错误，都必须按协议错误立即结束并清理实例。
            if (FakeWorker.mode === 'missingId') { queueMicrotask(() => { entry.delivered = true; this.deliver({ result: 'stale-wrong', elapsedMs: 1 }); }); return; }
            if (FakeWorker.mode === 'futureId') { queueMicrotask(() => { entry.delivered = true; this.deliver({ id: data.id + 1000, result: 'stale-wrong', elapsedMs: 1 }); }); return; }
            if (FakeWorker.mode === 'missingElapsed') { queueMicrotask(() => { entry.delivered = true; this.deliver({ id: data.id, result: 'stale-wrong' }); }); return; }
            if (FakeWorker.mode === 'nanElapsed') { queueMicrotask(() => { entry.delivered = true; this.deliver({ id: data.id, result: 'stale-wrong', elapsedMs: NaN }); }); return; }
            if (FakeWorker.mode === 'infinityElapsed') { queueMicrotask(() => { entry.delivered = true; this.deliver({ id: data.id, result: 'stale-wrong', elapsedMs: Infinity }); }); return; }
            if (FakeWorker.mode === 'badPayload') { queueMicrotask(() => { entry.delivered = true; this.deliver({ id: data.id, elapsedMs: 1 }); }); return; }
            if (FakeWorker.mode === 'duplicateReady') return;
            if (FakeWorker.mode === 'stall') return;
            queueMicrotask(() => { entry.delivered = true; this.deliver(evaluateWorker(data)); });
        }
        deliver(message) { if (!this.terminated && this.onmessage) this.onmessage({ data: message }); }
        terminate() { this.terminated = true; if (this.readyTimer != null) clearTimeout(this.readyTimer); }
    }
    FakeWorker.mode = 'normal';
    FakeWorker.loadDelayMs = 0;
    FakeWorker.failBlob = false;

    let activeConv = null;
    let renderCount = 0;
    // 只缩短装载超时（10000ms）用于测试，其他定时器保持真实值；断言里仍校验实际配置为 10 秒。
    const timing = { loadTimeoutMs: null };
    const context = {
        console,
        setTimeout: (fn, ms, ...args) => setTimeout(fn, timing.loadTimeoutMs != null && ms >= 10000 ? timing.loadTimeoutMs : ms, ...args),
        clearTimeout,
        URL,
        Worker: FakeWorker,
        document: { baseURI: 'http://local.test/' },
        dom: { messagesContainer: null },
        renderStaticMessage: text => String(text),
        state: { settings: { userName: 'Sensei', userDescription: 'Patient teacher', sillyTavernPreset: { prompts: [], regexScripts: [], regexScriptsEnabled: false } } },
        getActiveConv: () => activeConv,
        renderMessagesOnly: () => { renderCount += 1; harness.renderAll(); }
    };
    vm.createContext(context);
    vm.runInContext([
        readSource('mvu/40-mvu-data.js'),
        readSource('mvu/40-mvu-parser.js'),
        readSource('mvu/40-mvu-yaml-parser.js'),
        readSource('mvu/40-mvu-update-blocks.js'),
        readSource('mvu/40-mvu-patch-runtime.js'),
        readSource('mvu/40-mvu-schema-defaults.js'),
        readSource('mvu/40-mvu-template-expressions.js'),
        readSource('mvu/40-mvu-template-parser.js'),
        readSource('mvu/40-mvu-template.js'),
        readSource('mvu/40-mvu-initial-state.js'),
        readSource('mvu/40-mvu-runtime.js'),
        readSource('mvu/40-mvu-mutations.js'),
        readSource('conversation/32-message-identity.js'),
        readSource('prompt/40-sillytavern-macro-runtime.js'),
        readSource('prompt/40-character-prompt-helpers.js'),
        readSource('prompt/40-character-regex-runtime.js'),
        readSource('prompt/40-regex-worker-runtime.js')
    ].join('\n'), context, { filename: 'regex-runtime.js' });

    const harness = {
        context,
        FakeWorker,
        timing,
        posted,
        instances,
        evaluateWorker,
        messages: [],
        character: null,
        conv: null,
        rendered: [],
        renderCount: () => renderCount,
        setActiveConv: conv => { activeConv = conv; harness.conv = conv; },
        get activeConv() { return activeConv; },
        flag: expression => vm.runInContext(expression, context),
        fn: name => vm.runInContext(name, context),
        renderAll() {
            harness.rendered = harness.messages.map(message => harness.fn('formatMessage')(message.content, {
                conv: harness.conv, msg: message, character: harness.character,
                processingPhase: 'display', sourcePlacement: 'AI_OUTPUT'
            }));
        },
        deliverAll() {
            for (let guard = 0; guard < 100000; guard += 1) {
                const entry = posted.find(item => !item.delivered);
                if (!entry) return;
                entry.delivered = true;
                entry.worker.deliver(evaluateWorker(entry.data));
            }
        },
        // ready 协议让一次调度需要两轮微任务：调度启动 Worker -> Worker 投递 ready -> 提交任务。
        async microtasks(count = 6) {
            for (let i = 0; i < count; i += 1) await Promise.resolve();
        },
        async settle(maxMs = 3000) {
            const start = Date.now();
            let lastPosts = -1;
            let lastRenders = -1;
            let stable = 0;
            while (Date.now() - start < maxMs) {
                await new Promise(resolve => setTimeout(resolve, 40));
                if (posted.length === lastPosts && renderCount === lastRenders) {
                    stable += 1;
                    if (stable >= 2) return;
                } else {
                    stable = 0;
                    lastPosts = posted.length;
                    lastRenders = renderCount;
                }
            }
        }
    };
    return harness;
}

function makeConv(id) { return { id, stLocalVars: {}, messages: [] }; }
function makeCharacter(scripts) {
    return { name: 'Arona', regexScriptsEnabled: true, regexScriptsPromptEnabled: true, extensions: { regex_scripts: scripts } };
}

// Blob/URL 桩：记录 createObjectURL 收到的 Blob 与 revokeObjectURL 调用，同时保留可在 VM 中构造的 URL。
function stubObjectUrls(created, revoked) {
    return class StubURL extends URL {
        static createObjectURL(blob) { created.push(blob); return 'blob:embedded-' + created.length; }
        static revokeObjectURL(url) { revoked.push(url); }
    };
}

// 0) 求值器使用真实 Worker 语义：装载不主动发消息，prepare 才回 ready，普通请求第一条消息就是 result
{
    const worker = captureWorkerMessages();
    assert.equal(worker.messages.length, 0, '真实 regex-worker.js 装载完成后不得主动发送消息');
    worker.send({ type: 'regex-worker-prepare' });
    assert.equal(worker.messages.length, 1, 'prepare 消息必须恰好返回一条回复');
    assert.equal(worker.messages[0].ready, true, 'prepare 消息必须返回 { ready: true }');
    const taskMessages = captureWorkerMessages();
    taskMessages.send({ text: 'a1a', source: 'a', flags: 'g', replacement: 'b', trimStrings: [] });
    assert.ok(taskMessages.messages.length === 1 && taskMessages.messages[0].ready !== true, '旧客户端直发任务第一条消息不得是 ready');
    assert.equal(taskMessages.messages[0].result, 'b1b', '旧客户端直发任务第一条消息必须是 result');
}
assert.equal(
    createWorkerEvaluator()({ text: 'a1a', source: 'a', flags: 'g', replacement: 'b', trimStrings: [] }).result,
    'b1b',
    'FakeWorker 必须复用真实 regex-worker.js，而不是镜像实现'
);

// 1) 显示链按规则顺序串联，后续规则使用上一步输出而非未替换原文
{
    const h = createHarness();
    const conv = makeConv('c-order');
    const msg = { role: 'assistant', content: 'a' };
    conv.messages.push(msg);
    h.setActiveConv(conv);
    h.character = makeCharacter([
        { placement: [2], findRegex: 'a', replaceString: 'b' },
        { placement: [2], findRegex: 'b', replaceString: 'c' }
    ]);
    h.messages = [msg];
    h.renderAll();
    assert.equal(h.rendered[0], 'a', '结果就绪前先显示原文');
    await h.settle();
    assert.equal(h.rendered[0], 'c', '显示链必须顺序执行并稳定到最终结果');
}

// 1b) 规则顺序决定结果（先 ab->x，再 a->b 得到 x；反序则为 bb）
{
    const h = createHarness();
    const conv = makeConv('c-precedence');
    const msg = { role: 'assistant', content: 'ab' };
    conv.messages.push(msg);
    h.setActiveConv(conv);
    h.character = makeCharacter([
        { placement: [2], findRegex: 'ab', replaceString: 'x' },
        { placement: [2], findRegex: 'a', replaceString: 'b' }
    ]);
    h.messages = [msg];
    h.renderAll();
    await h.settle();
    assert.equal(h.rendered[0], 'x', '必须保持条目顺序');
}

// 2) 150 条可见消息 × 3 条规则：全部完成、顺序正确、清空积压后不再执行 Worker、不无限调度
{
    const h = createHarness();
    const conv = makeConv('c-bulk');
    h.character = makeCharacter([
        { placement: [2], findRegex: 'a', replaceString: 'b' },
        { placement: [2], findRegex: 'b', replaceString: 'c' },
        { placement: [2], findRegex: 'c', replaceString: 'd' }
    ]);
    for (let i = 0; i < 150; i += 1) conv.messages.push({ role: 'assistant', content: 'a' + i });
    h.messages = conv.messages;
    h.setActiveConv(conv);
    h.renderAll();
    await h.settle();
    assert.equal(h.posted.length, 150 * 3, '每条消息每步规则只执行一次');
    for (let i = 0; i < 150; i += 1) assert.equal(h.rendered[i], 'd' + i, `消息 ${i} 的显示结果`);
    const posts = h.posted.length;
    h.renderAll();
    assert.equal(h.posted.length, posts, '清空积压后重复渲染不得再执行 Worker');
    const renders = h.renderCount();
    await new Promise(resolve => setTimeout(resolve, 200));
    assert.equal(h.renderCount(), renders, '稳定后不得继续调度渲染');
    assert.equal(h.flag('regexRenderScheduled'), false, '调度标记必须复位');
}

// 3) 提示词优先 + 显示积压 >= 256 不拒绝提示词请求
{
    const h = createHarness();
    h.FakeWorker.mode = 'manual';
    const conv = makeConv('c-priority');
    const character = makeCharacter([{ placement: [2], findRegex: 'a', replaceString: 'b' }]);
    for (let i = 0; i < 300; i += 1) conv.messages.push({ role: 'assistant', content: 'a' + i });
    h.character = character;
    h.messages = conv.messages;
    h.setActiveConv(conv);
    h.renderAll();
    assert.equal(h.instances.length, 0, '同步渲染栈内不得创建 Worker');
    assert.equal(h.posted.length, 0, '同步渲染栈内不得提交任务');
    assert.equal(h.flag('regexDisplayQueue.length'), 256, '显示队列受限');
    assert.equal(h.flag('regexWaitingDisplayTasks.length'), 44, '超出上限的显示任务等待而不拒绝');
    await h.microtasks();
    assert.equal(h.posted.length, 1, '微任务后才启动首个显示任务');
    const promptPromise = h.fn('applyRegexScriptsAsync')('prompt-a', character, { conv, processingPhase: 'prompt', sourcePlacement: 'AI_OUTPUT', character });
    const first = h.posted[0];
    first.delivered = true;
    first.worker.deliver(h.evaluateWorker(first.data));
    await h.microtasks();
    assert.equal(h.posted.length, 2, '释放后调度下一个任务');
    assert.equal(h.posted[1].data.text, 'prompt-a', '提示词任务必须优先于积压的显示任务');
    h.FakeWorker.mode = 'normal';
    h.deliverAll();
    await h.settle();
    assert.equal(await promptPromise, 'prompt-b', '显示积压时提示词仍被完整处理');
}

// 4) pending 独立去重：>256 条不同任务与重复请求都不重复排队，同 key 跨 phase 复用并提升
{
    const h = createHarness();
    h.FakeWorker.mode = 'manual';
    const run = h.fn('runRegexReplacement');
    const pattern = h.flag('new RegExp("k", "g")');
    const script = { trimStrings: [] };
    const texts = Array.from({ length: 300 }, (_, i) => 'z' + i);
    texts.forEach(text => run(text, pattern, 'x', script, { priority: 'display' }));
    assert.equal(h.flag('regexPendingTasks.size'), 300, 'pending 独立于完成缓存');
    assert.equal(h.posted.length, 0, '同步栈内不启动 Worker');
    await h.microtasks();
    assert.equal(h.posted.length, 1, '微任务后只执行队首任务');
    texts.forEach(text => run(text, pattern, 'x', script, { priority: 'display' }));
    assert.equal(h.flag('regexPendingTasks.size'), 300, '重复的 pending 请求不得重复排队');
    assert.equal(h.posted.length, 1);
    run('shared-key', pattern, 'x', script, { priority: 'display' });
    assert.equal(h.flag('regexPendingTasks.size'), 301, '新的 pending 任务入队一次');
    run('shared-key', pattern, 'x', script, { priority: 'prompt' });
    assert.equal(h.flag('regexPendingTasks.size'), 301, '同 key 跨 phase 只执行一次');
    assert.equal(h.flag('regexPromptQueue.length'), 1, '复用的显示任务被提升到提示词队列');
    h.FakeWorker.mode = 'normal';
    h.deliverAll();
    await h.settle();
    assert.equal(h.posted.length, 301, '排空后每个不同任务只执行一次');
}

// 5) Worker 错误 / 超时后可重新调用成功；失败的显示规则保持原文且不循环
{
    const h = createHarness();
    const run = h.fn('runRegexReplacement');
    const pattern = h.flag('new RegExp("a", "g")');
    const script = { trimStrings: [] };
    h.FakeWorker.mode = 'error';
    await assert.rejects(run('aa', pattern, 'b', script, { priority: 'prompt' }), /fake-worker-error/);
    h.FakeWorker.mode = 'normal';
    assert.equal(await run('aa', pattern, 'b', script, { priority: 'prompt' }), 'bb', '失败后必须可重试');

    h.FakeWorker.mode = 'stall';
    const started = Date.now();
    await assert.rejects(run('aaa', pattern, 'b', script, { priority: 'prompt' }), /500ms/);
    assert.ok(Date.now() - started >= 480, '超时必须等待 500ms 后终止');
    h.FakeWorker.mode = 'normal';
    assert.equal(await run('aaa', pattern, 'b', script, { priority: 'prompt' }), 'bbb', '超时终止后可重试');
}

// 5c) 装载延迟与执行耗时分离：装载超过 500ms 但简单规则仍成功，装载超时才失败
{
    const h = createHarness();
    h.FakeWorker.loadDelayMs = 600;
    const run = h.fn('runRegexReplacement');
    const pattern = h.flag('new RegExp("a", "g")');
    const script = { name: '延迟装载规则', trimStrings: [] };
    const started = Date.now();
    assert.equal(await run('aa', pattern, 'b', script, { priority: 'prompt' }), 'bb', '装载 600ms 不得被当作执行超时');
    assert.ok(Date.now() - started >= 580, '确实等待了装载完成');
    h.FakeWorker.loadDelayMs = 0;
}

// 5d) 执行真正卡住仍按 500ms 终止，超时提示包含规则名称
{
    const h = createHarness();
    const run = h.fn('runRegexReplacement');
    const pattern = h.flag('new RegExp("a", "g")');
    h.FakeWorker.mode = 'stall';
    await assert.rejects(
        run('aaa', pattern, 'b', { name: '卡住规则', trimStrings: [] }, { priority: 'prompt' }),
        /500ms.*卡住规则/,
        '执行超时必须包含规则名称'
    );
    await assert.rejects(
        run('aaa', pattern, 'b', { scriptName: '脚本名规则', trimStrings: [] }, { priority: 'prompt' }),
        /500ms.*脚本名规则/,
        'scriptName 形式的规则名也必须出现在超时提示中'
    );
    h.FakeWorker.mode = 'normal';
}

// 5e) Worker 装载失败（onerror）后队列能继续，且失败不缓存
{
    const h = createHarness();
    h.FakeWorker.mode = 'loaderror';
    const run = h.fn('runRegexReplacement');
    const pattern = h.flag('new RegExp("a", "g")');
    const script = { trimStrings: [] };
    await assert.rejects(run('aa', pattern, 'b', script, { priority: 'prompt' }), /加载/, '装载失败必须明确报错');
    h.FakeWorker.mode = 'normal';
    assert.equal(await run('aa', pattern, 'b', script, { priority: 'prompt' }), 'bb', '装载失败后队列能继续并重试成功');
}

// 5f) Worker 正常返回但实际执行超过 500ms（elapsedMs）同样拒绝，且失败不缓存
{
    const h = createHarness();
    const run = h.fn('runRegexReplacement');
    const pattern = h.flag('new RegExp("a", "g")');
    const script = { name: '耗时规则', trimStrings: [] };
    h.FakeWorker.mode = 'overrun';
    await assert.rejects(run('aa', pattern, 'b', script, { priority: 'prompt' }), /500ms.*耗时规则/, 'elapsedMs 超过上限必须拒绝');
    h.FakeWorker.mode = 'normal';
    assert.equal(await run('aa', pattern, 'b', script, { priority: 'prompt' }), 'bb', 'elapsedMs 拒绝后不得缓存失败');
}

// 5g) 真实 Worker 超过装载上限仍未 ready：终止、释放队列，后续请求恢复正常
{
    const h = createHarness();
    const run = h.fn('runRegexReplacement');
    const pattern = h.flag('new RegExp("a", "g")');
    const script = { trimStrings: [] };
    assert.equal(h.flag('REGEX_WORKER_LOAD_TIMEOUT_MS'), 10000, '装载上限的实际配置必须仍是 10 秒');
    h.timing.loadTimeoutMs = 60; // 测试注入短定时器，避免真等 10s
    h.FakeWorker.mode = 'noready';
    const started = Date.now();
    await assert.rejects(
        run('aa', pattern, 'b', script, { priority: 'prompt' }),
        /加载失败/,
        'Worker 超过装载上限未 ready 必须明确报告加载失败'
    );
    assert.ok(Date.now() - started >= 50, '必须等到装载上限才终止，而不是立刻失败');
    assert.equal(h.instances[0].terminated, true, '装载超时必须终止未就绪的 Worker');
    assert.equal(h.flag('regexWorkerBusy'), false, '装载超时后必须释放运行中的任务');
    assert.equal(h.flag('regexPendingTasks.size'), 0, '装载超时后不得残留 pending 任务');
    h.FakeWorker.mode = 'normal';
    assert.equal(await run('aa', pattern, 'b', script, { priority: 'prompt' }), 'bb', '装载超时后队列恢复，后续请求正常成功');
}

// 5b) 提示词错误必须阻止请求，显示错误保持原文且不无限重试
{
    const h = createHarness();
    const conv = makeConv('c-display-error');
    const msg = { role: 'assistant', content: 'a' };
    conv.messages.push(msg);
    h.setActiveConv(conv);
    h.character = makeCharacter([{ placement: [2], findRegex: 'a', replaceString: 'b' }]);
    h.messages = [msg];
    h.FakeWorker.mode = 'error';
    h.renderAll();
    await h.settle(1500);
    assert.equal(h.rendered[0], 'a', '显示失败保持原文');
    const posts = h.posted.length;
    h.renderAll();
    await new Promise(resolve => setTimeout(resolve, 150));
    assert.equal(h.posted.length, posts, '显示失败后重复渲染不得再触发 Worker');
    await assert.rejects(
        h.fn('applyRegexScriptsAsync')('a', h.character, { conv, processingPhase: 'prompt', sourcePlacement: 'AI_OUTPUT' }),
        /fake-worker-error/,
        '实际提示词错误必须传递出去'
    );
}

// 6) 原文、规则启用、替换宏与会话切换的失效
{
    const h = createHarness();
    const conv = makeConv('c-invalidation');
    conv.stLocalVars.mood = 'happy';
    const msg = { role: 'assistant', content: 'a' };
    conv.messages.push(msg);
    h.setActiveConv(conv);
    h.character = makeCharacter([{ placement: [2], findRegex: 'a', replaceString: '{{getvar::mood}}' }]);
    h.messages = [msg];
    h.renderAll();
    await h.settle();
    assert.equal(h.rendered[0], 'happy', '替换宏应展开会话变量');
    conv.stLocalVars.mood = 'sad';
    h.renderAll();
    await h.settle();
    assert.equal(h.rendered[0], 'sad', '会话变量变化必须使显示链失效');
    msg.content = 'a!';
    h.renderAll();
    await h.settle();
    assert.equal(h.rendered[0], 'sad!', '原文本变化必须重算');
    h.character.regexScriptsEnabled = false;
    h.renderAll();
    assert.equal(h.rendered[0], 'a!', '关闭规则后保持原文');
    // 非当前会话的显示链完成不得触发当前会话重渲染
    h.character.regexScriptsEnabled = true;
    h.setActiveConv(makeConv('c-other'));
    h.conv = conv;
    const renders = h.renderCount();
    msg.content = 'aa';
    h.renderAll();
    await h.settle();
    assert.equal(h.renderCount(), renders, '非活动会话的显示链不得触发当前会话渲染');
}

// 7) 无 Worker 时复杂规则拒绝；非法长度与 pattern 校验保持
{
    const h = createHarness();
    const body = { id: 'c-noworker' };
    const unsupported = makeCharacter([{ placement: [2], findRegex: '(a+)+$', replaceString: 'x' }]);
    h.context.Worker = undefined;
    await assert.rejects(
        h.fn('applyRegexScriptsAsync')('aaaa', unsupported, { conv: body, processingPhase: 'prompt', sourcePlacement: 'AI_OUTPUT' }),
        /复杂规则保持关闭/,
        '无 Worker 时复杂提示词规则必须拒绝'
    );
    assert.equal(
        h.fn('formatMessage')('aaaa', { conv: body, msg: { role: 'assistant', content: 'aaaa' }, character: unsupported, processingPhase: 'display', sourcePlacement: 'AI_OUTPUT' }),
        'aaaa',
        '无 Worker 时复杂显示规则保持原文'
    );
    const run = h.fn('runRegexReplacement');
    await assert.rejects(run('a'.repeat(500001), h.flag('new RegExp("a", "g")'), 'b', { trimStrings: [] }), /500000/);
    const validate = h.fn('validateRegexScript');
    assert.throws(() => validate({ placement: [2], findRegex: 'x'.repeat(10001), replaceString: '' }), /10000/);
    assert.throws(() => validate({ placement: [2], findRegex: 'x', replaceString: 'y', flags: 'gz' }), /标志/);
}

// 8) 历史消息显示必须使用自身对应的 MVU，而非会话最新状态；上游 MVU 变化要重算
{
    const h = createHarness();
    const conv = makeConv('c-mvu');
    conv.messages.push({ role: 'assistant', id: 'm0', content: '<initvar>{"stat_data":{"name":"first"}}</initvar>prev' });
    const msg = { role: 'assistant', id: 'm1', content: 'AAA' };
    conv.messages.push(msg);
    h.setActiveConv(conv);
    h.character = makeCharacter([{ placement: [2], findRegex: 'AAA', replaceString: '<%= stat_data.name %>' }]);
    h.messages = [msg];
    h.renderAll();
    await h.settle();
    assert.equal(h.rendered[0], 'first', '历史消息必须使用自身对应的 MVU 数据');
    conv.messages[0].content = '<initvar>{"stat_data":{"name":"second"}}</initvar>prev';
    const postsBefore = h.posted.length;
    h.renderAll();
    await h.settle();
    assert.equal(h.rendered[0], 'second', '上游 MVU 变化必须使显示链失效重算');
    assert.equal(h.posted.length, postsBefore + 1, '仅本消息的链重算一次');
}

// 9) 预设 main 正文（{{charPrompt}}）变化必须使显示链失效
{
    const h = createHarness();
    const conv = makeConv('c-preset');
    const msg = { role: 'assistant', content: 'A' };
    conv.messages.push(msg);
    h.setActiveConv(conv);
    h.character = makeCharacter([{ placement: [2], findRegex: 'A', replaceString: '{{charPrompt}}' }]);
    h.messages = [msg];
    h.context.state.settings.sillyTavernPreset = { prompts: [{ identifier: 'main', content: 'MAIN-1' }], regexScripts: [], regexScriptsEnabled: false };
    h.renderAll();
    await h.settle();
    assert.equal(h.rendered[0], 'MAIN-1', '{{charPrompt}} 展开预设 main 正文');
    h.context.state.settings.sillyTavernPreset.prompts[0].content = 'MAIN-2';
    h.renderAll();
    await h.settle();
    assert.equal(h.rendered[0], 'MAIN-2', '预设 main 正文变化必须使显示链失效');
}

// 10) 历史消息内容编辑（数量不变）必须使 {{lastusermessage}} 显示链失效
{
    const h = createHarness();
    const conv = makeConv('c-history');
    const target = { role: 'assistant', content: 'A' };
    conv.messages.push({ role: 'user', content: 'hi-1' });
    conv.messages.push(target);
    h.setActiveConv(conv);
    h.character = makeCharacter([{ placement: [2], findRegex: 'A', replaceString: '{{lastusermessage}}' }]);
    h.messages = [target];
    h.renderAll();
    await h.settle();
    assert.equal(h.rendered[0], 'hi-1', '{{lastusermessage}} 展开上一条用户消息');
    conv.messages[0].content = 'hi-2';
    h.renderAll();
    await h.settle();
    assert.equal(h.rendered[0], 'hi-2', '历史内容编辑必须使显示链失效');
}

// 11) 深度边界变化必须使显示链失效
{
    const h = createHarness();
    const conv = makeConv('c-depth');
    const msg = { role: 'assistant', content: 'a' };
    conv.messages.push(msg);
    h.setActiveConv(conv);
    h.character = makeCharacter([{ placement: [2], findRegex: 'a', replaceString: 'b', minDepth: 1 }]);
    const ctx = depth => ({ conv, msg, character: h.character, processingPhase: 'display', sourcePlacement: 'AI_OUTPUT', depth });
    assert.equal(h.fn('formatMessage')('a', ctx(2)), 'a', '结果就绪前先显示原文');
    await h.settle();
    assert.equal(h.fn('formatMessage')('a', ctx(2)), 'b', '深度满足时应用规则');
    assert.equal(h.fn('formatMessage')('a', ctx(0)), 'a', '深度不满足时规则失效并保持原文');
}

// 12) 规则顺序变化必须使显示链失效
{
    const h = createHarness();
    const conv = makeConv('c-order-invalidate');
    const msg = { role: 'assistant', content: 'ab' };
    conv.messages.push(msg);
    h.setActiveConv(conv);
    const ruleX = { placement: [2], findRegex: 'ab', replaceString: 'x' };
    const ruleA = { placement: [2], findRegex: 'a', replaceString: 'b' };
    h.character = makeCharacter([ruleX, ruleA]);
    h.messages = [msg];
    h.renderAll();
    await h.settle();
    assert.equal(h.rendered[0], 'x', '先 ab->x 得到 x');
    h.character.extensions.regex_scripts = [ruleA, ruleX];
    h.renderAll();
    await h.settle();
    assert.equal(h.rendered[0], 'bb', '规则顺序变化必须使显示链失效');
}

// 13) 关闭规则后旧链不再继续：手动 Worker 下不新增 post、不额外重渲染
{
    const h = createHarness();
    h.FakeWorker.mode = 'manual';
    const conv = makeConv('c-cancel');
    const msg = { role: 'assistant', content: 'a' };
    conv.messages.push(msg);
    h.setActiveConv(conv);
    h.character = makeCharacter([
        { placement: [2], findRegex: 'a', replaceString: 'b' },
        { placement: [2], findRegex: 'b', replaceString: 'c' }
    ]);
    h.messages = [msg];
    h.renderAll();
    assert.equal(h.posted.length, 0, '同步栈内不启动 Worker');
    await h.microtasks();
    assert.equal(h.posted.length, 1, '首步占用 Worker');
    h.character.regexScriptsEnabled = false;
    h.renderAll();
    assert.equal(h.rendered[0], 'a', '关闭规则后立即回到原文');
    const posts = h.posted.length;
    const renders = h.renderCount();
    const first = h.posted[0];
    first.delivered = true;
    first.worker.deliver(h.evaluateWorker(first.data));
    assert.equal(h.posted.length, posts, '失效链不得再提交后续步骤');
    await new Promise(resolve => setTimeout(resolve, 80));
    assert.equal(h.renderCount(), renders, '失效链不得触发重渲染');
    assert.equal(h.flag('regexPendingTasks.size'), 0, '失效链的等待任务须释放');
}

// 14) 切换会话后旧链在异步结束时停止，不再继续或占用队列
{
    const h = createHarness();
    h.FakeWorker.mode = 'manual';
    const convA = makeConv('c-switch-a');
    const msg = { role: 'assistant', content: 'a' };
    convA.messages.push(msg);
    h.setActiveConv(convA);
    h.character = makeCharacter([{ placement: [2], findRegex: 'a', replaceString: 'b' }]);
    h.messages = [msg];
    h.renderAll();
    assert.equal(h.posted.length, 0, '同步栈内不启动 Worker');
    await h.microtasks();
    assert.equal(h.posted.length, 1);
    h.setActiveConv(makeConv('c-switch-b'));
    const first = h.posted[0];
    first.delivered = true;
    first.worker.deliver(h.evaluateWorker(first.data));
    assert.equal(h.posted.length, 1, '切换会话后旧链异步结束不得继续');
}

// 15) 无 context.msg 的显示路径（流式）仍执行复杂规则
{
    const h = createHarness();
    const conv = makeConv('c-stream');
    h.setActiveConv(conv);
    h.character = makeCharacter([{ placement: [2], findRegex: '(foo)+', replaceString: 'ok' }]);
    const context = { conv, character: h.character, processingPhase: 'display', sourcePlacement: 'AI_OUTPUT' };
    assert.equal(h.fn('formatMessage')('foofoo', context), 'foofoo', '结果就绪前先显示原文');
    await h.settle();
    assert.equal(h.fn('formatMessage')('foofoo', context), 'ok', '无消息对象时复杂显示规则也须由 Worker 执行');
}

// 16) 流式新版本文本取代旧 pending：等待队列不积累
{
    const h = createHarness();
    h.FakeWorker.mode = 'manual';
    const conv = makeConv('c-stream-supersede');
    h.setActiveConv(conv);
    h.character = makeCharacter([{ placement: [2], findRegex: 'x', replaceString: 'y' }]);
    const render = text => h.fn('formatMessage')(text, { conv, character: h.character, processingPhase: 'display', sourcePlacement: 'AI_OUTPUT' });
    for (let i = 1; i <= 20; i += 1) render('x'.repeat(i));
    assert.equal(h.posted.length, 0, '同步栈内不启动 Worker');
    assert.ok(h.flag('regexPendingTasks.size') <= 2, '过时版本的 pending 必须被释放');
    assert.equal(h.flag('regexDisplayQueue.length'), 1, '显示队列只保留最新版本文本');
    assert.equal(h.flag('regexWaitingDisplayTasks.length'), 0, '过时版本不得积压等待队列');
    await h.microtasks();
    assert.equal(h.posted.length, 1, '微任务后只有当前版本占用 Worker');
    h.FakeWorker.mode = 'normal';
    h.deliverAll();
    await h.settle();
}

// 17) 切换会话后旧会话的等待显示任务被释放（队列不残留）
{
    const h = createHarness();
    h.FakeWorker.mode = 'manual';
    const convA = makeConv('c-drain-a');
    h.character = makeCharacter([{ placement: [2], findRegex: 'a', replaceString: 'b' }]);
    for (let i = 0; i < 300; i += 1) convA.messages.push({ role: 'assistant', content: 'a' + i });
    h.setActiveConv(convA);
    convA.messages.forEach(msg => h.fn('formatMessage')(msg.content, { conv: convA, msg, character: h.character, processingPhase: 'display', sourcePlacement: 'AI_OUTPUT' }));
    assert.equal(h.flag('regexDisplayQueue.length'), 256, '显示队列受限');
    assert.equal(h.flag('regexWaitingDisplayTasks.length'), 44, '超出上限的显示任务进入等待队列');
    const convB = makeConv('c-drain-b');
    const msgB = { role: 'assistant', content: 'a' };
    convB.messages.push(msgB);
    h.setActiveConv(convB);
    h.fn('formatMessage')('a', { conv: convB, msg: msgB, character: h.character, processingPhase: 'display', sourcePlacement: 'AI_OUTPUT' });
    assert.equal(h.flag('regexWaitingDisplayTasks.length'), 0, '切换会话后旧等待任务必须释放');
    assert.ok(h.flag('regexDisplayQueue.length') <= 1, '旧会话显示队列清空，仅保留新会话任务');
}

// 18) 显示链签名为结构化 JSON，不受分隔符字符（U+0001）碰撞影响
{
    const h = createHarness();
    const info = { charName: 'Arona', userName: 'Sensei', settings: {} };
    const sig = h.fn('buildRegexDisplaySignature')('a\u0001b', [], 2, info, { conv: makeConv('c-sig'), msg: null });
    assert.equal(JSON.parse(sig).raw, 'a\u0001b', '签名必须直接保留原文，而不是用分隔符拼接');
}

// 19) 生成期间历史显示链完成不得重建历史；生成结束后仅合并刷新一次
{
    const h = createHarness();
    const conv = makeConv('c-generating');
    const msg = { role: 'assistant', content: 'a' };
    conv.messages.push(msg);
    h.setActiveConv(conv);
    h.character = makeCharacter([{ placement: [2], findRegex: 'a', replaceString: 'b' }]);
    h.messages = [msg];
    h.context.state.isGenerating = true;
    h.renderAll();
    await h.settle(800);
    assert.equal(
        h.fn('formatMessage')('a', { conv, msg, character: h.character, processingPhase: 'display', sourcePlacement: 'AI_OUTPUT' }),
        'b',
        '显示链结果仍被计算并缓存'
    );
    await new Promise(resolve => setTimeout(resolve, 250));
    assert.equal(h.renderCount(), 0, '生成期间显示完成不得重建历史（否则销毁流式气泡）');
    h.context.state.isGenerating = false;
    await new Promise(resolve => setTimeout(resolve, 250));
    assert.equal(h.renderCount(), 1, '生成结束后仅合并刷新一次');
    await new Promise(resolve => setTimeout(resolve, 200));
    assert.equal(h.renderCount(), 1, '合并刷新后不得再重复调度');
    assert.equal(h.flag('regexDeferredRenderTimer'), null, '延迟刷新定时器必须复位');
}

// 20) 无消息对象的流式显示链执行复杂规则但不触发全量历史刷新
{
    const h = createHarness();
    const conv = makeConv('c-stream-nomsg');
    h.setActiveConv(conv);
    h.character = makeCharacter([{ placement: [2], findRegex: '(foo)+', replaceString: 'ok' }]);
    const context = { conv, character: h.character, processingPhase: 'display', sourcePlacement: 'AI_OUTPUT' };
    assert.equal(h.fn('formatMessage')('foofoo', context), 'foofoo', '结果就绪前先显示原文');
    await h.settle();
    assert.equal(h.fn('formatMessage')('foofoo', context), 'ok', '无消息复杂规则仍由 Worker 执行');
    await new Promise(resolve => setTimeout(resolve, 150));
    assert.equal(h.renderCount(), 0, '无消息链完成不得触发全量历史刷新');
}

// 21) 精确竞态：调度时未生成，32ms 定时器触发前开始生成，不得重建历史
{
    const h = createHarness();
    const conv = makeConv('c-race-schedule');
    const msg = { role: 'assistant', content: 'a' };
    conv.messages.push(msg);
    h.setActiveConv(conv);
    h.context.state.isGenerating = false;
    h.fn('scheduleRegexDisplayRender')({ conv, msg });
    h.context.state.isGenerating = true;
    await new Promise(resolve => setTimeout(resolve, 70));
    assert.equal(h.renderCount(), 0, '开始生成后 32ms 定时器不得重建历史');
    h.context.state.isGenerating = false;
    await new Promise(resolve => setTimeout(resolve, 250));
    assert.equal(h.renderCount(), 1, '生成结束后仅合并刷新一次');
    await new Promise(resolve => setTimeout(resolve, 200));
    assert.equal(h.renderCount(), 1, '合并刷新后不得重复调度');
    assert.equal(h.flag('regexDeferredRenderTimer'), null, '延迟刷新定时器必须复位');
}

// 22) 同步渲染栈内不得创建 Worker/postMessage，微任务后才启动且只运行一个；整批链结果在清空后只合并重绘一次
{
    const h = createHarness();
    h.FakeWorker.mode = 'manual';
    const conv = makeConv('c-batch-async');
    const msgA = { role: 'assistant', content: 'a' };
    const msgB = { role: 'assistant', content: 'aa' };
    conv.messages.push(msgA, msgB);
    h.setActiveConv(conv);
    h.character = makeCharacter([{ placement: [2], findRegex: 'a', replaceString: 'x' }]);
    h.messages = [msgA, msgB];
    h.renderAll();
    assert.equal(h.instances.length, 0, '同步渲染栈内不得创建 Worker');
    assert.equal(h.posted.length, 0, '同步渲染栈内不得 postMessage');
    assert.equal(h.flag('regexPendingTasks.size'), 2, '两条链的任务已入队但未执行');
    await h.microtasks();
    assert.equal(h.instances.length, 1, '微任务后仅启动一个 Worker');
    assert.equal(h.posted.length, 1, '微任务后仅提交一个任务');
    const first = h.posted[0];
    first.delivered = true;
    first.worker.deliver(h.evaluateWorker(first.data));
    assert.equal(h.posted.length, 1, '第一条完成前不得并发提交第二条');
    assert.equal(h.renderCount(), 0, '第二条任务未完成时第一条链完成不得重绘');
    await h.microtasks();
    assert.equal(h.posted.length, 2, '第一条链完成后启动第二条');
    const second = h.posted[1];
    second.delivered = true;
    second.worker.deliver(h.evaluateWorker(second.data));
    await h.settle();
    assert.equal(h.renderCount(), 1, '整批完成后仅合并重绘一次');
    assert.equal(h.rendered[0], 'x', '第一条链结果');
    assert.equal(h.rendered[1], 'xx', '第二条链结果');
    await new Promise(resolve => setTimeout(resolve, 250));
    assert.equal(h.renderCount(), 1, '批次结束后不得重复重绘');
}

// 23) 批次清空后仍处于生成期间：合并刷新延后到生成结束，且只重绘一次
{
    const h = createHarness();
    h.FakeWorker.mode = 'manual';
    const conv = makeConv('c-race-batch');
    const msgA = { role: 'assistant', content: 'a' };
    const msgB = { role: 'assistant', content: 'aa' };
    conv.messages.push(msgA, msgB);
    h.setActiveConv(conv);
    h.character = makeCharacter([{ placement: [2], findRegex: 'a', replaceString: 'x' }]);
    h.messages = [msgA, msgB];
    h.renderAll();
    await h.microtasks();
    const first = h.posted[0];
    first.delivered = true;
    first.worker.deliver(h.evaluateWorker(first.data));
    await h.microtasks();
    h.context.state.isGenerating = true;
    const second = h.posted[1];
    second.delivered = true;
    second.worker.deliver(h.evaluateWorker(second.data));
    await new Promise(resolve => setTimeout(resolve, 70));
    assert.equal(h.renderCount(), 0, '批次清空后处于生成期间仍不得重建历史');
    h.context.state.isGenerating = false;
    await new Promise(resolve => setTimeout(resolve, 250));
    assert.equal(h.renderCount(), 1, '生成结束后仅合并刷新一次');
    await new Promise(resolve => setTimeout(resolve, 200));
    assert.equal(h.renderCount(), 1, '合并刷新后不得重复调度');
    assert.equal(h.flag('regexDeferredRenderTimer'), null, '延迟刷新定时器必须复位');
}

// 24) 复用单个健康 Worker：多条不同请求只创建一个实例、只握手一次、正常完成不终止、编号唯一
{
    const h = createHarness();
    const run = h.fn('runRegexReplacement');
    const pattern = h.flag('new RegExp("a", "g")');
    const cases = [['aa', 'bb'], ['aaa', 'bbb'], ['aaaa', 'bbbb'], ['a5', 'b5']];
    for (const [text, expected] of cases) {
        assert.equal(await run(text, pattern, 'b', { trimStrings: [] }, { priority: 'prompt' }), expected, `复用 Worker 处理 ${text}`);
    }
    assert.equal(h.instances.length, 1, '不同请求复用后只创建一个 Worker');
    assert.equal(h.instances[0].prepares, 1, '只进行一次 prepare 握手');
    assert.equal(h.instances[0].terminated, false, '正常完成后不得终止 Worker');
    assert.equal(h.posted.length, cases.length, '每个请求各自提交一次');
    assert.equal(new Set(h.posted.map(entry => entry.data.id)).size, cases.length, '每个任务必须有唯一编号');
}

// 25) 内嵌源码优先走 Blob Worker：执行期不请求同源脚本、字节来自内嵌源码、终止时释放 Blob URL
{
    const h = createHarness();
    h.context.REGEX_WORKER_SOURCE = workerSource;
    const created = [];
    const revoked = [];
    h.context.Blob = class FakeBlob { constructor(parts, options) { this.parts = parts; this.type = options && options.type; } };
    h.context.URL = stubObjectUrls(created, revoked);
    const run = h.fn('runRegexReplacement');
    const pattern = h.flag('new RegExp("a", "g")');
    assert.equal(await run('aa', pattern, 'b', { trimStrings: [] }, { priority: 'prompt' }), 'bb', '内嵌 Blob Worker 正常执行');
    assert.equal(h.instances.length, 1, '内嵌路径只创建一个 Worker');
    assert.equal(h.instances[0].url, 'blob:embedded-1', '优先用 Blob URL 构造 Worker，而不是同源脚本');
    assert.equal(created[0].parts[0], workerSource, 'Blob 字节必须等于内嵌的 canonical Worker 源码');
    assert.deepEqual(revoked, [], '正常完成不得释放仍在复用的 Worker 的 Blob URL');

    h.FakeWorker.mode = 'error';
    await assert.rejects(run('aaa', pattern, 'b', { trimStrings: [] }, { priority: 'prompt' }), /fake-worker-error/, '内嵌 Worker 报错必须传递');
    assert.deepEqual(revoked, ['blob:embedded-1'], '终止实例时必须释放 Blob URL');
    h.FakeWorker.mode = 'normal';
}

// 25b) Blob 构造被同步拒绝时回退同源 Worker 兼容分支，并释放被拒的 Blob URL
{
    const h = createHarness();
    h.context.REGEX_WORKER_SOURCE = workerSource;
    const created = [];
    const revoked = [];
    h.context.Blob = class FakeBlob { constructor(parts) { this.parts = parts; } };
    h.context.URL = stubObjectUrls(created, revoked);
    h.FakeWorker.failBlob = true;
    const run = h.fn('runRegexReplacement');
    const pattern = h.flag('new RegExp("a", "g")');
    assert.equal(await run('aa', pattern, 'b', { trimStrings: [] }, { priority: 'prompt' }), 'bb', 'Blob 构造被拒后回退同源 Worker 仍能执行');
    assert.ok(h.instances[0].url.includes('assets/js/regex-worker.js'), '回退必须使用同源脚本地址');
    assert.ok(h.instances[0].url.includes('v=20261015-regex-singleton-1'), '同源回退地址必须带版本参数');
    assert.deepEqual(revoked, ['blob:embedded-1'], '被拒的 Blob URL 必须释放');
    h.FakeWorker.failBlob = false;
}

// 26) 重复 ready / 构造拒绝 / 重复结果 / 不匹配编号：单次结算、释放队列、后续任务恢复
{
    const h = createHarness();
    const run = h.fn('runRegexReplacement');
    const pattern = h.flag('new RegExp("a", "g")');
    const script = { trimStrings: [] };

    // 重复 ready 不得重置执行期限。
    h.FakeWorker.mode = 'duplicateReady';
    const started = Date.now();
    await assert.rejects(run('aa', pattern, 'b', script, { priority: 'prompt' }), /500ms/, '重复 ready 后仍按 500ms 终止');
    const elapsed = Date.now() - started;
    assert.ok(elapsed >= 480 && elapsed < 750, `重复 ready 不得重置执行期限，实际 ${elapsed}ms`);
    assert.equal(h.flag('regexWorkerBusy'), false, '超时后必须释放运行状态');
    assert.equal(h.flag('regexPendingTasks.size'), 0, '超时后不得残留 pending 任务');

    // Worker 构造同步拒绝：报告装载失败，队列可恢复。
    h.FakeWorker.mode = 'ctorerror';
    await assert.rejects(run('aa', pattern, 'b', script, { priority: 'prompt' }), /加载/, '构造失败必须报告装载失败');
    h.FakeWorker.mode = 'normal';
    assert.equal(await run('aa', pattern, 'b', script, { priority: 'prompt' }), 'bb', '构造失败后队列恢复');

    // 重复结果只结算一次。
    const h2 = createHarness();
    h2.FakeWorker.mode = 'duplicateResult';
    const run2 = h2.fn('runRegexReplacement');
    const pattern2 = h2.flag('new RegExp("a", "g")');
    assert.equal(await run2('aa', pattern2, 'b', { trimStrings: [] }, { priority: 'prompt' }), 'bb', '重复结果只结算一次');
    assert.equal(h2.flag('regexPendingTasks.size'), 0, '重复结果后清空 pending');
    h2.FakeWorker.mode = 'normal';
    assert.equal(await run2('aaa', pattern2, 'b', { trimStrings: [] }, { priority: 'prompt' }), 'bbb', '重复结果后后续任务成功');

    // 旧任务重复编号的迟到响应必须被忽略，当前任务结果照常结算。
    const h3 = createHarness();
    h3.FakeWorker.mode = 'staleThenOk';
    const run3 = h3.fn('runRegexReplacement');
    const pattern3 = h3.flag('new RegExp("a", "g")');
    assert.equal(await run3('aa', pattern3, 'b', { trimStrings: [] }, { priority: 'prompt' }), 'bb', '旧任务重复编号的响应必须被忽略');
    assert.equal(h3.flag('regexWorkerInstance'), h3.instances[0], '忽略旧编号后仍复用同一健康 Worker');
}

// 27) 非法响应（缺失/非法/未来编号、缺失/非有限 elapsedMs、无结果也无错误）立即按协议错误结束并清理实例，队列随之恢复
{
    const cases = [
        ['missingId', '缺失编号'],
        ['futureId', '未来编号'],
        ['missingElapsed', '缺失耗时'],
        ['nanElapsed', '非有限耗时'],
        ['infinityElapsed', '无限耗时'],
        ['badPayload', '非法 payload']
    ];
    for (const [mode, label] of cases) {
        const h = createHarness();
        h.FakeWorker.mode = mode;
        const run = h.fn('runRegexReplacement');
        const pattern = h.flag('new RegExp("a", "g")');
        const script = { name: '协议规则', trimStrings: [] };
        await assert.rejects(run('aa', pattern, 'b', script, { priority: 'prompt' }), /响应无效/, `${label} 必须按协议错误立即结束`);
        assert.equal(h.instances[0].terminated, true, `${label} 后必须终止失效实例`);
        assert.equal(h.flag('regexWorkerInstance'), null, `${label} 后共享实例必须清空`);
        assert.equal(h.flag('regexWorkerReady'), false, `${label} 后不得保留就绪标记`);
        assert.equal(h.flag('regexPendingTasks.size'), 0, `${label} 后不得残留 pending 任务`);
        h.FakeWorker.mode = 'normal';
        assert.equal(await run('aa', pattern, 'b', script, { priority: 'prompt' }), 'bb', `${label} 后队列必须恢复`);
        assert.equal(h.instances.length, 2, `${label} 后必须新建实例而不是复用失效 Worker`);
    }
}

// 28) 空闲错误：任务正常完成后保留复用的 Worker 在空闲期崩溃，必须立即销毁共享实例，下一请求新建实例且成功
{
    const h = createHarness();
    const run = h.fn('runRegexReplacement');
    const pattern = h.flag('new RegExp("a", "g")');
    const script = { trimStrings: [] };
    assert.equal(await run('aa', pattern, 'b', script, { priority: 'prompt' }), 'bb', '首次请求成功');
    assert.equal(h.instances.length, 1, '只创建一个 Worker');
    assert.equal(h.instances[0].terminated, false, '正常完成后保留复用 Worker');
    assert.equal(h.flag('regexWorkerInstance'), h.instances[0], '共享实例仍指向保留的 Worker');
    h.instances[0].onerror({ message: 'simulated idle crash' });
    assert.equal(h.instances[0].terminated, true, '空闲错误必须终止已失效的共享 Worker');
    assert.equal(h.flag('regexWorkerInstance'), null, '空闲错误必须清空共享实例');
    assert.equal(h.flag('regexWorkerReady'), false, '空闲错误后不得保留就绪标记');
    assert.equal(h.flag('regexWorkerBusy'), false, '空闲错误不得改变空闲状态');
    assert.equal(await run('aaa', pattern, 'b', script, { priority: 'prompt' }), 'bbb', '下一请求必须新建 Worker 并成功');
    assert.equal(h.instances.length, 2, '下一请求必须创建新实例，而不是复用已终止的旧实例');
    assert.equal(h.instances[1].terminated, false, '新实例正常保留供复用');
}

await new Promise(resolve => setTimeout(resolve, 60));
assert.equal(unhandledRejections, 0, '不得产生未处理的 promise rejection');
console.log('Regex queue checks passed: prompt priority, pending dedup, failure retry, ordered display chains, stable rendering, invalidation, worker reuse, embedded Blob worker, correlation ids, protocol-error recovery, idle-error teardown and no-Worker guards.');
