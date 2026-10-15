// Only this explicit table can reach host data. No card function is evaluated here.
var cardRuntimeMethods = {
    getCurrentMessageId: 'message.current.read', getChatMessages: 'chat.read', getLastMessageId: 'chat.read',
    getCharacter: 'character.read', getTheme: 'theme.read', getVariables: 'variables.read',
    replaceMvuData: 'variables.write.current', replaceVariables: 'variables.write.current', patchMvuData: 'variables.write.current',
    substituteMacros: 'macros.substitute', formatAsDisplayedMessage: 'display.format', refreshOneMessage: 'display.refresh',
    setInputText: 'input.write', appendInputText: 'input.write', triggerGeneration: 'generate.trigger',
    eventOn: 'events.subscribe', eventOnce: 'events.subscribe', eventEmit: 'events.emit.local'
};

function cardRuntimeMessageRef(entry, reference) {
    if (reference == null || reference === entry.messageId) return;
    if (reference && typeof reference === 'object' && reference.type === 'message' && reference.message_id === entry.messageId) return;
    throw cardRuntimeError('INVALID_TARGET', '只允许访问承载前端的当前消息。');
}

function cardRuntimeVariableStamp(instance) {
    if (!instance || instance.stopped || !cardRuntimeEntryIsCurrent(instance.entry)) throw cardRuntimeError('STALE_TARGET', '变量目标已失效。');
    var entry = instance.entry;
    var source = typeof getMvuContextStamp === 'function' ? getMvuContextStamp(entry.conv, entry.msg) : null;
    if (!instance.variableStamp || instance.variableSource !== source) { instance.variableSource = source; instance.variableStamp = cardRuntimeToken(); }
    return instance.variableStamp;
}

function cardRuntimeVariableResult(instance) {
    var entry = assertCardRuntimeInstance(instance, 'variables.read');
    if (typeof getMvuDataForMessage !== 'function' || typeof getMvuContextStamp !== 'function') throw cardRuntimeError('UNSUPPORTED_METHOD', 'MVU 状态功能尚未就绪。');
    return { data: cardRuntimeJson(getMvuDataForMessage(entry.conv, entry.msg)), stamp: cardRuntimeVariableStamp(instance) };
}

async function writeCardRuntimeVariables(instance, request, value) {
    var entry = assertCardRuntimeInstance(instance, 'variables.write.current');
    if (typeof replaceMvuDataForMessage !== 'function' || typeof getMvuContextStamp !== 'function') throw cardRuntimeError('UNSUPPORTED_METHOD', 'MVU 保存功能尚未就绪。');
    var source = getMvuContextStamp(entry.conv, entry.msg);
    if (typeof request.baseline !== 'string' || request.baseline !== instance.variableStamp || source !== instance.variableSource) throw cardRuntimeError('STALE_BASELINE', '变量基线已变化，请重新读取。');
    if (instance.variableWriteInProgress) throw cardRuntimeError('WRITER_BUSY', '此实例已有变量写入等待保存。');
    var writerKey = entry.cardKey.split(':')[0] + ':' + entry.messageId + ':' + entry.version;
    var owner = cardRuntimeWriters.get(writerKey);
    if (owner && owner !== instance.token) throw cardRuntimeError('WRITER_BUSY', '此消息已有变量写入实例。');
    cardRuntimeWriters.set(writerKey, instance.token); instance.writerKey = writerKey;
    function validate() {
        assertCardRuntimeInstance(instance, 'variables.write.current');
        if (cardRuntimeWriters.get(writerKey) !== instance.token) throw cardRuntimeError('REVOKED', '变量写入实例已停止。');
        return true;
    }
    instance.variableWriteInProgress = true;
    try {
        var result = await replaceMvuDataForMessage(entry.conv, entry.msg, cardRuntimeJson(value), { expectedStamp: source, validate: validate });
        validate();
        if (result === false) throw cardRuntimeError('SAVE_REJECTED', '变量未保存。');
        return { data: instance.grant.permissions['variables.read'] ? cardRuntimeJson(getMvuDataForMessage(entry.conv, entry.msg)) : null, stamp: cardRuntimeVariableStamp(instance) };
    } finally { instance.variableWriteInProgress = false; }
}

function cardRuntimeInput(instance, value, append) {
    var entry = assertCardRuntimeInstance(instance, 'input.write');
    if (getActiveConv() !== entry.conv || state.isGenerating || entry.conv._messageCommitInProgress || !dom.messageInput || dom.messageInput.disabled) throw cardRuntimeError('INPUT_BUSY', '当前输入不可写。');
    if (instance.inputRevision !== userDraftEditSequence || dom.messageInput.value !== instance.inputValue) throw cardRuntimeError('INPUT_CHANGED', '输入已被编辑，卡片未覆盖草稿。');
    var text = String(value == null ? '' : value);
    var next = append ? dom.messageInput.value + text : text;
    if (cardRuntimeBytes(next) > 65536) throw cardRuntimeError('LIMIT_EXCEEDED', '输入超过 64 KiB。');
    cancelUserDraft();
    dom.messageInput.value = next;
    dom.messageInput.dispatchEvent(new Event('input', { bubbles: true }));
    instance.inputRevision = userDraftEditSequence; instance.inputValue = dom.messageInput.value;
    return { length: dom.messageInput.value.length };
}

