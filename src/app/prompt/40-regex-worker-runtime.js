// 正则执行队列：提示词任务优先于显示任务；pending 独立去重，完成结果缓存受限，失败不缓存。
// 显示链按消息/会话保存串联状态，仅在输入签名不变时复用结果；过时链与等待任务会被释放，队列因此保持有界。
var regexResultCache = new Map();
var regexPendingTasks = new Map();
var regexPromptQueue = [];
var regexDisplayQueue = [];
var regexWaitingDisplayTasks = [];
var regexWorkerBusy = false;
var regexWorkerDispatchScheduled = false;
var regexRenderScheduled = false;
var regexRenderTimer = null;
var regexDeferredRenderTimer = null;
var regexDeferredRenderConv = null;
var regexDisplayChains = new WeakMap();
var REGEX_RESULT_CACHE_LIMIT = 256;
var REGEX_DISPLAY_QUEUE_LIMIT = 256;
var REGEX_WORKER_LOAD_TIMEOUT_MS = 10000;
var REGEX_WORKER_EXECUTION_TIMEOUT_MS = 500;

// 构建时（scripts/build-app.js）用 assets/js/regex-worker.js 的源码替换下一行；未构建的源码级夹具保持 null，回退到同源 Worker。
var REGEX_WORKER_SOURCE = null; // @@REGEX_WORKER_SOURCE@@
// 同源后备地址：仅在没有内嵌源码时使用；版本参数与内嵌版本同步更新，避免部署平台长期缓存旧脚本。
var REGEX_WORKER_URL = 'assets/js/regex-worker.js?v=20261015-regex-singleton-1';
// 复用的单个 Worker 实例与就绪状态：正常完成后保留，错误/超时/协议异常时终止并清空，以便下次重建。
var regexWorkerInstance = null;
var regexWorkerReady = false;
var regexWorkerBlobUrl = null;
var regexWorkerTaskSeq = 0;

// 错误提示统一带出规则名称，方便用户定位是规则卡住还是 Worker 装载/协议受阻；不包含聊天正文或缓存 key。
function regexRuleSuffix(task) {
    var name = task && task.ruleName ? String(task.ruleName).trim() : '';
    return name ? '：' + name : '';
}

function regexExecutionTimeoutError(task) {
    return new Error('正则执行超过 ' + REGEX_WORKER_EXECUTION_TIMEOUT_MS + 'ms，已终止' + regexRuleSuffix(task) + '；请调整该规则');
}

function regexWorkerLoadError(task) {
    return new Error('正则 Worker 加载失败' + regexRuleSuffix(task));
}

function regexWorkerLoadTimeoutError(task) {
    return new Error('正则 Worker 加载失败：超过 ' + REGEX_WORKER_LOAD_TIMEOUT_MS / 1000 + ' 秒未就绪' + regexRuleSuffix(task));
}

function regexWorkerExecutionError(task, detail) {
    return new Error('正则 Worker 执行失败' + regexRuleSuffix(task) + (detail ? '：' + detail : ''));
}

function regexWorkerProtocolError(task) {
    return new Error('正则 Worker 响应无效' + regexRuleSuffix(task));
}

// 仅把严格小于当前任务编号的非负整数识别为旧任务重复响应；缺失/字符串/NaN/未来编号都按协议错误处理。
function isStaleRegexWorkerId(id, currentId) {
    return typeof id === 'number' && Number.isInteger(id) && id >= 0 && id < currentId;
}

function validateRegexScript(script) {
    if (!isCardRuntimeRecord(script)) throw new Error('正则条目格式无效');
    var raw = getRegexScriptFindSource(script);
    if (!raw || raw.length > 10000) throw new Error('正则模式为空或超过 10000 字符');
    var slash = raw.match(/^\/(.*)\/([a-z]*)$/s);
    var flags = slash ? slash[2] : String(script.flags || 'g');
    if (/[^dgimsuvy]/.test(flags) || new Set(flags).size !== flags.length || flags.includes('u') && flags.includes('v')) throw new Error('正则标志无效');
    try { new RegExp(slash ? slash[1] : raw, flags); } catch (error) { throw new Error('正则模式无效：' + error.message); }
    ['minDepth', 'maxDepth'].forEach(function(key) {
        if (script[key] == null || script[key] === '') return;
        if (!Number.isInteger(Number(script[key])) || Number(script[key]) < 0 || Number(script[key]) > 1000) throw new Error('正则深度须为 0–1000 的整数');
    });
    if (script.minDepth != null && script.maxDepth != null && Number(script.minDepth) > Number(script.maxDepth)) throw new Error('最小深度不能大于最大深度');
    if (!getRegexScriptPlacements(script).length) throw new Error('至少选择一个处理位置');
    if (getRegexScriptReplacement(script).length > 500000) throw new Error('正则替换文本过长');
    return script;
}

