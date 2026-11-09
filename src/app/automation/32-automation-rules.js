/**
 * 新手导读（文件：32-automation-rules.js）
 *
 * 负责什么：定义“事件—条件—动作”自动化规则的数据模型、规范化、校验、绑定匹配和持久化事务。
 * 在程序中的位置：规则定义存放在 settings.automationRules，本机执行授权存放在本机专用设置；
 * 运行队列、事件去重和迟到动作保护由 52-automation-runtime.js 负责。
 * 从哪里开始看：`ensureAutomationSettings(settings)`、`saveAutomationRulesChange(mutator)`、
 * `importAutomationRulesData(raw)`、`getAutomationRuleGrant(ruleId)`。
 * 修改时注意：导入/云同步永远不能自动授予本机执行或自动发送权限；规则 revision 参与执行去重。
 */
// ==================== Automation Rule Definitions ====================
var AUTOMATION_EVENTS = [
    'conversation-created',
    'conversation-entered',
    'before-send',
    'user-message-saved',
    'assistant-message-saved',
    'worldbook-activated'
];
var AUTOMATION_SCOPES = ['global', 'character', 'conversation'];
var AUTOMATION_ACTION_TYPES = [
    'set-draft',
    'append-draft',
    'quick-reply',
    'prompt-fragment',
    'mvu-set',
    'block-send',
    'send-message'
];
var AUTOMATION_CONDITION_SOURCES = [
    'conversation-id',
    'conversation-title',
    'character-name',
    'event-role',
    'event-text',
    'message-count',
    'mvu',
    'worldbook-entry'
];
var AUTOMATION_CONDITION_OPS = ['equals', 'not-equals', 'contains', 'not-contains', 'gt', 'gte', 'lt', 'lte', 'exists', 'not-exists'];
var AUTOMATION_VALUE_TYPES = ['string', 'number', 'boolean'];
var AUTOMATION_ALLOWED_ACTIONS = {
    'conversation-created': ['set-draft', 'append-draft', 'quick-reply', 'send-message'],
    'conversation-entered': ['set-draft', 'append-draft', 'quick-reply', 'send-message'],
    'before-send': ['set-draft', 'append-draft', 'quick-reply', 'prompt-fragment', 'block-send'],
    'user-message-saved': ['set-draft', 'append-draft', 'quick-reply', 'mvu-set', 'send-message'],
    'assistant-message-saved': ['set-draft', 'append-draft', 'quick-reply', 'mvu-set', 'send-message'],
    'worldbook-activated': ['prompt-fragment']
};
var AUTOMATION_MAX_RULES = 80;
var AUTOMATION_MAX_CONDITIONS = 10;
var AUTOMATION_MAX_ACTIONS = 10;
var AUTOMATION_MAX_NAME = 80;
var AUTOMATION_MAX_TEXT = 4000;
var AUTOMATION_MAX_DRAFT = 20000;
var AUTOMATION_MAX_PATH = 200;
var AUTOMATION_MAX_TARGET = 200;
var AUTOMATION_MAX_RECENT_RUNS = 20;
var AUTOMATION_MAX_RUN_DETAIL = 300;
var failedAutomationDraft = null;

function normalizeAutomationEvent(value) {
    var event = String(value || '');
    return AUTOMATION_EVENTS.indexOf(event) >= 0 ? event : '';
}

function normalizeAutomationScope(value) {
    var scope = String(value || '').toLowerCase();
    return AUTOMATION_SCOPES.indexOf(scope) >= 0 ? scope : 'global';
}

function normalizeAutomationValueType(value) {
    var type = String(value || '').toLowerCase();
    return AUTOMATION_VALUE_TYPES.indexOf(type) >= 0 ? type : 'string';
}

function automationBoundedText(value, limit, allowEmpty) {
    return typeof value === 'string' && value.length <= limit && (allowEmpty === true || value.trim() !== '');
}

function automationStrictValueMatches(type, value, allowEmpty) {
    if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
    if (type === 'boolean') return value === true || value === false;
    return automationBoundedText(value, AUTOMATION_MAX_TEXT, allowEmpty === true);
}

