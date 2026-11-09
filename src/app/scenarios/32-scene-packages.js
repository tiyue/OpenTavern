/**
 * 新手导读（文件：32-scene-packages.js）
 *
 * 负责什么：定义“场景包—事件”的数据模型、规范化、校验、绑定匹配、本机授权和可靠保存事务。
 * 在程序中的位置：场景包定义存放在 settings.scenePackages，本机执行授权存放在本机专用设置；
 * 运行、去重、进度回放和取消由 52-scene-runtime.js 负责，管理界面在 68-scene-ui.js。
 * 从哪里开始看：`ensureSceneSettings(settings)`、`saveScenePackagesChange(mutator)`、
 * `importScenePackagesData(raw)`、`getScenePackageGrant(packageId)`。
 * 修改时注意：导入/云同步/恢复永远不能自动授予本机执行许可；剧情进度不存放在设置里。
 */
// ==================== Scene Package Definitions ====================
var SCENE_TRIGGERS = ['opening', 'user-message-saved', 'assistant-message-saved'];
var SCENE_SCOPES = ['global', 'character', 'conversation'];
var SCENE_CONDITION_SOURCES = [
    'conversation-id',
    'conversation-title',
    'character-name',
    'event-role',
    'event-text',
    'message-count',
    'mvu',
    'away-minutes'
];
var SCENE_MAX_PACKAGES = 20;
var SCENE_MAX_EVENTS = 20;
var SCENE_MAX_CONDITIONS = 10;
var SCENE_MAX_MVU_CHANGES = 10;
var SCENE_MAX_NAME = 80;
var SCENE_MAX_TEXT = 4000;
var SCENE_MAX_PATH = 200;
var SCENE_MAX_TARGET = 200;
var SCENE_MAX_RECENT_RUNS = 20;
var SCENE_MAX_RUN_DETAIL = 300;
// 记录正文/条件/变量的指纹上限必须覆盖最大合法事件，不能把合法长正文判成无效历史。
// 字符串按 JSON 转义最坏 12 倍估算，条件值与变量值上限沿用自动化定义。
var SCENE_MAX_FINGERPRINT = (SCENE_MAX_TEXT + 64) * 12 +
    (SCENE_MAX_CONDITIONS + SCENE_MAX_MVU_CHANGES) * ((SCENE_MAX_PATH + AUTOMATION_MAX_TEXT + 128) * 12) + 4096;
var SCENE_RECORD_VERSION = 2;
var SCENE_PACKAGE_KEYS = ['id', 'revision', 'name', 'enabled', 'scope', 'targetId', 'order', 'events'];
var SCENE_EVENT_KEYS = ['id', 'revision', 'name', 'order', 'trigger', 'once', 'conditions', 'text', 'mvu'];
var SCENE_CONDITION_KEYS = ['id', 'source', 'op', 'path', 'valueType', 'value'];
var SCENE_MVU_CHANGE_KEYS = ['id', 'path', 'valueType', 'value'];
var failedSceneDraft = null;

