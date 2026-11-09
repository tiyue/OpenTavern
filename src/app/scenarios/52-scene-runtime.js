/**
 * 新手导读（文件：52-scene-runtime.js）
 *
 * 负责什么：剧情事件的运行时——复用 11 的真实事件、条件、忙碌与取消语义，按稳定顺序执行场景事件，
 * 把剧情正文、MVU 变更和一次性记录写入同一个可靠会话候选，并提供纯回放进度、失败重试和无副作用预演。
 * 在程序中的位置：定义在 32-scene-packages.js，界面在 68-scene-ui.js；
 * `dispatchAutomationEvent` 在普通规则为空时也会调用 `runSceneDispatchEvent`。
 * 从哪里开始看：`runSceneDispatchEvent(eventName, conv, payload, options)`、`getSceneProgress(conv)`、
 * `runSceneExplicitOpening(conv)`、`cancelSceneRuntime(reason, conversationId)`。
 * 修改时注意：进度只来自可校验的场景消息记录；运行队列不持久化，启动/刷新/导入/预演不得重放剧情。
 */
// ==================== Scene Runtime ====================
var SCENE_MAX_STEPS_PER_DISPATCH = 10;
var SCENE_MAX_CHAIN_DEPTH = 2;
var sceneRuntimeEpoch = 0;
var sceneRunSequence = 0;
var sceneDispatchQueues = Object.create(null);
var sceneFailedExecutions = Object.create(null);
var sceneRunPersistTimer = null;
var sceneActivityBaselines = Object.create(null);
var sceneOpeningBatches = Object.create(null);
var SCENE_ACTIVITY_BASELINE_TTL_MS = 120000;
var SCENE_OPENING_SOURCE_PREFIX = 'scene-opening-source:';

function sceneCanonicalJson(value) {
    return JSON.stringify(value, function(_key, current) {
        if (!current || typeof current !== 'object' || Array.isArray(current)) return current;
        var sorted = Object.create(null);
        Object.keys(current).sort().forEach(function(key) { sorted[key] = current[key]; });
        return sorted;
    });
}

function sceneOpeningSourceId(conv) {
    return SCENE_OPENING_SOURCE_PREFIX + 'conversation';
}

function buildSceneOpeningSource(conv) {
    return { id: sceneOpeningSourceId(conv), role: 'opening', content: '', sceneOpening: true };
}

// 有效版本身份：未物化的原始用户/助手版本与之后补齐的同一版本等价，
// 真正切换到其他版本（即使正文相同）仍按版本 ID 或手动状态区分。
function sceneUserVersionIdentity(message) {
    if (!message || message.role !== 'user') return '';
    if (typeof getUserMessageVersionState === 'function') {
        try { return 'u:' + String(getUserMessageVersionState(message).current.id || ''); } catch (error) {}
    }
    return 'u:' + String(message.selectedUserVersionId || '');
}

function sceneResponseVersionIdentity(message) {
    if (!message || message.role !== 'assistant') return '';
    // 未物化的原始回复使用 base:<消息ID>；物化同一版本沿用该身份（base ID 已被旧历史占用时也保持等价），
    // 切换到其他版本才换身份。
    var selected = Array.isArray(message.responseVersions) && message.selectedResponseVersionId ?
        message.responseVersions.find(function(version) {
            return version && version.id === message.selectedResponseVersionId;
        }) : null;
    if (selected && selected.baseIdentity === true) return 'r:base:' + String(message.id || '');
    return 'r:' + String(message.selectedResponseVersionId || 'base:' + String(message.id || ''));
}

function sceneSelectedResponseDigest(message) {
    if (!message || !Array.isArray(message.responseVersions)) return '';
    var selected = message.responseVersions.find(function(version) {
        return version && version.id === message.selectedResponseVersionId && version.message && typeof version.message === 'object';
    });
    if (!selected) return '';
    var versionManual = selected.message.mvuManualData ? fingerprintMessageText(sceneCanonicalJson(selected.message.mvuManualData)) : '';
    var liveManual = message.mvuManualData ? fingerprintMessageText(sceneCanonicalJson(message.mvuManualData)) : '';
    // 物化的原始版本与当前正文/手动状态一致时等价于未物化来源。
    if (getMessageRevision(selected.message) === getMessageRevision(message) && versionManual === liveManual) return '';
    return fingerprintMessageText(sceneCanonicalJson([
        getMessageRevision(selected.message), versionManual, String(selected.message.mvuManualVersionId || '')
    ]));
}

// 有效人工状态版本身份：只有经真实版本与手动状态确认的绑定，才把物化前后的同一来源视为等价；
// 任意 baseIdentity 标记、未确认或错误的 manual 绑定仍按原值区分。
function sceneEffectiveManualVersionId(message) {
    var raw = String(message && message.mvuManualVersionId || '');
    if (!message || !message.mvuManualData) return raw;
    if (typeof getMvuMessageVersionId !== 'function' || message.mvuManualVersionId !== getMvuMessageVersionId(message)) return raw;
    if (message.selectedResponseVersionId) {
        var selected = Array.isArray(message.responseVersions) ? message.responseVersions.find(function(version) {
            return version && version.id === message.selectedResponseVersionId && version.message && typeof version.message === 'object' &&
                getMessageRevision(version.message) === getMessageRevision(message);
        }) : null;
        if (!selected || typeof mvuResponseVersionMatches !== 'function' || !mvuResponseVersionMatches(message, selected)) return raw;
    }
    if (typeof validateMvuData === 'function' && !validateMvuData(message.mvuManualData).valid) return raw;
    return sceneResponseVersionIdentity(message) || raw;
}