// 入站定义必须先按原始值严格校验，再做规范化；未知来源/操作/类型和非法值都不能被悄悄改写后执行。
function automationRawConditionValid(condition) {
    if (!condition || typeof condition !== 'object' || Array.isArray(condition)) return false;
    var source = String(condition.source || '');
    var op = String(condition.op || '');
    if (AUTOMATION_CONDITION_SOURCES.indexOf(source) < 0 || AUTOMATION_CONDITION_OPS.indexOf(op) < 0) return false;
    if (source === 'message-count' && ['contains', 'not-contains', 'exists', 'not-exists'].indexOf(op) >= 0) return false;
    if (source === 'event-role' && ['contains', 'not-contains', 'gt', 'gte', 'lt', 'lte', 'exists', 'not-exists'].indexOf(op) >= 0) return false;
    if (source === 'worldbook-entry' && ['gt', 'gte', 'lt', 'lte', 'exists', 'not-exists'].indexOf(op) >= 0) return false;
    if (['conversation-id', 'conversation-title', 'character-name', 'event-text'].indexOf(source) >= 0 &&
        ['gt', 'gte', 'lt', 'lte', 'exists', 'not-exists'].indexOf(op) >= 0) return false;
    var valueType = source === 'message-count' ? 'number' : source === 'mvu' ? String(condition.valueType || '') : 'string';
    var needsValue = op !== 'exists' && op !== 'not-exists';
    if (needsValue && AUTOMATION_VALUE_TYPES.indexOf(valueType) < 0) return false;
    if (!needsValue && condition.valueType !== undefined && AUTOMATION_VALUE_TYPES.indexOf(valueType) < 0) return false;
    var allowEmpty = source === 'event-role';
    if (needsValue && !automationStrictValueMatches(valueType, condition.value, allowEmpty)) return false;
    if (needsValue && valueType === 'number' && ['contains', 'not-contains'].indexOf(op) >= 0) return false;
    if (needsValue && valueType === 'boolean' && ['contains', 'not-contains', 'gt', 'gte', 'lt', 'lte'].indexOf(op) >= 0) return false;
    if (needsValue && valueType === 'string' && ['gt', 'gte', 'lt', 'lte'].indexOf(op) >= 0) return false;
    if (source === 'mvu') {
        if (!automationBoundedText(condition.path, AUTOMATION_MAX_PATH)) return false;
        try { validateAutomationPath(condition.path); } catch (error) { return false; }
    }
    return true;
}

function automationRawActionValid(action) {
    if (!action || typeof action !== 'object' || Array.isArray(action)) return false;
    var type = String(action.type || '');
    if (AUTOMATION_ACTION_TYPES.indexOf(type) < 0) return false;
    if (type === 'set-draft' || type === 'append-draft') return automationBoundedText(action.text, AUTOMATION_MAX_TEXT);
    if (type === 'prompt-fragment') {
        return (action.role === undefined || action.role === 'system' || action.role === 'user') &&
            automationBoundedText(action.text, AUTOMATION_MAX_TEXT);
    }
    if (type === 'quick-reply') {
        return automationBoundedText(action.groupId, AUTOMATION_MAX_TARGET) &&
            automationBoundedText(action.buttonId, AUTOMATION_MAX_TARGET) &&
            (action.mode === undefined || action.mode === 'append' || action.mode === 'replace');
    }
    if (type === 'mvu-set') {
        if (!automationBoundedText(action.path, AUTOMATION_MAX_PATH)) return false;
        try { validateAutomationPath(action.path); } catch (error) { return false; }
        var valueType = String(action.valueType || '');
        return AUTOMATION_VALUE_TYPES.indexOf(valueType) >= 0 && automationStrictValueMatches(valueType, action.value);
    }
    if (type === 'block-send') {
        return (action.reason === undefined || typeof action.reason === 'string') &&
            String(action.reason || '').length <= AUTOMATION_MAX_RUN_DETAIL;
    }
    if (type === 'send-message') {
        return (action.text === undefined || typeof action.text === 'string') &&
            String(action.text || '').length <= AUTOMATION_MAX_TEXT;
    }
    return false;
}