function isFixedWidthRegex(pattern) {
    var source = pattern.source;
    var inClass = false;
    for (var i = 0; i < source.length; i++) {
        var char = source[i];
        if (char === '\\') {
            if (/\d|[pk]/.test(source[i + 1] || '')) return false;
            i++;
        } else if (char === '[') inClass = true;
        else if (char === ']') inClass = false;
        else if (!inClass && '*+?{}()|'.includes(char)) return false;
    }
    return !inClass;
}

function removeRegexTaskFromQueue(task) {
    var index = regexDisplayQueue.indexOf(task);
    if (index !== -1) { regexDisplayQueue.splice(index, 1); return true; }
    index = regexPromptQueue.indexOf(task);
    if (index !== -1) { regexPromptQueue.splice(index, 1); return true; }
    index = regexWaitingDisplayTasks.indexOf(task);
    if (index !== -1) { regexWaitingDisplayTasks.splice(index, 1); return true; }
    return false;
}

// 已排队的显示任务在提示词请求到达时复用同一条目，并提升到提示词队列，避免重复执行。
function promoteRegexTask(task) {
    task.promptWanted = true;
    if (task.priority === 'prompt') return;
    task.priority = 'prompt';
    if (removeRegexTaskFromQueue(task)) regexPromptQueue.push(task);
}

// 任务仍被至少一条显示链或某个提示词请求需要时不能取消。
function regexTaskStillWanted(task) {
    return task.promptWanted === true || (task.owners != null && task.owners.size > 0);
}

function admitRegexTask(task) {
    if (task.priority === 'prompt') { regexPromptQueue.push(task); return; }
    pruneStaleRegexDisplayTasks();
    if (regexDisplayQueue.length < REGEX_DISPLAY_QUEUE_LIMIT) regexDisplayQueue.push(task);
    else regexWaitingDisplayTasks.push(task);
}

function drainRegexWaitingTasks() {
    while (regexWaitingDisplayTasks.length && regexDisplayQueue.length < REGEX_DISPLAY_QUEUE_LIMIT) {
        regexDisplayQueue.push(regexWaitingDisplayTasks.shift());
    }
}

// 释放已失效显示链遗留的排队任务：消息被删除、规则关闭或会话切换后，旧链不再需要结果，等待队列因此保持有界。
function releaseRegexTask(task) {
    if (!removeRegexTaskFromQueue(task)) return false;
    regexPendingTasks.delete(task.key);
    task.reject(new Error('正则显示任务已取消'));
    return true;
}

function pruneStaleRegexDisplayTasks() {
    [regexDisplayQueue, regexWaitingDisplayTasks].forEach(function(queue) {
        for (var index = queue.length - 1; index >= 0; index--) {
            var task = queue[index];
            if (task.running || task.promptWanted === true || !task.owners || task.owners.size === 0) continue;
            task.owners.forEach(function(owner) { if (isRegexDisplayChainStale(owner)) task.owners.delete(owner); });
            if (task.owners.size === 0) releaseRegexTask(task);
        }
    });
}

function finishRegexTask(task, error, result) {
    task.running = false;
    regexPendingTasks.delete(task.key);
    if (error) { task.reject(error); return; }
    regexResultCache.set(task.key, result);
    if (regexResultCache.size > REGEX_RESULT_CACHE_LIMIT) regexResultCache.delete(regexResultCache.keys().next().value);
    task.resolve(result);
}

