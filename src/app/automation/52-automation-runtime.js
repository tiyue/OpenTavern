/**
 * 新手导读（文件：52-automation-runtime.js）
 *
 * 负责什么：事件触发自动化的运行时——按顺序匹配规则、执行动作、去重、限流、记录结果并保护迟到动作。
 * 在程序中的位置：被发送、生成、新建会话、进入会话和提示词构建的最小钩子调用；
 * 规则定义在 32-automation-rules.js，条件求值在 32-automation-conditions.js。
 * 从哪里开始看：`dispatchAutomationEvent(eventName, conv, payload)`、`runAutomationBeforeSend(conv, capture)`、
 * `settleAutomationAfterTurn(conv)`、`cancelAutomationRuntime(reason, conversationId)`。
 * 修改时注意：队列与运行实例只在内存中，不持久化、不进入同步；自动发送必须经过 sendMessage。
 */
// ==================== Automation Runtime ====================
var AUTOMATION_MAX_QUEUE = 20;
var AUTOMATION_MAX_STEPS = 40;
var AUTOMATION_MAX_CHAIN_DEPTH = 2;
var AUTOMATION_MAX_PROCESSED = 200;
var AUTOMATION_MAX_FRAGMENTS = 5;
var AUTOMATION_PENDING_SEND_TTL_MS = 120000;
var AUTOMATION_PROMPT_FRAGMENT_TTL_MS = 300000;
var AUTOMATION_MVU_WRITE_TIMEOUT_MS = 10000;
var automationEventSequence = 0;
var automationRequestSequence = 0;
var automationDispatchDepth = 0;
var automationRuntimeEpoch = 0;
var automationActiveChain = null;
var automationPendingSends = [];
var automationScheduledSends = [];
var automationPromptFragments = Object.create(null);
var automationWorldbookFragments = Object.create(null);
var automationProcessedEvents = Object.create(null);
var automationProcessedOrder = [];
var automationRunsPersistTimer = null;

function createAutomationEventId() {
    automationEventSequence += 1;
    return 'automation-event-' + Date.now().toString(36) + '-' + automationEventSequence.toString(36);
}

function createAutomationRequestToken() {
    automationRequestSequence += 1;
    return 'automation-request-' + Date.now().toString(36) + '-' + automationRequestSequence.toString(36);
}

function getAutomationGenerationChain(conv) {
    var context = typeof state !== 'undefined' && state && state._generationRuntime;
    if (!context || !context.automationChain) return null;
    if (!conv || !context.conversation || context.conversation.id !== conv.id) return null;
    if (typeof isGenerationRuntimeOwned === 'function' && !isGenerationRuntimeOwned(context)) return null;
    return context.automationChain;
}

function automationFragmentsStillCurrent(entries, build, conv) {
    if (!entries || !entries.length) return true;
    if (build && typeof isPromptBuildCurrent === 'function' && !isPromptBuildCurrent(build)) return false;
    var targetConv = conv || build && build.conv || null;
    return entries.every(function(entry) {
        if (!entry || !entry.ruleId) return false;
        if (entry.conversationId && targetConv && targetConv.id !== entry.conversationId) return false;
        var rule = getAutomationRuleById(entry.ruleId, targetConv);
        if (!rule || rule.invalid === true || !rule.enabled || rule.revision !== entry.revision ||
            automationRuleFingerprint(rule) !== entry.fingerprint || !isAutomationRuleAuthorized(rule)) return false;
        if (entry.event && rule.event !== entry.event) return false;
        return true;
    });
}

function automationRuleHasAction(rule, action) {
    if (!rule || !action || !Array.isArray(rule.actions)) return false;
    return rule.actions.some(function(item) {
        return (!action.type || item.type === action.type) && item.path === action.path &&
            item.valueType === action.valueType && String(item.value) === String(action.value);
    });
}

function automationBoundedDeferred(promise, milliseconds, onTimeout) {
    var timer = null;
    var timeout = new Promise(function(resolve) {
        timer = setTimeout(function() {
            if (typeof onTimeout === 'function') onTimeout();
            resolve(null);
        }, milliseconds);
    });
    return Promise.race([promise, timeout]).finally(function() {
        if (timer) clearTimeout(timer);
    });
}

function getAutomationMvuContextData(conv) {
    try {
        var target = getMvuMainMessages(conv).slice(-1)[0];
        return target ? getMvuDataForMessage(conv, target) : getMvuInitialData(conv);
    } catch (error) {
        return {};
    }
}

function automationProcessedKey(eventId, rule) {
    return String(eventId) + '|' + rule.id + '@' + rule.revision;
}

function automationWasProcessed(eventId, rule) {
    return automationProcessedEvents[automationProcessedKey(eventId, rule)] === true;
}

function markAutomationProcessed(eventId, rule) {
    var key = automationProcessedKey(eventId, rule);
    if (automationProcessedEvents[key]) return;
    automationProcessedEvents[key] = true;
    automationProcessedOrder.push(key);
    while (automationProcessedOrder.length > AUTOMATION_MAX_PROCESSED) {
        delete automationProcessedEvents[automationProcessedOrder.shift()];
    }
}