// 历史来源标识：真实消息包含正文修订、选中用户/助手版本和影响 MVU 的人工状态；
// 开场使用可校验的会话初始来源，而不是伪造用户消息。
function getSceneSourceStamp(conv, source) {
    if (!source) return '';
    if (source.sceneOpening === true) {
        return 'o1:' + fingerprintMessageText(JSON.stringify([
            'opening', normalizeConversationActivityTimestamp(conv && conv.created)
        ]));
    }
    return 'm2:' + fingerprintMessageText(JSON.stringify([
        String(source.id || ''),
        getMessageRevision(source),
        sceneResponseVersionIdentity(source),
        sceneUserVersionIdentity(source),
        sceneEffectiveManualVersionId(source),
        source.mvuManualSwipeId == null ? null : source.mvuManualSwipeId,
        source.mvuManualData ? fingerprintMessageText(sceneCanonicalJson(source.mvuManualData)) : '',
        sceneSelectedResponseDigest(source)
    ]));
}

function sceneMessageDigestFields(message) {
    if (!message || typeof message !== 'object') return '';
    var sceneStage = message.stage === 'scene';
    return JSON.stringify([
        String(message.id || ''),
        String(message.role || ''),
        String(message.stage || ''),
        getMessageRevision(message),
        // 场景消息的版本簿记不改变历史状态；正文、手动快照和记录校验和已覆盖真实语义。
        sceneStage ? '' : sceneResponseVersionIdentity(message),
        sceneUserVersionIdentity(message),
        sceneStage ? '' : sceneEffectiveManualVersionId(message),
        message.mvuManualData ? fingerprintMessageText(sceneCanonicalJson(message.mvuManualData)) : '',
        sceneStage && message.sceneEvent ? String(message.sceneEvent.integrity || '') : ''
    ]);
}

function scenePrefixDigest(conv, count) {
    var messages = conv && Array.isArray(conv.messages) ? conv.messages : [];
    var digest = 'p1';
    for (var index = 0; index < count && index < messages.length; index++) {
        digest = fingerprintMessageText(digest + '\n' + sceneMessageDigestFields(messages[index]));
    }
    return digest;
}

// 来源前缀条数：普通消息为含来源消息在内的条数，开场来源为执行时的完整会话长度。
function sceneSourcePrefixCount(conv, source) {
    if (!source || !conv || !Array.isArray(conv.messages)) return 0;
    if (source.sceneOpening === true) return conv.messages.length;
    var index = conv.messages.findIndex(function(message) { return message && message.id === source.id; });
    return index >= 0 ? index + 1 : 0;
}

function buildScenePrefixIndex(conv) {
    var messages = conv && Array.isArray(conv.messages) ? conv.messages : [];
    var index = Object.create(null);
    if (!messages.some(function(message) { return message && message.stage === 'scene'; })) return index;
    var digest = 'p1';
    for (var position = 0; position < messages.length; position++) {
        digest = fingerprintMessageText(digest + '\n' + sceneMessageDigestFields(messages[position]));
        var message = messages[position];
        if (message && typeof message.id === 'string') index[message.id] = { digest: digest, count: position + 1 };
    }
    return index;
}

function createSceneRunId() {
    sceneRunSequence += 1;
    return 'scene-run-' + Date.now().toString(36) + '-' + sceneRunSequence.toString(36);
}

function sceneRunDetail(value) {
    return String(value == null ? '' : value).slice(0, SCENE_MAX_RUN_DETAIL);
}

function sceneRecordDigest(record, text) {
    return 's2:' + fingerprintMessageText(JSON.stringify([
        Number(record.version) || 0,
        String(record.packageId || ''),
        Number(record.packageRevision) || 0,
        String(record.eventId || ''),
        Number(record.eventRevision) || 0,
        String(record.packageName || ''),
        String(record.eventName || ''),
        String(record.trigger || ''),
        record.once === true ? '1' : '0',
        String(record.fingerprint || ''),
        String(record.sourceKind || 'message'),
        String(record.sourceMessageId || ''),
        String(record.sourceRevision || ''),
        Number(record.sourcePrefixCount) || 0,
        String(record.sourcePrefixDigest || ''),
        String(record.mvuBaseDigest || ''),
        Number(record.order) || 0,
        String(text == null ? '' : text),
        (Array.isArray(record.mvuChanges) ? record.mvuChanges : []).map(function(change) {
            return [String(change.path || ''), String(change.valueType || ''), String(change.value == null ? '' : change.value)];
        })
    ]));
}

function sceneMvuChangeRecordValid(change) {
    return !!change && typeof change === 'object' && !Array.isArray(change) &&
        sceneBoundedText(change.path, SCENE_MAX_PATH) && scenePathIsSafe(change.path) && AUTOMATION_VALUE_TYPES.indexOf(String(change.valueType || '')) >= 0 &&
        (typeof change.value === 'string' || typeof change.value === 'number' || typeof change.value === 'boolean');
}

