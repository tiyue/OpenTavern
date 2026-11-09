/**
 * 新手导读（文件：50-plugin-runtime.js）
 *
 * 负责什么：通用插件的运行实例、启动握手、事件订阅、私有存储 RPC、受控 UI 和受检网络 RPC。
 * 在程序中的位置：只通过 40-plugin-isolation.js 的 sandbox iframe/Blob Worker 执行插件代码；
 * 管理界面在 68-plugins-ui.js。运行状态只存在内存，刷新后必须再次显式启用。
 * 从哪里开始看：`startPluginInstance(pluginId)`、`stopPluginInstance(pluginId, reason)`、
 * `pluginRuntimeHandleRpc(instance, message)`、`pluginRuntimeNetworkRequest(instance, request)`。
 * 修改时注意：任何 RPC 都必须先验证实例端口、插件 ID、内容摘要/version、当前本机授权和存活世代；
 * 插件不能自行选择 pluginId 或读取其他命名空间。
 */
// ==================== Plugin Runtime ====================
var pluginRuntimeInstances = new Map();
var pluginRuntimeProbes = new Map();
var pluginRuntimeDisplays = new Map();
var pluginRuntimeStatus = Object.create(null);
var pluginRuntimeEpochs = Object.create(null);
var pluginRuntimeFrameEventsBound = false;
var PLUGIN_RUNTIME_EVENTS = ['conversation-saved', 'current-conversation-changed'];
var PLUGIN_FORBIDDEN_HEADERS = [
    'authorization', 'connection', 'content-length', 'cookie', 'host', 'origin',
    'proxy-authorization', 'referer', 'te', 'trailer', 'transfer-encoding', 'upgrade', 'x-api-key'
];

function pluginRuntimeEpoch(pluginId) {
    return pluginRuntimeEpochs[pluginId] || 0;
}

function pluginRuntimeBumpEpoch(pluginId) {
    pluginRuntimeEpochs[pluginId] = pluginRuntimeEpoch(pluginId) + 1;
    return pluginRuntimeEpochs[pluginId];
}

function pluginRuntimeStatusFor(pluginId) {
    var instance = pluginRuntimeInstances.get(pluginId);
    if (instance) return instance.status;
    var status = pluginRuntimeStatus[pluginId];
    return status ? status.status : 'stopped';
}

function pluginRuntimeStatusMessage(pluginId) {
    var status = pluginRuntimeStatus[pluginId];
    return status ? status.message || '' : '';
}

function pluginRuntimeSetStatus(pluginId, status, message) {
    pluginRuntimeStatus[pluginId] = { status: status, message: String(message || ''), updatedAt: Date.now() };
}

function clearPluginRuntimeStatus(pluginId) {
    delete pluginRuntimeStatus[pluginId];
}

function pluginRuntimeNotifyUi() {
    try { if (typeof refreshPluginManager === 'function') refreshPluginManager(); } catch (error) {}
    try { if (typeof hydratePluginSettings === 'function') hydratePluginSettings(); } catch (error) {}
}

function pluginRuntimeIsRunning(pluginId) {
    var instance = pluginRuntimeInstances.get(pluginId);
    return !!instance && instance.status === 'running' && !instance.stopped;
}

function pluginRuntimeDisplayFor(pluginId) {
    return pluginRuntimeDisplays.get(pluginId) || null;
}

function pluginRuntimeCurrentRecord(pluginId) {
    if (typeof getInstalledPluginById !== 'function') return null;
    return getInstalledPluginById(pluginId);
}

function pluginRuntimeEnsureCurrent(instance) {
    if (!instance || instance.stopped) throw new Error(t('plugin_session_stale'));
    if (instance.probe) {
        if (pluginRuntimeProbes.get(instance.instanceId) !== instance) throw new Error(t('plugin_session_stale'));
        if (instance.epoch !== pluginRuntimeEpoch(instance.pluginId)) throw new Error(t('plugin_session_stale'));
        return instance.record;
    }
    if (pluginRuntimeInstances.get(instance.pluginId) !== instance) {
        throw new Error(t('plugin_session_stale'));
    }
    if (instance.epoch !== pluginRuntimeEpoch(instance.pluginId)) throw new Error(t('plugin_session_stale'));
    var record = pluginRuntimeCurrentRecord(instance.pluginId);
    if (!record || pluginFingerprint(record) !== instance.fingerprint) throw new Error(t('plugin_session_stale'));
    var grant = getPluginGrant(instance.pluginId, state.settings);
    if (!isPluginGranted(record, grant)) throw new Error(t('plugin_not_authorized'));
    return record;
}

function pluginDependencyIssueText(issue) {
    if (!issue) return t('plugin_dependency_missing').replace('{id}', '?');
    if (issue.code === 'cycle') return t('plugin_dependency_cycle');
    if (issue.code === 'version') return t('plugin_dependency_version').replace('{id}', issue.id).replace('{expected}', issue.version).replace('{actual}', issue.installedVersion || '?');
    return t('plugin_dependency_missing').replace('{id}', issue.id);
}

function pluginRuntimeCheckDependencies(record, requireRunning) {
    var records = getInstalledPlugins();
    var issues = pluginDependencyIssues(record, records);
    if (issues.length) throw new Error(pluginDependencyIssueText(issues[0]));
    if (!requireRunning) return;
    (record.dependencies || []).forEach(function(dependency) {
        if (!pluginRuntimeIsRunning(dependency.id)) throw new Error(t('plugin_dependency_not_running').replace('{id}', dependency.id));
    });
}