function automationRuleInputValid(rule) {
    if (!rule || typeof rule !== 'object' || Array.isArray(rule)) return false;
    if (rule.name !== undefined && (typeof rule.name !== 'string' || rule.name.length > AUTOMATION_MAX_NAME)) return false;
    if (AUTOMATION_EVENTS.indexOf(String(rule.event || '')) < 0) return false;
    var scope = String(rule.scope || '').toLowerCase();
    if (AUTOMATION_SCOPES.indexOf(scope) < 0) return false;
    if (scope !== 'global' && !automationBoundedText(rule.targetId, AUTOMATION_MAX_TARGET)) return false;
    if (!Array.isArray(rule.conditions) || rule.conditions.length > AUTOMATION_MAX_CONDITIONS) return false;
    if (!Array.isArray(rule.actions) || rule.actions.length > AUTOMATION_MAX_ACTIONS) return false;
    return rule.conditions.every(automationRawConditionValid) && rule.actions.every(automationRawActionValid);
}

// 本机授权绑定规范化后的可执行内容，而不是外部可伪造的 revision。
// 名称、排序与启停不改变执行语义，因此不参与指纹；角色/会话目标、条件、动作和动作权限内容都参与。
function automationRuleFingerprint(rule) {
    if (!rule || typeof rule !== 'object') return '';
    function text(value) {
        if (typeof value === 'boolean') return value ? '1' : '0';
        if (value === null || value === undefined) return '';
        return String(value);
    }
    return JSON.stringify([
        text(rule.event), text(rule.scope), text(rule.targetId),
        (Array.isArray(rule.conditions) ? rule.conditions : []).map(function(condition) {
            return [text(condition.source), text(condition.op), text(condition.path),
                text(condition.valueType), text(condition.value)];
        }),
        (Array.isArray(rule.actions) ? rule.actions : []).map(function(action) {
            return [text(action.type), text(action.text), text(action.role), text(action.groupId),
                text(action.buttonId), text(action.mode), text(action.path), text(action.valueType),
                text(action.value), text(action.reason)];
        })
    ]);
}

function normalizeAutomationConditionValue(type, value) {
    if (type === 'number') {
        var number = Number(value);
        return Number.isFinite(number) ? number : 0;
    }
    if (type === 'boolean') return value === true || String(value) === 'true';
    return String(value == null ? '' : value).slice(0, AUTOMATION_MAX_TEXT);
}

function normalizeAutomationCondition(condition, index, usedIds) {
    if (!condition || typeof condition !== 'object' || Array.isArray(condition)) return null;
    var source = AUTOMATION_CONDITION_SOURCES.indexOf(String(condition.source || '')) >= 0 ? String(condition.source) : '';
    var op = AUTOMATION_CONDITION_OPS.indexOf(String(condition.op || '')) >= 0 ? String(condition.op) : '';
    if (!source || !op) return null;
    var id = String(condition.id || '').trim() || 'automation-condition-' + Date.now().toString(36) + '-' + index;
    while (usedIds[id]) id += '-' + index;
    usedIds[id] = true;
    var valueType = source === 'message-count' ? 'number' : source === 'mvu' ? normalizeAutomationValueType(condition.valueType) : 'string';
    return {
        id: id,
        source: source,
        op: op,
        path: source === 'mvu' ? String(condition.path || '').trim().slice(0, AUTOMATION_MAX_PATH) : '',
        valueType: valueType,
        value: normalizeAutomationConditionValue(valueType, condition.value)
    };
}