function substituteCardRuntimeMacros(text, env, depth) {
    var source = String(text), result = '', cursor = 0, steps = 0;
    depth = depth || 0;
    if (source.length > ST_MACRO_MAX_TEXT || depth > ST_MACRO_MAX_DEPTH) throw cardRuntimeError('LIMIT_EXCEEDED', '宏文本超过上限。');
    var allowed = ['//', 'comment', 'char', 'user', 'persona', 'original', 'newline', 'noop', 'trim', 'lastusermessage', 'lastcharmessage', 'lastmessage', 'getvar', 'random', 'pick'];
    while (cursor < source.length) {
        if (++steps > ST_MACRO_MAX_STEPS) throw cardRuntimeError('LIMIT_EXCEEDED', '宏节点超过上限。');
        var open = source.indexOf('{{', cursor);
        if (open < 0) return result + source.slice(cursor);
        result += source.slice(cursor, open);
        var close = findSillyTavernMacroClose(source, open);
        if (close < 0) return result + source.slice(open);
        var body = source.slice(open + 2, close);
        if (body.includes('{{')) body = substituteCardRuntimeMacros(body, env, depth + 1);
        var name = parseSillyTavernMacroBody(body).name;
        if (!allowed.includes(name)) throw cardRuntimeError('UNSUPPORTED_MACRO', '卡片只读宏未实现：' + name);
        result += resolveSillyTavernMacro(body, env, { mutate: false }); cursor = close + 2;
    }
    return result;
}