function pluginRuntimeBindFrameEvents() {
    if (pluginRuntimeFrameEventsBound) return;
    pluginRuntimeFrameEventsBound = true;
    window.addEventListener('message', function(event) {
        var data = event.data;
        if (!data || typeof data !== 'object' || typeof data.token !== 'string') return;
        var instance = null;
        pluginRuntimeInstances.forEach(function(candidate) { if (candidate.token === data.token) instance = candidate; });
        pluginRuntimeProbes.forEach(function(candidate) { if (candidate.token === data.token) instance = candidate; });
        if (!instance || instance.stopped || !instance.frame || event.source !== instance.frame.contentWindow) return;
        if (event.origin !== 'null') return;
        if (data.type === 'plugin-isolation-ready') {
            if (instance.port) return;
            try { pluginRuntimeConnectFrame(instance); } catch (error) { pluginRuntimeFail(instance, error.message); }
            return;
        }
        if (data.type === 'plugin-isolation-error') pluginRuntimeFail(instance, String(data.message || 'Plugin isolation failed'));
    });
    if (typeof appStore !== 'undefined' && appStore && typeof appStore.subscribe === 'function') {
        appStore.subscribe(function(changedKeys) {
            if (!changedKeys || changedKeys.indexOf('activeConvId') < 0) return;
            pluginRuntimeEmit('current-conversation-changed', {
                conversationId: typeof state !== 'undefined' ? state.activeConvId : null
            });
        });
    }
}

function pluginRuntimeConnectFrame(instance) {
    var channel = new MessageChannel();
    instance.port = channel.port1;
    instance.port.onmessage = function(event) {
        pluginRuntimeEnqueue(instance, event.data);
    };
    instance.port.start();
    var config = {
        abi: PLUGIN_ISOLATION_ABI,
        instanceId: instance.instanceId,
        pluginId: instance.pluginId,
        version: instance.record.version,
        digest: instance.record.digest,
        capabilities: instance.record.capabilities,
        resources: instance.record.resources,
        probe: instance.probe
    };
    instance.frame.contentWindow.postMessage({
        type: 'plugin-isolation-start',
        token: instance.token,
        instanceId: instance.instanceId,
        sdk: pluginWorkerSdkSource(config),
        entry: instance.record.entry.code
    }, '*', [channel.port2]);
}

function pluginRuntimeCreateFrame(instance) {
    var frame = document.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.setAttribute('referrerpolicy', 'no-referrer');
    frame.setAttribute('aria-hidden', 'true');
    frame.setAttribute('tabindex', '-1');
    frame.className = 'plugin-isolation-frame';
    frame.title = 'Plugin isolation';
    frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:1px;height:1px;border:0;visibility:hidden;';
    frame.srcdoc = buildPluginIsolationDocument(instance.token);
    instance.frame = frame;
    document.body.appendChild(frame);
}

function pluginRuntimeQueueFailure(instance, message) {
    if (!message || typeof message !== 'object' || Array.isArray(message)) return 'Plugin message was not a valid object';
    if (message.instanceId !== instance.instanceId) return null;
    if (message.type === 'plugin-rpc') {
        if (typeof message.id !== 'string' || !message.id || message.id.length > 80) return 'Plugin call id is invalid';
        if (typeof message.method !== 'string' || !message.method || message.method.length > 64) return 'Plugin method is invalid';
        if (message.args !== undefined && !Array.isArray(message.args)) return 'Plugin arguments must be an array';
        if (Array.isArray(message.args) && message.args.length > 8) return 'Plugin arguments exceed the allowed count';
    }
    var now = Date.now();
    instance.messageTimes = (instance.messageTimes || []).filter(function(time) {
        return now - time < PLUGIN_RATE_WINDOW_MS;
    });
    if (instance.messageTimes.length >= PLUGIN_MAX_MESSAGES_PER_WINDOW) return 'Too many plugin messages';
    var text;
    try { text = JSON.stringify(message); } catch (error) { return 'Plugin message is not serializable'; }
    var bytes = text ? pluginTextBytes(text) : 0;
    if (!bytes || bytes > PLUGIN_MAX_RPC_BYTES) return 'Plugin message exceeds the allowed size';
    if ((instance.queue || []).length >= PLUGIN_MAX_QUEUED_MESSAGES) return 'Too many plugin messages are queued';
    if ((instance.queueBytes || 0) + bytes > PLUGIN_MAX_QUEUED_BYTES) return 'Plugin message queue exceeds the allowed size';
    instance.messageTimes.push(now);
    return { bytes: bytes };
}

function pluginRuntimeDrain(instance) {
    if (!instance || instance.stopped || instance.draining) return;
    var item = instance.queue.shift();
    if (!item) return;
    instance.queueBytes -= item.bytes;
    instance.draining = true;
    Promise.resolve().then(function() {
        return pluginRuntimeHandleMessage(instance, item.message);
    }).catch(function(error) {
        pluginRuntimeFail(instance, error && error.message || String(error));
    }).then(function() {
        instance.draining = false;
        pluginRuntimeDrain(instance);
    });
}