function scenePathIsSafe(path) {
    try { validateAutomationPath(path); return true; } catch (error) { return false; }
}

// 纯回放校验：正文、来源消息前缀/版本、一次性/可重复记录和变量状态必须同时有效。
// allowOpeningReanchor 只给分支/恢复重新锚定开场来源时使用：开场来源本身即将被改写，其余来源仍严格校验。
function sceneRecordSourceValid(conv, record, prefixIndex, options) {
    var messages = conv && Array.isArray(conv.messages) ? conv.messages : [];
    var count = Number(record.sourcePrefixCount);
    if (!Number.isInteger(count) || count < 0 || count > messages.length) return false;
    var digest;
    if (record.sourceKind === 'opening') {
        if (record.sourceMessageId !== sceneOpeningSourceId(conv)) return false;
        if (!(options && options.allowOpeningReanchor === true) && record.sourceRevision !== getSceneSourceStamp(conv, buildSceneOpeningSource(conv))) return false;
        digest = scenePrefixDigest(conv, count);
    } else {
        var source = count > 0 ? messages[count - 1] : null;
        if (!source || source.id !== record.sourceMessageId || source.stage === 'scene' || source.role === 'scene') return false;
        if (getSceneSourceStamp(conv, source) !== record.sourceRevision) return false;
        var entry = prefixIndex && prefixIndex[record.sourceMessageId];
        if (entry && entry.count === count) digest = entry.digest;
        else digest = scenePrefixDigest(conv, count);
    }
    return digest === record.sourcePrefixDigest;
}

function isSceneMessageRecordValid(conv, message, prefixIndex, options) {
    if (!conv || !message || typeof message !== 'object' || message.role !== 'assistant' || message.stage !== 'scene') return false;
    if (!sceneBoundedText(message.content, SCENE_MAX_TEXT)) return false;
    var record = message.sceneEvent;
    if (!scenePlainRecord(record) || Number(record.version) !== SCENE_RECORD_VERSION) return false;
    if (!sceneBoundedText(record.packageId, SCENE_MAX_TARGET) || !sceneBoundedText(record.eventId, SCENE_MAX_TARGET)) return false;
    if (record.sourceKind !== 'opening' && record.sourceKind !== 'message') return false;
    if (!sceneBoundedText(record.sourceMessageId, SCENE_MAX_TARGET) || !sceneBoundedText(record.sourceRevision, 200)) return false;
    if (!sceneBoundedText(record.sourcePrefixDigest, 120) || (record.mvuBaseDigest && !sceneBoundedText(record.mvuBaseDigest, 120))) return false;
    if (SCENE_TRIGGERS.indexOf(String(record.trigger || '')) < 0 || typeof record.once !== 'boolean') return false;
    if (!sceneBoundedText(record.fingerprint, SCENE_MAX_FINGERPRINT, true) || !sceneBoundedText(record.packageName, SCENE_MAX_NAME) || !sceneBoundedText(record.eventName, SCENE_MAX_NAME)) return false;
    if (!Array.isArray(record.mvuChanges) || record.mvuChanges.length > SCENE_MAX_MVU_CHANGES) return false;
    if (!record.mvuChanges.every(sceneMvuChangeRecordValid)) return false;
    if (typeof record.integrity !== 'string' || record.integrity !== sceneRecordDigest(record, message.content)) return false;
    if (!sceneRecordSourceValid(conv, record, prefixIndex, options)) return false;
    if (record.mvuChanges.length) {
        if (!message.mvuManualData) return false;
        var checked = validateMvuData(message.mvuManualData);
        if (!checked.valid) return false;
        if (message.mvuManualVersionId !== getMvuMessageVersionId(message)) return false;
    }
    return true;
}

function getSceneProgress(conv) {
    var entries = [];
    var prefixIndex = buildScenePrefixIndex(conv);
    (conv && Array.isArray(conv.messages) ? conv.messages : []).forEach(function(message, index) {
        if (!isSceneMessageRecordValid(conv, message, prefixIndex)) return;
        entries.push({
            messageId: message.id,
            messageIndex: index,
            text: message.content,
            at: Number(message.sceneEvent.at) || 0,
            packageId: message.sceneEvent.packageId,
            packageName: message.sceneEvent.packageName,
            eventId: message.sceneEvent.eventId,
            eventName: message.sceneEvent.eventName,
            trigger: message.sceneEvent.trigger,
            once: message.sceneEvent.once,
            sourceMessageId: message.sceneEvent.sourceMessageId,
            mvuChanges: JSON.parse(JSON.stringify(message.sceneEvent.mvuChanges || []))
        });
    });
    return entries;
}

function clearSceneMessageRecord(message) {
    if (message) delete message.sceneEvent;
    return message;
}

function sceneValidRecordForSource(conv, packageId, eventId, sourceMessageId) {
    var prefixIndex = buildScenePrefixIndex(conv);
    return (conv && Array.isArray(conv.messages) ? conv.messages : []).some(function(message) {
        return isSceneMessageRecordValid(conv, message, prefixIndex) && message.sceneEvent.packageId === packageId &&
            message.sceneEvent.eventId === eventId && message.sceneEvent.sourceMessageId === sourceMessageId;
    });
}

