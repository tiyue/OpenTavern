
function cardRuntimePalette() {
    var body = typeof document !== 'undefined' && document.body, light = !!(body && body.classList.contains('theme-new-light'));
    var taoxin = light && body.classList.contains('theme-taoxin'), modern = body && body.classList.contains('theme-new-dark');
    return { theme: taoxin ? 'taoxin' : light ? 'new-light' : modern ? 'new-dark' : 'classic', colorScheme: light ? 'light' : 'dark',
        foreground: taoxin ? '#2a3238' : light ? '#302b27' : modern ? '#f2eae2' : '#e4e4e7', background: taoxin ? '#ffffff' : light ? '#fffdfa' : modern ? '#221f1c' : '#16161c' };
}

function updateCardRuntimeFrameHeight(instance) {
    if (!instance || instance.stopped || !instance.frame.isConnected) return;
    var maximum = Math.max(120, Math.min(480, (window.innerHeight || 800) * .6));
    instance.frame.style.height = Math.ceil(Math.max(120, Math.min(maximum, instance.contentHeight || 120))) + 'px';
}

function cardRuntimeInitialData(instance) {
    var entry = instance.entry, permissions = instance.grant.permissions;
    return { messageId: entry.messageId, characterId: entry.character && entry.character.id || null,
        variables: permissions['variables.read'] && typeof getMvuDataForMessage === 'function' ? cardRuntimeJson(getMvuDataForMessage(entry.conv, entry.msg)) : null,
        stamp: cardRuntimeVariableStamp(instance), palette: cardRuntimePalette(),
        messages: permissions['chat.read'] ? cardRuntimeJson(entry.conv.messages.filter(function(message) { return (message.role === 'user' || message.role === 'assistant') && message.stage !== 'second'; }).slice(-200).map(function(message) { return { id: message.id, role: message.role, content: String(message.content || '') }; })) : [] };
}

function buildCardRuntimeDocument(instance) {
    var grant = instance.grant, template = document.createElement('template');
    template.innerHTML = grant.plan.entrySource;
    template.content.querySelectorAll('meta[http-equiv], base, iframe, frame, object, embed').forEach(function(element) { element.remove(); });
    template.content.querySelectorAll('script').forEach(function(script) {
        if (script.hasAttribute('src')) throw cardRuntimeError('UNRESOLVED_DEPENDENCY', '此级别仍有未固定的外部脚本。');
        if (script.type === 'importmap') script.remove();
    });
    var media = grant.permissions['media.remote'] ? ' http: https:' : '';
    var modules = grant.plan.modules || [];
    var policy = "default-src 'none'; script-src 'unsafe-inline'" + (grant.level !== 'L0' ? " 'unsafe-eval'" : '') + (modules.length ? ' blob:' : '') + "; style-src 'unsafe-inline'" + (media ? ' http: https:' : '') + "; img-src data: blob:" + media + '; font-src data:' + media + '; media-src data: blob:' + media + "; connect-src 'none'; worker-src 'none'; frame-src 'none'; child-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
    var config = { token: instance.token, abi: CARD_RUNTIME_ABI, level: grant.level, permissions: grant.permissions, initial: cardRuntimeInitialData(instance), modules: modules };
    var serialized = JSON.stringify(config).replace(/</g, '\\u003c');
    var dependencies = grant.plan.scripts.filter(function(script) { return script.inject === true; }).map(function(script) {
        return '<script' + (script.type === 'module' ? ' type="module"' : '') + '>' + script.source.replace(/<\/script/gi, '<\\/script') + '</script>';
    }).join('');
    var palette = cardRuntimePalette(), colors = '--card-runtime-scheme:' + palette.colorScheme + ';--card-runtime-text:' + palette.foreground + ';--card-runtime-surface:' + palette.background;
    return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="' + policy.replace(/"/g, '&quot;') + '">' +
        '<style>:root{' + colors + '}html,body{margin:0;min-width:0;overflow-wrap:anywhere;color-scheme:var(--card-runtime-scheme);color:var(--card-runtime-text);background:var(--card-runtime-surface)}body{padding:12px;box-sizing:border-box}img,video,canvas{max-width:100%}*{box-sizing:border-box}</style>' +
        '<script>(' + cardRuntimeChildBootstrap.toString() + ')(' + serialized + ');</script>' + dependencies + '</head><body>' + template.innerHTML + '</body></html>';
}