function pluginRuntimeEnqueue(instance, message) {
    if (!instance || instance.stopped || !Array.isArray(instance.queue)) return;
    // 丢弃伪造实例 ID 的消息，但它们在到达处理链前也要经过同样的队列边界。
    if (message && typeof message === 'object' && message.instanceId !== instance.instanceId) return;
    var accepted = pluginRuntimeQueueFailure(instance, message);
    if (!accepted) return;
    if (typeof accepted === 'string') {
        pluginRuntimeFail(instance, accepted);
        return;
    }
    instance.queue.push({ message: message, bytes: accepted.bytes });
    instance.queueBytes += accepted.bytes;
    pluginRuntimeDrain(instance);
}

function pluginRuntimePost(instance, message) {
    if (!instance || instance.stopped || !instance.port) return;
    try { instance.port.postMessage(message); } catch (error) {}
}

function pluginRuntimeRpcError(instance, id, code, message) {
    pluginRuntimePost(instance, {
        type: 'plugin-host-rpc-result',
        id: id,
        ok: false,
        error: { code: code || 'PLUGIN_ERROR', message: String(message || 'Plugin request failed').slice(0, 300) }
    });
}

function pluginRuntimeRpcResult(instance, id, result) {
    var serialized;
    try { serialized = JSON.stringify(result === undefined ? null : result); } catch (error) { serialized = 'null'; }
    if (pluginTextBytes(serialized) > PLUGIN_MAX_RPC_RESPONSE_BYTES) {
        pluginRuntimeRpcError(instance, id, 'RESPONSE_TOO_LARGE', 'Plugin response exceeds the allowed size');
        return;
    }
    pluginRuntimePost(instance, { type: 'plugin-host-rpc-result', id: id, ok: true, result: result === undefined ? null : result });
}

async function pluginRuntimeHandleMessage(instance, message) {
    if (!instance || instance.stopped || !instance.frame || !message || typeof message !== 'object') return;
    if (message.instanceId !== instance.instanceId) return;
    if (message.type === 'plugin-loaded') return;
    if (message.type === 'plugin-ready') {
        if (instance.status !== 'starting') return;
        var detail = message.detail;
        if (detail !== undefined && detail !== null && JSON.stringify(detail).length > 4096) {
            pluginRuntimeFail(instance, 'Plugin ready details are too large');
            return;
        }
        clearTimeout(instance.startupTimer);
        if (instance.probe) {
            instance.status = 'verifying';
            pluginRuntimePost(instance, { type: 'plugin-host-probe-check' });
            instance.probeTimer = setTimeout(function() {
                if (instance.status !== 'verifying' || instance.stopped) return;
                pluginRuntimeFail(instance, t('plugin_candidate_failed').replace('{message}', t('plugin_start_timeout')));
            }, PLUGIN_PROBE_STABILITY_MS);
            return;
        }
        instance.status = 'running';
        pluginRuntimeSetStatus(instance.pluginId, 'running', '');
        if (instance.readyResolve) instance.readyResolve(instance);
        instance.readyResolve = null;
        instance.readyReject = null;
        if (instance.subscriptions.has('current-conversation-changed')) {
            pluginRuntimePost(instance, {
                type: 'plugin-host-event',
                event: 'current-conversation-changed',
                detail: { conversationId: state.activeConvId }
            });
        }
        pluginRuntimeNotifyUi();
        return;
    }
    if (message.type === 'plugin-probe-ack') {
        if (!instance.probe || instance.status !== 'verifying') return;
        clearTimeout(instance.probeTimer);
        instance.probeTimer = null;
        instance.status = 'running';
        if (instance.readyResolve) instance.readyResolve(instance);
        instance.readyResolve = null;
        instance.readyReject = null;
        return;
    }
    if (message.type === 'plugin-subscribe' || message.type === 'plugin-unsubscribe') {
        var event = String(message.event || '');
        if (PLUGIN_RUNTIME_EVENTS.indexOf(event) < 0) return;
        var record = instance.probe ? instance.record : pluginRuntimeEnsureCurrent(instance);
        if ((record.capabilities || []).indexOf('events.conversation') < 0) {
            pluginRuntimeRpcError(instance, 'subscribe', 'PERMISSION_DENIED', 'events.conversation is not granted');
            return;
        }
        if (message.type === 'plugin-subscribe') instance.subscriptions.add(event);
        else instance.subscriptions.delete(event);
        if (message.type === 'plugin-subscribe' && !instance.probe) {
            pluginRuntimePost(instance, {
                type: 'plugin-host-event',
                event: event,
                detail: event === 'current-conversation-changed'
                    ? { conversationId: state.activeConvId }
                    : { conversationId: state.activeConvId, reason: 'subscription' }
            });
        }
        return;
    }
    if (message.type === 'plugin-fail') {
        pluginRuntimeFail(instance, String(message.message || 'Plugin reported a failure'));
        return;
    }
    if (message.type !== 'plugin-rpc') return;
    var id = message.id;
    if (typeof id !== 'string' || !id || id.length > 80) return;
    if (message.method !== undefined && typeof message.method !== 'string') {
        pluginRuntimeRpcError(instance, id, 'INVALID_ARGUMENTS', 'Plugin method must be a string');
        return;
    }
    if (message.args !== undefined && !Array.isArray(message.args)) {
        pluginRuntimeRpcError(instance, id, 'INVALID_ARGUMENTS', 'Plugin arguments must be an array');
        return;
    }
    var callSequence = /^rpc-([1-9]\d{0,11})$/.exec(id);
    if (callSequence) {
        var sequence = Number(callSequence[1]);
        if (sequence <= (instance.callIdSequence || 0)) {
            pluginRuntimeRpcError(instance, id, 'DUPLICATE_CALL', 'Duplicate plugin call id');
            return;
        }
        instance.callIdSequence = sequence;
    } else {
        if (instance.callIds.has(id)) {
            pluginRuntimeRpcError(instance, id, 'DUPLICATE_CALL', 'Duplicate plugin call id');
            return;
        }
        if (instance.callIds.size >= PLUGIN_MAX_CALL_IDS) {
            pluginRuntimeRpcError(instance, id, 'CALL_ID_LIMIT', 'Plugin call id window is full');
            return;
        }
        instance.callIds.add(id);
    }
    var now = Date.now();
    instance.rpcTimes = instance.rpcTimes.filter(function(time) { return now - time < PLUGIN_RATE_WINDOW_MS; });
    if (instance.rpcTimes.length >= PLUGIN_MAX_RPC_PER_WINDOW) {
        pluginRuntimeRpcError(instance, id, 'RATE_LIMITED', 'Too many plugin calls');
        return;
    }
    if (instance.inflight.size >= PLUGIN_MAX_INFLIGHT_RPC) {
        pluginRuntimeRpcError(instance, id, 'TOO_MANY_REQUESTS', 'Too many plugin calls in flight');
        return;
    }
    instance.rpcTimes.push(now);
    instance.inflight.add(id);
    try {
        var size = 0;
        try { size = JSON.stringify(message).length; } catch (error) { size = 0; }
        if (!size || pluginTextBytes(JSON.stringify(message)) > PLUGIN_MAX_RPC_BYTES) throw pluginRuntimeError('REQUEST_TOO_LARGE', 'Plugin request exceeds the allowed size');
        var result = await pluginRuntimeHandleRpc(instance, message.method, message.args);
        pluginRuntimeRpcResult(instance, id, result);
    } catch (error) {
        pluginRuntimeRpcError(instance, id, error.code || 'PLUGIN_ERROR', error.message || String(error));
    } finally {
        instance.inflight.delete(id);
    }
}