function automationRuleStillExecutable(rule, conv, eventName) {
    if (!rule || !conv) return false;
    var current = getAutomationRuleById(rule.id, conv);
    return !!(current && current.invalid !== true && current.enabled && current.revision === rule.revision &&
        current.event === eventName && automationRuleMatchesConversation(current, conv) &&
        isLiveConversation(conv));
}

function sanitizeAutomationRunText(value, limit) {
    return String(value == null ? '' : value).slice(0, limit || AUTOMATION_MAX_RUN_DETAIL);
}

function sanitizeAutomationRunEntry(entry) {
    entry = entry || {};
    return {
        id: String(entry.id || ''),
        event: normalizeAutomationEvent(entry.event),
        eventId: sanitizeAutomationRunText(entry.eventId, 120),
        conversationId: sanitizeAutomationRunText(entry.conversationId, AUTOMATION_MAX_TARGET),
        ruleId: sanitizeAutomationRunText(entry.ruleId, AUTOMATION_MAX_TARGET),
        ruleName: sanitizeAutomationRunText(entry.ruleName, AUTOMATION_MAX_NAME),
        revision: Number.isInteger(Number(entry.revision)) ? Number(entry.revision) : 0,
        at: Number(entry.at) || Date.now(),
        status: ['matched', 'skipped', 'failed', 'sent'].indexOf(entry.status) >= 0 ? entry.status : 'matched',
        detail: sanitizeAutomationRunText(entry.detail),
        conditions: (Array.isArray(entry.conditions) ? entry.conditions : []).slice(0, AUTOMATION_MAX_CONDITIONS).map(function(item) {
            return {
                id: sanitizeAutomationRunText(item && item.id, 80),
                source: sanitizeAutomationRunText(item && item.source, 40),
                op: sanitizeAutomationRunText(item && item.op, 40),
                matched: !!(item && item.matched),
                reason: sanitizeAutomationRunText(item && item.reason, 80)
            };
        }),
        actions: (Array.isArray(entry.actions) ? entry.actions : []).slice(0, AUTOMATION_MAX_ACTIONS).map(function(item) {
            return {
                type: sanitizeAutomationRunText(item && item.type, 40),
                status: sanitizeAutomationRunText(item && item.status, 20),
                detail: sanitizeAutomationRunText(item && item.detail)
            };
        })
    };
}

function recordAutomationRun(entry) {
    ensureAutomationSettings();
    var runs = state.settings.automationRecentRuns;
    runs.unshift(sanitizeAutomationRunEntry(entry));
    if (runs.length > AUTOMATION_MAX_RECENT_RUNS) runs.length = AUTOMATION_MAX_RECENT_RUNS;
    persistAutomationRunsThrottled();
}

function persistAutomationRunsThrottled() {
    if (automationRunsPersistTimer) return;
    automationRunsPersistTimer = setTimeout(function() {
        automationRunsPersistTimer = null;
        try {
            Promise.resolve(persistState()).catch(function(error) {
                if (typeof reportPersistPostSaveError === 'function') reportPersistPostSaveError('automation run records', error);
            });
        } catch (error) {
            if (typeof reportPersistPostSaveError === 'function') reportPersistPostSaveError('automation run records', error);
        }
    }, 400);
}

function getAutomationRecentRuns() {
    ensureAutomationSettings();
    return (state.settings.automationRecentRuns || []).map(function(entry) { return sanitizeAutomationRunEntry(entry); });
}

function resolveAutomationQuickReply(action, conv) {
    ensureQuickReplyGroups();
    var group = (state.settings.quickReplyGroups || []).find(function(item) {
        return item.id === action.groupId && item.enabled !== false;
    });
    if (!group) throw new Error(t('automation_quick_reply_missing'));
    var button = (group.buttons || []).find(function(item) {
        return item.id === action.buttonId && item.enabled !== false;
    });
    if (!button) throw new Error(t('automation_quick_reply_missing'));
    return expandQuickReplyText(button.content, conv);
}