function scenePlainRecord(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function sceneBoundedText(value, limit, allowEmpty) {
    return typeof value === 'string' && value.length <= limit && (allowEmpty === true || value.trim() !== '');
}

function sceneOnlyKeys(value, keys) {
    if (!scenePlainRecord(value)) return false;
    return Object.keys(value).every(function(key) { return keys.indexOf(key) >= 0; });
}

function normalizeSceneTrigger(value) {
    var trigger = String(value || '');
    return SCENE_TRIGGERS.indexOf(trigger) >= 0 ? trigger : '';
}

function normalizeSceneScope(value) {
    var scope = String(value || '').toLowerCase();
    return SCENE_SCOPES.indexOf(scope) >= 0 ? scope : 'global';
}

function sceneNumericConditionOp(op) {
    return ['equals', 'not-equals', 'gt', 'gte', 'lt', 'lte'].indexOf(op) >= 0;
}

// 入站定义先按原始值严格校验，未知来源/类型、原型路径、过深或超量内容都不能被改写后执行。
function sceneConditionInputValid(condition) {
    if (!scenePlainRecord(condition)) return false;
    var source = String(condition.source || '');
    var op = String(condition.op || '');
    if (SCENE_CONDITION_SOURCES.indexOf(source) < 0 || AUTOMATION_CONDITION_OPS.indexOf(op) < 0) return false;
    if (source === 'away-minutes') {
        return sceneNumericConditionOp(op) && typeof condition.value === 'number' && Number.isFinite(condition.value) && condition.value >= 0 &&
            (condition.valueType === undefined || condition.valueType === 'number') &&
            (condition.path === undefined || String(condition.path) === '');
    }
    if (source === 'message-count' && (condition.valueType !== undefined && condition.valueType !== 'number' ||
        condition.path !== undefined && String(condition.path) !== '')) return false;
    if (source === 'message-count' && ['contains', 'not-contains', 'exists', 'not-exists'].indexOf(op) >= 0) return false;
    if (source === 'event-role' && ['contains', 'not-contains', 'gt', 'gte', 'lt', 'lte', 'exists', 'not-exists'].indexOf(op) >= 0) return false;
    if (['conversation-id', 'conversation-title', 'character-name', 'event-text'].indexOf(source) >= 0 &&
        ['gt', 'gte', 'lt', 'lte', 'exists', 'not-exists'].indexOf(op) >= 0) return false;
    try { return automationRawConditionValid(condition); } catch (error) { return false; }
}

function sceneMvuChangeInputValid(change) {
    if (!scenePlainRecord(change)) return false;
    if (!sceneBoundedText(change.path, SCENE_MAX_PATH)) return false;
    try { validateAutomationPath(change.path); } catch (error) { return false; }
    var valueType = String(change.valueType || '');
    if (AUTOMATION_VALUE_TYPES.indexOf(valueType) < 0) return false;
    return automationStrictValueMatches(valueType, change.value);
}

function sceneEventInputValid(event) {
    if (!scenePlainRecord(event)) return false;
    if (event.name !== undefined && (typeof event.name !== 'string' || event.name.length > SCENE_MAX_NAME)) return false;
    if (SCENE_TRIGGERS.indexOf(String(event.trigger || '')) < 0) return false;
    if (event.once !== undefined && typeof event.once !== 'boolean') return false;
    if (!sceneBoundedText(event.text, SCENE_MAX_TEXT)) return false;
    if (!Array.isArray(event.conditions) || event.conditions.length > SCENE_MAX_CONDITIONS) return false;
    if (!Array.isArray(event.mvu) || event.mvu.length > SCENE_MAX_MVU_CHANGES) return false;
    return event.conditions.every(sceneConditionInputValid) && event.mvu.every(sceneMvuChangeInputValid);
}

function scenePackageInputValid(pkg) {
    if (!scenePlainRecord(pkg)) return false;
    if (!sceneBoundedText(pkg.name, SCENE_MAX_NAME)) return false;
    if (SCENE_SCOPES.indexOf(String(pkg.scope || '').toLowerCase()) < 0) return false;
    var scope = String(pkg.scope).toLowerCase();
    if (scope !== 'global' && !sceneBoundedText(pkg.targetId, SCENE_MAX_TARGET)) return false;
    if (pkg.enabled !== undefined && typeof pkg.enabled !== 'boolean') return false;
    if (!Array.isArray(pkg.events) || pkg.events.length > SCENE_MAX_EVENTS) return false;
    return pkg.events.every(sceneEventInputValid);
}

// 本机授权绑定规范化后的可执行内容，而不是外部可伪造的 revision。
// 名称、排序与启停不改变单个事件语义，因此不参与指纹；绑定目标、触发、一次性策略、条件、正文和变量变更参与。
function sceneEventFingerprint(event) {
    if (!scenePlainRecord(event)) return '';
    function text(value) {
        if (typeof value === 'boolean') return value ? '1' : '0';
        if (value === null || value === undefined) return '';
        return String(value);
    }
    return JSON.stringify([
        text(event.trigger),
        text(event.once === true),
        (Array.isArray(event.conditions) ? event.conditions : []).map(function(condition) {
            return [text(condition.source), text(condition.op), text(condition.path),
                text(condition.valueType), text(condition.value)];
        }),
        text(event.text),
        (Array.isArray(event.mvu) ? event.mvu : []).map(function(change) {
            return [text(change.path), text(change.valueType), text(change.value)];
        })
    ]);
}

function scenePackageFingerprint(pkg) {
    if (!scenePlainRecord(pkg)) return '';
    var events = (Array.isArray(pkg.events) ? pkg.events : []).slice().sort(function(a, b) {
        return String(a && a.id || '').localeCompare(String(b && b.id || ''));
    });
    return JSON.stringify([
        String(pkg.scope || ''),
        String(pkg.targetId || ''),
        // 稳定事件身份决定一次性/去重命名空间，必须和可执行内容一起纳入本机授权。
        events.map(function(event) { return [String(event && event.id || ''), sceneEventFingerprint(event)]; })
    ]);
}

function normalizeSceneCondition(condition, index, usedIds) {
    if (!scenePlainRecord(condition)) return null;
    var source = SCENE_CONDITION_SOURCES.indexOf(String(condition.source || '')) >= 0 ? String(condition.source) : '';
    var op = AUTOMATION_CONDITION_OPS.indexOf(String(condition.op || '')) >= 0 ? String(condition.op) : '';
    if (!source || !op) return null;
    var id = String(condition.id || '').trim() || 'scene-condition-' + Date.now().toString(36) + '-' + index;
    while (usedIds[id]) id += '-' + index;
    usedIds[id] = true;
    var valueType = source === 'message-count' || source === 'away-minutes'
        ? 'number'
        : source === 'mvu' ? normalizeAutomationValueType(condition.valueType) : 'string';
    return {
        id: id,
        source: source,
        op: op,
        path: source === 'mvu' ? String(condition.path || '').trim().slice(0, SCENE_MAX_PATH) : '',
        valueType: valueType,
        value: normalizeAutomationConditionValue(valueType, condition.value)
    };
}

function normalizeSceneMvuChange(change, index, usedIds) {
    if (!scenePlainRecord(change)) return null;
    if (!sceneBoundedText(change.path, SCENE_MAX_PATH)) return null;
    var valueType = normalizeAutomationValueType(change.valueType);
    var normalized = { id: 'scene-change-' + Date.now().toString(36) + '-' + index, path: '', valueType: valueType, value: null };
    normalized.path = String(change.path || '').trim().slice(0, SCENE_MAX_PATH);
    try { validateAutomationPath(normalized.path); } catch (error) { return null; }
    normalized.value = normalizeAutomationConditionValue(valueType, change.value);
    var id = String(change.id || '').trim() || normalized.id;
    while (usedIds[id]) id += '-' + index;
    usedIds[id] = true;
    normalized.id = id;
    return normalized;
}

function normalizeSceneEvent(event, index, usedEventIds) {
    if (!scenePlainRecord(event)) return null;
    var id = String(event.id || '').trim() || 'scene-event-' + Date.now().toString(36) + '-' + index;
    while (usedEventIds[id]) id += '-' + index;
    usedEventIds[id] = true;
    var invalid = event.invalid === true || !sceneEventInputValid(event);
    var conditionsUsed = Object.create(null), mvuUsed = Object.create(null);
    var conditions = (Array.isArray(event.conditions) ? event.conditions : []).slice(0, SCENE_MAX_CONDITIONS)
        .map(function(condition, conditionIndex) { return normalizeSceneCondition(condition, conditionIndex, conditionsUsed); })
        .filter(Boolean);
    var mvu = (Array.isArray(event.mvu) ? event.mvu : []).slice(0, SCENE_MAX_MVU_CHANGES)
        .map(function(change, changeIndex) { return normalizeSceneMvuChange(change, changeIndex, mvuUsed); })
        .filter(Boolean);
    if (Array.isArray(event.conditions) && conditions.length !== Math.min(event.conditions.length, SCENE_MAX_CONDITIONS)) invalid = true;
    if (Array.isArray(event.mvu) && mvu.length !== Math.min(event.mvu.length, SCENE_MAX_MVU_CHANGES)) invalid = true;
    conditions.forEach(function(condition) { if (!sceneConditionInputValid(condition)) invalid = true; });
    mvu.forEach(function(change) { if (!sceneMvuChangeInputValid(change)) invalid = true; });
    var normalized = {
        id: id,
        revision: Number.isInteger(Number(event.revision)) && Number(event.revision) >= 0 ? Number(event.revision) : 0,
        name: String(event.name || '').trim().slice(0, SCENE_MAX_NAME) || t('scene_unnamed_event'),
        order: Number.isFinite(Number(event.order)) ? Number(event.order) : index,
        trigger: normalizeSceneTrigger(event.trigger) || 'user-message-saved',
        once: event.once !== false,
        conditions: conditions,
        text: typeof event.text === 'string' ? event.text.slice(0, SCENE_MAX_TEXT) : '',
        mvu: mvu
    };
    if (invalid) normalized.invalid = true;
    return normalized;
}

function normalizeScenePackage(pkg, index, usedIds) {
    if (!scenePlainRecord(pkg)) return null;
    var id = String(pkg.id || '').trim();
    while (!id || usedIds[id]) id = 'scene-package-' + Date.now().toString(36) + '-' + index + (usedIds[id] ? '-' + Math.random().toString(36).slice(2, 6) : '');
    usedIds[id] = true;
    var scope = normalizeSceneScope(pkg.scope);
    var invalid = pkg.invalid === true || !scenePackageInputValid(pkg);
    var eventIds = Object.create(null);
    var events = (Array.isArray(pkg.events) ? pkg.events : []).slice(0, SCENE_MAX_EVENTS)
        .map(function(event, eventIndex) { return normalizeSceneEvent(event, eventIndex, eventIds); })
        .filter(Boolean);
    if (Array.isArray(pkg.events) && events.length !== Math.min(pkg.events.length, SCENE_MAX_EVENTS)) invalid = true;
    events.forEach(function(event) { if (event.invalid === true) invalid = true; });
    events.forEach(function(event, eventIndex) { event.order = eventIndex; });
    var normalized = {
        id: id,
        revision: Number.isInteger(Number(pkg.revision)) && Number(pkg.revision) >= 0 ? Number(pkg.revision) : 0,
        name: String(pkg.name || '').trim().slice(0, SCENE_MAX_NAME) || t('scene_unnamed_package'),
        enabled: pkg.enabled === true && !invalid,
        scope: scope,
        targetId: scope === 'global' ? '' : String(pkg.targetId || '').trim().slice(0, SCENE_MAX_TARGET),
        order: Number.isFinite(Number(pkg.order)) ? Number(pkg.order) : index,
        events: events
    };
    if (invalid) normalized.invalid = true;
    return normalized;
}

function sanitizeSceneRunText(value, limit) {
    return String(value == null ? '' : value).slice(0, limit || SCENE_MAX_RUN_DETAIL);
}

function sanitizeSceneRunEntry(entry) {
    entry = entry || {};
    return {
        id: sanitizeSceneRunText(entry.id, 120),
        at: Number(entry.at) || Date.now(),
        conversationId: sanitizeSceneRunText(entry.conversationId, SCENE_MAX_TARGET),
        packageId: sanitizeSceneRunText(entry.packageId, SCENE_MAX_TARGET),
        packageName: sanitizeSceneRunText(entry.packageName, SCENE_MAX_NAME),
        eventId: sanitizeSceneRunText(entry.eventId, SCENE_MAX_TARGET),
        eventName: sanitizeSceneRunText(entry.eventName, SCENE_MAX_NAME),
        trigger: normalizeSceneTrigger(entry.trigger),
        sourceMessageId: sanitizeSceneRunText(entry.sourceMessageId, SCENE_MAX_TARGET),
        status: ['executed', 'skipped', 'failed', 'cancelled'].indexOf(entry.status) >= 0 ? entry.status : 'skipped',
        detail: sanitizeSceneRunText(entry.detail),
        conditions: (Array.isArray(entry.conditions) ? entry.conditions : []).slice(0, SCENE_MAX_CONDITIONS).map(function(item) {
            return {
                id: sanitizeSceneRunText(item && item.id, 80),
                source: sanitizeSceneRunText(item && item.source, 40),
                op: sanitizeSceneRunText(item && item.op, 40),
                matched: !!(item && item.matched),
                reason: sanitizeSceneRunText(item && item.reason, 80)
            };
        })
    };
}

function ensureSceneSettings(settings) {
    settings = settings || (typeof state !== 'undefined' ? state.settings : null);
    if (!settings || typeof settings !== 'object') return settings;
    if (!Array.isArray(settings.scenePackages)) settings.scenePackages = [];
    var usedIds = Object.create(null);
    settings.scenePackages = settings.scenePackages.slice(0, SCENE_MAX_PACKAGES).map(function(pkg, index) {
        return normalizeScenePackage(pkg, index, usedIds);
    }).filter(Boolean);
    settings.scenePackages.forEach(function(pkg, index) { pkg.order = index; });
    if (!settings.scenePackageGrants || typeof settings.scenePackageGrants !== 'object' || Array.isArray(settings.scenePackageGrants)) {
        settings.scenePackageGrants = {};
    }
    var packagesById = Object.create(null);
    settings.scenePackages.forEach(function(pkg) { packagesById[pkg.id] = pkg; });
    Object.keys(settings.scenePackageGrants).forEach(function(packageId) {
        var grant = settings.scenePackageGrants[packageId];
        var pkg = packagesById[packageId];
        if (!pkg || pkg.invalid === true || !grant || typeof grant !== 'object' ||
            Number(grant.revision) !== pkg.revision || typeof grant.fingerprint !== 'string' ||
            grant.fingerprint !== scenePackageFingerprint(pkg)) delete settings.scenePackageGrants[packageId];
    });
    if (!Array.isArray(settings.sceneRecentRuns)) settings.sceneRecentRuns = [];
    settings.sceneRecentRuns = settings.sceneRecentRuns.slice(0, SCENE_MAX_RECENT_RUNS).map(sanitizeSceneRunEntry);
    return settings;
}

function getScenePackages() {
    ensureSceneSettings();
    return (state.settings.scenePackages || []).slice().sort(function(a, b) { return a.order - b.order; });
}

function getScenePackageById(id, conv) {
    ensureSceneSettings();
    var pkg = (state.settings.scenePackages || []).find(function(item) { return item.id === id; }) || null;
    if (!pkg && typeof getContentModuleScenePackageById === 'function') {
        pkg = getContentModuleScenePackageById(id, conv);
    }
    return pkg;
}

function getSceneEventById(pkg, eventId) {
    return pkg && Array.isArray(pkg.events) ? pkg.events.find(function(event) { return event.id === eventId; }) || null : null;
}

function scenePackageMatchesConversation(pkg, conv) {
    if (!pkg || pkg.enabled === false) return false;
    if (pkg.scope === 'global') return true;
    if (!conv) return false;
    if (pkg.scope === 'conversation') return pkg.targetId === conv.id;
    return automationTargetNames(conv).indexOf(String(pkg.targetId || '').toLowerCase()) >= 0;
}

function getScenePackageGrant(packageId) {
    ensureSceneSettings();
    if (typeof isContentModuleSceneId === 'function' &&
        isContentModuleSceneId(packageId) &&
        typeof getContentModuleSceneGrant === 'function') {
        return getContentModuleSceneGrant(packageId);
    }
    var grant = state.settings.scenePackageGrants[packageId];
    if (!grant || typeof grant !== 'object') return null;
    return {
        revision: Number.isInteger(Number(grant.revision)) ? Number(grant.revision) : -1,
        fingerprint: typeof grant.fingerprint === 'string' ? grant.fingerprint : ''
    };
}

function isScenePackageAuthorized(pkg) {
    if (!pkg || pkg.invalid === true) return false;
    var grant = getScenePackageGrant(pkg.id);
    var fingerprint = scenePackageFingerprint(pkg);
    return !!grant && !!fingerprint && grant.revision === pkg.revision && grant.fingerprint === fingerprint;
}

function validateScenePackage(pkg) {
    if (!scenePlainRecord(pkg) || pkg.invalid === true) throw new Error(t('scene_invalid_package'));
    if (!String(pkg.name || '').trim()) throw new Error(t('scene_name_required'));
    if (SCENE_SCOPES.indexOf(pkg.scope) < 0) throw new Error(t('scene_scope_required'));
    if (pkg.scope !== 'global' && !String(pkg.targetId || '').trim()) throw new Error(t('scene_target_required'));
    if (!Array.isArray(pkg.events) || pkg.events.length > SCENE_MAX_EVENTS) throw new Error(t('scene_events_invalid'));
    pkg.events.forEach(function(event) {
        if (event.invalid === true) throw new Error(t('scene_event_invalid'));
        if (!String(event.name || '').trim()) throw new Error(t('scene_event_name_required'));
        if (SCENE_TRIGGERS.indexOf(event.trigger) < 0) throw new Error(t('scene_event_trigger_invalid'));
        if (!String(event.text || '').trim() || String(event.text).length > SCENE_MAX_TEXT) throw new Error(t('scene_event_text_required'));
        if (!Array.isArray(event.conditions) || !Array.isArray(event.mvu)) throw new Error(t('scene_event_invalid'));
        if (event.conditions.length > SCENE_MAX_CONDITIONS) throw new Error(t('scene_conditions_invalid'));
        if (event.mvu.length > SCENE_MAX_MVU_CHANGES) throw new Error(t('scene_mvu_invalid'));
        event.conditions.forEach(function(condition) {
            if (!sceneConditionInputValid(condition)) throw new Error(t('scene_conditions_invalid'));
        });
        event.mvu.forEach(function(change) {
            if (!sceneMvuChangeInputValid(change)) throw new Error(t('scene_mvu_invalid'));
            try { validateAutomationPath(change.path); } catch (error) { throw new Error(t('scene_mvu_invalid')); }
        });
    });
    return pkg;
}

function getScenePackagesSnapshot() {
    ensureSceneSettings();
    return JSON.stringify({
        packages: state.settings.scenePackages,
        grants: state.settings.scenePackageGrants
    });
}

async function saveScenePackagesChange(mutator, options) {
    options = options || {};
    if (failedSceneDraft) throw new Error(t('scene_draft_pending'));
    var root = state.settings;
    var candidate = JSON.parse(JSON.stringify(state.settings));
    ensureSceneSettings(candidate);
    mutator(candidate);
    if (Array.isArray(candidate.scenePackages) && candidate.scenePackages.length > SCENE_MAX_PACKAGES) throw new Error(t('scene_package_limit'));
    candidate.scenePackages.forEach(function(pkg) {
        if (pkg && Array.isArray(pkg.events) && pkg.events.length > SCENE_MAX_EVENTS) throw new Error(t('scene_events_invalid'));
    });
    ensureSceneSettings(candidate);
    candidate.scenePackages.forEach(function(pkg) {
        if (pkg.invalid === true && pkg.enabled !== true) return;
        validateScenePackage(pkg);
    });
    var baseline = options.baseline || getScenePackagesSnapshot();
    function check() {
        if (state.settings !== root) throw new Error(t('scene_settings_replaced'));
        if (getScenePackagesSnapshot() !== baseline) throw new Error(t('scene_settings_changed'));
    }
    try {
        check();
        await persistState(true, {
            throwOnError: true,
            beforePersist: check,
            transformSnapshot: function(snapshot) {
                snapshot.settings.scenePackages = JSON.parse(JSON.stringify(candidate.scenePackages));
                snapshot.settings.scenePackageGrants = JSON.parse(JSON.stringify(candidate.scenePackageGrants));
                return snapshot;
            },
            onPersistSuccess: function() {
                check();
                state.settings.scenePackages = JSON.parse(JSON.stringify(candidate.scenePackages));
                state.settings.scenePackageGrants = JSON.parse(JSON.stringify(candidate.scenePackageGrants));
            },
            commitPendingSnapshot: function(snapshot) {
                if (getScenePackagesSnapshot() === baseline) {
                    snapshot.settings.scenePackages = JSON.parse(JSON.stringify(candidate.scenePackages));
                    snapshot.settings.scenePackageGrants = JSON.parse(JSON.stringify(candidate.scenePackageGrants));
                }
            }
        });
        failedSceneDraft = null;
        appStore.notify('settings');
        return true;
    } catch (error) {
        failedSceneDraft = { candidate: candidate, root: root, baseline: baseline };
        throw error;
    }
}

function setScenePackageGrant(settings, packageId, revision, authorized) {
    if (!settings || typeof settings !== 'object') return;
    if (!settings.scenePackageGrants || typeof settings.scenePackageGrants !== 'object') settings.scenePackageGrants = {};
    var pkg = (settings.scenePackages || []).find(function(item) { return item.id === packageId; });
    if (!pkg || pkg.invalid === true || authorized !== true) { delete settings.scenePackageGrants[packageId]; return; }
    settings.scenePackageGrants[packageId] = {
        revision: revision === undefined ? pkg.revision : Number(revision),
        fingerprint: scenePackageFingerprint(pkg)
    };
}

function bumpScenePackageRevision(pkg) {
    pkg.revision = (Number(pkg.revision) || 0) + 1;
    return pkg.revision;
}

function cloneScenePackageForCopy(pkg) {
    var copy = JSON.parse(JSON.stringify(pkg));
    copy.id = makeId();
    copy.revision = 0;
    copy.name = (pkg.name || t('scene_unnamed_package')) + ' ' + t('scene_copy_suffix');
    copy.enabled = false;
    copy.order = (state.settings.scenePackages || []).length;
    copy.events = copy.events.map(function(event) { event.id = makeId(); return event; });
    return copy;
}

function importScenePackagesData(raw) {
    var packages = Array.isArray(raw) ? raw : raw && raw.type === 'opentavern-scene-packages' ? raw.packages : null;
    if (!Array.isArray(packages) || !packages.length || packages.length > SCENE_MAX_PACKAGES) throw new Error(t('scene_import_invalid'));
    var normalized = packages.map(function(rawPackage, index) {
        var copy = JSON.parse(JSON.stringify(rawPackage));
        if (!sceneOnlyKeys(copy, SCENE_PACKAGE_KEYS) || !Array.isArray(copy.events) || copy.events.length > SCENE_MAX_EVENTS) throw new Error(t('scene_import_invalid'));
        copy.events.forEach(function(event) {
            if (!sceneOnlyKeys(event, SCENE_EVENT_KEYS) || !Array.isArray(event.conditions) || event.conditions.length > SCENE_MAX_CONDITIONS ||
                !Array.isArray(event.mvu) || event.mvu.length > SCENE_MAX_MVU_CHANGES) throw new Error(t('scene_import_invalid'));
            event.conditions.forEach(function(condition) {
                if (!sceneOnlyKeys(condition, SCENE_CONDITION_KEYS) || !sceneConditionInputValid(condition)) throw new Error(t('scene_import_invalid'));
            });
            event.mvu.forEach(function(change) {
                if (!sceneOnlyKeys(change, SCENE_MVU_CHANGE_KEYS) || !sceneMvuChangeInputValid(change)) throw new Error(t('scene_import_invalid'));
            });
        });
        if (!scenePackageInputValid(copy)) throw new Error(t('scene_import_invalid'));
        copy.id = makeId();
        copy.revision = 0;
        copy.enabled = false;
        copy.order = index;
        copy.events.forEach(function(event, eventIndex) {
            event.id = makeId();
            event.revision = 0;
            event.order = eventIndex;
        });
        var usedEventIds = Object.create(null);
        var normalizedEvents = copy.events.map(function(event, eventIndex) {
            return normalizeSceneEvent(event, eventIndex, usedEventIds);
        });
        if (normalizedEvents.some(function(event) { return !event || event.invalid === true; })) throw new Error(t('scene_import_invalid'));
        var packageCopy = normalizeScenePackage(Object.assign({}, copy, { events: normalizedEvents }), index, Object.create(null));
        if (!packageCopy || packageCopy.invalid === true) throw new Error(t('scene_import_invalid'));
        packageCopy.enabled = false;
        packageCopy.grants = undefined;
        validateScenePackage(packageCopy);
        return packageCopy;
    });
    return normalized;
}

function exportScenePackagesData() {
    return {
        type: 'opentavern-scene-packages',
        version: 1,
        packages: getScenePackages().map(function(pkg) {
            return JSON.parse(JSON.stringify(pkg));
        })
    };
}