function pluginRuntimeError(code, message) {
    var error = new Error(message || code);
    error.code = code;
    return error;
}

function pluginRuntimeRequireCapability(instance, capability) {
    var record = pluginRuntimeEnsureCurrent(instance);
    if ((record.capabilities || []).indexOf(capability) < 0) throw pluginRuntimeError('PERMISSION_DENIED', capability + ' is not granted');
    return record;
}

function pluginRuntimeStorageKey(instance, key) {
    if (typeof key !== 'string' || !PLUGIN_PRIVATE_KEY_PATTERN.test(key)) throw pluginRuntimeError('INVALID_KEY', 'Invalid plugin storage key');
    return key;
}

function pluginRuntimePrivateStore(instance) {
    pluginRuntimeEnsureCurrent(instance);
    return pluginPrivateDataFor(state.settings, instance.pluginId);
}

async function pluginRuntimeWritePrivate(instance, key, value, remove) {
    pluginRuntimeRequireCapability(instance, 'storage.private');
    if (instance.probe) throw pluginRuntimeError('PROBE_DENIED', 'Probe mode cannot write plugin storage');
    var epoch = instance.epoch;
    var pluginId = instance.pluginId;
    var fingerprint = instance.fingerprint;
    var data = pluginRuntimePrivateStore(instance);
    if (remove) delete data[key];
    else data[key] = value;
    if (pluginTextBytes(JSON.stringify(data)) > PLUGIN_MAX_PRIVATE_BYTES) throw pluginRuntimeError('PRIVATE_TOO_LARGE', 'Plugin private data exceeds the allowed size');
    pluginSanitizePrivateData(data);
    await savePluginSettingsChange(function(candidate) {
        if (pluginRuntimeEpoch(pluginId) !== epoch) throw pluginRuntimeError('SESSION_STALE', 'Plugin session is no longer current');
        var record = (candidate.plugins || []).find(function(item) { return item.id === pluginId; });
        if (!record || pluginFingerprint(record) !== fingerprint) throw pluginRuntimeError('SESSION_STALE', 'Plugin install changed during save');
        var grant = candidate.pluginGrants && candidate.pluginGrants[pluginId];
        if (!isPluginGranted(record, grant)) throw pluginRuntimeError('PERMISSION_DENIED', 'Plugin authorization was revoked');
        if (!candidate.pluginPrivateData) candidate.pluginPrivateData = {};
        candidate.pluginPrivateData[pluginId] = JSON.parse(JSON.stringify(data));
    }, {
        skipDraft: true,
        afterPersist: function() {
            // saveAll 可能已经写入后返回 ACK；提交 live 前必须重新验证最初实例/世代/指纹/授权。
            pluginRuntimeEnsureCurrent(instance);
        },
        beforePersist: function() {
            if (pluginRuntimeEpoch(pluginId) !== epoch || pluginRuntimeInstances.get(pluginId) !== instance) {
                throw pluginRuntimeError('SESSION_STALE', 'Plugin session ended before the save');
            }
        }
    });
    if (pluginRuntimeEpoch(pluginId) !== epoch || pluginRuntimeInstances.get(pluginId) !== instance) throw pluginRuntimeError('SESSION_STALE', 'Plugin session ended before the save completed');
    return true;
}

