// Card execution permissions and instances stay in page memory, outside settings/snapshots.
var CARD_RUNTIME_ABI = 'opentavern-card-1';
var CARD_RUNTIME_MAX_SOURCE_BYTES = 1024 * 1024;
var CARD_RUNTIME_MAX_RPC_BYTES = 1024 * 1024;
var cardRuntimeEntries = new Map();
var cardRuntimeGrants = new Map();
var cardRuntimeInstances = new Map();
var cardRuntimeWriters = new Map();
var cardRuntimeObjectIds = new WeakMap();
var cardRuntimeObjectSequence = 0;
var cardRuntimeCapabilities = {
    'chat.read': '读取当前会话最近最多 200 条非系统消息',
    'character.read': '读取此角色的名称、头像和描述',
    'theme.read': '读取界面主题',
    'variables.read': '读取此消息的 MVU 变量',
    'variables.write.current': '修改此消息的 MVU 变量，保存后不会因撤销回退',
    'input.write': '回填当前聊天输入框',
    'generate.trigger': '发送输入并触发生成',
    'macros.substitute': '替换受支持的只读宏',
    'display.format': '格式化显示文本',
    'display.refresh': '刷新当前消息显示',
    'events.subscribe': '接收当前会话和变量更新事件',
    'events.emit.local': '发送卡片内部事件',
    'media.remote': '加载远程图片、字体和媒体',
    'network.fetch': '通过所选站点联网'
};

function cardRuntimeError(code, message) {
    var error = new Error(message || code); error.code = code; return error;
}

function cardRuntimeObjectId(value) {
    if (!value || typeof value !== 'object') return 'none';
    if (!cardRuntimeObjectIds.has(value)) cardRuntimeObjectIds.set(value, String(++cardRuntimeObjectSequence));
    return cardRuntimeObjectIds.get(value);
}

function cardRuntimeBytes(value) { return new TextEncoder().encode(String(value)).length; }

function cardRuntimeJson(value, maxBytes) {
    var stack = [{ value: value, depth: 0 }], active = new WeakSet(), nodes = 0;
    while (stack.length) {
        var row = stack.pop(), item = row.value;
        if (row.exit) { active.delete(item); continue; }
        if (++nodes > 40000) throw cardRuntimeError('LIMIT_EXCEEDED', '数据节点过多。');
        if (row.depth > 32) throw cardRuntimeError('INVALID_DATA', '数据嵌套过深。');
        if (typeof item === 'number' && !Number.isFinite(item)) throw cardRuntimeError('INVALID_DATA', '数据包含非有限数字。');
        if (item && typeof item === 'object') {
            var prototype = Object.getPrototypeOf(item);
            if (!Array.isArray(item) && prototype !== null && Object.getPrototypeOf(prototype) !== null) throw cardRuntimeError('INVALID_DATA', '只接受普通 JSON 对象。');
            if (active.has(item)) throw cardRuntimeError('INVALID_DATA', '数据包含循环引用。');
            active.add(item); stack.push({ value: item, exit: true });
            var keys = Object.keys(item);
            if (keys.length > 40000) throw cardRuntimeError('LIMIT_EXCEEDED', '数据节点过多。');
            keys.forEach(function(key) {
                if (key === '__proto__' || key === 'prototype' || key === 'constructor') throw cardRuntimeError('INVALID_DATA', '数据包含不支持的属性。');
                var descriptor = Object.getOwnPropertyDescriptor(item, key);
                if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) throw cardRuntimeError('INVALID_DATA', 'JSON 数据不能包含访问器。');
                stack.push({ value: descriptor.value, depth: row.depth + 1 });
            });
        }
        else if (typeof item === 'function' || typeof item === 'symbol' || typeof item === 'bigint' || item === undefined) throw cardRuntimeError('INVALID_DATA', '只接受 JSON 数据。');
    }
    var text = JSON.stringify(value);
    if (cardRuntimeBytes(text) > (maxBytes || CARD_RUNTIME_MAX_RPC_BYTES)) throw cardRuntimeError('LIMIT_EXCEEDED', '数据超过运行时上限。');
    return JSON.parse(text);
}

function freezeCardRuntimeData(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.keys(value).forEach(function(key) { freezeCardRuntimeData(value[key]); }); Object.freeze(value);
    }
    return value;
}