function sceneOnceTriggered(conv, packageId, eventId) {
    var prefixIndex = buildScenePrefixIndex(conv);
    return (conv && Array.isArray(conv.messages) ? conv.messages : []).some(function(message) {
        return isSceneMessageRecordValid(conv, message, prefixIndex) && message.sceneEvent.packageId === packageId &&
            message.sceneEvent.eventId === eventId;
    });
}

function getSceneLastActivityTimestamp(conv, sourceMessageId) {
    var latest = 0;
    (conv && Array.isArray(conv.messages) ? conv.messages : []).forEach(function(message) {
        if (!message || message.id === sourceMessageId || message.stage === 'scene') return;
        latest = Math.max(latest, getMessageActivityTimestamp(message));
    });
    // 普通保存只更新 conv.updated，消息本身可能没有时间戳；真正未知时返回 0，不拿创建时间猜测。
    latest = Math.max(latest, normalizeConversationActivityTimestamp(conv && conv.updated));
    return latest;
}

function getSceneAwayMinutes(conv, sourceMessageId, activityBaseline) {
    var latest = Number(activityBaseline);
    if (!Number.isFinite(latest) || latest <= 0) latest = getSceneLastActivityTimestamp(conv, sourceMessageId);
    if (!latest) return 0;
    return Math.max(0, Math.floor((Date.now() - latest) / 60000));
}

function captureSceneActivityBaseline(conv) {
    if (!conv || !conv.id) return;
    sceneActivityBaselines[conv.id] = { at: Date.now(), baseline: getSceneLastActivityTimestamp(conv, '') };
}

function takeSceneActivityBaseline(conv) {
    if (!conv || !conv.id) return null;
    var entry = sceneActivityBaselines[conv.id];
    if (!entry) return null;
    delete sceneActivityBaselines[conv.id];
    if (Date.now() - entry.at > SCENE_ACTIVITY_BASELINE_TTL_MS) return null;
    return entry.baseline;
}

function getSceneMvuContextData(conv) {
    try { return getMvuDataForMessage(conv, null); }
    catch (error) { return typeof getMvuInitialData === 'function' ? getMvuInitialData(conv) : {}; }
}

function buildSceneEventContext(conv, trigger, payload) {
    payload = payload || {};
    if (typeof payload.getMvuData !== 'function') {
        payload = Object.assign({}, payload, { getMvuData: function() { return getSceneMvuContextData(conv); } });
    }
    var context = buildAutomationEventContext(conv, trigger, payload);
    context.awayMinutes = getSceneAwayMinutes(conv, payload.messageId, payload.activityBaseline);
    return context;
}

function evaluateSceneConditions(conditions, context) {
    var reasons = (conditions || []).map(function(condition) {
        if (condition.source !== 'away-minutes') return evaluateAutomationCondition(condition, context);
        var matched = automationCompareValues({ exists: true, value: Number(context.awayMinutes) }, condition.op, condition.value, 'number');
        return { id: condition.id, source: condition.source, op: condition.op, matched: matched, reason: matched ? 'matched' : 'not-matched' };
    });
    return { matched: reasons.every(function(item) { return item.matched; }), reasons: reasons };
}

function persistSceneRunsThrottled() {
    if (sceneRunPersistTimer) return;
    sceneRunPersistTimer = setTimeout(function() {
        sceneRunPersistTimer = null;
        try {
            Promise.resolve(persistState()).catch(function(error) {
                if (typeof reportPersistPostSaveError === 'function') reportPersistPostSaveError('scene run records', error);
            });
        } catch (error) {
            if (typeof reportPersistPostSaveError === 'function') reportPersistPostSaveError('scene run records', error);
        }
    }, 400);
}

function recordSceneRun(entry) {
    ensureSceneSettings();
    if (!Array.isArray(state.settings.sceneRecentRuns)) state.settings.sceneRecentRuns = [];
    state.settings.sceneRecentRuns.unshift(sanitizeSceneRunEntry(entry));
    if (state.settings.sceneRecentRuns.length > SCENE_MAX_RECENT_RUNS) state.settings.sceneRecentRuns.length = SCENE_MAX_RECENT_RUNS;
    persistSceneRunsThrottled();
}

function getSceneRecentRuns() {
    ensureSceneSettings();
    return (state.settings.sceneRecentRuns || []).map(function(entry) { return sanitizeSceneRunEntry(entry); });
}

function clearSceneFailure(conversationId) {
    if (conversationId) delete sceneFailedExecutions[conversationId];
    else sceneFailedExecutions = Object.create(null);
}

function getSceneFailure(conversationId) {
    return sceneFailedExecutions[conversationId] || null;
}

function sceneFailureRecord(entry) {
    if (!entry || !entry.conversationId) return;
    sceneFailedExecutions[entry.conversationId] = {
        conversationId: entry.conversationId,
        packageId: entry.packageId,
        packageRevision: Number(entry.packageRevision) || 0,
        eventId: entry.eventId,
        eventRevision: Number(entry.eventRevision) || 0,
        eventFingerprint: String(entry.eventFingerprint || ''),
        trigger: entry.trigger,
        sourceKind: entry.sourceKind === 'opening' ? 'opening' : 'message',
        sourceMessageId: entry.sourceMessageId,
        sourceRevision: entry.sourceRevision == null ? null : String(entry.sourceRevision),
        sourcePrefixCount: Number(entry.sourcePrefixCount) || 0,
        sourcePrefixDigest: String(entry.sourcePrefixDigest || ''),
        activityBaseline: Number(entry.activityBaseline) || 0,
        detail: sceneRunDetail(entry.detail),
        at: Date.now()
    };
}