function pluginRuntimeSanitizeView(instance, view) {
    if (!pluginPlainRecord(view) || !pluginOnlyKeys(view, ['title', 'text', 'actions'])) throw pluginRuntimeError('INVALID_VIEW', 'Invalid plugin view');
    var title = view.title === undefined ? '' : view.title;
    var text = view.text === undefined ? '' : view.text;
    if (typeof title !== 'string' || title.length > PLUGIN_MAX_UI_TITLE || typeof text !== 'string' || text.length > PLUGIN_MAX_UI_TEXT) {
        throw pluginRuntimeError('INVALID_VIEW', 'Plugin view text is too large');
    }
    var actions = view.actions === undefined ? [] : view.actions;
    if (!Array.isArray(actions) || actions.length > PLUGIN_MAX_UI_ACTIONS) throw pluginRuntimeError('INVALID_VIEW', 'Plugin view has too many actions');
    var seen = Object.create(null);
    var cleanActions = actions.map(function(action) {
        if (!pluginPlainRecord(action) || !pluginOnlyKeys(action, ['id', 'label']) ||
            typeof action.id !== 'string' || !PLUGIN_ACTION_ID_PATTERN.test(action.id) || seen[action.id] ||
            typeof action.label !== 'string' || !action.label.trim() || action.label.length > 40) {
            throw pluginRuntimeError('INVALID_VIEW', 'Plugin view action is invalid');
        }
        seen[action.id] = true;
        return { id: action.id, label: action.label.trim() };
    });
    return { title: title, text: text, actions: cleanActions };
}

function pluginRuntimeSetDisplay(instance, view) {
    var clean = pluginRuntimeSanitizeView(instance, view);
    if (instance.probe) return true;
    pluginRuntimeDisplays.set(instance.pluginId, {
        pluginId: instance.pluginId,
        pluginName: instance.record.name,
        title: clean.title,
        text: clean.text,
        actions: clean.actions,
        conversationId: state.activeConvId || null,
        updatedAt: Date.now()
    });
    pluginRuntimeNotifyUi();
    return true;
}

function pluginRuntimeClearDisplay(instance) {
    if (instance.probe) return true;
    pluginRuntimeDisplays.delete(instance.pluginId);
    pluginRuntimeNotifyUi();
    return true;
}

function pluginRuntimeEmit(eventName, detail) {
    if (PLUGIN_RUNTIME_EVENTS.indexOf(eventName) < 0) return;
    pluginRuntimeInstances.forEach(function(instance) {
        if (instance.stopped || instance.probe || !instance.subscriptions.has(eventName)) return;
        try { pluginRuntimeEnsureCurrent(instance); }
        catch (error) { pluginRuntimeStop(instance, error.message || String(error), { failed: true }); return; }
        pluginRuntimePost(instance, {
            type: 'plugin-host-event',
            event: eventName,
            detail: detail && typeof detail === 'object' ? JSON.parse(JSON.stringify(detail)) : null
        });
    });
}

function notifyPluginRuntimeConversationSaved(conv) {
    if (!conv || conv.id === undefined) return;
    if (state.activeConvId !== conv.id) return;
    pluginRuntimeEmit('conversation-saved', { conversationId: conv.id, reason: 'messages' });
}

function buildPluginConversationStats(conv) {
    if (!conv || conv.id === undefined || conv.id === null) {
        return { version: 1, available: false, conversationId: null, title: '', updated: 0, messages: [] };
    }
    var messages = (Array.isArray(conv.messages) ? conv.messages : []).filter(function(message) {
        return message && (message.role === 'user' || message.role === 'assistant') && message.stage !== 'second';
    }).slice(-PLUGIN_MAX_STATS_MESSAGES).map(function(message) {
        var text = String(message.content || '').slice(0, 20000);
        var characters = 0;
        for (var index = 0; index < text.length; index++) if (!/\s/.test(text[index])) characters++;
        return { role: message.role, characters: characters };
    });
    return {
        version: 1,
        available: true,
        conversationId: String(conv.id),
        title: String(conv.title || '').slice(0, PLUGIN_MAX_UI_TITLE),
        updated: Number(conv.updated) || 0,
        messages: messages
    };
}

function pluginRuntimeNetworkHeaders(raw) {
    if (raw === undefined) return {};
    if (!pluginPlainRecord(raw)) throw pluginRuntimeError('INVALID_HEADERS', 'Network headers must be an object');
    var keys = Object.keys(raw);
    if (keys.length > 16) throw pluginRuntimeError('INVALID_HEADERS', 'Too many network headers');
    var headers = {};
    keys.forEach(function(key) {
        var lower = String(key).toLowerCase();
        if (!/^[a-z0-9-]{1,64}$/.test(lower) || PLUGIN_FORBIDDEN_HEADERS.indexOf(lower) >= 0 ||
            lower.indexOf('proxy-') === 0 || lower.indexOf('sec-') === 0) {
            throw pluginRuntimeError('FORBIDDEN_HEADER', 'Header is not allowed: ' + lower);
        }
        if (typeof raw[key] !== 'string' || raw[key].length > 1000) throw pluginRuntimeError('INVALID_HEADERS', 'Invalid header value');
        headers[lower] = raw[key];
    });
    return headers;
}

