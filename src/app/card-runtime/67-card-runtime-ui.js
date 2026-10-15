// Explicit review and page-local consent; no field is written to settings.
var cardRuntimeDialog = null;

function openCardRuntimeDialog(id, title, body, onSave, options) {
    if (cardRuntimeDialog && cardRuntimeDialog.isConnected) cardRuntimeDialog.close();
    options = options || {};
    var onClose = options.onClose, dialog;
    options.onClose = function() { if (cardRuntimeDialog === dialog) cardRuntimeDialog = null; if (onClose) onClose(); };
    dialog = openFeatureDialog(id, title, body, onSave, options); cardRuntimeDialog = dialog;
    return dialog;
}

function cardRuntimeSelection(dialog) {
    var level = dialog.querySelector('[data-runtime-level]').value, permissions = {}, network = {};
    if (!['L0', 'L1', 'L2', 'L3'].includes(level)) throw cardRuntimeError('INVALID_LEVEL', '请选择运行级别。');
    dialog.querySelectorAll('[data-runtime-permission]').forEach(function(input) { permissions[input.getAttribute('data-runtime-permission')] = input.checked; });
    if (level === 'L3') {
        var address;
        try { address = new URL(dialog.querySelector('[data-runtime-broker]').value.trim()); } catch (_) { throw cardRuntimeError('INVALID_NETWORK', '请填写完整的 HTTP 或 HTTPS 联网服务地址。'); }
        if (!['http:', 'https:'].includes(address.protocol) || address.username || address.password || address.origin === location.origin) throw cardRuntimeError('INVALID_NETWORK', '联网服务须使用与应用不同源且不含凭据的 HTTP 或 HTTPS 地址。');
        var origins = dialog.querySelector('[data-runtime-origins]').value.split(/[\s,]+/).filter(Boolean).map(function(value) {
            var origin;
            try { origin = new URL(value); } catch (_) { throw cardRuntimeError('INVALID_NETWORK', '允许访问的来源格式不正确。'); }
            if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw cardRuntimeError('INVALID_NETWORK', '每个允许来源只填写协议、主机和端口。');
            return origin.origin;
        });
        if (!origins.length || origins.length > 16) throw cardRuntimeError('INVALID_NETWORK', '请填写 1–16 个允许访问的来源。');
        var methods = Array.from(dialog.querySelectorAll('[data-runtime-method]:checked'), function(input) { return input.value; });
        if (!methods.length) throw cardRuntimeError('INVALID_NETWORK', '至少选择一种请求方法。');
        if (!permissions['network.fetch']) throw cardRuntimeError('PERMISSION_DENIED', 'L3 需要明确勾选联网权限。');
        network = { brokerUrl: address.href, origins: Array.from(new Set(origins)), methods: methods };
    } else permissions['network.fetch'] = false;
    return { level: level, permissions: permissions, network: network };
}

function chooseCardRuntimePermissions(entry, controller) {
    return new Promise(function(resolve) {
        var accepted = false;
        var body = '<p class="feature-hint">卡片脚本将在隔离窗口中运行。许可仅在本页有效；修改内容、切换目标或撤销后需重新确认。</p>' +
            '<label class="feature-field"><span>运行级别</span><select data-runtime-level><option value="L0">L0 · 仅卡片内联脚本</option><option value="L1">L1 · 固定基础库</option><option value="L2">L2 · 下载并审核完整依赖</option><option value="L3">L3 · 受限联网服务</option></select></label>' +
            '<p class="feature-hint" data-runtime-level-hint>L0 不下载外部脚本，不开放联网接口。</p><fieldset class="card-runtime-permissions"><legend>允许的操作</legend>' +
            Object.keys(cardRuntimeCapabilities).map(function(key) { return '<label><input type="checkbox" data-runtime-permission="' + key + '"><span>' + escapeHtml(cardRuntimeCapabilities[key]) + '</span></label>'; }).join('') + '</fieldset>' +
            '<fieldset class="card-runtime-network" data-runtime-network hidden><legend>联网范围</legend>' +
            '<label class="feature-field"><span>不同源联网服务地址</span><input type="url" data-runtime-broker placeholder="http://localhost:8766/index.html"></label>' +
            '<label class="feature-field"><span>允许访问的来源，每行一个</span><textarea rows="3" data-runtime-origins placeholder="https://example.com"></textarea></label>' +
            '<div class="feature-toolbar">' + ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map(function(method) { return '<label><input type="checkbox" data-runtime-method value="' + method + '"' + (method === 'GET' ? ' checked' : '') + '> ' + method + '</label>'; }).join('') + '</div></fieldset>';
        var dialog = openCardRuntimeDialog('cardRuntimePermissionDialog', '运行卡片', body, function(current) {
            if (controller.signal.aborted || !cardRuntimeEntryIsCurrent(entry)) throw cardRuntimeError('STALE_TARGET', '会话或消息已变化，请重新打开。');
            var selection = cardRuntimeSelection(current); accepted = true; resolve(selection);
        }, { saveLabel: '准备并审核', onClose: function() { if (!accepted) { controller.abort(); resolve(null); } } });
        controller.signal.addEventListener('abort', function() { if (dialog.isConnected && dialog.open) dialog.close(); }, { once: true });
        dialog.querySelector('[data-runtime-level]').addEventListener('change', function(event) {
            var level = event.target.value;
            dialog.querySelector('[data-runtime-network]').hidden = level !== 'L3';
            dialog.querySelector('[data-runtime-level-hint]').textContent = { L0: 'L0 不下载外部脚本，不开放联网接口。', L1: 'L1 使用已固定版本的基础库，不开放联网接口。', L2: '准备将下载依赖供你审核；确认运行前不会执行。', L3: '准备将固定依赖；联网接口通过所选服务访问允许来源。' }[level];
        });
    });
}