function normalizeAutomationAction(action, index, usedIds) {
    if (!action || typeof action !== 'object' || Array.isArray(action)) return null;
    var type = AUTOMATION_ACTION_TYPES.indexOf(String(action.type || '')) >= 0 ? String(action.type) : '';
    if (!type) return null;
    var id = String(action.id || '').trim() || 'automation-action-' + Date.now().toString(36) + '-' + index;
    while (usedIds[id]) id += '-' + index;
    usedIds[id] = true;
    var result = { id: id, type: type };
    if (type === 'set-draft' || type === 'append-draft') {
        result.text = String(action.text || '').slice(0, AUTOMATION_MAX_TEXT);
    } else if (type === 'prompt-fragment') {
        result.role = String(action.role || '').toLowerCase() === 'user' ? 'user' : 'system';
        result.text = String(action.text || '').slice(0, AUTOMATION_MAX_TEXT);
    } else if (type === 'quick-reply') {
        result.groupId = String(action.groupId || '').trim().slice(0, AUTOMATION_MAX_TARGET);
        result.buttonId = String(action.buttonId || '').trim().slice(0, AUTOMATION_MAX_TARGET);
        result.mode = String(action.mode || '').toLowerCase() === 'replace' ? 'replace' : 'append';
    } else if (type === 'mvu-set') {
        result.path = String(action.path || '').trim().slice(0, AUTOMATION_MAX_PATH);
        result.valueType = normalizeAutomationValueType(action.valueType);
        result.value = normalizeAutomationConditionValue(result.valueType, action.value);
    } else if (type === 'block-send') {
        result.reason = String(action.reason || '').slice(0, AUTOMATION_MAX_RUN_DETAIL);
    } else if (type === 'send-message') {
        result.text = String(action.text || '').slice(0, AUTOMATION_MAX_TEXT);
    }
    return result;
}

function normalizeAutomationRule(rule, index, usedIds) {
    if (!rule || typeof rule !== 'object' || Array.isArray(rule)) return null;
    var id = String(rule.id || '').trim();
    if (!id || usedIds[id]) id = 'automation-rule-' + Date.now().toString(36) + '-' + index;
    usedIds[id] = true;
    var event = normalizeAutomationEvent(rule.event);
    var scope = normalizeAutomationScope(rule.scope);
    var invalid = AUTOMATION_SCOPES.indexOf(String(rule.scope || '').toLowerCase()) < 0 ||
        !Array.isArray(rule.conditions) || !Array.isArray(rule.actions) ||
        rule.conditions.length > AUTOMATION_MAX_CONDITIONS || rule.actions.length > AUTOMATION_MAX_ACTIONS ||
        (scope !== 'global' && !String(rule.targetId || '').trim());
    if (rule.invalid === true || !automationRuleInputValid(rule)) invalid = true;
    var conditionIds = Object.create(null), actionIds = Object.create(null);
    var conditions = (Array.isArray(rule.conditions) ? rule.conditions : []).slice(0, AUTOMATION_MAX_CONDITIONS)
        .map(function(condition, conditionIndex) { return normalizeAutomationCondition(condition, conditionIndex, conditionIds); })
        .filter(Boolean);
    var actions = (Array.isArray(rule.actions) ? rule.actions : []).slice(0, AUTOMATION_MAX_ACTIONS)
        .map(function(action, actionIndex) { return normalizeAutomationAction(action, actionIndex, actionIds); })
        .filter(Boolean);
    if (Array.isArray(rule.conditions) && conditions.length !== Math.min(rule.conditions.length, AUTOMATION_MAX_CONDITIONS)) invalid = true;
    if (Array.isArray(rule.actions) && actions.length !== Math.min(rule.actions.length, AUTOMATION_MAX_ACTIONS)) invalid = true;
    actions.forEach(function(action) {
        if ((AUTOMATION_ALLOWED_ACTIONS[event] || []).indexOf(action.type) < 0) invalid = true;
    });
    var normalized = {
        id: id,
        revision: Number.isInteger(Number(rule.revision)) && Number(rule.revision) >= 0 ? Number(rule.revision) : 0,
        name: String(rule.name || '').trim().slice(0, AUTOMATION_MAX_NAME) || t('automation_unnamed_rule'),
        enabled: rule.enabled === true && !!event && !invalid,
          event: event || 'before-send',
        scope: scope,
        targetId: scope === 'global' ? '' : String(rule.targetId || '').trim().slice(0, AUTOMATION_MAX_TARGET),
        order: Number.isFinite(Number(rule.order)) ? Number(rule.order) : index,
        conditions: conditions,
        actions: actions
    };
    if (invalid) normalized.invalid = true;
    return normalized;
}