async function pluginRuntimeNetworkRequest(instance, request) {
    pluginRuntimeRequireCapability(instance, 'network.rpc');
    if (instance.probe) throw pluginRuntimeError('PROBE_DENIED', 'Probe mode cannot make network requests');
    if (!pluginPlainRecord(request) || !pluginOnlyKeys(request, ['url', 'method', 'headers', 'body'])) {
        throw pluginRuntimeError('INVALID_REQUEST', 'Invalid network request');
    }
    if (typeof request.url !== 'string' || request.url.length > 2048) throw pluginRuntimeError('INVALID_REQUEST', 'Invalid network URL');
    var method = String(request.method || 'GET').toUpperCase();
    var parsed;
    try { parsed = new URL(request.url); } catch (error) { throw pluginRuntimeError('INVALID_REQUEST', 'Invalid network URL'); }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
        throw pluginRuntimeError('INVALID_REQUEST', 'Only HTTP(S) URLs are allowed');
    }
    var grant = getPluginGrant(instance.pluginId, state.settings);
    var rule = grant && Array.isArray(grant.network) ? grant.network.find(function(item) { return item.origin === parsed.origin; }) : null;
    if (!rule || rule.methods.indexOf(method) < 0) throw pluginRuntimeError('NETWORK_DENIED', 'Origin or method is not authorized');
    var headers = pluginRuntimeNetworkHeaders(request.headers);
    var body = request.body;
    if (body !== undefined) {
        if (typeof body !== 'string') throw pluginRuntimeError('INVALID_REQUEST', 'Network body must be text');
        if (pluginTextBytes(body) > PLUGIN_MAX_NETWORK_BODY) throw pluginRuntimeError('BODY_TOO_LARGE', 'Network body exceeds the allowed size');
    }
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    if (controller) instance.aborters.add(controller);
    var timer = setTimeout(function() { if (controller) controller.abort(); }, PLUGIN_NETWORK_TIMEOUT_MS);
    try {
        if (typeof fetch !== 'function') throw pluginRuntimeError('NETWORK_UNAVAILABLE', 'Network is unavailable');
        var response = await fetch(parsed.href, {
            method: method,
            headers: headers,
            body: method === 'GET' || method === 'HEAD' ? undefined : body,
            credentials: 'omit',
            redirect: 'error',
            mode: 'cors',
            cache: 'no-store',
            referrerPolicy: 'no-referrer',
            signal: controller ? controller.signal : undefined
        });
        if (!response || !response.ok && response.status === 0) throw pluginRuntimeError('NETWORK_FAILED', 'Network request failed');
        var declaredHeader = response.headers && response.headers.get ? response.headers.get('content-length') : null;
        var declared = declaredHeader === null || declaredHeader === undefined || declaredHeader === '' ? NaN : Number(declaredHeader);
        if (Number.isFinite(declared) && declared > PLUGIN_MAX_NETWORK_RESPONSE) throw pluginRuntimeError('RESPONSE_TOO_LARGE', 'Network response exceeds the allowed size');
        var text = '';
        if (response.body && typeof response.body.getReader === 'function') {
            var reader = response.body.getReader();
            var decoder = typeof TextDecoder === 'function' ? new TextDecoder() : null;
            var total = 0;
            while (true) {
                var chunk = await reader.read();
                if (chunk.done) break;
                total += chunk.value.length;
                if (total > PLUGIN_MAX_NETWORK_RESPONSE) {
                    try { await reader.cancel(); } catch (error) {}
                    throw pluginRuntimeError('RESPONSE_TOO_LARGE', 'Network response exceeds the allowed size');
                }
                text += decoder ? decoder.decode(chunk.value, { stream: true }) : String.fromCharCode.apply(null, chunk.value);
            }
            if (decoder) text += decoder.decode();
        } else {
            // 没有流式 reader 时无法在读取过程中执行字节上限；空响应才可以安全返回，
            // 其他情况如实拒绝，不用 response.text() 整段读取后再检查。
            var emptyBody = method === 'HEAD' || [204, 205, 304].indexOf(Number(response.status)) >= 0 || declared === 0;
            if (!emptyBody) throw pluginRuntimeError('NETWORK_UNBOUNDED', 'Network response cannot be read within the allowed size');
            text = '';
        }
        return {
            ok: !!response.ok,
            status: Number(response.status) || 0,
            statusText: String(response.statusText || '').slice(0, 100),
            contentType: response.headers && response.headers.get ? String(response.headers.get('content-type') || '').slice(0, 200) : '',
            body: text
        };
    } catch (error) {
        if (error && error.name === 'AbortError') throw pluginRuntimeError('NETWORK_ABORTED', 'Network request was cancelled');
        if (error && error.code) throw error;
        throw pluginRuntimeError('NETWORK_FAILED', error && error.message ? error.message : 'Network request failed');
    } finally {
        clearTimeout(timer);
        if (controller) instance.aborters.delete(controller);
    }
}