function sceneDefinitionStillExecutable(pkg, event, conv) {
    var current = getScenePackageById(pkg.id, conv);
    var currentEvent = getSceneEventById(current, event.id);
    return !!(current && current.enabled && current.invalid !== true && current.revision === pkg.revision &&
        currentEvent && currentEvent.invalid !== true && sceneEventFingerprint(currentEvent) === sceneEventFingerprint(event) &&
        isScenePackageAuthorized(current));
}

function sceneSourceStillCurrent(conv, payload) {
    if (payload && payload.sceneOpening === true) return isLiveConversation(conv);
    if (!payload || !payload.messageId) return false;
    var source = (conv.messages || []).find(function(message) { return message.id === payload.messageId; });
    return !!source && (payload.messageRevision == null || getMessageRevision(source) === payload.messageRevision);
}

// 重试只能复用失败候选的真实来源前缀：后续消息追加不改变来源之前的前缀，早先历史/来源版本变化必须拒绝。
function sceneSourceBaselineIntact(conv, source, baseline) {
    if (!baseline) return true;
    var count = sceneSourcePrefixCount(conv, source);
    return count === Number(baseline.count) && scenePrefixDigest(conv, count) === baseline.digest;
}

function sceneFirstUserMessageId(conv) {
    var first = (conv && Array.isArray(conv.messages) ? conv.messages : []).find(function(message) { return message.role === 'user'; });
    return first ? first.id : '';
}

function buildSceneMessage(pkg, event, conv, trigger, source, mvuChanges, mvuData) {
    var narrator = t('scene_narrator');
    var groupSpeaker = null;
    if (conv && conv.group) {
        var lastAssistant = (conv.messages || []).slice().reverse().find(function(message) {
            return message && message.role === 'assistant' && message.stage !== 'scene' && message.speaker;
        });
        if (lastAssistant) groupSpeaker = lastAssistant.speaker;
    }
    var openingSource = !!(source && source.sceneOpening === true);
    var sourceCount = sceneSourcePrefixCount(conv, source);
    var mvuBaseDigest = '';
    if (mvuChanges.length && typeof getMvuDataForMessage === 'function') {
        try { mvuBaseDigest = 'b1:' + fingerprintMessageText(sceneCanonicalJson(getMvuDataForMessage(conv, null))); }
        catch (error) { mvuBaseDigest = ''; }
    }
    var message = {
        id: makeId(),
        role: 'assistant',
        stage: 'scene',
        speaker: groupSpeaker || narrator,
        content: event.text,
        sceneEvent: {
            version: SCENE_RECORD_VERSION,
            packageId: pkg.id,
            packageRevision: pkg.revision,
            packageName: pkg.name,
            eventId: event.id,
            eventRevision: event.revision,
            eventName: event.name,
            trigger: trigger,
            once: event.once === true,
            fingerprint: sceneEventFingerprint(event),
            sourceKind: openingSource ? 'opening' : 'message',
            sourceMessageId: source.id,
            sourceRevision: getSceneSourceStamp(conv, source),
            sourcePrefixCount: sourceCount,
            sourcePrefixDigest: scenePrefixDigest(conv, sourceCount),
            mvuBaseDigest: mvuBaseDigest,
            order: event.order,
            at: Date.now(),
            mvuChanges: mvuChanges.map(function(change) {
                return { path: change.path, valueType: change.valueType, value: change.value };
            })
        }
    };
    if (mvuChanges.length) {
        message.mvuManualData = cloneMvuRuntimeValue(mvuData);
        message.mvuManualVersionId = getMvuMessageVersionId(message);
    }
    message.sceneEvent.integrity = sceneRecordDigest(message.sceneEvent, message.content);
    message.revision = getMessageRevision(message);
    return message;
}

function applySceneMvuChanges(conv, changes) {
    var data = JSON.parse(JSON.stringify(getMvuDataForMessage(conv, null)));
    changes.forEach(function(change) {
        data = writeAutomationMvuValue(data, change.path, parseAutomationActionValue(change));
    });
    var checked = validateMvuData(data);
    if (!checked.valid) throw new Error(checked.diagnostics.map(function(item) { return item.message; }).join('；') || t('scene_mvu_invalid'));
    return checked.data;
}

async function persistSceneMessage(conv, pkg, event, trigger, source, changes, mvuData, epoch, sourceBaseline) {
    var message = buildSceneMessage(pkg, event, conv, trigger, source, changes, mvuData);
    var sourceReference = source && source.sceneOpening === true
        ? { sceneOpening: true, messageId: source.id }
        : { messageId: source.id, messageRevision: getMessageRevision(source) };
    function stillPermitted() {
        if (epoch !== sceneRuntimeEpoch || !isLiveConversation(conv) || getActiveConv() !== conv) return false;
        if (!sceneSourceBaselineIntact(conv, source, sourceBaseline)) return false;
        return sceneDefinitionStillExecutable(pkg, event, conv) && sceneSourceStillCurrent(conv, sourceReference);
    }
    await persistConversationMessageMutation(conv, function(candidate) {
        candidate.messages.push(message);
        return message;
    }, { validate: stillPermitted });
    if (!isLiveConversation(conv) || !conv.messages.some(function(item) { return item.id === message.id; })) throw new Error(t('scene_target_changed'));
    return message;
}