function writeAutomationComposerDraft(conv, text, mode) {
    if (getActiveConv() !== conv || !isLiveConversation(conv)) throw new Error(t('automation_wrong_conversation'));
    var draft = getComposerDraft(conv);
    if (!draft) throw new Error(t('automation_wrong_conversation'));
    var next = String(mode === 'replace' ? text : mergeQuickReplyIntoComposerText(draft.text, text, 'append')).slice(0, AUTOMATION_MAX_DRAFT);
    draft.text = next;
    draft.revision++;
    if (dom && dom.messageInput) {
        dom.messageInput.value = next;
        dom.messageInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (typeof renderComposerImages === 'function') renderComposerImages();
}

async function runAutomationMvuWrite(rule, conv, eventName, action, control) {
    if (!automationRuleStillExecutable(rule, conv, eventName)) throw new Error(t('automation_revision_changed'));
    if (!isAutomationRuleAuthorized(rule)) throw new Error(t('automation_mvu_unauthorized'));
    var value = parseAutomationActionValue(action);
    var sources = typeof captureMvuSources === 'function' ? captureMvuSources(conv) : null;
    var scheduledEpoch = automationRuntimeEpoch;
    var writeState = control || { expired: false };
    var target = getMvuMainMessages(conv).slice(-1)[0] || null;
    var targetRevision = target ? getMessageRevision(target) : null;
    function targetStillCurrent() {
        if (!target) return true;
        var current = (conv.messages || []).find(function(message) { return message.id === target.id; });
        return !!current && (targetRevision == null || getMessageRevision(current) === targetRevision);
    }
    function permitted() {
        if (writeState.expired || scheduledEpoch !== automationRuntimeEpoch) return false;
        if (!isLiveConversation(conv) || getActiveConv() !== conv || !targetStillCurrent()) return false;
        if (!automationRuleStillExecutable(rule, conv, eventName)) return false;
        var currentRule = getAutomationRuleById(rule.id, conv);
        return !!(currentRule && currentRule.invalid !== true && automationRuleHasAction(currentRule, action) &&
            isAutomationRuleAuthorized(currentRule));
    }
    if (target) {
        var current = getMvuDataForMessage(conv, target);
        var checked = validateMvuData(writeAutomationMvuValue(current, action.path, value));
        if (!checked.valid) throw new Error(checked.diagnostics.map(function(item) { return item.message; }).join('；') || t('automation_value_invalid'));
        await replaceMvuDataForMessage(conv, target, checked.data, {
            expectedStamp: sources && sources.stamp,
            validate: permitted
        });
        if (writeState.expired) throw new Error(t('automation_revision_changed'));
        return '已写入最新助手消息的变量';
    }
    var initial = getMvuInitialData(conv);
    var checkedInitial = validateMvuData(writeAutomationMvuValue(initial, action.path, value));
    if (!checkedInitial.valid) throw new Error(checkedInitial.diagnostics.map(function(item) { return item.message; }).join('；') || t('automation_value_invalid'));
    var candidate = Object.assign({}, conv, {
        messages: cloneMvuRuntimeValue(conv.messages),
        summaries: cloneMvuRuntimeValue(conv.summaries || []),
        updated: Date.now()
    });
    ensureConversationMvu(candidate, { initial: checkedInitial.data });
    await persistConversationMutation(conv, function() {}, candidate, function(currentConv, validateOnly) {
        if (!sources || !validateMvuSources(currentConv, sources) || !permitted()) return false;
        if (validateOnly) return true;
        return commitMvuCandidate(currentConv, candidate);
    });
    if (writeState.expired) throw new Error(t('automation_revision_changed'));
    if (typeof appStore !== 'undefined' && appStore && typeof appStore.notify === 'function') appStore.notify('conversations');
    return '已写入会话初始变量候选';
}

function queueAutomationSend(rule, conv, eventName, chain, runEntry, action, preparedText, messageId, messageRevision) {
    if (!isAutomationSendAuthorized(rule)) throw new Error(t('automation_send_missing_grant'));
    if (getActiveConv() !== conv || !isLiveConversation(conv)) throw new Error(t('automation_wrong_conversation'));
    if (typeof isGroupAutoRoundsActive === 'function' && isGroupAutoRoundsActive()) throw new Error(t('automation_group_busy'));
    var explicitText = String(action && action.text || '').trim();
    var text = String(explicitText ? action.text : preparedText || '').trim();
    if (!text) {
        var emptyEntry = { type: 'send-message', status: 'skipped', detail: t('automation_send_empty') };
        runEntry.status = 'skipped';
        runEntry.actions.push(emptyEntry);
        return emptyEntry;
    }
    var draft = getComposerDraft(conv);
    var draftText = draft ? String(draft.text || '') : '';
    if (draftText.trim() && draftText.trim() !== text) {
        var conflictEntry = { type: 'send-message', status: 'skipped', detail: t('automation_draft_not_empty') };
        runEntry.status = 'skipped';
        runEntry.actions.push(conflictEntry);
        return conflictEntry;
    }
    automationPendingSends.push({
        conversationId: conv.id,
        ruleId: rule.id,
        revision: rule.revision,
        eventName: eventName,
        text: text.slice(0, AUTOMATION_MAX_TEXT),
        baseRevision: draft ? draft.revision : 0,
        baseText: draftText,
        messageId: String(messageId || ''),
        messageRevision: messageRevision == null ? null : messageRevision,
        connectionStamp: typeof getPromptBuildConnectionStamp === 'function' ? getPromptBuildConnectionStamp(state.settings) : '',
        moduleStamp: typeof getContentModuleAssemblyStamp === 'function' ? getContentModuleAssemblyStamp(conv) : '',
        chain: { depth: chain.depth, hits: Object.assign({}, chain.hits), steps: Number(chain.steps) || 0 },
        at: Date.now()
    });
    while (automationPendingSends.length > AUTOMATION_MAX_QUEUE) automationPendingSends.shift();
    var actionEntry = { type: 'send-message', status: 'queued', detail: t('automation_send_queued') };
    runEntry.actions.push(actionEntry);
    return actionEntry;
}

function executeAutomationPlanAction(rule, conv, eventName, action, context, chain, runEntry, plan, deferred, runState) {
    if (!isAutomationRuleAuthorized(rule)) throw new Error(t('automation_not_granted'));
    if (!automationRuleStillExecutable(rule, conv, eventName)) throw new Error(t('automation_revision_changed'));
    if ((AUTOMATION_ALLOWED_ACTIONS[eventName] || []).indexOf(action.type) < 0) throw new Error(t('automation_action_event_invalid'));
    if (context.messageId) {
        var eventMessage = (conv.messages || []).find(function(message) { return message.id === context.messageId; });
        if (!eventMessage || context.messageRevision != null && getMessageRevision(eventMessage) !== context.messageRevision) {
            throw new Error(t('automation_target_changed'));
        }
    }
    var actionEntry = { type: action.type, status: 'ok', detail: '' };
    if (action.type === 'set-draft' || action.type === 'append-draft') {
        var mode = action.type === 'append-draft' ? 'append' : 'replace';
        if (eventName === 'before-send') plan.draftOps.push({ mode: mode, text: action.text });
        else {
            var activeDraft = getComposerDraft(conv);
            var activeText = activeDraft ? String(activeDraft.text || '') : '';
            if (activeText.trim() && activeText !== String(runState.preparedText || '')) {
                actionEntry.status = 'skipped';
                actionEntry.detail = t('automation_draft_not_empty');
            } else {
                writeAutomationComposerDraft(conv, action.text, mode);
                runState.preparedText = String((getComposerDraft(conv) || {}).text || '');
            }
        }
        if (actionEntry.status !== 'skipped') actionEntry.detail = mode === 'append' ? t('automation_action_appended') : t('automation_action_applied');
    } else if (action.type === 'quick-reply') {
        var content = resolveAutomationQuickReply(action, conv);
        if (eventName === 'before-send') plan.draftOps.push({ mode: action.mode, text: content });
        else {
            var quickDraft = getComposerDraft(conv);
            var quickText = quickDraft ? String(quickDraft.text || '') : '';
            if (quickText.trim() && quickText !== String(runState.preparedText || '')) {
                actionEntry.status = 'skipped';
                actionEntry.detail = t('automation_draft_not_empty');
            } else {
                writeAutomationComposerDraft(conv, content, action.mode);
                runState.preparedText = String((getComposerDraft(conv) || {}).text || '');
            }
        }
        if (actionEntry.status !== 'skipped') actionEntry.detail = action.mode === 'replace' ? t('automation_action_applied') : t('automation_action_appended');
    } else if (action.type === 'prompt-fragment') {
        var fragment = {
            role: action.role === 'user' ? 'user' : 'system',
            text: String(action.text || '').slice(0, AUTOMATION_MAX_TEXT),
            ruleId: rule.id,
            revision: rule.revision,
            fingerprint: automationRuleFingerprint(rule),
            event: eventName,
            conversationId: conv.id
        };
        if (!fragment.text.trim()) throw new Error(t('automation_action_text_required'));
        if (eventName === 'before-send') plan.fragments.push(fragment);
        else if (eventName === 'worldbook-activated') {
            if (!automationWorldbookFragments[conv.id]) {
                automationWorldbookFragments[conv.id] = { owner: plan.owner || null, operation: plan.operation || null, fragments: [], at: Date.now() };
            }
            automationWorldbookFragments[conv.id].fragments.push(fragment);
        } else throw new Error(t('automation_action_event_invalid'));
        actionEntry.detail = t('automation_action_fragment');
    } else if (action.type === 'block-send') {
        if (eventName !== 'before-send') throw new Error(t('automation_action_event_invalid'));
        plan.blockedReason = action.reason || t('automation_blocked_default');
        actionEntry.detail = plan.blockedReason;
    } else if (action.type === 'send-message') {
        actionEntry = queueAutomationSend(rule, conv, eventName, chain, runEntry, action, runState.preparedText, context.messageId, context.messageRevision);
        return;
    } else if (action.type === 'mvu-set') {
        actionEntry.status = 'running';
        runEntry.actions.push(actionEntry);
        var writeState = { expired: false };
        var writeCall = function() {
            if (writeState.expired) return Promise.reject(new Error(t('automation_revision_changed')));
            return runAutomationMvuWrite(rule, conv, eventName, action, writeState);
        };
        runState.mvu = (runState.mvu || Promise.resolve()).then(writeCall).then(function(detail) {
            actionEntry.status = 'ok';
            actionEntry.detail = detail;
        }, function(error) {
            actionEntry.status = 'failed';
            actionEntry.detail = error.message || String(error);
        });
        deferred.push(automationBoundedDeferred(runState.mvu, AUTOMATION_MVU_WRITE_TIMEOUT_MS, function() {
            writeState.expired = true;
            if (actionEntry.status === 'running') {
                actionEntry.status = 'failed';
                actionEntry.detail = t('automation_busy');
            }
        }));
        return;
    } else {
        throw new Error(t('automation_actions_invalid'));
    }
    runEntry.actions.push(actionEntry);
}

function executeAutomationRule(rule, conv, eventName, context, chain, runEntry, plan, deferred) {
    markAutomationProcessed(context.eventId, rule);
    chain.hits[rule.id] = (chain.hits[rule.id] || 0) + 1;
    if (rule.actions.some(function(action) { return action.type === 'send-message'; })) {
        var existingDraft = getComposerDraft(conv);
        if (existingDraft && String(existingDraft.text || '').trim()) {
            runEntry.status = 'skipped';
            runEntry.actions.push({ type: 'send-message', status: 'skipped', detail: t('automation_draft_not_empty') });
            return;
        }
    }
    var runState = { preparedText: '', mvu: null };
    for (var index = 0; index < rule.actions.length; index++) {
        if ((Number(chain.steps) || 0) >= AUTOMATION_MAX_STEPS) {
            runEntry.actions.push({ type: 'limit', status: 'failed', detail: t('automation_steps_limited') });
            break;
        }
        chain.steps = (Number(chain.steps) || 0) + 1;
        try {
            executeAutomationPlanAction(rule, conv, eventName, rule.actions[index], context, chain, runEntry, plan, deferred, runState);
        } catch (error) {
            runEntry.actions.push({ type: rule.actions[index].type, status: 'failed', detail: error.message || String(error) });
            runEntry.status = 'failed';
        }
    }
}

function dispatchAutomationEvent(eventName, conv, payload, options) {
    options = options || {};
    if (AUTOMATION_EVENTS.indexOf(eventName) < 0 || !conv || !isLiveConversation(conv)) return Promise.resolve({ matched: 0, blocked: false });
    // 在发送覆盖 conv.updated 之前记录真实活动基线，供随后的 user/assistant-saved 场景批次使用。
    if (eventName === 'before-send' && typeof captureSceneActivityBaseline === 'function') captureSceneActivityBaseline(conv);
    var contextPayload = Object.assign({}, payload || {});
    contextPayload.eventId = contextPayload.eventId || createAutomationEventId();
    contextPayload.getMvuData = function() { return getAutomationMvuContextData(conv); };
    var context = buildAutomationEventContext(conv, eventName, contextPayload);
    var plan = options.plan || { draftOps: [], fragments: [], blockedReason: '' };
    plan.owner = options.owner || plan.owner || null;
    plan.operation = options.operation || plan.operation || null;
    var parentChain = options.chain || getAutomationGenerationChain(conv) || automationActiveChain;
    var chain = parentChain
        ? { depth: (Number(parentChain.depth) || 0) + 1, hits: Object.assign({}, parentChain.hits || {}), steps: Number(parentChain.steps) || 0 }
        : { depth: 0, hits: {}, steps: 0 };
    var runEntry = {
        id: createAutomationEventId(), event: eventName, eventId: context.eventId,
        conversationId: conv.id, at: Date.now(), status: 'matched', detail: '', conditions: [], actions: [], ruleId: '', ruleName: '', revision: 0
    };
    var dispatchRules = typeof getContentModuleAutomationRulesForConversation === 'function'
        ? getContentModuleAutomationRulesForConversation(conv) : getAutomationRules();
    var rules = dispatchRules.filter(function(rule) {
        return rule.enabled && automationRuleMatchesEvent(rule, eventName) && automationRuleMatchesConversation(rule, conv);
    });
    function runScenes() {
        if (typeof runSceneDispatchEvent !== 'function') return Promise.resolve(null);
        // 每个已 ACK 的场景增量由 runSceneDispatchEvent 按序重新绑定生成来源。
        return Promise.resolve(runSceneDispatchEvent(eventName, conv, contextPayload, { chain: options.chain || null })).catch(function(error) {
            if (typeof reportPersistPostSaveError === 'function') reportPersistPostSaveError('scene event runtime', error);
            return { executed: 0, skipped: 0, failed: 1, changedMessages: [], error: error && error.message || String(error) };
        });
    }
    if (chain.depth > AUTOMATION_MAX_CHAIN_DEPTH) {
        recordAutomationRun(Object.assign({}, runEntry, { status: 'skipped', detail: t('automation_chain_limited') }));
        return Promise.resolve({ matched: 0, blocked: false, chainLimited: true });
    }
    if (automationDispatchDepth >= 3) {
        recordAutomationRun(Object.assign({}, runEntry, { status: 'skipped', detail: t('automation_dispatch_limited') }));
        return Promise.resolve({ matched: 0, blocked: false, dispatchLimited: true });
    }
    if (!rules.length) return runScenes().then(function(scene) { return { matched: 0, blocked: false, scene: scene }; });
    automationDispatchDepth++;
    var deferred = [];
    var matchedCount = 0;
    var ruleRuns = [];
    try {
        rules.slice(0, AUTOMATION_MAX_QUEUE).forEach(function(rule) {
            if (automationWasProcessed(context.eventId, rule)) return;
            if (chain.hits[rule.id]) {
                recordAutomationRun(Object.assign({}, runEntry, {
                    status: 'skipped', ruleId: rule.id, ruleName: rule.name, revision: rule.revision,
                    detail: t('automation_loop_blocked')
                }));
                return;
            }
            var evaluated = evaluateAutomationConditions(rule.conditions, context);
            if (!evaluated.matched) return;
            matchedCount++;
            var ruleRun = Object.assign({}, runEntry, {
                ruleId: rule.id, ruleName: rule.name, revision: rule.revision,
                conditions: evaluated.reasons, actions: []
            });
            executeAutomationRule(rule, conv, eventName, context, chain, ruleRun, plan, deferred);
            if (!ruleRun.actions.length && !deferred.length) ruleRun.status = 'matched';
            ruleRuns.push(ruleRun);
        });
    } finally {
        automationDispatchDepth--;
    }
    return Promise.allSettled(deferred).then(function() {
        ruleRuns.forEach(recordAutomationRun);
        if (eventName === 'conversation-created' || eventName === 'conversation-entered') scheduleAutomationSettlement(conv, 0);
        return { matched: matchedCount, blocked: !!plan.blockedReason };
    }).then(function(result) {
        return runScenes().then(function(scene) { result.scene = scene; return result; });
    });
}

function applyAutomationBeforeSendPlan(conv, capture, plan) {
    if (!capture || !plan || !Array.isArray(plan.draftOps) || !plan.draftOps.length) return false;
    // 捕获后用户又输入时放弃改文，绝不覆盖迟到输入。
    if (capture.draft && capture.revision != null && capture.draft.revision !== capture.revision) {
        capture.text = String(capture.draft.text || '').trim().slice(0, AUTOMATION_MAX_DRAFT);
        capture.revision = capture.draft.revision;
        if (Array.isArray(capture.draft.images)) capture.attachments = JSON.parse(JSON.stringify(capture.draft.images));
        return false;
    }
    var changed = false;
    plan.draftOps.forEach(function(operation) {
        var text = String(operation.text || '').slice(0, AUTOMATION_MAX_TEXT);
        if (!text.trim()) return;
        if (operation.mode === 'replace' || !String(capture.text || '').trim()) capture.text = text;
        else capture.text = String(capture.text).replace(/\s*$/, '') + '\n' + text;
        changed = true;
    });
    if (!changed) return false;
    var next = String(capture.text || '').trim().slice(0, AUTOMATION_MAX_DRAFT);
    if (!next) return false;
    capture.text = next;
    if (capture.draft) {
        capture.draft.text = next;
        capture.draft.revision++;
        capture.revision = capture.draft.revision;
    }
    if (getActiveConv() === conv && dom && dom.messageInput) dom.messageInput.value = next;
    return true;
}

async function runAutomationBeforeSend(conv, capture, options) {
    if (!conv || !capture) return { blocked: false };
    options = options || {};
    delete automationPromptFragments[conv.id];
    var token = createAutomationRequestToken();
    var plan = { draftOps: [], fragments: [], blockedReason: '' };
    await dispatchAutomationEvent('before-send', conv, {
        role: 'user', text: capture.text, messageId: '', messageRevision: null
    }, { plan: plan, chain: options.chain || null });
    if (plan.blockedReason) return { blocked: true, reason: plan.blockedReason };
    var changed = applyAutomationBeforeSendPlan(conv, capture, plan);
    if (plan.fragments.length) {
        automationPromptFragments[conv.id] = { token: token, fragments: plan.fragments.slice(0, AUTOMATION_MAX_FRAGMENTS), at: Date.now() };
    }
    return { blocked: false, changed: changed, token: token };
}

function takeAutomationPromptFragments(conv, buildOptions) {
    if (!conv || !conv.id) return [];
    buildOptions = buildOptions || {};
    var fragments = [];
    var worldbook = automationWorldbookFragments[conv.id];
    if (worldbook && worldbook.fragments && worldbook.fragments.length &&
        (!buildOptions.owner || !worldbook.owner || worldbook.owner === buildOptions.owner) &&
        Date.now() - worldbook.at <= AUTOMATION_PROMPT_FRAGMENT_TTL_MS) {
        fragments = fragments.concat(worldbook.fragments.splice(0, worldbook.fragments.length));
        delete automationWorldbookFragments[conv.id];
    }
    var pending = automationPromptFragments[conv.id];
    if (pending && pending.token && pending.token === buildOptions.fragmentToken) {
        delete automationPromptFragments[conv.id];
        if (Date.now() - pending.at <= AUTOMATION_PROMPT_FRAGMENT_TTL_MS) fragments = fragments.concat(pending.fragments);
    }
    return fragments.filter(function(fragment) {
        if (!fragment || !String(fragment.text || '').trim()) return false;
        if (!fragment.ruleId) return true;
        return automationFragmentsStillCurrent([fragment], null, conv);
    }).slice(0, AUTOMATION_MAX_FRAGMENTS).map(function(fragment) {
        return {
            role: fragment.role === 'user' ? 'user' : 'system',
            content: String(fragment.text).slice(0, AUTOMATION_MAX_TEXT),
            ruleId: fragment.ruleId,
            revision: fragment.revision,
            fingerprint: fragment.fingerprint,
            event: fragment.event,
            conversationId: fragment.conversationId
        };
    });
}

function buildAutomationDryRunContext(rule) {
    var conv = getActiveConv();
    if (!conv) return null;
    var payload = { eventId: 'automation-dry-run', getMvuData: function() { return getAutomationMvuContextData(conv); } };
    if (rule.event === 'before-send') {
        payload.role = 'user';
        payload.text = (getComposerDraft(conv) || {}).text || '';
    } else if (rule.event === 'user-message-saved') {
        var lastUser = (conv.messages || []).slice().reverse().find(function(message) { return message.role === 'user'; });
        payload.role = 'user';
        payload.text = lastUser && lastUser.content || '';
    } else if (rule.event === 'assistant-message-saved') {
        var lastAssistant = getMvuMainMessages(conv).slice(-1)[0];
        payload.role = 'assistant';
        payload.text = lastAssistant && lastAssistant.content || '';
    } else if (rule.event === 'worldbook-activated') {
        var previewConv = JSON.parse(JSON.stringify(conv));
        var result = typeof getActivatedWorldInfo === 'function' ? getActivatedWorldInfo(previewConv) : { entries: [] };
        payload.worldbookEntries = (result.entries || []).map(function(entry) {
            return { worldBookId: entry._sourceWorldBookId || '', uid: entry.uid == null ? '' : entry.uid, automationId: entry.automationId || '', moduleId: entry._moduleId || '' };
        });
    }
    return buildAutomationEventContext(conv, rule.event, payload);
}

function dispatchAutomationWorldbookEvent(conv, entries, buildOptions) {
    if (!conv) return;
    buildOptions = buildOptions || {};
    automationWorldbookFragments[conv.id] = {
        owner: buildOptions.owner || null,
        operation: buildOptions.operation || null,
        fragments: [],
        at: Date.now()
    };
    if (!Array.isArray(entries) || !entries.length) return;
    dispatchAutomationEvent('worldbook-activated', conv, {
        worldbookEntries: entries.map(function(entry) {
            return {
                worldBookId: entry && entry._sourceWorldBookId || '',
                uid: entry && entry.uid == null ? '' : entry.uid,
                automationId: entry && entry.automationId || '',
                moduleId: entry && entry._moduleId || ''
            };
        })
    }, { owner: buildOptions.owner || null, operation: buildOptions.operation || null }).catch(function(error) {
        if (typeof reportPersistPostSaveError === 'function') reportPersistPostSaveError('automation worldbook event', error);
    });
}

function automationConversationBusy(conv) {
    if (typeof quickReplyConversationBusy === 'function') return quickReplyConversationBusy(conv);
    return !!(state.isGenerating || composerSendInProgress || conv && conv._messageCommitInProgress);
}

function automationPendingOwnsComposer(pending, conv) {
    var draft = getComposerDraft(conv);
    if (!draft) return false;
    return draft.revision === pending.baseRevision && String(draft.text || '') === String(pending.baseText || '');
}

function recordAutomationPendingResult(pending, conv, status, detail) {
    var rule = getAutomationRuleById(pending.ruleId, conv);
    recordAutomationRun({
        id: createAutomationEventId(), event: pending.eventName, eventId: '', conversationId: conv && conv.id,
        ruleId: pending.ruleId, ruleName: rule && rule.name || pending.ruleId,
        revision: pending.revision, at: Date.now(), status: status, detail: detail, conditions: [], actions: []
    });
}

function automationPendingStillValid(pending, conv) {
    if (!pending) return false;
    if (!String(pending.text || '').trim()) {
        recordAutomationPendingResult(pending, conv, 'skipped', t('automation_send_empty'));
        return false;
    }
    var rule = getAutomationRuleById(pending.ruleId, conv);
    if (!rule || rule.invalid === true || !rule.enabled || rule.revision !== pending.revision ||
        !automationRuleStillExecutable(rule, conv, pending.eventName)) {
        recordAutomationPendingResult(pending, conv, 'skipped', t('automation_revision_changed'));
        return false;
    }
    if (!isAutomationSendAuthorized(rule)) {
        recordAutomationPendingResult(pending, conv, 'skipped', t('automation_send_missing_grant'));
        return false;
    }
    if (pending.messageId) {
        var source = (conv.messages || []).find(function(message) { return message.id === pending.messageId; });
        if (!source || pending.messageRevision != null && getMessageRevision(source) !== pending.messageRevision) {
            recordAutomationPendingResult(pending, conv, 'skipped', t('automation_target_changed'));
            return false;
        }
    }
    if (pending.connectionStamp && typeof getPromptBuildConnectionStamp === 'function' &&
        getPromptBuildConnectionStamp(state.settings) !== pending.connectionStamp) {
        recordAutomationPendingResult(pending, conv, 'skipped', t('automation_target_changed'));
        return false;
    }
    if (pending.moduleStamp !== undefined && typeof getContentModuleAssemblyStamp === 'function' &&
        getContentModuleAssemblyStamp(conv) !== pending.moduleStamp) {
        recordAutomationPendingResult(pending, conv, 'skipped', t('automation_target_changed'));
        return false;
    }
    if (!automationPendingOwnsComposer(pending, conv)) {
        recordAutomationPendingResult(pending, conv, 'skipped', t('automation_draft_not_empty'));
        return false;
    }
    if (pending.chain.depth + 1 > AUTOMATION_MAX_CHAIN_DEPTH) {
        recordAutomationPendingResult(pending, conv, 'skipped', t('automation_chain_limited'));
        return false;
    }
    if ((Number(pending.chain.steps) || 0) >= AUTOMATION_MAX_STEPS) {
        recordAutomationPendingResult(pending, conv, 'skipped', t('automation_steps_limited'));
        return false;
    }
    return true;
}

function scheduleAutomationSendTimer(pending, conv) {
    var scheduledEpoch = automationRuntimeEpoch;
    var entry = { pending: pending, conversationId: conv.id, ruleId: pending.ruleId, timer: null };
    automationScheduledSends.push(entry);
    entry.timer = setTimeout(function() {
        automationScheduledSends = automationScheduledSends.filter(function(item) { return item !== entry; });
        if (scheduledEpoch !== automationRuntimeEpoch || getActiveConv() !== conv || !isLiveConversation(conv)) {
            recordAutomationPendingResult(pending, conv, 'skipped', t('automation_cancelled'));
            return;
        }
        if (typeof isGroupAutoRoundsActive === 'function' && isGroupAutoRoundsActive()) {
            recordAutomationPendingResult(pending, conv, 'skipped', t('automation_group_busy'));
            return;
        }
        if (automationConversationBusy(conv)) {
            recordAutomationPendingResult(pending, conv, 'skipped', t('automation_busy'));
            return;
        }
        if (!automationPendingStillValid(pending, conv)) return;
        var draft = getComposerDraft(conv);
        if (!draft) return;
        if (String(draft.text || '') !== pending.text) {
            try {
                writeAutomationComposerDraft(conv, pending.text, 'replace');
            } catch (error) {
                recordAutomationPendingResult(pending, conv, 'failed', error.message || String(error));
                return;
            }
        }
        Promise.resolve(sendMessage({ automationChain: pending.chain })).then(function(result) {
            var started = !!(result && result.started);
            recordAutomationPendingResult(pending, conv, started ? 'sent' : 'skipped',
                started ? t('automation_send_started') : t(result && result.reason === 'busy' ? 'automation_busy' : 'automation_send_empty'));
        }, function(error) {
            recordAutomationPendingResult(pending, conv, 'failed', error && error.message || String(error));
        });
    }, 0);
}

function settleAutomationAfterTurn(conv, attempts) {
    if (!conv) return;
    attempts = Number(attempts) || 0;
    var now = Date.now();
    automationPendingSends = automationPendingSends.filter(function(item) {
        return now - item.at <= AUTOMATION_PENDING_SEND_TTL_MS;
    });
    var due = automationPendingSends.filter(function(item) {
        return item.conversationId === conv.id && now - item.at <= AUTOMATION_PENDING_SEND_TTL_MS;
    });
    if (!due.length) return;
    function removeDue() {
        automationPendingSends = automationPendingSends.filter(function(item) { return due.indexOf(item) < 0; });
    }
    if (getActiveConv() !== conv || !isLiveConversation(conv)) { removeDue(); due.forEach(function(item) { recordAutomationPendingResult(item, conv, 'skipped', t('automation_wrong_conversation')); }); return; }
    if (typeof isGroupAutoRoundsActive === 'function' && isGroupAutoRoundsActive()) { removeDue(); due.forEach(function(item) { recordAutomationPendingResult(item, conv, 'skipped', t('automation_group_busy')); }); return; }
    if (automationConversationBusy(conv)) {
        if (attempts < 10) { scheduleAutomationSettlement(conv, attempts + 1); return; }
        removeDue();
        due.forEach(function(item) { recordAutomationPendingResult(item, conv, 'skipped', t('automation_busy')); });
        return;
    }
    removeDue();
    due.slice(1).forEach(function(item) { recordAutomationPendingResult(item, conv, 'skipped', t('automation_send_collision')); });
    var pending = due[0];
    if (!automationPendingStillValid(pending, conv)) return;
    scheduleAutomationSendTimer(pending, conv);
}

function scheduleAutomationSettlement(conv, attempts) {
    attempts = Number(attempts) || 0;
    if (!conv || !automationPendingSends.some(function(item) { return item.conversationId === conv.id; })) return;
    if (automationConversationBusy(conv) && attempts < 10) {
        setTimeout(function() { scheduleAutomationSettlement(conv, attempts + 1); }, 150);
        return;
    }
    settleAutomationAfterTurn(conv, attempts);
}

function cancelAutomationRuntime(reason, conversationId) {
    automationRuntimeEpoch++;
    if (typeof cancelSceneRuntime === 'function') cancelSceneRuntime(reason, conversationId);
    automationScheduledSends = automationScheduledSends.filter(function(entry) {
        if (conversationId && entry.conversationId !== conversationId) return true;
        if (entry.timer) clearTimeout(entry.timer);
        return false;
    });
    if (conversationId) {
        automationPendingSends = automationPendingSends.filter(function(item) { return item.conversationId !== conversationId; });
        delete automationPromptFragments[conversationId];
        delete automationWorldbookFragments[conversationId];
        return;
    }
    automationPendingSends = [];
    automationPromptFragments = Object.create(null);
    automationWorldbookFragments = Object.create(null);
    automationProcessedEvents = Object.create(null);
    automationProcessedOrder = [];
}

function cancelAutomationRuntimeForRule(ruleId, revision) {
    if (!ruleId) return;
    automationPendingSends = automationPendingSends.filter(function(item) {
        return !(item.ruleId === ruleId && (revision == null || item.revision !== revision));
    });
    automationScheduledSends = automationScheduledSends.filter(function(entry) {
        if (entry.ruleId !== ruleId || !(revision == null || entry.pending.revision !== revision)) return true;
        if (entry.timer) clearTimeout(entry.timer);
        return false;
    });
    Object.keys(automationPromptFragments).forEach(function(conversationId) {
        var pending = automationPromptFragments[conversationId];
        pending.fragments = (pending.fragments || []).filter(function(fragment) { return fragment.ruleId !== ruleId; });
        if (!pending.fragments.length) delete automationPromptFragments[conversationId];
    });
    Object.keys(automationWorldbookFragments).forEach(function(conversationId) {
        var worldbook = automationWorldbookFragments[conversationId];
        worldbook.fragments = (worldbook.fragments || []).filter(function(fragment) { return fragment.ruleId !== ruleId; });
    });
}
