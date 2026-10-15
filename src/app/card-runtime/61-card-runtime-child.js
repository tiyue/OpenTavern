// The bootstrap runs only in the opaque iframe. Card bytes never enter the host DOM.
function cardRuntimeChildBootstrap(config) {
    'use strict';
    var port = null, sequence = 0, waiting = new Map(), events = new Map(), objectUrls = [], stopped = false, layoutObserver = null, lastHeight = 0;
    var initial = config.initial, variables = initial.variables, stamp = initial.stamp;
    var readyResolve, ready = new Promise(function(resolve) { readyResolve = resolve; });
    function copy(value) { return JSON.parse(JSON.stringify(value)); }
    function denied(permission) { var error = new Error('Permission denied: ' + permission); error.code = 'PERMISSION_DENIED'; throw error; }
    function requirePermission(permission) { if (!config.permissions[permission]) denied(permission); }
    function call(method, args) {
        return ready.then(function() {
            if (stopped) throw new Error('Card runtime stopped');
            return new Promise(function(resolve, reject) {
                var id = String(++sequence), timer = setTimeout(function() { waiting.delete(id); reject(new Error('Card request timed out')); }, 15000);
                waiting.set(id, { resolve: resolve, reject: reject, timer: timer });
                var request = { type: 'card-runtime-rpc', id: id, method: method, args: copy(args || []) };
                if (typeof stamp === 'string') request.baseline = stamp;
                try { port.postMessage(request); } catch (error) { clearTimeout(timer); waiting.delete(id); reject(error); }
            });
        });
    }
    function pathValue(path) {
        requirePermission('variables.read');
        if (typeof path !== 'string' || !path || path.length > 1024) throw new Error('Invalid variable path');
        var parts = path.replace(/\[(\d+)\]/g, '.$1').split('.');
        if (parts.some(function(part) { return !part || part === '__proto__' || part === 'prototype' || part === 'constructor'; })) throw new Error('Invalid variable path');
        function read(root) {
            var value = root;
            for (var part of parts) { if (!value || typeof value !== 'object' || !Object.prototype.hasOwnProperty.call(value, part)) return undefined; value = value[part]; }
            return value;
        }
        var value = read(variables);
        if (value === undefined && variables && variables.stat_data) value = read(variables.stat_data);
        return value === undefined ? undefined : copy(value);
    }
    function remember(result) { stamp = result.stamp; if (result.data !== null) variables = copy(result.data); return result.data === null ? null : copy(result.data); }
    function getVariables(reference) { return call('getVariables', [reference == null ? null : reference]).then(remember); }
    function replaceVariables(value, reference) { return call('replaceMvuData', [value, reference == null ? null : reference]).then(remember); }
    function updateVariablesWith(updater) {
        if (typeof updater !== 'function') return Promise.reject(new Error('updateVariablesWith needs a function'));
        return getVariables().then(function(data) { var draft = copy(data); return Promise.resolve(updater(draft)).then(function(result) { return replaceVariables(result === undefined ? draft : result); }); });
    }
    function on(name, callback, once) {
        if (typeof callback !== 'function') return Promise.reject(new Error('Event callback must be a function'));
        if (!/^[a-zA-Z][a-zA-Z0-9_.:-]{0,79}$/.test(String(name))) return Promise.reject(new Error('Invalid event name'));
        var hostEvent = name === 'chat.changed' || name === 'mvu.updated';
        requirePermission(hostEvent ? 'events.subscribe' : 'events.emit.local');
        var list = events.get(name) || []; list.push({ callback: callback, once: once }); events.set(name, list);
        function off() { events.set(name, (events.get(name) || []).filter(function(item) { return item.callback !== callback; })); }
        return (hostEvent ? call(once ? 'eventOnce' : 'eventOn', [name]) : Promise.resolve()).then(function() { return off; }, function(error) { off(); throw error; });
    }
    function applyPalette(palette) {
        if (!palette || !['light', 'dark'].includes(palette.colorScheme) || !/^#[0-9a-f]{6}$/i.test(palette.foreground) || !/^#[0-9a-f]{6}$/i.test(palette.background)) return;
        document.documentElement.style.setProperty('--card-runtime-scheme', palette.colorScheme);
        document.documentElement.style.setProperty('--card-runtime-text', palette.foreground);
        document.documentElement.style.setProperty('--card-runtime-surface', palette.background);
    }
    function reportLayout() {
        if (!port || stopped || !document.body) return;
        var body = document.body, height = Math.ceil(Math.max(body.offsetHeight, body.getBoundingClientRect().height));
        if (body.scrollHeight > document.documentElement.clientHeight + 1) height = Math.max(height, body.scrollHeight);
        if (height > 0 && height !== lastHeight) { lastHeight = height; port.postMessage({ type: 'card-runtime-layout', height: height }); }
    }
    function startLayout() {
        if (stopped || !document.body) return;
        if (!layoutObserver && typeof ResizeObserver === 'function') { layoutObserver = new ResizeObserver(reportLayout); layoutObserver.observe(document.body); }
        reportLayout();
    }
    applyPalette(initial.palette);
    document.addEventListener('DOMContentLoaded', startLayout, { once: true });
    document.addEventListener('load', reportLayout, true);
    window.addEventListener('resize', reportLayout);
    var api = {
        abi: config.abi, call: call, getCurrentMessageId: function() { return initial.messageId; },
        getChatMessages: function(options) { return call('getChatMessages', [options || {}]); }, getLastMessageId: function() { return call('getLastMessageId', []); },
        getCharacter: function() { return call('getCharacter', []); }, getTheme: function() { return call('getTheme', []); },
        getVariables: getVariables, replaceVariables: replaceVariables, replaceMvuData: replaceVariables, updateVariablesWith: updateVariablesWith,
        patchMvuData: function(operations) { return call('patchMvuData', [operations]).then(remember); },
        substituteMacros: function(text) { return call('substituteMacros', [String(text)]); },
        formatAsDisplayedMessage: function(text) { return call('formatAsDisplayedMessage', [String(text)]); },
        refreshOneMessage: function(reference) { return call('refreshOneMessage', [reference == null ? null : reference]); },
        setInputText: function(text) { return call('setInputText', [String(text)]); }, appendInputText: function(text) { return call('appendInputText', [String(text)]); },
        triggerGeneration: function() { return call('triggerGeneration', []); },
        eventOn: function(name, callback) { return on(name, callback, false); }, eventOnce: function(name, callback) { return on(name, callback, true); },
        eventEmit: function(name, detail) { return call('eventEmit', [name, detail === undefined ? null : detail]); },
        networkFetch: function(url, options) { requirePermission('network.fetch'); if (config.level !== 'L3') throw new Error('Network requires L3'); return call('networkFetch', [String(url), options || {}]); }
    };
    window.OpenTavernFrontend = api;
    window.TavernHelper = api;
    window.Mvu = window.MVU = { getMvuData: getVariables, replaceMvuData: replaceVariables, patch: api.patchMvuData, events: { VARIABLE_UPDATE_ENDED: 'mvu.updated' } };
    window.getvar = window.getVar = pathValue;
    window.getAllVariables = function() { requirePermission('variables.read'); return copy(variables); };
    window.getVariables = getVariables; window.replaceVariables = replaceVariables; window.updateVariablesWith = updateVariablesWith;
    window.getChatMessages = api.getChatMessages; window.getLastMessageId = api.getLastMessageId; window.getCurrentMessageId = api.getCurrentMessageId;
    window.eventOn = api.eventOn; window.eventOnce = api.eventOnce; window.eventEmit = api.eventEmit;
    window.substituteMacros = window.substitudeMacros = api.substituteMacros;
    window.formatAsDisplayedMessage = api.formatAsDisplayedMessage; window.refreshOneMessage = api.refreshOneMessage;
    window.SillyTavern = { getContext: function() { requirePermission('chat.read'); return { chat: copy(initial.messages), characterId: initial.characterId }; } };
    if (config.level === 'L3') window.fetch = function(url, options) {
        return Promise.resolve().then(function() { return api.networkFetch(url, options); }).then(function(result) {
            return new Response(result.body, { status: result.status, statusText: result.statusText || '', headers: result.headers });
        });
    };
    document.addEventListener('click', function(event) { var link = event.target.closest && event.target.closest('a,area'); if (link) event.preventDefault(); }, true);
    document.addEventListener('submit', function(event) { event.preventDefault(); }, true);
    var mapping = {};
    (config.modules || []).forEach(function(module, index) {
        var url = URL.createObjectURL(new Blob([module.source], { type: 'text/javascript' })); objectUrls.push(url); mapping[module.id || 'card-runtime:module-' + index] = url;
    });
    if (objectUrls.length) { var map = document.createElement('script'); map.type = 'importmap'; map.textContent = JSON.stringify({ imports: mapping }); document.head.appendChild(map); }
    function stop() {
        if (stopped) return; stopped = true; readyResolve();
        waiting.forEach(function(item) { clearTimeout(item.timer); item.reject(new Error('Card runtime stopped')); }); waiting.clear(); events.clear();
        objectUrls.forEach(function(url) { URL.revokeObjectURL(url); }); objectUrls = [];
        if (port) port.close(); if (layoutObserver) layoutObserver.disconnect(); clearInterval(heartbeat);
        window.removeEventListener('message', connect);
    }
    function connect(event) {
        var data = event.data;
        if (event.source !== parent || !data || data.type !== 'card-runtime-connect' || data.token !== config.token || !event.ports[0] || port) return;
        port = event.ports[0];
        if (data.initial) { initial = data.initial; variables = initial.variables; stamp = initial.stamp; applyPalette(initial.palette); }
        port.onmessage = function(message) {
            var value = message.data;
            if (!value || typeof value !== 'object') return;
            if (value.type === 'card-runtime-stop') { stop(); return; }
            if (value.type === 'card-runtime-theme') { applyPalette(value.palette); reportLayout(); return; }
            if (value.type === 'card-runtime-result' && waiting.has(value.id)) {
                var item = waiting.get(value.id); waiting.delete(value.id); clearTimeout(item.timer);
                if (value.ok) item.resolve(value.result);
                else { var error = new Error(value.error && value.error.message || 'Card request failed'); error.code = value.error && value.error.code; item.reject(error); }
            } else if (value.type === 'card-runtime-event') {
                if (value.event === 'mvu.updated' && value.detail) { if (value.detail.variables !== null) variables = copy(value.detail.variables); stamp = value.detail.stamp; }
                (events.get(value.event) || []).slice().forEach(function(item) { try { item.callback(copy(value.detail)); } catch (error) { console.error(error); } if (item.once) events.set(value.event, (events.get(value.event) || []).filter(function(current) { return current !== item; })); });
            }
        };
        port.start(); window.removeEventListener('message', connect); readyResolve(); startLayout();
    }
    window.addEventListener('message', connect);
    var heartbeat = setInterval(function() { if (port) port.postMessage({ type: 'card-runtime-ping' }); }, 5000);
    window.addEventListener('pagehide', stop);
    parent.postMessage({ type: 'card-runtime-ready', token: config.token, abi: config.abi }, '*');
}