function ensureAutomationSettings(settings) {
    settings = settings || (typeof state !== 'undefined' ? state.settings : null);
    if (!settings || typeof settings !== 'object') return settings;
    if (!Array.isArray(settings.automationRules)) settings.automationRules = [];
    var usedIds = Object.create(null);
    settings.automationRules = settings.automationRules.slice(0, AUTOMATION_MAX_RULES).map(function(rule, index) {
        return normalizeAutomationRule(rule, index, usedIds);
    }).filter(Boolean);
    settings.automationRules.forEach(function(rule, index) { rule.order = index; });
    if (!settings.automationRuleGrants || typeof settings.automationRuleGrants !== 'object' || Array.isArray(settings.automationRuleGrants)) settings.automationRuleGrants = {};
    if (!settings.automationSendGrants || typeof settings.automationSendGrants !== 'object' || Array.isArray(settings.automationSendGrants)) settings.automationSendGrants = {};
    var rulesById = Object.create(null);
    settings.automationRules.forEach(function(rule) { rulesById[rule.id] = rule; });
    Object.keys(settings.automationRuleGrants).forEach(function(ruleId) {
        var grant = settings.automationRuleGrants[ruleId];
        var rule = rulesById[ruleId];
        if (!rule || rule.invalid === true || !grant || typeof grant !== 'object' ||
            Number(grant.revision) !== rule.revision || typeof grant.fingerprint !== 'string' ||
            grant.fingerprint !== automationRuleFingerprint(rule)) delete settings.automationRuleGrants[ruleId];
    });
    Object.keys(settings.automationSendGrants).forEach(function(ruleId) {
        var grant = settings.automationRuleGrants[ruleId];
        if (!grant || grant.allowSend !== true) delete settings.automationSendGrants[ruleId];
    });
    if (!Array.isArray(settings.automationRecentRuns)) settings.automationRecentRuns = [];
    settings.automationRecentRuns = settings.automationRecentRuns.slice(0, AUTOMATION_MAX_RECENT_RUNS);
    return settings;
}

function getAutomationRules() {
    ensureAutomationSettings();
    return (state.settings.automationRules || []).slice().sort(function(a, b) { return a.order - b.order; });
}

function getAutomationRuleById(id, conv) {
    ensureAutomationSettings();
    var rule = (state.settings.automationRules || []).find(function(item) { return item.id === id; }) || null;
    if (!rule && typeof getContentModuleAutomationRuleById === 'function') {
        rule = getContentModuleAutomationRuleById(id, conv);
    }
    return rule;
}

function automationTargetNames(conv) {
    var names = [];
    if (conv && conv.character && conv.character.name) names.push(String(conv.character.name).toLowerCase());
    if (conv && conv.group && Array.isArray(conv.group.members)) {
        conv.group.members.forEach(function(member) {
            if (member && member.character && member.character.name) names.push(String(member.character.name).toLowerCase());
        });
    }
    return Array.from(new Set(names));
}

function automationRuleMatchesConversation(rule, conv) {
    if (!rule || rule.enabled === false) return false;
    if (rule.scope === 'global') return true;
    if (!conv) return false;
    if (rule.scope === 'conversation') return rule.targetId === conv.id;
    return automationTargetNames(conv).indexOf(String(rule.targetId || '').toLowerCase()) >= 0;
}

function automationRuleMatchesEvent(rule, eventName) {
    return !!rule && rule.event === eventName;
}

function getAutomationRuleGrant(ruleId) {
    ensureAutomationSettings();
    if (typeof isContentModuleRuleId === 'function' &&
        isContentModuleRuleId(ruleId) &&
        typeof getContentModuleAutomationRuleGrant === 'function') {
        return getContentModuleAutomationRuleGrant(ruleId);
    }
    var grant = state.settings.automationRuleGrants[ruleId];
    if (!grant || typeof grant !== 'object') return null;
    return {
        revision: Number.isInteger(Number(grant.revision)) ? Number(grant.revision) : -1,
        fingerprint: typeof grant.fingerprint === 'string' ? grant.fingerprint : '',
        allowSend: grant.allowSend === true
    };
}

