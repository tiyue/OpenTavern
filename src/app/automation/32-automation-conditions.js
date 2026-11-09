/**
 * 新手导读（文件：32-automation-conditions.js）
 *
 * 负责什么：声明式条件求值——会话/角色、事件消息、已保存主消息数量、有效 MVU 路径值和世界书条目身份。
 * 在程序中的位置：只做纯计算，不派发事件、不写历史；52-automation-runtime.js 用它判断命中与原因。
 * 从哪里开始看：`buildAutomationEventContext(...)`、`evaluateAutomationConditions(conditions, context)`、
 * `readAutomationMvuValue(mvuData, path)`、`parseAutomationActionValue(action)`。
 * 修改时注意：只支持简单包含/相等与数值比较，不执行 JS、函数或新命令语言；路径拒绝原型污染。
 */
// ==================== Automation Condition Evaluation ====================
var AUTOMATION_UNSAFE_PATH_SEGMENTS = ['__proto__', 'constructor', 'prototype'];

function automationIsPlainRecord(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function automationReadPathSegments(path) {
    var value = String(path || '').trim();
    if (!value || value.length > AUTOMATION_MAX_PATH) throw new Error(t('automation_mvu_path_invalid'));
    var segments = value.split('.');
    if (!segments.length || segments.length > 8) throw new Error(t('automation_mvu_path_invalid'));
    segments.forEach(function(segment) {
        if (!segment || segment.length > 40) throw new Error(t('automation_mvu_path_invalid'));
        if (AUTOMATION_UNSAFE_PATH_SEGMENTS.indexOf(segment) >= 0) throw new Error(t('automation_mvu_path_invalid'));
    });
    return segments;
}

function readAutomationMvuValue(mvuData, path) {
    var segments = automationReadPathSegments(path);
    var current = mvuData;
    for (var index = 0; index < segments.length; index++) {
        if (current == null) return { exists: false, value: undefined };
        var key = segments[index];
        if (Array.isArray(current)) {
            if (!/^\d+$/.test(key) || Number(key) >= current.length) return { exists: false, value: undefined };
            current = current[Number(key)];
            continue;
        }
        if (!automationIsPlainRecord(current) || !Object.prototype.hasOwnProperty.call(current, key)) return { exists: false, value: undefined };
        current = current[key];
    }
    return { exists: true, value: current };
}

function cloneAutomationValue(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function writeAutomationMvuValue(mvuData, path, value) {
    var segments = automationReadPathSegments(path);
    var root = cloneAutomationValue(automationIsPlainRecord(mvuData) ? mvuData : {});
    var current = root;
    for (var index = 0; index < segments.length - 1; index++) {
        var key = segments[index];
        var next = Object.prototype.hasOwnProperty.call(current, key) ? current[key] : null;
        if (!automationIsPlainRecord(next) && !Array.isArray(next)) {
            // 保持既有数组形状；只有下一段是数字索引时才创建数组。
            next = /^\d+$/.test(String(segments[index + 1])) ? [] : {};
            Object.defineProperty(current, key, { value: next, writable: true, enumerable: true, configurable: true });
        }
        current = next;
    }
    Object.defineProperty(current, segments[segments.length - 1], {
        value: cloneAutomationValue(value),
        writable: true,
        enumerable: true,
        configurable: true
    });
    return root;
}

function parseAutomationActionValue(action) {
    var type = normalizeAutomationValueType(action && action.valueType);
    if (type === 'number') {
        var number = Number(action.value);
        if (!Number.isFinite(number)) throw new Error(t('automation_value_invalid'));
        return number;
    }
    if (type === 'boolean') {
        if (action.value !== true && action.value !== false && action.value !== 'true' && action.value !== 'false') throw new Error(t('automation_value_invalid'));
        return action.value === true || action.value === 'true';
    }
    return String(action.value == null ? '' : action.value);
}

function automationCompareValues(actual, op, expected, valueType) {
    if (op === 'exists') return actual.exists === true;
    if (op === 'not-exists') return actual.exists !== true;
    if (actual.exists !== true) return false;
    var value = actual.value;
    if (op === 'gt' || op === 'gte' || op === 'lt' || op === 'lte') {
        if (typeof value !== 'number' || !Number.isFinite(value)) return false;
        var target = Number(expected);
        if (!Number.isFinite(target)) return false;
        if (op === 'gt') return value > target;
        if (op === 'gte') return value >= target;
        if (op === 'lt') return value < target;
        return value <= target;
    }
    if (valueType === 'number') {
        if (typeof value !== 'number' || !Number.isFinite(value)) return false;
        var number = Number(expected);
        if (!Number.isFinite(number)) return false;
        if (op === 'equals') return value === number;
        if (op === 'not-equals') return value !== number;
        return false;
    }
    if (valueType === 'boolean') {
        var boolean = expected === true || expected === 'true';
        if (typeof value !== 'boolean') return false;
        if (op === 'equals') return value === boolean;
        if (op === 'not-equals') return value !== boolean;
        return false;
    }
    if (valueType === 'string' && typeof value !== 'string') return false;
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') return false;
    var text = String(value);
    var wanted = String(expected == null ? '' : expected);
    if (op === 'equals') return text === wanted;
    if (op === 'not-equals') return text !== wanted;
    if (op === 'contains') return text.indexOf(wanted) >= 0;
    if (op === 'not-contains') return text.indexOf(wanted) < 0;
    return false;
}

function automationEntryIdentityMatches(entries, value, op) {
    var wanted = String(value == null ? '' : value);
    if (!wanted) return false;
    var list = Array.isArray(entries) ? entries : [];
    var anyEquals = false, anyContains = false;
    list.forEach(function(entry) {
        var identities = [];
        if (entry.worldBookId && entry.uid !== '') identities.push(entry.worldBookId + ':' + entry.uid);
        if (entry.uid !== '') identities.push(entry.uid);
        if (entry.automationId) identities.push(entry.automationId);
        identities.forEach(function(identity) {
            if (identity === wanted) anyEquals = true;
            if (identity.indexOf(wanted) >= 0) anyContains = true;
        });
    });
    if (op === 'contains') return anyContains;
    if (op === 'not-contains') return list.length > 0 && !anyContains;
    if (op === 'not-equals') return list.length > 0 && !anyEquals;
    return anyEquals;
}

function evaluateAutomationCondition(condition, context) {
    var source = condition.source;
    var actual = { exists: false, value: undefined };
    if (source === 'conversation-id') actual = { exists: true, value: String(context.conversationId || '') };
    else if (source === 'conversation-title') actual = { exists: true, value: String(context.conversationTitle || '') };
    else if (source === 'character-name') {
        var names = (context.characterNames || []).map(function(name) { return String(name || ''); }).filter(Boolean);
        var nameMatched = names.some(function(name) {
            return automationCompareValues({ exists: true, value: name }, condition.op, condition.value, 'string');
        });
        return { id: condition.id, source: source, op: condition.op, matched: nameMatched, reason: nameMatched ? 'matched' : 'not-matched' };
    } else if (source === 'event-role') {
        var eventRole = String(context.eventRole || '');
        // UI 的“任意”选项以空值呈现；它必须同时匹配 user/assistant，而不是空字符串相等。
        if ((condition.op === 'equals' || condition.op === 'not-equals') && String(condition.value == null ? '' : condition.value) === '') {
            var anyMatches = condition.op === 'equals' ? !!eventRole : !eventRole;
            return { id: condition.id, source: source, op: condition.op, matched: anyMatches, reason: anyMatches ? 'matched' : 'not-matched' };
        }
        actual = { exists: true, value: eventRole };
    }
    else if (source === 'event-text') actual = { exists: true, value: String(context.eventText || '') };
    else if (source === 'message-count') actual = { exists: true, value: Number(context.messageCount) };
    else if (source === 'mvu') {
        if (typeof context.getMvuData !== 'function') return { id: condition.id, source: source, op: condition.op, matched: false, reason: 'mvu-unavailable' };
        try {
            actual = readAutomationMvuValue(context.getMvuData(), condition.path);
        } catch (error) {
            return { id: condition.id, source: source, op: condition.op, matched: false, reason: error.message };
        }
    } else if (source === 'worldbook-entry') {
        var matched = automationEntryIdentityMatches(context.worldbookEntries || [], condition.value, condition.op);
        return { id: condition.id, source: source, op: condition.op, matched: matched, reason: matched ? 'matched' : 'not-matched' };
    } else {
        return { id: condition.id, source: source, op: condition.op, matched: false, reason: 'unsupported-source' };
    }
    var result = automationCompareValues(actual, condition.op, condition.value, condition.valueType);
    return { id: condition.id, source: source, op: condition.op, matched: result, reason: result ? 'matched' : 'not-matched' };
}

function evaluateAutomationConditions(conditions, context) {
    var reasons = (conditions || []).map(function(condition) { return evaluateAutomationCondition(condition, context); });
    return {
        matched: reasons.every(function(item) { return item.matched; }),
        reasons: reasons
    };
}

function getAutomationSavedMainMessageCount(conv) {
    return (conv && Array.isArray(conv.messages) ? conv.messages : []).filter(function(message) {
        return message && (message.role === 'user' || message.role === 'assistant') && message.stage !== 'second' && message.stage !== 'scene';
    }).length;
}

function getAutomationCharacterNames(conv) {
    var names = [];
    if (conv && conv.character && conv.character.name) names.push(String(conv.character.name));
    if (conv && conv.group && Array.isArray(conv.group.members)) {
        conv.group.members.forEach(function(member) {
            if (member && member.character && member.character.name) names.push(String(member.character.name));
        });
    }
    return Array.from(new Set(names));
}

function buildAutomationEventContext(conv, eventName, payload) {
    payload = payload || {};
    var entries = (Array.isArray(payload.worldbookEntries) ? payload.worldbookEntries : []).slice(0, 30).map(function(entry) {
        return {
            worldBookId: String(entry && entry.worldBookId || '').slice(0, AUTOMATION_MAX_TARGET),
            uid: String(entry && entry.uid == null ? '' : entry.uid).slice(0, AUTOMATION_MAX_TARGET),
            automationId: String(entry && entry.automationId || '').slice(0, AUTOMATION_MAX_TARGET),
            moduleId: String(entry && entry.moduleId || '').slice(0, AUTOMATION_MAX_TARGET)
        };
    });
    return {
        event: eventName,
        eventId: String(payload.eventId || ''),
        conversationId: String(conv && conv.id || '').slice(0, AUTOMATION_MAX_TARGET),
        conversationTitle: String(conv && conv.title || '').slice(0, AUTOMATION_MAX_TARGET),
        characterNames: getAutomationCharacterNames(conv).slice(0, 20).map(function(name) { return String(name).slice(0, AUTOMATION_MAX_NAME); }),
        messageCount: getAutomationSavedMainMessageCount(conv),
        eventRole: String(payload.role || '').slice(0, 20),
        eventText: String(payload.text || '').slice(0, AUTOMATION_MAX_TEXT),
        messageId: String(payload.messageId || '').slice(0, AUTOMATION_MAX_TARGET),
        messageRevision: payload.messageRevision == null ? null : payload.messageRevision,
        worldbookEntries: entries,
        getMvuData: payload.getMvuData || function() { return {}; }
    };
}