async function executeSceneEvent(pkg, event, conv, trigger, payload, options) {
    options = options || {};
    var executionEpoch = options.epoch == null ? sceneRuntimeEpoch : Number(options.epoch);
    var openingSource = !!(payload && payload.sceneOpening === true);
    var source = openingSource
        ? buildSceneOpeningSource(conv)
        : (conv && Array.isArray(conv.messages) ? conv.messages.find(function(message) { return message.id === (payload && payload.messageId); }) : null);
    var run = {
        id: createSceneRunId(), at: Date.now(), conversationId: conv && conv.id || '',
        packageId: pkg.id, packageName: pkg.name, packageRevision: pkg.revision,
        eventId: event.id, eventName: event.name, eventRevision: event.revision, eventFingerprint: sceneEventFingerprint(event),
        trigger: trigger, sourceKind: openingSource ? 'opening' : 'message', sourceMessageId: source ? source.id : '',
        sourceRevision: source ? getSceneSourceStamp(conv, source) : null,
        sourcePrefixCount: 0, sourcePrefixDigest: '',
        activityBaseline: payload && payload.activityBaseline,
        status: 'skipped', detail: '', conditions: []
    };
    if (!conv || !isLiveConversation(conv)) { run.detail = t('scene_target_changed'); return { run: run, matched: false }; }
    if (!pkg || pkg.invalid === true || !pkg.enabled || !scenePackageMatchesConversation(pkg, conv)) { run.detail = t('scene_not_bound'); return { run: run, matched: false }; }
    if (!isScenePackageAuthorized(pkg)) { run.detail = t('scene_not_authorized'); if (options.recordSkips) recordSceneRun(run); return { run: run, matched: false }; }
    if (!source || source.stage === 'scene') { run.detail = t('scene_target_changed'); if (options.recordSkips) recordSceneRun(run); return { run: run, matched: false }; }
    run.sourcePrefixCount = sceneSourcePrefixCount(conv, source);
    run.sourcePrefixDigest = scenePrefixDigest(conv, run.sourcePrefixCount);
    if (event.once === true && sceneOnceTriggered(conv, pkg.id, event.id)) {
        run.detail = t('scene_already_triggered');
        if (options.recordSkips || options.explicit) recordSceneRun(run);
        return { run: run, matched: false, alreadyTriggered: true };
    }
    if (event.once !== true && sceneValidRecordForSource(conv, pkg.id, event.id, source.id)) {
        run.detail = t('scene_source_already_triggered');
        if (options.recordSkips) recordSceneRun(run);
        return { run: run, matched: false, alreadyTriggered: true };
    }
    var context = buildSceneEventContext(conv, trigger, payload);
    var evaluated = evaluateSceneConditions(event.conditions, context);
    run.conditions = evaluated.reasons;
    if (!evaluated.matched) {
        run.detail = t('scene_conditions_unmet');
        if (options.recordSkips || options.explicit) recordSceneRun(run);
        return { run: run, matched: false };
    }
    try {
        var mvuData = event.mvu.length ? applySceneMvuChanges(conv, event.mvu) : null;
        var message = await persistSceneMessage(conv, pkg, event, trigger, source, event.mvu, mvuData, executionEpoch, options.sourceBaseline);
        run.status = 'executed';
        run.detail = t('scene_executed');
        recordSceneRun(run);
        clearSceneFailure(conv.id);
        return { run: run, matched: true, message: message, changed: true };
    } catch (error) {
        run.status = executionEpoch !== sceneRuntimeEpoch ? 'cancelled' : 'failed';
        run.detail = sceneRunDetail(error && error.message || error);
        recordSceneRun(run);
        sceneFailureRecord(run);
        return { run: run, matched: true, error: error, changed: false };
    }
}

function enqueueSceneDispatch(conv, task) {
    var id = conv && conv.id;
    if (!id) return Promise.resolve(task());
    var previous = sceneDispatchQueues[id] || Promise.resolve();
    var next = previous.then(function() { return task(); }, function() { return task(); });
    var marker = next.then(function() {}, function() {});
    sceneDispatchQueues[id] = marker;
    return next.finally(function() {
        if (sceneDispatchQueues[id] === marker) delete sceneDispatchQueues[id];
    });
}