function isAutomationRuleAuthorized(rule) {
    if (!rule || rule.invalid === true) return false;
    var grant = getAutomationRuleGrant(rule.id);
    var fingerprint = automationRuleFingerprint(rule);
    return !!grant && !!fingerprint && grant.revision === rule.revision && grant.fingerprint === fingerprint;
}

function isAutomationSendAuthorized(rule) {
    var grant = isAutomationRuleAuthorized(rule) ? getAutomationRuleGrant(rule.id) : null;
    return !!(grant && grant.allowSend);
}

function validateAutomationPath(path) {
    var value = String(path || '').trim();
    if (!value || value.length > AUTOMATION_MAX_PATH) throw new Error(t('automation_mvu_path_invalid'));
    var segments = value.split('.');
    if (!segments.length || segments.length > 8) throw new Error(t('automation_mvu_path_invalid'));
    segments.forEach(function(segment) {
        if (!segment || segment.length > 40) throw new Error(t('automation_mvu_path_invalid'));
        if (['__proto__', 'constructor', 'prototype'].indexOf(segment) >= 0) throw new Error(t('automation_mvu_path_invalid'));
        if (!/^[A-Za-z0-9_\-\u4e00-\u9fff]+$/.test(segment)) throw new Error(t('automation_mvu_path_invalid'));
    });
    return segments;
}

function validateAutomationRule(rule) {
    if (!rule || typeof rule !== 'object' || Array.isArray(rule)) throw new Error(t('automation_invalid_rule'));
    if (rule.invalid === true) throw new Error(t('automation_invalid_rule'));
    if (!String(rule.name || '').trim()) throw new Error(t('automation_name_required'));
    if (AUTOMATION_EVENTS.indexOf(rule.event) < 0) throw new Error(t('automation_invalid_rule'));
    if (AUTOMATION_SCOPES.indexOf(rule.scope) < 0) throw new Error(t('automation_invalid_rule'));
    if (rule.scope !== 'global' && !String(rule.targetId || '').trim()) throw new Error(t('automation_target_required'));
    if (!Array.isArray(rule.conditions) || rule.conditions.length > AUTOMATION_MAX_CONDITIONS) throw new Error(t('automation_conditions_invalid'));
    if (!Array.isArray(rule.actions) || rule.actions.length > AUTOMATION_MAX_ACTIONS) throw new Error(t('automation_actions_invalid'));
    rule.conditions.forEach(function(condition) {
        if (AUTOMATION_CONDITION_SOURCES.indexOf(condition.source) < 0 || AUTOMATION_CONDITION_OPS.indexOf(condition.op) < 0) throw new Error(t('automation_conditions_invalid'));
        if (condition.source === 'mvu') validateAutomationPath(condition.path);
        if (['exists', 'not-exists'].includes(condition.op) && condition.source !== 'mvu') throw new Error(t('automation_conditions_invalid'));
        if (condition.source === 'message-count' && ['contains', 'not-contains', 'exists', 'not-exists'].includes(condition.op)) throw new Error(t('automation_conditions_invalid'));
        if (condition.source === 'event-role' && ['contains', 'not-contains', 'gt', 'gte', 'lt', 'lte', 'exists', 'not-exists'].includes(condition.op)) throw new Error(t('automation_conditions_invalid'));
        if (condition.source === 'worldbook-entry' && ['gt', 'gte', 'lt', 'lte', 'exists', 'not-exists'].includes(condition.op)) throw new Error(t('automation_conditions_invalid'));
        if (['conversation-id', 'conversation-title', 'character-name', 'event-text'].includes(condition.source) && ['gt', 'gte', 'lt', 'lte', 'exists', 'not-exists'].includes(condition.op)) throw new Error(t('automation_conditions_invalid'));
        if (!['exists', 'not-exists'].includes(condition.op) && condition.source === 'mvu' && AUTOMATION_VALUE_TYPES.indexOf(condition.valueType) < 0) throw new Error(t('automation_conditions_invalid'));
        if (String(condition.value == null ? '' : condition.value).length > AUTOMATION_MAX_TEXT) throw new Error(t('automation_conditions_invalid'));
        if (!automationRawConditionValid(condition)) throw new Error(t('automation_conditions_invalid'));
    });
    rule.actions.forEach(function(action) {
        if (AUTOMATION_ACTION_TYPES.indexOf(action.type) < 0) throw new Error(t('automation_actions_invalid'));
        var allowed = AUTOMATION_ALLOWED_ACTIONS[rule.event] || [];
        if (allowed.indexOf(action.type) < 0) throw new Error(t('automation_action_event_invalid'));
        if ((action.type === 'set-draft' || action.type === 'append-draft' || action.type === 'prompt-fragment') && !String(action.text || '').trim()) throw new Error(t('automation_action_text_required'));
        if (['set-draft', 'append-draft', 'prompt-fragment', 'send-message'].includes(action.type) && String(action.text || '').length > AUTOMATION_MAX_TEXT) throw new Error(t('automation_actions_invalid'));
        if (action.type === 'block-send' && String(action.reason || '').length > AUTOMATION_MAX_RUN_DETAIL) throw new Error(t('automation_actions_invalid'));
        if (action.type === 'quick-reply' && (!String(action.groupId || '').trim() || !String(action.buttonId || '').trim())) throw new Error(t('automation_action_quick_required'));
        if (action.type === 'mvu-set') validateAutomationPath(action.path);
        if (!automationRawActionValid(action)) throw new Error(t('automation_actions_invalid'));
    });
    return rule;
}