// Worker 启动/继续都合并到单个微任务：让当前同步 DOM 渲染栈先返回，避免 300 条全量重绘阻塞 Worker 消息与 500ms 超时回调。
function scheduleRegexWorkerDispatch() {
    if (regexWorkerDispatchScheduled) return;
    regexWorkerDispatchScheduled = true;
    Promise.resolve().then(function() {
        regexWorkerDispatchScheduled = false;
        runNextRegexWorkerTask();
    });
}

// 终止当前实例并清空复用状态；正常结果不走这里，因此健康 Worker 会一直保留。
function resetRegexWorker() {
    if (regexWorkerInstance) {
        regexWorkerInstance.onmessage = null;
        regexWorkerInstance.onerror = null;
        regexWorkerInstance.terminate();
        regexWorkerInstance = null;
    }
    if (regexWorkerBlobUrl != null && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(regexWorkerBlobUrl);
    regexWorkerBlobUrl = null;
    regexWorkerReady = false;
}

// 优先用本次 bundle 内嵌的 Worker 源码构造 Blob Worker，执行期不再额外取网；
// 没有内嵌源码或 Blob 构造同步失败时保留同源 Worker 兼容分支（源码级夹具即走此分支）。
function createRegexWorkerInstance() {
    var source = typeof REGEX_WORKER_SOURCE === 'string' && REGEX_WORKER_SOURCE.length ? REGEX_WORKER_SOURCE : '';
    if (source && typeof Blob === 'function' && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
        var blobUrl = null;
        try {
            blobUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
            var blobWorker = new Worker(blobUrl);
            regexWorkerBlobUrl = blobUrl;
            return blobWorker;
        } catch (blobError) {
            if (blobUrl != null && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(blobUrl);
        }
    }
    return new Worker(regexWorkerFallbackUrl());
}

// 同源后备地址同样经过唯一的运行时资源定位入口：有版本快照时命中不可变副本，否则保留原相对地址。
function regexWorkerFallbackUrl() {
    var path = typeof getRuntimeAssetUrl === 'function' ? getRuntimeAssetUrl(REGEX_WORKER_URL) : REGEX_WORKER_URL;
    return new URL(path, document.baseURI);
}

function runNextRegexWorkerTask() {
    if (regexWorkerBusy) return;
    pruneStaleRegexDisplayTasks();
    drainRegexWaitingTasks();
    var task = regexPromptQueue.shift() || regexDisplayQueue.shift();
    if (!task) return;
    regexWorkerBusy = true;
    task.running = true;
    // 复用同一个 Worker 后消息可能交错，用递增编号把每个任务的响应严格关联到发起它的那次提交。
    var taskId = ++regexWorkerTaskSeq;
    var worker = null;
    var loadTimer = null;
    var executionTimer = null;
    var completed = false;
    var started = false;
    function clearTimers() {
        if (loadTimer != null) { clearTimeout(loadTimer); loadTimer = null; }
        if (executionTimer != null) { clearTimeout(executionTimer); executionTimer = null; }
    }
    // 只有真正的错误/超时/协议异常才终止实例并清空状态；正常结果保留 Worker 供后续任务复用，失败不缓存也不自动重发。
    function finish(error, result) {
        if (completed) return;
        completed = true;
        clearTimers();
        if (error) resetRegexWorker();
        regexWorkerBusy = false;
        finishRegexTask(task, error, result);
        scheduleRegexWorkerDispatch();
    }
    // 收到 ready（响应 prepare 握手）后才提交真正任务并启动执行计时，装载延迟不再被算作 500ms 执行超时；装载本身另有 10s 上限。
    function startExecution() {
        if (completed || started) return;
        started = true;
        if (loadTimer != null) { clearTimeout(loadTimer); loadTimer = null; }
        executionTimer = setTimeout(function() { finish(regexExecutionTimeoutError(task)); }, REGEX_WORKER_EXECUTION_TIMEOUT_MS);
        try {
            worker.postMessage(Object.assign({}, task.data, { id: taskId }));
        } catch (error) { finish(regexWorkerExecutionError(task, error && error.message)); }
    }
    function handleMessage(event) {
        // 旧实例的迟到消息：实例不符直接忽略（重复 ready 也不重置执行期限）。
        if (regexWorkerInstance !== worker) return;
        var message = event && event.data;
        if (!message || typeof message !== 'object') { finish(regexWorkerProtocolError(task)); return; }
        if (message.ready === true) { regexWorkerReady = true; startExecution(); return; }
        if (!started) { finish(regexWorkerProtocolError(task)); return; }
        // 只有能识别为旧任务重复的编号才忽略；缺失/非法/未来编号属于协议错误，立即结束并清理，避免误导用户以为是规则复杂。
        if (message.id !== taskId) {
            if (isStaleRegexWorkerId(message.id, taskId)) return;
            finish(regexWorkerProtocolError(task)); return;
        }
        if (message.error != null) { finish(regexWorkerExecutionError(task, String(message.error))); return; }
        if (typeof message.result !== 'string') { finish(regexWorkerProtocolError(task)); return; }
        // elapsedMs 必须是有限非负数：缺失/NaN/Infinity 的响应不可直接接受，避免把未知耗时误当成正常结果。
        if (typeof message.elapsedMs !== 'number' || !Number.isFinite(message.elapsedMs) || message.elapsedMs < 0) { finish(regexWorkerProtocolError(task)); return; }
        // Worker 自己报告实际执行耗时，正常返回但真实执行超过 500ms 同样拒绝。
        if (message.elapsedMs > REGEX_WORKER_EXECUTION_TIMEOUT_MS) { finish(regexExecutionTimeoutError(task)); return; }
        finish(null, message.result);
    }
    function wire(instance) {
        worker = instance;
        regexWorkerInstance = instance;
        instance.onmessage = handleMessage;
        instance.onerror = function() {
            // 任务已结算后（正常结果保留复用的 Worker）的空闲错误：共享实例已失效，立即销毁以便下次重建，不重复结算已完成的任务。
            if (completed) { if (regexWorkerInstance === instance) resetRegexWorker(); return; }
            finish(started ? regexWorkerExecutionError(task) : regexWorkerLoadError(task));
        };
    }
    try {
        // 已就绪的健康 Worker 直接复用，不再重新装载脚本。
        if (regexWorkerInstance && regexWorkerReady) {
            wire(regexWorkerInstance);
            startExecution();
            return;
        }
        wire(createRegexWorkerInstance());
        regexWorkerReady = false;
        loadTimer = setTimeout(function() { finish(regexWorkerLoadTimeoutError(task)); }, REGEX_WORKER_LOAD_TIMEOUT_MS);
        // 装载后主动提交 prepare 请求，收到 ready 才提交任务。
        worker.postMessage({ type: 'regex-worker-prepare' });
    } catch (error) {
        finish(started ? regexWorkerExecutionError(task, error && error.message) : regexWorkerLoadError(task));
    }
}

function runRegexReplacement(text, pattern, replacement, script, options) {
    if (text.length > 500000) return Promise.reject(new Error('正则输入超过 500000 字符'));
    var data = { text: text, source: pattern.source, flags: pattern.flags, replacement: replacement, trimStrings: Array.isArray(script.trimStrings) ? script.trimStrings.map(String) : [], contextKey: options && options.contextKey || '' };
    var key = JSON.stringify(data);
    var owner = options && options.owner && typeof options.owner === 'object' ? options.owner : null;
    var cached = regexResultCache.get(key);
    if (typeof cached === 'string') return Promise.resolve(cached);
    var pending = regexPendingTasks.get(key);
    if (pending) {
        if (owner) { pending.owners.add(owner); owner.pendingTask = pending; }
        if (options && options.priority === 'prompt') promoteRegexTask(pending);
        return pending.promise;
    }
    if (typeof Worker === 'undefined') {
        if (!isFixedWidthRegex(pattern)) return Promise.reject(new Error('浏览器不支持正则隔离，复杂规则保持关闭'));
        return Promise.resolve(text.replace(pattern, function() {
            var args = arguments;
            var result = expandRegexReplacement(replacement, args).replace(/\{\{match\}\}/gi, String(args[0] || ''));
            data.trimStrings.forEach(function(value) { if (value) result = result.split(value).join(''); });
            return result;
        }));
    }
    var ruleName = String((script && (script.name || script.scriptName)) || '').trim();
    var task = { key: key, data: data, ruleName: ruleName, priority: options && options.priority === 'prompt' ? 'prompt' : 'display', promptWanted: !!(options && options.priority === 'prompt'), owners: new Set(), running: false, promise: null, resolve: null, reject: null };
    if (owner) { task.owners.add(owner); owner.pendingTask = task; }
    task.promise = new Promise(function(resolve, reject) { task.resolve = resolve; task.reject = reject; });
    regexPendingTasks.set(key, task);
    admitRegexTask(task);
    scheduleRegexWorkerDispatch();
    return task.promise;
}

// 显示链按消息/会话对象保存串联状态：只有输入签名变化时才重算，避免重复入队与全量重渲染循环。
function getRegexDisplayChainState(context, sourcePlacement, create) {
    var owner = context && (context.msg || context.conv);
    if (!owner || typeof owner !== 'object') return null;
    var chains = regexDisplayChains.get(owner);
    if (!chains) {
        if (create !== true) return null;
        chains = new Map();
        regexDisplayChains.set(owner, chains);
    }
    var subKey = String(sourcePlacement == null ? '' : sourcePlacement);
    var state = chains.get(subKey);
    if (!state) {
        if (create !== true) return null;
        state = { owner: owner, subKey: subKey, token: 0, active: false, status: 'idle', pendingTask: null, signature: null, result: '' };
        chains.set(subKey, state);
    }
    return state;
}

// 排空显示队列时使用较轻的失效判断（不检查消息成员关系），避免每次入队都线性扫描消息列表。
function isRegexDisplayChainStale(state) {
    if (!state || state.status !== 'running') return true;
    var conv = state.context && state.context.conv;
    if (!conv) return true;
    if (typeof getActiveConv === 'function' && getActiveConv() !== conv) return true;
    return false;
}

// 链仍有效：处于运行中、所属会话仍是当前会话，且消息仍在会话内；会话切换或删除消息后旧链立即失效。
function isRegexDisplayChainLive(state) {
    if (isRegexDisplayChainStale(state)) return false;
    var conv = state.context.conv;
    if (state.owner !== conv && (!Array.isArray(conv.messages) || conv.messages.indexOf(state.owner) === -1)) return false;
    return true;
}

function releaseRegexChainStep(state) {
    if (!state || !state.pendingTask) return;
    var task = state.pendingTask;
    state.pendingTask = null;
    if (task.owners) task.owners.delete(state);
    if (task.running || regexTaskStillWanted(task)) return;
    releaseRegexTask(task);
}

function invalidateRegexDisplayChain(state) {
    if (!state) return;
    state.token += 1;
    state.status = 'cancelled';
    state.active = false;
    state.signature = null;
    releaseRegexChainStep(state);
}

function regexDisplayHistorySignal(conv) {
    var messages = conv && Array.isArray(conv.messages) ? conv.messages : [];
    var signal = { last: '', lastUser: '', lastChar: '' };
    for (var index = 0; index < messages.length; index++) {
        var message = messages[index];
        if (!message || !message.content) continue;
        var content = String(message.content);
        signal.last = content;
        var role = String(message.role || '').toLowerCase();
        if (role === 'user') signal.lastUser = content;
        if (role === 'assistant') signal.lastChar = content;
    }
    return signal;
}

// 结构化签名：原文、规则顺序/开关/深度直接纳入；替换含宏或声明式模板时，再纳入预设正文、历史、MVU 与世界书上下文。
function buildRegexDisplaySignature(raw, steps, sourcePlacement, info, context) {
    var settings = info.settings || {};
    var conv = context.conv;
    var signature = {
        v: 2,
        raw: String(raw == null ? '' : raw),
        placement: sourcePlacement == null ? null : sourcePlacement,
        char: info.charName || '',
        user: info.userName || '',
        persona: String(settings.userDescription || ''),
        depth: context.depth == null ? null : context.depth,
        edit: context.isEdit === true,
        convId: conv && conv.id != null ? String(conv.id) : null,
        steps: []
    };
    var usesMacroContext = false;
    for (var index = 0; index < steps.length; index++) {
        var script = steps[index].script;
        var replacement = getRegexScriptReplacement(script);
        if (replacement.indexOf('{{') !== -1 || replacement.indexOf('<%') !== -1) usesMacroContext = true;
        signature.steps.push({
            find: getRegexScriptFindSource(script),
            replace: replacement,
            source: steps[index].pattern.source,
            flags: steps[index].pattern.flags,
            trim: Array.isArray(script.trimStrings) ? script.trimStrings.map(String) : [],
            disabled: script.disabled === true || script.enabled === false,
            runOnEdit: script.runOnEdit === true,
            markdownOnly: script.markdownOnly === true,
            promptOnly: script.promptOnly === true
        });
    }
    if (usesMacroContext) {
        signature.vars = conv && conv.stLocalVars ? conv.stLocalVars : null;
        signature.history = regexDisplayHistorySignal(conv);
        signature.presetMain = typeof getSillyTavernPresetPromptContent === 'function' ? getSillyTavernPresetPromptContent('main') : '';
        signature.presetJailbreak = typeof getSillyTavernPresetPromptContent === 'function' ? getSillyTavernPresetPromptContent('jailbreak') : '';
        signature.mvu = conv && typeof getMvuDataForMessage === 'function' ? getMvuDataForMessage(conv, context.msg || null) : null;
        signature.worldInfo = conv && typeof getMvuWorldInfoEntries === 'function' ? getMvuWorldInfoEntries(conv) : null;
    }
    return JSON.stringify(signature);
}

// 显示替换沿用历史语义：附带当前消息与对应 MVU 数据，避免历史消息读到会话最新状态。
function buildRegexDisplayReplacementContext(state) {
    var context = state.context;
    return buildRegexReplacementContext(context, state.result);
}

function runRegexDisplayChain(raw, character, context, steps, sourcePlacement, info) {
    var state = getRegexDisplayChainState(context, sourcePlacement, true);
    if (!state) return raw;
    var signature = buildRegexDisplaySignature(raw, steps, sourcePlacement, info, context);
    if (state.signature !== signature) {
        if (state.status === 'running') releaseRegexChainStep(state);
        state.signature = signature;
        state.raw = raw;
        state.result = raw;
        state.index = 0;
        state.steps = steps;
        state.character = character;
        state.context = context;
        state.info = info;
        state.status = 'running';
        state.active = false;
        state.token += 1;
        runRegexDisplayChainStep(state);
    }
    return state.result;
}

function runRegexDisplayChainStep(state) {
    if (!state || state.status !== 'running' || state.active) return;
    if (!isRegexDisplayChainLive(state)) { invalidateRegexDisplayChain(state); return; }
    if (state.index >= state.steps.length) {
        state.status = 'done';
        scheduleRegexDisplayRender(state.context);
        return;
    }
    var step = state.steps[state.index];
    var replacementContext = buildRegexDisplayReplacementContext(state);
    var replacement = replacePlaceholders(getRegexScriptReplacement(step.script), state.info.charName, state.info.userName, replacementContext);
    state.active = true;
    var token = state.token;
    runRegexReplacement(state.result, step.pattern, replacement, step.script, { priority: 'display', owner: state, contextKey: buildRegexContextKey(replacementContext, replacement) }).then(function(output) {
        if (state.token !== token) return;
        state.active = false;
        state.pendingTask = null;
        if (!isRegexDisplayChainLive(state)) { invalidateRegexDisplayChain(state); return; }
        state.result = output;
        state.index += 1;
        runRegexDisplayChainStep(state);
    }, function(error) {
        if (state.token !== token) return;
        state.active = false;
        state.pendingTask = null;
        if (!isRegexDisplayChainLive(state)) { invalidateRegexDisplayChain(state); return; }
        state.status = 'error';
        state.result = state.raw;
        console.warn('[Regex]', error && error.message);
        scheduleRegexDisplayRender(state.context);
    });
}

// 生成期间或正则批次尚未清空时不重建历史：前者避免销毁流式气泡，后者避免主线程在每条规则完成时就整表重绘。
function regexDisplayRenderDeferred() {
    return (state && state.isGenerating) || regexPendingTasks.size !== 0;
}

// 仅在活动会话且带具体消息时重建历史；流式等无消息对象的链结果由下一次流式渲染读取，不能凭空重绘。
function refreshRegexDisplayRender(conv) {
    if (!conv || typeof getActiveConv !== 'function' || getActiveConv() !== conv || typeof renderMessagesOnly !== 'function') return;
    // 32ms 定时器触发时生成可能已开始、或正则批次未清空：重建前重查，转为延迟刷新，批次结束后再一次性展示完整链结果。
    if (regexDisplayRenderDeferred()) { scheduleDeferredRegexDisplayRender(conv); return; }
    // 批次已清空：取消尚未触发的合并/32ms 定时器，确保整批结果只重绘一次。
    if (regexDeferredRenderTimer != null) { clearTimeout(regexDeferredRenderTimer); regexDeferredRenderTimer = null; regexDeferredRenderConv = null; }
    if (regexRenderTimer != null) { clearTimeout(regexRenderTimer); regexRenderTimer = null; regexRenderScheduled = false; }
    var scroll = dom.messagesContainer && dom.messagesContainer.scrollTop;
    conv._lastRenderedVisibleCount = 0;
    renderMessagesOnly();
    if (dom.messagesContainer) dom.messagesContainer.scrollTop = scroll;
}

// 生成期间或正则批次未清空时合并成一次延迟刷新：等生成结束且批次清空后再重绘，避免销毁流式气泡或反复重建整表。
function scheduleDeferredRegexDisplayRender(conv) {
    regexDeferredRenderConv = conv;
    if (regexDeferredRenderTimer != null) return;
    regexDeferredRenderTimer = setTimeout(function() {
        regexDeferredRenderTimer = null;
        var target = regexDeferredRenderConv;
        regexDeferredRenderConv = null;
        if (!target) return;
        if (typeof getActiveConv === 'function' && getActiveConv() !== target) return;
        if (regexDisplayRenderDeferred()) {
            regexDeferredRenderConv = target;
            scheduleDeferredRegexDisplayRender(target);
            return;
        }
        refreshRegexDisplayRender(target);
    }, 100);
}

function scheduleRegexDisplayRender(context) {
    if (!context || !context.msg || !context.conv) return;
    if (typeof getActiveConv !== 'function' || getActiveConv() !== context.conv) return;
    if (regexDisplayRenderDeferred()) {
        scheduleDeferredRegexDisplayRender(context.conv);
        return;
    }
    if (regexRenderScheduled) return;
    regexRenderScheduled = true;
    regexRenderTimer = setTimeout(function() {
        regexRenderTimer = null;
        regexRenderScheduled = false;
        refreshRegexDisplayRender(context.conv);
    }, 32);
}

async function applyRegexScriptsAsync(text, character, context) {
    context = context || {};
    var result = String(text == null ? '' : text);
    var phase = context.processingPhase || (context.forPrompt ? 'prompt' : 'display');
    var placement = context.sourcePlacement == null ? (context.messageRole === 'user' ? 'USER_INPUT' : 'AI_OUTPUT') : context.sourcePlacement;
    var scripts = getEnabledRegexScripts(character, context);
    var settings = context.settings || state.settings;
    for (var index = 0; index < scripts.length; index++) {
        var script = scripts[index];
        if (script.disabled === true || script.enabled === false || !regexScriptHasPlacement(script, placement) || !regexScriptMatchesProcessingPhase(script, phase) || context.isEdit && script.runOnEdit !== true || !regexScriptMatchesDepth(script, context.depth)) continue;
        validateRegexScript(script);
        var pattern = buildRegexScriptPattern(getRegexScriptFindSource(script), script.flags);
        var replacementContext = buildRegexReplacementContext(context, result);
        var replacement = replacePlaceholders(getRegexScriptReplacement(script), character && character.name || 'Assistant', settings.userName || 'User', replacementContext);
        result = await runRegexReplacement(result, pattern, replacement, script, { priority: 'prompt', contextKey: buildRegexContextKey(replacementContext, replacement) });
    }
    return result;
}

async function formatMessageAsync(message, context) {
    context = Object.assign({}, context || {});
    if (context.isEdit === undefined) context.isEdit = !!(context.msg && context.msg.editedAt);
    return finishFormattedMessage(await applyRegexScriptsAsync(message, getRegexContextCharacter(context), context), context);
}
