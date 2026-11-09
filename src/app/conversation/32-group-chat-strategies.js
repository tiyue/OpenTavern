// Local, explainable group speaker strategies and user-started bounded auto rounds.
var GROUP_SPEAKER_MODES = ['round-robin', 'manual', 'natural', 'probability'];
var GROUP_AUTO_MAX_ROUNDS = 10;
var GROUP_AUTO_MAX_INTERVAL_SEC = 30;
var groupAutoRoundRunId = 0;
var groupAutoRoundState = null;

function normalizeGroupSpeakerMode(value) {
    return GROUP_SPEAKER_MODES.indexOf(String(value || '')) >= 0 ? String(value) : 'round-robin';
}

function getGroupSpeakerStrategy(conv) {
    var raw = conv && conv.group && conv.group.speakerStrategy;
    raw = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    var weights = {};
    if (raw.weights && typeof raw.weights === 'object' && !Array.isArray(raw.weights)) {
        Object.keys(raw.weights).forEach(function(name) {
            var value = Number(raw.weights[name]);
            if (Number.isFinite(value) && value >= 0) weights[name] = value;
        });
    }
    return {
        mode: normalizeGroupSpeakerMode(raw.mode),
        weights: weights,
        manualSpeakerName: String(raw.manualSpeakerName || ''),
        autoRoundCount: Number.isInteger(Number(raw.autoRoundCount)) && Number(raw.autoRoundCount) >= 1 && Number(raw.autoRoundCount) <= GROUP_AUTO_MAX_ROUNDS ? Number(raw.autoRoundCount) : 3,
        autoRoundIntervalSec: Number.isInteger(Number(raw.autoRoundIntervalSec)) && Number(raw.autoRoundIntervalSec) >= 1 && Number(raw.autoRoundIntervalSec) <= GROUP_AUTO_MAX_INTERVAL_SEC ? Number(raw.autoRoundIntervalSec) : 3
    };
}

function getGroupSpeakerRandom() {
    if (typeof groupSpeakerRandom === 'function') {
        var value = Number(groupSpeakerRandom());
        if (Number.isFinite(value)) return Math.min(0.999999999, Math.max(0, value));
    }
    return Math.random();
}

function findGroupMemberByName(conv, name) {
    var wanted = String(name || '').toLowerCase();
    return getGroupMembers(conv).find(function(member) {
        return member.character && String(member.character.name || '').toLowerCase() === wanted;
    }) || null;
}

function getGroupMemberWeight(conv, name) {
    var strategy = getGroupSpeakerStrategy(conv);
    if (Object.prototype.hasOwnProperty.call(strategy.weights, name)) return strategy.weights[name];
    var lower = String(name || '').toLowerCase();
    var key = Object.keys(strategy.weights).find(function(item) { return item.toLowerCase() === lower; });
    return key === undefined ? 1 : strategy.weights[key];
}

function getRoundRobinGroupSpeaker(conv) {
    var members = getGroupMembers(conv).filter(function(member) { return !member.muted; });
    if (members.length === 0) return null;
    var lastAssistant = (conv.messages || []).slice().reverse().find(function(message) {
        return message.role === 'assistant' && message.speaker;
    });
    var lastIndex = -1;
    if (lastAssistant && lastAssistant.speaker) {
        lastIndex = members.findIndex(function(member) { return member.character.name === lastAssistant.speaker; });
        if (lastIndex === -1) {
            var lower = lastAssistant.speaker.toLowerCase();
            lastIndex = members.findIndex(function(member) { return (member.character.name || '').toLowerCase() === lower; });
        }
    }
    return members[(lastIndex + 1) % members.length].character;
}

function getNaturalGroupSpeaker(conv) {
    var members = getGroupMembers(conv).filter(function(member) { return !member.muted; });
    if (!members.length) return null;
    var history = (conv.messages || []).slice(-8).reverse();
    for (var i = 0; i < history.length; i++) {
        var message = history[i];
        if (!message || message.role === 'system') continue;
        var mentioned = parseGroupMention(String(message.content || ''), conv);
        if (mentioned) {
            var mentionedMember = members.find(function(member) { return member.character.name === mentioned.name; });
            if (mentionedMember) return mentionedMember.character;
        }
    }
    var lastSpokenIndex = {};
    (conv.messages || []).forEach(function(message, index) {
        if (message && message.role === 'assistant' && message.speaker) lastSpokenIndex[String(message.speaker).toLowerCase()] = index;
    });
    return members.slice().sort(function(a, b) {
        var aIndex = lastSpokenIndex[String(a.character.name).toLowerCase()];
        var bIndex = lastSpokenIndex[String(b.character.name).toLowerCase()];
        if (aIndex == null && bIndex == null) return (a.order || 0) - (b.order || 0);
        if (aIndex == null) return -1;
        if (bIndex == null) return 1;
        return aIndex - bIndex || (a.order || 0) - (b.order || 0);
    })[0].character;
}