function getAutomationRulesSnapshot() {
    ensureAutomationSettings();
    return JSON.stringify({
        rules: state.settings.automationRules,
        grants: state.settings.automationRuleGrants,
        sendGrants: state.settings.automationSendGrants
    });
}

async function saveAutomationRulesChange(mutator, options) {
    options = options || {};
    if (failedAutomationDraft) throw new Error(t('automation_draft_pending'));
    var root = state.settings;
    var candidate = JSON.parse(JSON.stringify(state.settings));
    ensureAutomationSettings(candidate);
    mutator(candidate);
    ensureAutomationSettings(candidate);
    candidate.automationRules.forEach(function(rule) {
        if (rule.invalid === true && rule.enabled !== true) return;
        validateAutomationRule(rule);
    });
    var baseline = options.baseline || getAutomationRulesSnapshot();
    function check() {
        if (state.settings !== root) throw new Error(t('automation_settings_replaced'));
        if (getAutomationRulesSnapshot() !== baseline) throw new Error(t('automation_settings_changed'));
    }
    try {
        check();
        await persistState(true, {
            throwOnError: true,
            beforePersist: check,
            transformSnapshot: function(snapshot) {
                snapshot.settings.automationRules = JSON.parse(JSON.stringify(candidate.automationRules));
                snapshot.settings.automationRuleGrants = JSON.parse(JSON.stringify(candidate.automationRuleGrants));
                snapshot.settings.automationSendGrants = JSON.parse(JSON.stringify(candidate.automationSendGrants));
                return snapshot;
            },
            onPersistSuccess: function() {
                check();
                state.settings.automationRules = JSON.parse(JSON.stringify(candidate.automationRules));
                state.settings.automationRuleGrants = JSON.parse(JSON.stringify(candidate.automationRuleGrants));
                state.settings.automationSendGrants = JSON.parse(JSON.stringify(candidate.automationSendGrants));
            },
            commitPendingSnapshot: function(snapshot) {
                if (getAutomationRulesSnapshot() === baseline) {
                    snapshot.settings.automationRules = JSON.parse(JSON.stringify(candidate.automationRules));
                    snapshot.settings.automationRuleGrants = JSON.parse(JSON.stringify(candidate.automationRuleGrants));
                    snapshot.settings.automationSendGrants = JSON.parse(JSON.stringify(candidate.automationSendGrants));
                }
            }
        });
        failedAutomationDraft = null;
        appStore.notify('settings');
        return true;
    } catch (error) {
        failedAutomationDraft = { candidate: candidate, root: root, baseline: baseline };
        throw error;
    }
}