async function dispatchCardRuntimeRpc(instance, request) {
    if (!request || typeof request !== 'object' || typeof request.id !== 'string' || !/^[a-z0-9-]{1,64}$/i.test(request.id) || typeof request.method !== 'string' || !Array.isArray(request.args)) throw cardRuntimeError('INVALID_REQUEST', '请求格式不正确。');
    cardRuntimeJson(request);
    if (!Object.prototype.hasOwnProperty.call(cardRuntimeMethods, request.method)) throw cardRuntimeError('UNSUPPORTED_METHOD', '接口未实现：' + request.method);
    var entry = assertCardRuntimeInstance(instance, cardRuntimeMethods[request.method]);
    if (instance.requestIds.has(request.id)) throw cardRuntimeError('DUPLICATE_REQUEST', '请求标识已使用。');
    if (instance.requestIds.size >= 2000) throw cardRuntimeError('LIMIT_EXCEEDED', '此实例请求数已达上限。');
    instance.requestIds.add(request.id);
    var now = Date.now(); instance.requestTimes = instance.requestTimes.filter(function(time) { return now - time < 10000; });
    if (instance.requestTimes.length >= 120) throw cardRuntimeError('RATE_LIMITED', '卡片请求过于频繁。');
    instance.requestTimes.push(now);
    var args = request.args, method = request.method;
    if (method === 'getCurrentMessageId') return entry.messageId;
    if (method === 'getChatMessages' || method === 'getLastMessageId') {
        var messages = (entry.conv.messages || []).filter(function(message) { return (message.role === 'user' || message.role === 'assistant') && message.stage !== 'second'; }).slice(-200);
        if (method === 'getLastMessageId') return messages.length ? messages[messages.length - 1].id : null;
        return cardRuntimeJson(messages.map(function(message) { return { id: message.id, message_id: message.id, role: message.role, content: String(message.content || ''), message: String(message.content || ''), speaker: String(message.speaker || '') }; }));
    }
    if (method === 'getCharacter') return cardRuntimeJson({ name: String(entry.character && entry.character.name || ''), avatar: String(entry.character && entry.character.avatar || ''), description: String(entry.character && entry.character.description || '') });
    if (method === 'getTheme') return { theme: cardRuntimePalette().theme };
    if (method === 'getVariables') { cardRuntimeMessageRef(entry, args[0]); return cardRuntimeVariableResult(instance); }
    if (method === 'replaceMvuData' || method === 'replaceVariables') { cardRuntimeMessageRef(entry, args[1]); return writeCardRuntimeVariables(instance, request, args[0]); }
    if (method === 'patchMvuData') {
        cardRuntimeMessageRef(entry, args[1]); assertCardRuntimeInstance(instance, 'variables.read');
        if (typeof applyMvuContent !== 'function') throw cardRuntimeError('UNSUPPORTED_METHOD', 'MVU Patch 功能尚未就绪。');
        var operations = cardRuntimeJson(args[0]);
        if (!Array.isArray(operations)) throw cardRuntimeError('INVALID_PATCH', '变量更新必须为操作数组。');
        var patched = applyMvuContent(cardRuntimeVariableResult(instance).data, '<JSONPatch>' + JSON.stringify(operations) + '</JSONPatch>');
        if (!patched || (patched.diagnostics && patched.diagnostics.length)) throw cardRuntimeError('INVALID_PATCH', '变量更新块无效。');
        return writeCardRuntimeVariables(instance, request, patched.data);
    }
    if (method === 'setInputText' || method === 'appendInputText') return cardRuntimeInput(instance, args[0], method === 'appendInputText');
    if (method === 'triggerGeneration') {
        if (typeof sendMessage !== 'function') throw cardRuntimeError('UNSUPPORTED_METHOD', '发送接口尚未就绪。');
        if (getActiveConv() !== entry.conv || state.isGenerating || entry.conv._messageCommitInProgress || !dom.messageInput || instance.inputRevision !== userDraftEditSequence || instance.inputValue !== dom.messageInput.value || !dom.messageInput.value.trim() || dom.messageInput.disabled) throw cardRuntimeError('INPUT_BUSY', '草稿已变化或当前不能发送。');
        var count = entry.conv.messages.length;
        sendMessage();
        if (entry.conv.messages.length <= count) throw cardRuntimeError('SEND_REJECTED', '发送未被接受。');
        return { submitted: true, started: state.isGenerating === true };
    }
    if (method === 'substituteMacros') {
        if (typeof createSillyTavernMacroEnv !== 'function' || typeof evaluateSillyTavernMacros !== 'function') throw cardRuntimeError('UNSUPPORTED_METHOD', '只读宏接口尚未就绪。');
        var history = instance.grant.permissions['chat.read'] ? entry.conv.messages.filter(function(message) { return (message.role === 'user' || message.role === 'assistant') && message.stage !== 'second'; }).slice(-200).map(function(message) { return { role: message.role, content: String(message.content || '') }; }) : [];
        var data = instance.grant.permissions['variables.read'] ? cardRuntimeVariableResult(instance).data : {};
        var safeConv = { id: entry.conv.id, messages: [], stLocalVars: {}, mvu: true };
        var env = createSillyTavernMacroEnv(safeConv, { charName: instance.grant.permissions['character.read'] && entry.character ? entry.character.name : 'Assistant', userName: 'User', persona: '', historyMessages: history, mvuData: freezeCardRuntimeData(data), persist: false });
        return substituteCardRuntimeMacros(String(args[0] || ''), env);
    }
    if (method === 'formatAsDisplayedMessage') {
        if (typeof renderStaticMessage !== 'function') throw cardRuntimeError('UNSUPPORTED_METHOD', '静态格式化功能尚未就绪。');
        return renderStaticMessage(String(args[0] || ''));
    }
    if (method === 'refreshOneMessage') {
        cardRuntimeMessageRef(entry, args[0]);
        if (typeof renderMessagesOnly !== 'function') throw cardRuntimeError('UNSUPPORTED_METHOD', '显示刷新功能尚未就绪。');
        setTimeout(function() { if (!instance.stopped && cardRuntimeEntryIsCurrent(entry)) renderMessagesOnly(); }, 0);
        return { scheduled: true };
    }
    var eventName = String(args[0] || '');
    if (!/^[a-zA-Z][a-zA-Z0-9_.:-]{0,79}$/.test(eventName)) throw cardRuntimeError('INVALID_EVENT', '事件名称无效。');
    if (method === 'eventOn' || method === 'eventOnce') {
        if (!['chat.changed', 'mvu.updated'].includes(eventName)) throw cardRuntimeError('UNSUPPORTED_EVENT', '宿主事件未实现：' + eventName);
        instance.subscriptions.set(eventName, method === 'eventOnce'); return { subscribed: true };
    }
    if (eventName === 'chat.changed' || eventName === 'mvu.updated') throw cardRuntimeError('INVALID_EVENT', '不能伪造宿主事件。');
    var detail = cardRuntimeJson(args.length > 1 ? args[1] : null);
    if (instance.port) instance.port.postMessage({ type: 'card-runtime-event', event: eventName, detail: detail });
    return { emitted: true };
}

function connectCardRuntimePort(instance, port) {
    instance.port = port;
    port.onmessage = async function(event) {
        var request = event.data;
        if (request && request.type === 'card-runtime-ping') { try { assertCardRuntimeInstance(instance); instance.lastContact = Date.now(); } catch (_) {} return; }
        if (request && request.type === 'card-runtime-layout') {
            try {
                assertCardRuntimeInstance(instance);
                if (!Number.isFinite(request.height) || request.height <= 0 || request.height > 1000000) return;
                instance.contentHeight = request.height; instance.lastContact = Date.now();
                if (!instance.layoutTimer) instance.layoutTimer = setTimeout(function() { instance.layoutTimer = null; updateCardRuntimeFrameHeight(instance); }, 50);
            } catch (_) {}
            return;
        }
        if (!request || request.type !== 'card-runtime-rpc') return;
        try {
            assertCardRuntimeInstance(instance); instance.lastContact = Date.now();
            var result = await dispatchCardRuntimeRpc(instance, request);
            assertCardRuntimeInstance(instance);
            port.postMessage({ type: 'card-runtime-result', id: request.id, ok: true, result: result });
        } catch (error) {
            if (!instance.stopped) port.postMessage({ type: 'card-runtime-result', id: request.id, ok: false, error: { code: error.code || 'RPC_FAILED', message: error.message || String(error) } });
        }
    };
    port.start();
}