function renderCardRuntimeContent(content, context, preparedDisplay) {
    var entry;
    try { entry = createCardRuntimeEntry(content, context); } catch (error) {
        var fallbackHtml = preparedDisplay ? preparedDisplay.display.html : (typeof renderAssistantDisplayContent === 'function' ? renderAssistantDisplayContent(content, false) : (typeof renderStaticMessage === 'function' ? renderStaticMessage(typeof stripDreamControlWrappers === 'function' ? stripDreamControlWrappers(content) : content) : escapeHtml(content)));
        return '<p class="feature-error">' + escapeHtml(error.message) + '</p>' + fallbackHtml;
    }
    if (!entry) return null;
    var staticHtml = preparedDisplay ? preparedDisplay.display.html : (typeof renderAssistantDisplayContent === 'function' ? renderAssistantDisplayContent(content, false) : (typeof renderStaticMessage === 'function' ? renderStaticMessage(typeof stripDreamControlWrappers === 'function' ? stripDreamControlWrappers(content) : content) : escapeHtml(content)));
    return '<section class="card-runtime" data-card-runtime-token="' + entry.token + '"><div class="card-runtime-static">' + staticHtml + '</div>' +
        '<div class="feature-toolbar card-runtime-toolbar"><span class="feature-hint" data-card-runtime-status>卡片前端尚未运行</span>' +
        '<button type="button" class="feature-entry" data-action="card-runtime-run" data-card-runtime-token="' + entry.token + '">运行卡片</button>' +
        '<button type="button" class="feature-entry" data-action="card-runtime-revoke" data-card-runtime-token="' + entry.token + '" hidden>停止并撤销</button>' +
        '<button type="button" class="feature-entry" data-action="card-runtime-details" data-card-runtime-token="' + entry.token + '">运行详情</button></div></section>';
}

function updateCardRuntimeElement(instance, running, message) {
    var element = instance.element;
    if (!element) return;
    var status = element.querySelector('[data-card-runtime-status]'), run = element.querySelector('[data-action="card-runtime-run"]'), revoke = element.querySelector('[data-action="card-runtime-revoke"]');
    if (status) status.textContent = message || (running ? instance.grant.level + ' 正在运行' : '卡片前端已停止');
    if (run) run.hidden = running;
    if (revoke) revoke.hidden = !running;
    var preview = element.querySelector('.card-runtime-static'); if (preview) preview.hidden = running;
}

function stopCardRuntimeInstance(instance, reason, revoke) {
    if (!instance || instance.stopped) return;
    instance.stopped = true; cardRuntimeInstances.delete(instance.token);
    clearTimeout(instance.timer); clearTimeout(instance.layoutTimer); clearInterval(instance.watchdog);
    if (instance.port) { try { instance.port.postMessage({ type: 'card-runtime-stop' }); instance.port.close(); } catch (_) {} }
    if (instance.cleanup) { try { instance.cleanup(); } catch (_) {} }
    instance.subscriptions.clear();
    if (instance.writerKey && cardRuntimeWriters.get(instance.writerKey) === instance.token) cardRuntimeWriters.delete(instance.writerKey);
    if (revoke) cardRuntimeGrants.delete(instance.grant.key);
    if (instance.frame) instance.frame.remove();
    updateCardRuntimeElement(instance, false, reason || '已停止；原文及已保存的变量保留');
}

function stopCardRuntimeInstances(reason, options) {
    Array.from(cardRuntimeInstances.values()).forEach(function(instance) { stopCardRuntimeInstance(instance, reason, options && options.revoke); });
    cardRuntimeEntries.forEach(function(entry) { if (entry.pending) entry.pending.abort(); });
}

function pruneCardRuntimeInstances() {
    Array.from(cardRuntimeInstances.values()).forEach(function(instance) {
        if (!instance.frame.isConnected) stopCardRuntimeInstance(instance, '显示已重建', false);
        else if (!cardRuntimeEntryIsCurrent(instance.entry)) stopCardRuntimeInstance(instance, '目标已变化，重新运行需确认', true);
    });
}

function cardRuntimeHostEvent(instance, name, detail) {
    if (!instance.port || !instance.subscriptions.has(name) || instance.stopped) return;
    instance.port.postMessage({ type: 'card-runtime-event', event: name, detail: detail });
    if (instance.subscriptions.get(name)) instance.subscriptions.delete(name);
}