async function pluginRuntimeHandleRpc(instance, method, args) {
    var values = Array.isArray(args) ? args : [];
    if (method === 'stats.get') {
        pluginRuntimeRequireCapability(instance, 'conversation.stats');
        if (values.length) throw pluginRuntimeError('INVALID_ARGUMENTS', 'Conversation statistics do not accept a conversation id');
        return buildPluginConversationStats(typeof getActiveConv === 'function' ? getActiveConv() : null);
    }
    if (method === 'storage.get' || method === 'storage.set' || method === 'storage.remove' || method === 'storage.keys') {
        pluginRuntimeRequireCapability(instance, 'storage.private');
        if (instance.probe && (method === 'storage.set' || method === 'storage.remove')) {
            throw pluginRuntimeError('PROBE_DENIED', 'Probe mode cannot write plugin storage');
        }
        if (method === 'storage.keys') {
            if (values.length) throw pluginRuntimeError('INVALID_ARGUMENTS', 'storage.keys does not accept arguments');
            return Object.keys(pluginRuntimePrivateStore(instance)).sort();
        }
        if (!values.length) throw pluginRuntimeError('INVALID_ARGUMENTS', 'A storage key is required');
        var key = pluginRuntimeStorageKey(instance, values[0]);
        if (method === 'storage.get') {
            if (values.length !== 1) throw pluginRuntimeError('INVALID_ARGUMENTS', 'storage.get accepts one key');
            var data = pluginRuntimePrivateStore(instance);
            return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
        }
        if (method === 'storage.remove') {
            if (values.length !== 1) throw pluginRuntimeError('INVALID_ARGUMENTS', 'storage.remove accepts one key');
            await pluginRuntimeWritePrivate(instance, key, undefined, true);
            return true;
        }
        if (values.length !== 2) throw pluginRuntimeError('INVALID_ARGUMENTS', 'storage.set accepts a key and value');
        var value;
        try { value = pluginSanitizePrivateValue(values[1], 0, { bytes: 0 }); } catch (error) { throw pluginRuntimeError('INVALID_VALUE', error.message); }
        await pluginRuntimeWritePrivate(instance, key, value, false);
        return true;
    }
    if (method === 'ui.render') {
        pluginRuntimeRequireCapability(instance, 'ui.panel');
        if (values.length !== 1) throw pluginRuntimeError('INVALID_ARGUMENTS', 'ui.render accepts one view');
        return pluginRuntimeSetDisplay(instance, values[0]);
    }
    if (method === 'ui.clear') {
        pluginRuntimeRequireCapability(instance, 'ui.panel');
        if (values.length) throw pluginRuntimeError('INVALID_ARGUMENTS', 'ui.clear does not accept arguments');
        return pluginRuntimeClearDisplay(instance);
    }
    if (method === 'network.request') {
        pluginRuntimeRequireCapability(instance, 'network.rpc');
        if (values.length !== 1) throw pluginRuntimeError('INVALID_ARGUMENTS', 'network.request accepts one request');
        return pluginRuntimeNetworkRequest(instance, values[0]);
    }
    throw pluginRuntimeError('UNKNOWN_METHOD', 'Unknown plugin method');
}

function pluginRuntimeTriggerAction(pluginId, actionId) {
    var instance = pluginRuntimeInstances.get(pluginId);
    if (!instance || !pluginRuntimeIsRunning(pluginId)) throw new Error(t('plugin_not_running'));
    var record = pluginRuntimeEnsureCurrent(instance);
    if ((record.capabilities || []).indexOf('ui.panel') < 0) throw new Error(t('plugin_not_authorized'));
    var display = pluginRuntimeDisplays.get(pluginId);
    if (!display || !display.actions.some(function(action) { return action.id === actionId; })) throw new Error(t('plugin_action_stale'));
    if (display.conversationId !== null && display.conversationId !== state.activeConvId) throw new Error(t('plugin_conversation_changed'));
    pluginRuntimePost(instance, { type: 'plugin-host-event', event: 'action', detail: { actionId: actionId, conversationId: state.activeConvId } });
    return true;
}

function pluginRuntimeFail(instance, message) {
    if (!instance || instance.stopped) return;
    if (instance.probe) {
        instance.stopped = true;
        pluginRuntimeProbes.delete(instance.instanceId);
        clearTimeout(instance.startupTimer);
        pluginRuntimeDisposeInstance(instance);
        if (instance.readyReject) instance.readyReject(new Error(message || t('plugin_start_failed')));
        instance.readyResolve = null;
        instance.readyReject = null;
        return;
    }
    pluginRuntimeSetStatus(instance.pluginId, 'failed', message || t('plugin_start_failed'));
    pluginRuntimeStop(instance, message || t('plugin_start_failed'), { failed: true });
}

function pluginRuntimeDisposeInstance(instance) {
    if (!instance) return;
    instance.stopped = true;
    if (Array.isArray(instance.queue)) instance.queue.length = 0;
    instance.queueBytes = 0;
    clearTimeout(instance.startupTimer);
    instance.aborters.forEach(function(controller) { try { controller.abort(); } catch (error) {} });
    instance.aborters.clear();
    clearTimeout(instance.probeTimer);
    if (instance.port) {
        try { instance.port.postMessage({ type: 'plugin-host-stop', reason: 'Plugin stopped' }); } catch (error) {}
        var port = instance.port;
        var frame = instance.frame;
        setTimeout(function() {
            try { port.close(); } catch (error) {}
            try { if (frame) frame.remove(); } catch (error) {}
        }, 150);
        instance.port = null;
        instance.frame = null;
    } else if (instance.frame) {
        try { instance.frame.remove(); } catch (error) {}
        instance.frame = null;
    }
}