function cardRuntimeToken() {
    if (typeof crypto === 'undefined' || typeof crypto.getRandomValues !== 'function') throw cardRuntimeError('UNAVAILABLE', '浏览器缺少安全随机数功能。');
    return Array.from(crypto.getRandomValues(new Uint8Array(24)), function(byte) { return byte.toString(16).padStart(2, '0'); }).join('');
}

function cardRuntimeCharacterStamp(character) { return JSON.stringify(character || null); }

function cardRuntimeEntryIsCurrent(entry) {
    if (!entry || !state.conversations || state.conversations[entry.conv.id] !== entry.conv || getActiveConv() !== entry.conv) return false;
    var message = (entry.conv.messages || []).find(function(item) { return item.id === entry.messageId; });
    if (message !== entry.msg || message.role !== 'assistant' || message.stage === 'second' || getMessageRevision(message) !== entry.revision) return false;
    var version = String(message.selectedResponseVersionId || '') + ':' + String(message.swipe_id == null ? '' : message.swipe_id);
    if (version !== entry.version) return false;
    var character = typeof getMessageSpeakerCharacter === 'function' ? getMessageSpeakerCharacter(message, entry.conv) : entry.conv.character;
    return character === entry.character && cardRuntimeCharacterStamp(character) === entry.characterStamp;
}

function extractCardRuntimeSource(content) {
    var source = String(content || '').trim();
    var fence = source.match(/^```html?[^\S\r\n]*\r?\n([\s\S]*?)\r?\n```$/i);
    if (fence && !/^\s*```/m.test(fence[1])) source = fence[1];
    var detection = fence && source === fence[1] ? source : source.replace(/^ {0,3}(`{3,}|~{3,})[^\r\n]*\r?\n[\s\S]*?(?:^ {0,3}\1[^\S\r\n]*$|(?![\s\S]))/gm, '').replace(/(`+)[^`]*?\1/g, '');
    if (!/<script\b|<[a-z][^<>]*\son[a-z]+\s*=/i.test(detection)) return null;
    return source;
}

function createCardRuntimeEntry(content, context) {
    var source = extractCardRuntimeSource(content), conv = context && context.conv, msg = context && context.msg;
    if (!source || !conv || !msg || msg.role !== 'assistant' || msg.stage === 'second' || !msg.id || (conv.messages || []).indexOf(msg) < 0) return null;
    if (cardRuntimeBytes(source) > CARD_RUNTIME_MAX_SOURCE_BYTES) throw cardRuntimeError('LIMIT_EXCEEDED', '卡片前端不能超过 1 MiB。');
    var character = context.character || (typeof getMessageSpeakerCharacter === 'function' ? getMessageSpeakerCharacter(msg, conv) : conv.character);
    for (var previous of cardRuntimeEntries.values()) {
        if (previous.conv === conv && previous.msg === msg && previous.source === source && previous.character === character && cardRuntimeEntryIsCurrent(previous)) return previous;
    }
    var entry = { token: cardRuntimeToken(), source: source, original: String(content), conv: conv, msg: msg, messageId: msg.id,
        revision: getMessageRevision(msg), version: String(msg.selectedResponseVersionId || '') + ':' + String(msg.swipe_id == null ? '' : msg.swipe_id),
        character: character, characterStamp: cardRuntimeCharacterStamp(character), cardKey: cardRuntimeObjectId(conv) + ':' + cardRuntimeObjectId(character), pending: null };
    cardRuntimeEntries.set(entry.token, entry);
    if (cardRuntimeEntries.size > 512) {
        for (var pair of cardRuntimeEntries) if (!pair[1].pending && !cardRuntimeInstances.has(pair[0]) && pair[0] !== entry.token) { cardRuntimeEntries.delete(pair[0]); break; }
    }
    return entry;
}

function findCardRuntimeGrant(entry) {
    for (var grant of cardRuntimeGrants.values()) if (grant.abi === CARD_RUNTIME_ABI && grant.cardKey === entry.cardKey && grant.source === entry.source && grant.characterStamp === entry.characterStamp) return grant;
    return null;
}