async function runSceneDispatchEvent(eventName, conv, payload, options) {
    options = options || {};
    if (!conv || !isLiveConversation(conv)) return { executed: 0, skipped: 0, failed: 0, changedMessages: [] };
    var opening = eventName === 'opening' || options.opening === true;
    if (!opening && eventName !== 'user-message-saved' && eventName !== 'assistant-message-saved') return { executed: 0, skipped: 0, failed: 0, changedMessages: [] };
    if (!payload || (!opening && !payload.messageId) || (!opening && !sceneSourceStillCurrent(conv, payload))) return { executed: 0, skipped: 0, failed: 0, changedMessages: [] };
    var parentChain = options.chain || null;
    var chain = { depth: parentChain ? (Number(parentChain.depth) || 0) + 1 : 0, steps: parentChain ? Number(parentChain.steps) || 0 : 0 };
    if (chain.depth > SCENE_MAX_CHAIN_DEPTH) return { executed: 0, skipped: 0, failed: 0, changedMessages: [], chainLimited: true };
    var dispatchEpoch = sceneRuntimeEpoch;
    // 同一事件批次共享一次捕获的活动基线；发送覆盖 conv.updated 前的时间语义保持一致。
    var activityBaseline = options.activityBaseline != null ? Number(options.activityBaseline) : null;
    if (activityBaseline == null) activityBaseline = opening ? getSceneLastActivityTimestamp(conv, '') : takeSceneActivityBaseline(conv);
    if (activityBaseline == null) activityBaseline = getSceneLastActivityTimestamp(conv, payload && payload.messageId);
    var dispatchPayload = Object.assign({}, payload, { activityBaseline: activityBaseline });
    return enqueueSceneDispatch(conv, async function() {
        if (dispatchEpoch !== sceneRuntimeEpoch) return { executed: 0, skipped: 0, failed: 0, changedMessages: [], cancelled: true };
        var triggers = opening ? ['opening'] : [eventName];
        if (!opening && eventName === 'user-message-saved' && sceneFirstUserMessageId(conv) === payload.messageId) triggers.unshift('opening');
        var result = { executed: 0, skipped: 0, failed: 0, changedMessages: [] };
        var packages = typeof getContentModuleScenePackagesForConversation === 'function'
            ? getContentModuleScenePackagesForConversation(conv) : getScenePackages();
        for (var packageIndex = 0; packageIndex < packages.length; packageIndex++) {
            var pkg = packages[packageIndex];
            if (!pkg || pkg.invalid === true || !pkg.enabled || !scenePackageMatchesConversation(pkg, conv)) continue;
            var events = (pkg.events || []).slice().sort(function(a, b) { return a.order - b.order; });
            for (var eventIndex = 0; eventIndex < events.length; eventIndex++) {
                var event = events[eventIndex];
                if (triggers.indexOf(event.trigger) < 0) continue;
                if (chain.steps >= SCENE_MAX_STEPS_PER_DISPATCH) {
                    recordSceneRun({ id: createSceneRunId(), conversationId: conv.id, packageId: pkg.id, packageName: pkg.name,
                        eventId: event.id, eventName: event.name, trigger: event.trigger, status: 'skipped', detail: t('scene_steps_limited') });
                    return result;
                }
                chain.steps++;
                if (dispatchEpoch !== sceneRuntimeEpoch) return result;
                var outcome = await executeSceneEvent(pkg, event, conv, event.trigger, dispatchPayload, Object.assign({}, options, { epoch: dispatchEpoch, explicit: options.explicit || opening }));
                if (outcome.changed) {
                    result.executed++;
                    result.changedMessages.push(outcome.message.id);
                    if (typeof refreshSceneGenerationSource === 'function') refreshSceneGenerationSource(conv, outcome.message);
                }
                else if (outcome.error) result.failed++;
                else result.skipped++;
                if (dispatchEpoch !== sceneRuntimeEpoch || !isLiveConversation(conv) || getActiveConv() !== conv) return result;
            }
        }
        return result;
    });
}

async function runSceneOpeningForConversation(conv, options) {
    options = options || {};
    if (!conv || !isLiveConversation(conv) || getActiveConv() !== conv) throw new Error(t('scene_target_changed'));
    if (state.isGenerating || conv._messageCommitInProgress) throw new Error(t('scene_busy'));
    if (!conv.id || sceneOpeningBatches[conv.id]) return { executed: 0, skipped: 0, failed: 0, changedMessages: [], alreadyRunning: true };
    var source = buildSceneOpeningSource(conv);
    var payload = {
        eventId: 'scene-opening:' + conv.id + '@' + Date.now().toString(36),
        role: 'user',
        text: '',
        messageId: source.id,
        sceneOpening: true
    };
    sceneOpeningBatches[conv.id] = true;
    try {
        return await runSceneDispatchEvent('opening', conv, payload, Object.assign({}, options, { explicit: true, opening: true }));
    } finally {
        delete sceneOpeningBatches[conv.id];
    }
}

// 失败重试只认失败当次的有界定义（修订+可执行内容指纹）、原来源（直连锚点+前缀条数/摘要）和原活动基线，
// 不重新抓当前定义或当前前缀批准。返回深拷贝定义，排队期间的原地修改不会被当成原候选。
function sceneFailedCandidateStillCurrent(conv, failure) {
    var pkg = getScenePackageById(failure.packageId, conv);
    var event = getSceneEventById(pkg, failure.eventId);
    if (!pkg || !event) throw new Error(t('scene_retry_missing'));
    if (pkg.invalid === true || pkg.enabled !== true || Number(pkg.revision) !== Number(failure.packageRevision) ||
        event.invalid === true || Number(event.revision) !== Number(failure.eventRevision) ||
        sceneEventFingerprint(event) !== failure.eventFingerprint) throw new Error(t('scene_target_changed'));
    if (!scenePackageMatchesConversation(pkg, conv)) throw new Error(t('scene_not_bound'));
    if (!isScenePackageAuthorized(pkg)) throw new Error(t('scene_not_authorized'));
    var source = failure.sourceKind === 'opening'
        ? buildSceneOpeningSource(conv)
        : (conv.messages || []).find(function(message) { return message.id === failure.sourceMessageId; });
    if (!source || source.stage === 'scene' || getSceneSourceStamp(conv, source) !== failure.sourceRevision) throw new Error(t('scene_target_changed'));
    var count = sceneSourcePrefixCount(conv, source);
    if (!Number.isInteger(Number(failure.sourcePrefixCount)) || count !== Number(failure.sourcePrefixCount) ||
        scenePrefixDigest(conv, count) !== failure.sourcePrefixDigest) throw new Error(t('scene_target_changed'));
    return { pkg: JSON.parse(JSON.stringify(pkg)), event: JSON.parse(JSON.stringify(event)), source: source };
}