function getWeightedGroupSpeaker(conv) {
    var members = getGroupMembers(conv).filter(function(member) { return !member.muted; });
    if (!members.length) return null;
    var weighted = members.map(function(member) {
        return { member: member, weight: getGroupMemberWeight(conv, member.character.name) };
    });
    var total = weighted.reduce(function(sum, item) { return sum + item.weight; }, 0);
    if (!(total > 0)) return null;
    var target = getGroupSpeakerRandom() * total;
    for (var i = 0; i < weighted.length; i++) {
        if (target < weighted[i].weight) return weighted[i].member.character;
        target -= weighted[i].weight;
    }
    return weighted[weighted.length - 1].member.character;
}

function getManualGroupSpeaker(conv) {
    if (conv._nextGroupSpeaker) {
        var forced = findGroupMemberByName(conv, conv._nextGroupSpeaker.name);
        if (forced && !forced.muted) return forced.character;
    }
    var strategy = getGroupSpeakerStrategy(conv);
    var member = findGroupMemberByName(conv, strategy.manualSpeakerName);
    return member && !member.muted ? member.character : null;
}

function getGroupSpeakerForMode(conv, mode) {
    if (!isGroupChat(conv)) return null;
    if (mode === 'manual') return getManualGroupSpeaker(conv);
    if (mode === 'natural') return getNaturalGroupSpeaker(conv);
    if (mode === 'probability') return getWeightedGroupSpeaker(conv);
    return getRoundRobinGroupSpeaker(conv);
}

function getGroupSpeakerForUserMessage(conv, text) {
    if (!isGroupChat(conv)) return { speaker: null, reason: '' };
    if (typeof pendingGroupMention !== 'undefined' && pendingGroupMention) {
        var pendingMember = findGroupMemberByName(conv, pendingGroupMention.name);
        if (!pendingMember || pendingMember.muted) return { speaker: null, reason: t('group_strategy_muted_mention') };
        return { speaker: pendingMember.character, reason: '' };
    }
    var mentioned = parseGroupMention(text, conv);
    if (mentioned) {
        var member = findGroupMemberByName(conv, mentioned.name);
        if (!member || member.muted) return { speaker: null, reason: t('group_strategy_muted_mention') };
        return { speaker: member.character, reason: '' };
    }
    if (!getGroupMembers(conv).some(function(item) { return !item.muted; })) return { speaker: null, reason: t('group_strategy_no_unmuted') };
    var strategy = getGroupSpeakerStrategy(conv);
    if (strategy.mode === 'manual') {
        var manual = getManualGroupSpeaker(conv);
        return manual ? { speaker: manual, reason: '' } : { speaker: null, reason: t('group_strategy_manual_required') };
    }
    if (strategy.mode === 'probability') {
        var total = getGroupMembers(conv).filter(function(item) { return !item.muted; }).reduce(function(sum, item) {
            return sum + getGroupMemberWeight(conv, item.character.name);
        }, 0);
        if (!(total > 0)) return { speaker: null, reason: t('group_strategy_zero_weights') };
    }
    return { speaker: getGroupSpeakerForMode(conv, strategy.mode), reason: '' };
}

function getGroupSendBlockReason(conv, text) {
    if (!isGroupChat(conv)) return '';
    var resolved = getGroupSpeakerForUserMessage(conv, text || '');
    return resolved.reason;
}

function completeGroupSpeakerTurn(conv) {
    if (!isGroupChat(conv)) return;
    var strategy = getGroupSpeakerStrategy(conv);
    conv._nextGroupSpeaker = strategy.mode === 'manual' ? null : getNextGroupSpeaker(conv);
}