var cardRuntimeFrameEventsBound = false;
function bindCardRuntimeFrameEvents() {
    if (cardRuntimeFrameEventsBound) return; cardRuntimeFrameEventsBound = true;
    window.addEventListener('message', function(event) {
        var data = event.data;
        if (!data || data.type !== 'card-runtime-ready' || typeof data.token !== 'string') return;
        var instance = cardRuntimeInstances.get(data.token);
        if (!instance || instance.grant.level === 'L3' || instance.port || event.source !== instance.frame.contentWindow || event.origin !== 'null' || data.abi !== CARD_RUNTIME_ABI) return;
        try {
            assertCardRuntimeInstance(instance); var channel = new MessageChannel(); connectCardRuntimePort(instance, channel.port1);
            instance.frame.contentWindow.postMessage({ type: 'card-runtime-connect', token: instance.token, abi: CARD_RUNTIME_ABI }, '*', [channel.port2]);
            clearTimeout(instance.timer); updateCardRuntimeElement(instance, true);
        } catch (error) { stopCardRuntimeInstance(instance, error.message, true); }
    });
    if (typeof appStore !== 'undefined') appStore.subscribe(function(keys) {
        pruneCardRuntimeInstances();
        cardRuntimeInstances.forEach(function(instance) {
            cardRuntimeHostEvent(instance, 'chat.changed', { conversationId: instance.entry.conv.id, changedKeys: keys });
            if (typeof getMvuContextStamp !== 'function') return;
            var source = getMvuContextStamp(instance.entry.conv, instance.entry.msg);
            if (instance.variableSource === source) return;
            var stamp = cardRuntimeVariableStamp(instance);
            cardRuntimeHostEvent(instance, 'mvu.updated', { stamp: stamp, variables: instance.grant.permissions['variables.read'] ? cardRuntimeJson(getMvuDataForMessage(instance.entry.conv, instance.entry.msg)) : null });
        });
    });
    if (typeof MutationObserver === 'function' && document.body) {
        var observer = new MutationObserver(function() {
            var palette = cardRuntimePalette();
            cardRuntimeInstances.forEach(function(instance) { if (instance.port && !instance.stopped) instance.port.postMessage({ type: 'card-runtime-theme', palette: palette }); });
        });
        observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    }
    window.addEventListener('resize', function() { cardRuntimeInstances.forEach(updateCardRuntimeFrameHeight); });
}

function mountCardRuntimeFrames(root) {
    if (!root || typeof root.querySelectorAll !== 'function') return;
    bindCardRuntimeFrameEvents(); pruneCardRuntimeInstances();
    root.querySelectorAll('section.card-runtime[data-card-runtime-token]').forEach(function(element) {
        var token = element.getAttribute('data-card-runtime-token'), entry = cardRuntimeEntries.get(token);
        if (!entry || cardRuntimeInstances.has(token) || !cardRuntimeEntryIsCurrent(entry)) return;
        var grant = findCardRuntimeGrant(entry); if (!grant) return;
        if (cardRuntimeInstances.size >= 16) { var label = element.querySelector('[data-card-runtime-status]'); if (label) label.textContent = '运行实例已达上限，请先停止其他卡片'; return; }
        var frame = document.createElement('iframe'); frame.setAttribute('sandbox', 'allow-scripts'); frame.setAttribute('referrerpolicy', 'no-referrer');
        frame.title = '卡片前端：' + String(entry.character && entry.character.name || '未命名'); frame.className = 'card-runtime-frame';
        frame.style.width = '100%'; frame.style.height = '120px'; frame.style.border = '0';
        var instance = { token: token, entry: entry, grant: grant, frame: frame, element: element, stopped: false, port: null, requestIds: new Set(), requestTimes: [], subscriptions: new Map(),
            inputRevision: userDraftEditSequence, inputValue: dom.messageInput.value, variableSource: null, variableStamp: null, lastContact: Date.now() };
        cardRuntimeInstances.set(token, instance);
        var loads = 0; frame.addEventListener('load', function() { if (++loads > 1) stopCardRuntimeInstance(instance, '卡片发生导航，已停止', true); });
        instance.timer = setTimeout(function() { stopCardRuntimeInstance(instance, '卡片未完成连接，保持静态显示', true); }, 10000);
        instance.watchdog = setInterval(function() { if (Date.now() - instance.lastContact > 30000) stopCardRuntimeInstance(instance, '卡片连接已中断', true); }, 10000);
        try {
            if (grant.level === 'L3') {
                if (typeof mountNetworkedCardRuntimeFrame !== 'function') throw cardRuntimeError('UNAVAILABLE', '联网运行层尚未就绪。');
                Promise.resolve(mountNetworkedCardRuntimeFrame(instance, frame)).then(function(port) {
                    if (instance.stopped) { port.close(); return; }
                    connectCardRuntimePort(instance, port); clearTimeout(instance.timer); updateCardRuntimeElement(instance, true);
                }).catch(function(error) { stopCardRuntimeInstance(instance, error.message, true); });
            } else { frame.srcdoc = buildCardRuntimeDocument(instance); element.appendChild(frame); }
        } catch (error) { stopCardRuntimeInstance(instance, error.message, true); }
    });
}