async function retrySceneFailure(conversationId) {
    var failure = getSceneFailure(conversationId || (typeof state !== 'undefined' && state.activeConvId));
    if (!failure) throw new Error(t('scene_retry_missing'));
    var conv = state.conversations && state.conversations[failure.conversationId];
    if (!conv || !isLiveConversation(conv) || getActiveConv() !== conv) throw new Error(t('scene_target_changed'));
    if (state.isGenerating || conv._messageCommitInProgress) throw new Error(t('scene_busy'));
    sceneFailedCandidateStillCurrent(conv, failure);
    var retryEpoch = sceneRuntimeEpoch;
    return enqueueSceneDispatch(conv, async function() {
        if (retryEpoch !== sceneRuntimeEpoch) throw new Error(t('scene_target_changed'));
        var candidate = sceneFailedCandidateStillCurrent(conv, failure);
        var outcome = await executeSceneEvent(candidate.pkg, candidate.event, conv, failure.trigger, {
            eventId: 'scene-retry:' + failure.eventId + ':' + Date.now().toString(36),
            role: candidate.source.role,
            text: candidate.source.content || '',
            messageId: candidate.source.id,
            messageRevision: getMessageRevision(candidate.source),
            sceneOpening: candidate.source.sceneOpening === true,
            activityBaseline: failure.activityBaseline
        }, {
            explicit: true, recordSkips: true, epoch: retryEpoch, activityBaseline: failure.activityBaseline,
            sourceBaseline: { count: failure.sourcePrefixCount, digest: failure.sourcePrefixDigest }
        });
        if (outcome.error) throw outcome.error;
        if (outcome.changed && getActiveConv() === conv) { renderMessagesOnly(); renderTokenBar(); }
        return outcome;
    });
}

function refreshSceneGenerationSource(conv, savedMessage) {
    if (!conv || typeof state === 'undefined') return false;
    var context = state._generationRuntime;
    if (!context || !context.operation || !context.conversation || context.conversation.id !== conv.id) return false;
    if (typeof context.operation.hasCurrentOwnership === 'function' && !context.operation.hasCurrentOwnership()) return false;
    if (!isLiveConversation(conv) || getActiveConv() !== conv) return false;
    if (typeof capturePromptBuildSource !== 'function') return false;
    if (!savedMessage || typeof context.operation.rebindSourceAfterSave !== 'function') return false;
    // 只把本次已ACK的场景增量纳入当前请求；停止/新请求/无关修改仍拒绝。
    return context.operation.rebindSourceAfterSave(capturePromptBuildSource(conv), savedMessage);
}

function cancelSceneRuntime(reason, conversationId) {
    sceneRuntimeEpoch++;
    if (conversationId) delete sceneActivityBaselines[conversationId];
    else sceneActivityBaselines = Object.create(null);
}

function getSceneRuntimeEpoch() {
    return sceneRuntimeEpoch;
}

// 分支只继承分叉点之前的开场进度；新分支需要把开场来源重新锚定到自己的会话初始来源。
// 只重新锚定调用前仍有效的记录，并按消息顺序重写它们的来源前缀摘要：
// 已因正文/版本/删除/前缀编辑失效的记录保持失效，不会被重新签名复活。
function reanchorSceneOpeningRecords(conv) {
    if (!conv || !Array.isArray(conv.messages)) return conv;
    var prefixIndex = buildScenePrefixIndex(conv);
    var retained = conv.messages.filter(function(message) {
        return !!message && message.stage === 'scene' && isSceneMessageRecordValid(conv, message, prefixIndex, { allowOpeningReanchor: true });
    });
    if (!retained.length) return conv;
    var digests = ['p1'];
    conv.messages.forEach(function(message, position) {
        var record = message && message.stage === 'scene' ? message.sceneEvent : null;
        if (record && retained.indexOf(message) >= 0) {
            if (record.sourceKind === 'opening') {
                record.sourceMessageId = sceneOpeningSourceId(conv);
                record.sourceRevision = getSceneSourceStamp(conv, buildSceneOpeningSource(conv));
            }
            var count = Number(record.sourcePrefixCount) || 0;
            record.sourcePrefixDigest = digests[Math.min(count, position)];
            record.integrity = sceneRecordDigest(record, message.content);
            message.revision = getMessageRevision(message);
        }
        digests.push(fingerprintMessageText(digests[position] + '\n' + sceneMessageDigestFields(message)));
    });
    return conv;
}