function validateGroupSpeakerStrategy(conv, raw) {
    if (!isGroupChat(conv)) throw new Error(t('group_strategy_not_group'));
    raw = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    // Validate the explicit value; legacy data without a mode still falls back to round-robin.
    var explicitMode = raw.mode;
    var mode;
    if (explicitMode === undefined || explicitMode === null || explicitMode === '') mode = 'round-robin';
    else {
        mode = String(explicitMode);
        if (GROUP_SPEAKER_MODES.indexOf(mode) < 0) throw new Error(t('group_strategy_mode_invalid'));
    }
    var members = getGroupMembers(conv);
    var weights = raw.weights && typeof raw.weights === 'object' && !Array.isArray(raw.weights) ? raw.weights : {};
    Object.keys(weights).forEach(function(name) {
        var value = Number(weights[name]);
        if (!Number.isFinite(value) || value < 0) throw new Error(t('group_strategy_weight_invalid'));
        if (!members.some(function(member) { return member.character.name.toLowerCase() === String(name).toLowerCase(); })) throw new Error(t('group_strategy_weight_member_invalid'));
    });
    var manualName = String(raw.manualSpeakerName || '');
    if (manualName) {
        var manual = findGroupMemberByName(conv, manualName);
        if (!manual) throw new Error(t('group_strategy_member_missing'));
        if (manual.muted) throw new Error(t('group_strategy_muted_mention'));
    }
    var count = Number(raw.autoRoundCount);
    if (!Number.isInteger(count) || count < 1 || count > GROUP_AUTO_MAX_ROUNDS) throw new Error(t('group_strategy_rounds_invalid'));
    var interval = Number(raw.autoRoundIntervalSec);
    if (!Number.isInteger(interval) || interval < 1 || interval > GROUP_AUTO_MAX_INTERVAL_SEC) throw new Error(t('group_strategy_interval_invalid'));
    if (!members.some(function(member) { return !member.muted; })) throw new Error(t('group_strategy_no_unmuted'));
    return {
        mode: mode, weights: JSON.parse(JSON.stringify(weights)), manualSpeakerName: manualName,
        autoRoundCount: count, autoRoundIntervalSec: interval
    };
}

async function saveGroupSpeakerStrategy(conv, strategy) {
    if (state.isGenerating || getActiveConv() !== conv || !isLiveConversation(conv)) throw new Error(t('group_strategy_wait_generation'));
    var normalized = validateGroupSpeakerStrategy(conv, strategy);
    var source = JSON.stringify(conv.group || null);
    var candidate = Object.assign({}, conv, {
        group: Object.assign({}, JSON.parse(JSON.stringify(conv.group)), { speakerStrategy: normalized }),
        updated: Date.now()
    });
    await persistConversationMutation(conv, function() {}, candidate, function(current, validateOnly) {
        if (JSON.stringify(current.group || null) !== source) return false;
        if (!validateOnly) {
            current.group.speakerStrategy = JSON.parse(JSON.stringify(normalized));
            current.updated = candidate.updated;
            current._nextGroupSpeaker = normalized.mode === 'manual' ? getManualGroupSpeaker(current) : getNextGroupSpeaker(current);
        }
        return true;
    });
    cancelGroupAutoRounds(t('group_strategy_config_changed'));
    return normalized;
}

function cancelGroupAutoRounds(reason) {
    if (!groupAutoRoundState) return false;
    if (groupAutoRoundState.timer) clearTimeout(groupAutoRoundState.timer);
    groupAutoRoundState.stopped = true;
    groupAutoRoundState = null;
    if (typeof renderGroupAutoRoundStatus === 'function') renderGroupAutoRoundStatus(reason || t('group_strategy_stopped'));
    return true;
}

function showGroupAutoRoundFailure(message) {
    var dialogs = typeof document !== 'undefined' && typeof document.querySelectorAll === 'function'
        ? document.querySelectorAll('dialog.feature-dialog[open]') : [];
    var error = null;
    for (var index = dialogs.length - 1; index >= 0 && !error; index--) error = dialogs[index].querySelector('.feature-error');
    if (error) { error.textContent = message; return; }
    alert(message);
}

function isGroupAutoRoundsActive() {
    return !!groupAutoRoundState;
}