function setAutomationRuleGrant(settings, ruleId, revision, allowSend) {
    if (!settings || typeof settings !== 'object') return;
    if (!settings.automationRuleGrants || typeof settings.automationRuleGrants !== 'object') settings.automationRuleGrants = {};
    if (!settings.automationSendGrants || typeof settings.automationSendGrants !== 'object') settings.automationSendGrants = {};
    var rule = (settings.automationRules || []).find(function(item) { return item.id === ruleId; });
    if (!rule || rule.invalid === true) { removeAutomationRuleGrant(settings, ruleId); return; }
    settings.automationRuleGrants[ruleId] = {
        revision: rule.revision,
        fingerprint: automationRuleFingerprint(rule),
        allowSend: allowSend === true
    };
    if (allowSend === true) settings.automationSendGrants[ruleId] = true;
    else delete settings.automationSendGrants[ruleId];
}

function removeAutomationRuleGrant(settings, ruleId) {
    delete settings.automationRuleGrants[ruleId];
    delete settings.automationSendGrants[ruleId];
}

function bumpAutomationRuleRevision(rule) {
    rule.revision = (Number(rule.revision) || 0) + 1;
    return rule.revision;
}

function cloneAutomationRuleForCopy(rule) {
    var copy = JSON.parse(JSON.stringify(rule));
    copy.id = makeId();
    copy.revision = 0;
    copy.name = (rule.name || t('automation_unnamed_rule')) + ' ' + t('automation_copy_suffix');
    copy.enabled = false;
    copy.order = (state.settings.automationRules || []).length;
    return copy;
}

function importAutomationRulesData(raw) {
    var rules = Array.isArray(raw) ? raw : raw && raw.type === 'opentavern-automation-rules' ? raw.rules : null;
    if (!Array.isArray(rules) || !rules.length || rules.length > AUTOMATION_MAX_RULES) throw new Error(t('automation_import_invalid'));
    var usedIds = Object.create(null);
    return rules.map(function(rawRule, index) {
        var copy = JSON.parse(JSON.stringify(rawRule));
        if (!copy || typeof copy !== 'object' || Array.isArray(copy) || !Array.isArray(copy.conditions) ||
            copy.conditions.length > AUTOMATION_MAX_CONDITIONS || !Array.isArray(copy.actions) || copy.actions.length > AUTOMATION_MAX_ACTIONS) {
            throw new Error(t('automation_import_invalid'));
        }
        copy.conditions.forEach(function(condition) {
            if (!condition || typeof condition !== 'object' || AUTOMATION_CONDITION_SOURCES.indexOf(condition.source) < 0 || AUTOMATION_CONDITION_OPS.indexOf(condition.op) < 0) throw new Error(t('automation_import_invalid'));
            if (String(condition.value == null ? '' : condition.value).length > AUTOMATION_MAX_TEXT) throw new Error(t('automation_import_invalid'));
        });
        copy.actions.forEach(function(action) {
            if (!action || typeof action !== 'object' || AUTOMATION_ACTION_TYPES.indexOf(action.type) < 0) throw new Error(t('automation_import_invalid'));
            if (String(action.text || '').length > AUTOMATION_MAX_TEXT || String(action.reason || '').length > AUTOMATION_MAX_RUN_DETAIL) throw new Error(t('automation_import_invalid'));
        });
        if (!automationRuleInputValid(copy)) throw new Error(t('automation_import_invalid'));
        copy.id = makeId();
        copy.revision = 0;
        copy.enabled = false;
        copy.order = index;
        var rule = normalizeAutomationRule(copy, index, usedIds);
        if (!rule) throw new Error(t('automation_import_invalid'));
        rule.enabled = false;
        validateAutomationRule(rule);
        return rule;
    });
}

function exportAutomationRulesData() {
    return {
        type: 'opentavern-automation-rules',
        version: 1,
        rules: getAutomationRules().map(function(rule) {
            return JSON.parse(JSON.stringify(rule));
        })
    };
}