function pluginRuntimeStop(instance, reason, options) {
    options = options || {};
    if (!instance || instance.stopped) return false;
    var pluginId = instance.pluginId;
    pluginRuntimeBumpEpoch(pluginId);
    pluginRuntimeInstances.delete(pluginId);
    pluginRuntimeDisplays.delete(pluginId);
    pluginRuntimeDisposeInstance(instance);
    pluginRuntimeSetStatus(pluginId, options.failed ? 'failed' : 'stopped', reason || '');
    if (instance.readyReject) instance.readyReject(new Error(reason || t('plugin_stopped')));
    instance.readyResolve = null;
    instance.readyReject = null;
    if (!options.skipDependents) {
        pluginDependents(getInstalledPlugins(), pluginId).forEach(function(dependent) {
            var dependentInstance = pluginRuntimeInstances.get(dependent.id);
            if (dependentInstance) pluginRuntimeStop(dependentInstance, t('plugin_dependency_stopped').replace('{id}', pluginId), { skipDependents: true });
        });
    }
    pluginRuntimeNotifyUi();
    return true;
}

function stopPluginInstance(pluginId, reason, options) {
    return pluginRuntimeStop(pluginRuntimeInstances.get(pluginId), reason, options || {});
}

function stopAllPluginInstances(reason, options) {
    options = options || {};
    var ids = [];
    pluginRuntimeInstances.forEach(function(instance) { ids.push(instance.pluginId); });
    pluginRuntimeProbes.forEach(function(instance) {
        pluginRuntimeBumpEpoch(instance.pluginId);
        if (instance.readyReject) instance.readyReject(new Error(reason || t('plugin_stopped')));
        instance.readyResolve = null;
        instance.readyReject = null;
        pluginRuntimeDisposeInstance(instance);
    });
    pluginRuntimeProbes.clear();
    (getInstalledPlugins() || []).forEach(function(record) {
        if (ids.indexOf(record.id) < 0) ids.push(record.id);
    });
    ids.forEach(function(pluginId) {
        pluginRuntimeBumpEpoch(pluginId);
        var instance = pluginRuntimeInstances.get(pluginId);
        if (instance) pluginRuntimeStop(instance, reason || t('plugin_stopped'), Object.assign({}, options, { skipDependents: true }));
    });
    pluginRuntimeDisplays.clear();
    pluginRuntimeNotifyUi();
}

function pluginRuntimeMount(record, options) {
    options = options || {};
    if (!record) return Promise.reject(new Error(t('plugin_missing')));
    pluginRuntimeBindFrameEvents();
    var pluginId = record.id;
    var token = pluginRandomToken();
    var instanceId = pluginRandomToken();
    var fingerprint = pluginFingerprint(record);
    var instance = {
        pluginId: pluginId,
        token: token,
        instanceId: instanceId,
        record: JSON.parse(JSON.stringify(record)),
        fingerprint: fingerprint,
        probe: options.probe === true,
        status: 'starting',
        stopped: false,
        frame: null,
        port: null,
        queue: [],
        queueBytes: 0,
        draining: false,
        messageTimes: [],
        subscriptions: new Set(),
        callIds: new Set(),
        callIdSequence: 0,
        rpcTimes: [],
        inflight: new Set(),
        aborters: new Set(),
        epoch: pluginRuntimeEpoch(pluginId),
        startupTimer: null,
        probeTimer: null,
        readyResolve: null,
        readyReject: null
    };
    if (instance.probe) pluginRuntimeProbes.set(instanceId, instance);
    else {
        pluginRuntimeInstances.set(pluginId, instance);
        pluginRuntimeSetStatus(pluginId, 'starting', '');
    }
    var ready = new Promise(function(resolve, reject) {
        instance.readyResolve = resolve;
        instance.readyReject = reject;
    });
    try {
        pluginRuntimeCreateFrame(instance);
    } catch (error) {
        if (instance.probe) pluginRuntimeProbes.delete(instanceId);
        else {
            pluginRuntimeInstances.delete(pluginId);
            pluginRuntimeSetStatus(pluginId, 'failed', error.message);
        }
        throw error;
    }
    instance.startupTimer = setTimeout(function() {
        if (instance.status !== 'starting' || instance.stopped) return;
        pluginRuntimeFail(instance, t('plugin_start_timeout'));
    }, PLUGIN_STARTUP_TIMEOUT_MS);
    pluginRuntimeNotifyUi();
    return ready;
}

async function startPluginInstance(pluginId) {
    var record = getInstalledPluginById(pluginId);
    if (!record) throw new Error(t('plugin_missing'));
    if (pluginRuntimeIsRunning(pluginId)) return pluginRuntimeInstances.get(pluginId);
    if (pluginRuntimeInstances.has(pluginId)) throw new Error(t('plugin_starting'));
    pluginRuntimeCheckDependencies(record, true);
    var grant = getPluginGrant(pluginId, state.settings);
    var missing = pluginGrantMissing(record, grant);
    if (missing.length) throw new Error(t('plugin_not_authorized'));
    try {
        var instance = await pluginRuntimeMount(record, { probe: false });
        if (!pluginRuntimeIsRunning(pluginId)) throw new Error(t('plugin_start_failed'));
        return instance;
    } catch (error) {
        pluginRuntimeSetStatus(pluginId, 'failed', error.message || String(error));
        pluginRuntimeNotifyUi();
        throw error;
    }
}

async function beginPluginProbe(record) {
    pluginRuntimeCheckDependencies(record, false);
    try {
        var instance = await pluginRuntimeMount(record, { probe: true });
        return {
            instance: instance,
            stop: function() {
                if (instance.stopped) return;
                pluginRuntimeDisposeInstance(instance);
                pluginRuntimeProbes.delete(instance.instanceId);
            }
        };
    } catch (error) {
        throw new Error(t('plugin_candidate_failed').replace('{message}', error.message || String(error)));
    }
}