function startGroupAutoRounds(conv, count, intervalSec) {
    if (!isGroupChat(conv)) throw new Error(t('group_strategy_not_group'));
    if (getActiveConv() !== conv || !isLiveConversation(conv)) throw new Error(t('group_strategy_wrong_conversation'));
    if (state.isGenerating || conv._messageCommitInProgress || groupAutoRoundState) throw new Error(t('group_strategy_auto_busy'));
    var strategy = getGroupSpeakerStrategy(conv);
    if (strategy.mode === 'manual') throw new Error(t('group_strategy_manual_auto'));
    var raw = Object.assign({}, strategy, { autoRoundCount: count, autoRoundIntervalSec: intervalSec });
    strategy = validateGroupSpeakerStrategy(conv, raw);
    if (!getGroupSpeakerForMode(conv, strategy.mode)) throw new Error(strategy.mode === 'probability' ? t('group_strategy_zero_weights') : t('group_strategy_no_unmuted'));
    groupAutoRoundState = {
        runId: ++groupAutoRoundRunId,
        conversationId: conv.id,
        conv: conv,
        remaining: strategy.autoRoundCount,
        completed: 0,
        intervalMs: strategy.autoRoundIntervalSec * 1000,
        timer: null,
        stopped: false
    };
    if (typeof renderGroupAutoRoundStatus === 'function') renderGroupAutoRoundStatus(t('group_strategy_auto_started'));
    startGroupAutoTurn(groupAutoRoundState);
}

function startGroupAutoTurn(run) {
    if (!run || groupAutoRoundState !== run || run.stopped) return;
    var conv = run.conv;
    if (getActiveConv() !== conv || !isLiveConversation(conv) || run.conversationId !== conv.id) {
        cancelGroupAutoRounds(t('group_strategy_stopped'));
        return;
    }
    if (state.isGenerating || conv._messageCommitInProgress) {
        cancelGroupAutoRounds(t('group_strategy_auto_busy'));
        return;
    }
    var strategy = getGroupSpeakerStrategy(conv);
    var speaker = getGroupSpeakerForMode(conv, strategy.mode);
    if (!speaker) {
        cancelGroupAutoRounds(strategy.mode === 'probability' ? t('group_strategy_zero_weights') : t('group_strategy_no_unmuted'));
        return;
    }
    conv._nextGroupSpeaker = speaker;
    if (typeof requestFullRender === 'function') requestFullRender();
    // The run owns the in-flight request until it settles. Cancelling future rounds must not
    // discard the current completion; only a new request may replace this ownership.
    run.turnActive = true;
    streamChat(
        function(token, fullContent, fullCot) {
            if (run.turnActive && getActiveConv() === conv && isLiveConversation(conv)) updateStreamingBubble(fullContent, conv, getCurrentGeneratingSpeakerName(conv), fullCot);
        },
        function(fullContent, fullCot, usage, completion) {
            if (!run.turnActive) return;
            run.turnActive = false;
            return handlePrimaryAssistantComplete(fullContent, fullCot, usage, conv, completion);
        },
        function(error) {
            if (!run.turnActive) return;
            run.turnActive = false;
            var streamingEl = document.getElementById('streamingMsg');
            if (streamingEl) streamingEl.remove();
            state.isGenerating = false;
            appStore.notify('isGenerating');
            renderMessagesOnly();
            var message = t('group_strategy_auto_failed') + ': ' + (error.message || error);
            cancelGroupAutoRounds(message);
            showGroupAutoRoundFailure(message);
        },
        conv
    );
    updateInputState();
}

function advanceGroupAutoRounds(conv) {
    var run = groupAutoRoundState;
    if (!run || run.conv !== conv || run.stopped) return;
    if (getActiveConv() !== conv || !isLiveConversation(conv)) {
        cancelGroupAutoRounds(t('group_strategy_stopped'));
        return;
    }
    run.remaining--;
    run.completed++;
    if (run.remaining <= 0) {
        var message = t('group_strategy_auto_finished');
        groupAutoRoundState = null;
        if (typeof renderGroupAutoRoundStatus === 'function') renderGroupAutoRoundStatus(message);
        return;
    }
    if (typeof renderGroupAutoRoundStatus === 'function') {
        renderGroupAutoRoundStatus(t('group_strategy_auto_progress') + ' ' + run.completed + '/' + (run.completed + run.remaining));
    }
    run.timer = setTimeout(function() {
        run.timer = null;
        startGroupAutoTurn(run);
    }, run.intervalMs);
}

function failGroupAutoRounds(conv, reason) {
    if (groupAutoRoundState && groupAutoRoundState.conv === conv) cancelGroupAutoRounds(reason || t('group_strategy_auto_failed'));
}