async function prepareCardRuntimeGrant(entry, selection, signal) {
    if (!cardRuntimeEntryIsCurrent(entry)) throw cardRuntimeError('STALE_TARGET', '会话或消息已变化，请重新打开。');
    if (typeof cardRuntimeDigest !== 'function' || typeof prepareCardRuntimeExecution !== 'function') throw cardRuntimeError('UNAVAILABLE', '卡片运行依赖尚未就绪。');
    var plan = await prepareCardRuntimeExecution(entry.source, selection.level, { signal: signal, permissions: selection.permissions, context: { conv: entry.conv, msg: entry.msg, character: entry.character }, network: selection.network });
    if (signal.aborted || !cardRuntimeEntryIsCurrent(entry)) throw cardRuntimeError('STALE_TARGET', '审核已取消或目标已变化。');
    plan = cardRuntimeJson(plan, 12 * 1024 * 1024);
    if (plan.level !== selection.level || typeof plan.entrySource !== 'string' || !Array.isArray(plan.scripts)) throw cardRuntimeError('INVALID_PLAN', '运行依赖格式不正确。');
    for (var script of plan.scripts) {
        if (typeof script.source !== 'string' || !/^[a-f0-9]{64}$/i.test(String(script.sha256)) || (script.type && !['classic', 'module'].includes(script.type))) throw cardRuntimeError('INVALID_PLAN', '依赖缺少固定源码或完整摘要。');
        if (await cardRuntimeDigest(script.source) !== String(script.sha256).toLowerCase()) throw cardRuntimeError('DIGEST_MISMATCH', '依赖内容摘要不匹配：' + script.name);
    }
    for (var module of plan.modules || []) {
        if (typeof module.source !== 'string' || !/^[a-f0-9]{64}$/i.test(String(module.sha256)) || await cardRuntimeDigest(module.source) !== String(module.sha256).toLowerCase()) throw cardRuntimeError('DIGEST_MISMATCH', '模块源码或摘要不匹配。');
    }
    var permissions = { 'message.current.read': true };
    Object.keys(cardRuntimeCapabilities).forEach(function(key) { permissions[key] = selection.permissions[key] === true; });
    var material = { abi: CARD_RUNTIME_ABI, cardKey: entry.cardKey, character: entry.characterStamp, source: entry.source, plan: plan, permissions: permissions, network: selection.network };
    var digest = await cardRuntimeDigest(JSON.stringify(material));
    if (!/^[a-f0-9]{64}$/.test(digest) || signal.aborted || !cardRuntimeEntryIsCurrent(entry)) throw cardRuntimeError('STALE_TARGET', '审核已取消或目标已变化。');
    return { key: digest, digest: digest, sourceDigest: await cardRuntimeDigest(entry.source), abi: CARD_RUNTIME_ABI, cardKey: entry.cardKey, characterStamp: entry.characterStamp,
        source: entry.source, plan: plan, permissions: Object.freeze(permissions), network: cardRuntimeJson(selection.network || {}), level: selection.level };
}

function activateCardRuntimeGrant(entry, grant) {
    if (!cardRuntimeEntryIsCurrent(entry) || entry.source !== grant.source || entry.cardKey !== grant.cardKey || entry.characterStamp !== grant.characterStamp) throw cardRuntimeError('STALE_TARGET', '会话或卡片内容已变化。');
    cardRuntimeGrants.forEach(function(previous, key) {
        if (key !== grant.key && previous.cardKey === entry.cardKey && previous.source === entry.source) {
            cardRuntimeGrants.delete(key);
            if (typeof stopCardRuntimeInstance === 'function') Array.from(cardRuntimeInstances.values()).forEach(function(instance) { if (instance.grant === previous) stopCardRuntimeInstance(instance, '运行许可已重新审核', false); });
        }
    });
    freezeCardRuntimeData(grant); cardRuntimeGrants.set(grant.key, grant); return grant;
}

function assertCardRuntimeInstance(instance, permission) {
    if (!instance || instance.stopped || cardRuntimeInstances.get(instance.token) !== instance || !instance.frame || !instance.frame.isConnected || !cardRuntimeEntryIsCurrent(instance.entry)) throw cardRuntimeError('STALE_TARGET', '运行实例或消息已失效。');
    if (cardRuntimeGrants.get(instance.grant.key) !== instance.grant || instance.grant.abi !== CARD_RUNTIME_ABI) throw cardRuntimeError('REVOKED', '此卡片的运行许可已撤销。');
    if (permission && instance.grant.permissions[permission] !== true) throw cardRuntimeError('PERMISSION_DENIED', '未授权此操作：' + permission);
    return instance.entry;
}