function cardRuntimeReviewHtml(grant) {
    var allowed = Object.keys(cardRuntimeCapabilities).filter(function(key) { return grant.permissions[key]; });
    var dependencies = grant.plan.scripts.concat(grant.plan.modules || []);
    return '<div class="card-runtime-review"><p>运行级别：' + escapeHtml(grant.level) + '</p><p class="feature-hint">许可绑定下列内容和操作；停止不会回退已保存的变量。</p>' +
        '<p class="feature-hint">窗口自行跳转可能发出请求，脚本也可持续占用资源。请仅运行可信卡片。</p>' +
        '<p>允许：' + escapeHtml(allowed.length ? allowed.map(function(key) { return cardRuntimeCapabilities[key]; }).join('；') : '仅读取承载此卡片的消息身份') + '</p>' +
        '<p>内容 SHA-256：<code>' + escapeHtml(grant.sourceDigest) + '</code></p><p>完整许可 SHA-256：<code>' + escapeHtml(grant.digest) + '</code></p>' +
        (grant.level === 'L3' ? '<p>联网服务：' + escapeHtml(grant.network.brokerUrl) + '</p><p>来源：' + escapeHtml(grant.network.origins.join('；')) + '</p><p>方法：' + escapeHtml(grant.network.methods.join('、')) + '</p>' : '') +
        '<details><summary>固定依赖（' + dependencies.length + '）</summary>' + dependencies.map(function(script) { return '<div class="card-runtime-dependency"><p>' + escapeHtml(script.name || script.url || script.id || '内联模块') + ' · ' + cardRuntimeBytes(script.source) + ' 字节</p><code>' + escapeHtml(script.sha256) + '</code><details><summary>查看源码</summary><pre><code>' + escapeHtml(script.source) + '</code></pre></details></div>'; }).join('') + '</details>' +
        '<details><summary>查看卡片原文</summary><pre><code>' + escapeHtml(grant.source) + '</code></pre></details></div>';
}

async function reviewCardRuntimeGrant(entry, selection, controller) {
    var grant = null, finish;
    var completed = new Promise(function(resolve) { finish = resolve; });
    var dialog = openCardRuntimeDialog('cardRuntimeReviewDialog', '审核卡片内容', '<p class="feature-hint">正在准备所选内容，完成后可查看依赖摘要和源码。</p>', function() {
        if (!grant || controller.signal.aborted) return false;
        activateCardRuntimeGrant(entry, grant);
        mountCardRuntimeFrames(dom.messagesContainer || document);
        finish(true);
    }, { saveLabel: '确认运行', onClose: function() { controller.abort(); finish(false); } });
    controller.signal.addEventListener('abort', function() { if (dialog.isConnected && dialog.open) dialog.close(); }, { once: true });
    dialog.querySelector('button[type="submit"]').disabled = true;
    try {
        grant = await prepareCardRuntimeGrant(entry, selection, controller.signal);
        if (controller.signal.aborted || !dialog.isConnected) return false;
        dialog.querySelector('.feature-dialog-body').innerHTML = cardRuntimeReviewHtml(grant);
        dialog.querySelector('button[type="submit"]').disabled = false;
    } catch (error) {
        if (!controller.signal.aborted && dialog.isConnected) {
            dialog.querySelector('.feature-error').textContent = error.message || String(error);
            dialog.querySelector('.feature-dialog-body').textContent = '准备失败，卡片保持静态显示。关闭后可重新选择运行级别。';
        }
    }
    return completed;
}

async function requestCardRuntimeRun(entry) {
    if (entry.pending) return;
    var controller = new AbortController(); entry.pending = controller;
    try {
        var selection = await chooseCardRuntimePermissions(entry, controller);
        if (selection && !controller.signal.aborted) await reviewCardRuntimeGrant(entry, selection, controller);
    } finally { if (entry.pending === controller) entry.pending = null; }
}

function revokeCardRuntimeEntry(entry) {
    cardRuntimeGrants.forEach(function(grant, key) { if (grant.cardKey === entry.cardKey && grant.source === entry.source) cardRuntimeGrants.delete(key); });
    Array.from(cardRuntimeInstances.values()).forEach(function(instance) { if (instance.entry.cardKey === entry.cardKey && instance.entry.source === entry.source) stopCardRuntimeInstance(instance, '已停止并撤销；原文及已保存的变量保留', false); });
    if (entry.pending) entry.pending.abort();
}

function handleCardRuntimeAction(action, element) {
    if (!['card-runtime-run', 'card-runtime-revoke', 'card-runtime-details'].includes(action)) return false;
    var owner = element && element.closest('[data-card-runtime-token]'), entry = owner && cardRuntimeEntries.get(owner.getAttribute('data-card-runtime-token'));
    if (!entry) return true;
    if (action === 'card-runtime-revoke') { revokeCardRuntimeEntry(entry); return true; }
    if (action === 'card-runtime-details') {
        var grant = findCardRuntimeGrant(entry);
        openCardRuntimeDialog('cardRuntimeDetailsDialog', '卡片运行详情', grant ? cardRuntimeReviewHtml(grant) : '<p class="feature-hint">尚未授权运行，当前仅显示静态内容。</p><details><summary>查看原文</summary><pre><code>' + escapeHtml(entry.source) + '</code></pre></details>', null);
        return true;
    }
    requestCardRuntimeRun(entry).catch(function(error) { openCardRuntimeDialog('cardRuntimeErrorDialog', '卡片未运行', '<p class="feature-hint">' + escapeHtml(error.message || String(error)) + '</p>', null); });
    return true;
}
