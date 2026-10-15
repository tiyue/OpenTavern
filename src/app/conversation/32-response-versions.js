// 回复版本保存正文及关联二阶段消息；原始对象中的未知扩展也保留。
function cloneResponseMessage(msg) {
    var clone = JSON.parse(JSON.stringify(msg));
    delete clone.responseVersions;
    delete clone.selectedResponseVersionId;
    return clone;
}

function captureResponseVersion(conv, msg) {
    var version = {
        id: makeId(),
        created: Date.now(),
        message: cloneResponseMessage(msg),
        secondMessages: conv.messages.filter(function(m) {
            return m.stage === 'second' && m.parentId === msg.id;
        }).map(cloneResponseMessage)
    };
    if (typeof bindMvuResponseVersion === 'function') bindMvuResponseVersion(conv, msg, version);
    return version;
}

function getResponseVersions(msg) {
    return (Array.isArray(msg && msg.responseVersions) ? msg.responseVersions : []).filter(function(version) {
        return version && typeof version.id === 'string' && version.id && version.message && version.message.role === 'assistant' &&
            version.message.stage !== 'second' && typeof version.message.content === 'string' && version.message.content.trim() &&
            Array.isArray(version.secondMessages) && version.secondMessages.every(function(second) {
                return second && typeof second.id === 'string' && second.id && second.role === 'assistant' && second.stage === 'second' && typeof second.content === 'string';
            });
    });
}

function prepareResponseVersions(conv, msg) {
    var versions = Array.isArray(msg.responseVersions) ? msg.responseVersions.slice() : [];
    var seconds = conv.messages.filter(function(m) { return m.stage === 'second' && m.parentId === msg.id; });
    var current = getResponseVersions(msg).find(function(version) {
        return version.id === msg.selectedResponseVersionId && getMessageRevision(version.message) === getMessageRevision(msg) &&
            (typeof mvuResponseVersionMatches !== 'function' || mvuResponseVersionMatches(msg, version)) &&
            version.secondMessages.length === seconds.length && version.secondMessages.every(function(second, index) {
                return second.id === seconds[index].id && getMessageRevision(second) === getMessageRevision(seconds[index]);
            });
    });
    if (!current) {
        current = captureResponseVersion(conv, msg);
        versions.push(current);
    }
    return { versions: versions, current: current };
}

function replaceResponseGroup(conv, targetId, message, secondMessages) {
    var index = conv.messages.findIndex(function(m) { return m.id === targetId && m.stage !== 'second'; });
    if (index < 0) return false;
    conv.messages = conv.messages.filter(function(m) { return m.id !== targetId && !(m.stage === 'second' && m.parentId === targetId); });
    conv.messages.splice.apply(conv.messages, [index, 0, message].concat(secondMessages));
    normalizeConversationMessageIdentity(conv);
    refreshSummaryValidity(conv);
    conv.updated = Date.now();
    conv._wiCache = null;
    conv._lastRenderedVisibleCount = 0;
    return true;
}

async function commitResponseVersion(conv, target, version, versions, sourcesMatch) {
    if (!isLiveConversation(conv) || conv.messages.indexOf(target) < 0 || conv._messageCommitInProgress) throw new Error(t('generation_target_changed'));
    var before = conv.messages.slice();
    var oldUpdated = conv.updated;
    var oldRevision = getMessageRevision(target);
    var mvuSource = typeof getMvuContextStamp === 'function' ? getMvuContextStamp(conv) : null;
    var message = cloneResponseMessage(version.message);
    message.id = target.id;
    message.responseVersions = versions;
    message.selectedResponseVersionId = version.id;
    var seconds = version.secondMessages.map(cloneResponseMessage);
    seconds.forEach(function(m) { m.parentId = message.id; m.parentRevision = getMessageRevision(message); });
    var candidate = Object.assign({}, conv, { messages: conv.messages.slice(), summaries: (conv.summaries || []).map(function(s) { return Object.assign({}, s); }), mvu: conv.mvu ? JSON.parse(JSON.stringify(conv.mvu)) : undefined });
    replaceResponseGroup(candidate, target.id, message, seconds);
    if (typeof refreshMvuCandidate === 'function') refreshMvuCandidate(candidate);
    var commitUpdated = candidate.updated;
    function commit(c, validateOnly) {
        var current = c.messages.find(function(m) { return m.id === target.id && m.stage !== 'second'; });
        if (!current || getMessageRevision(current) !== oldRevision || (mvuSource !== null && getMvuContextStamp(c) !== mvuSource) || (sourcesMatch && !sourcesMatch(c))) return false;
        if (validateOnly) return true;
        var currentUpdated = c.updated;
        replaceResponseGroup(c, target.id, JSON.parse(JSON.stringify(message)), seconds.map(function(m) { return JSON.parse(JSON.stringify(m)); }));
        c.updated = currentUpdated === oldUpdated ? commitUpdated : currentUpdated;
        if (typeof commitMvuCandidate === 'function') commitMvuCandidate(c, candidate);
        return true;
    }
    var candidateIds = new Set([message.id].concat(seconds.map(function(m) { return m.id; })));
    function rollback(c) {
        var current = c.messages.find(function(m) { return m.id === target.id; });
        if (!current || current.selectedResponseVersionId !== version.id) return;
        var currentById = new Map(c.messages.map(function(m) { return [m.id, m]; }));
        var oldIds = new Set(before.map(function(m) { return m.id; }));
        var extra = c.messages.filter(function(m) { return !oldIds.has(m.id) && !candidateIds.has(m.id); });
        c.messages = before.map(function(m) {
            return m.id === target.id || (m.stage === 'second' && m.parentId === target.id) ? JSON.parse(JSON.stringify(m)) : (currentById.get(m.id) || m);
        }).concat(extra);
        if (c.updated === commitUpdated) c.updated = oldUpdated;
        refreshSummaryValidity(c);
    }
    await persistConversationMutation(conv, rollback, candidate, commit);
    try { if (typeof pruneCardRuntimeInstances === 'function') pruneCardRuntimeInstances(); }
    catch (error) { reportPersistPostSaveError('card runtime cleanup', error); }
    if (!isLiveConversation(conv)) throw new Error(t('generation_target_changed'));
    if (isLiveConversation(conv) && getActiveConv() === conv) {
        renderMessagesOnly();
        renderTokenBar();
    }
    return message;
}

async function switchResponseVersion(actualIdx, direction) {
    if (state.isGenerating) return;
    var conv = getActiveConv();
    var target = conv && conv.messages[actualIdx];
    if (!target || !getResponseVersions(target).length || !isLiveConversation(conv)) return;
    var prepared = prepareResponseVersions(conv, target);
    var versions = getResponseVersions({ responseVersions: prepared.versions });
    var index = versions.findIndex(function(v) { return v.id === prepared.current.id; });
    var version = versions[index + direction];
    if (!version || !isLiveConversation(conv)) return;
    state.isGenerating = true;
    appStore.notify('isGenerating');
    try {
        await commitResponseVersion(conv, target, version, prepared.versions);
    } catch (error) {
        alert(t('generation_save_failed') + ': ' + error.message);
    } finally {
        state.isGenerating = false;
        appStore.notify('isGenerating');
    }
}

function renderResponseVersionControls(msg, actualIdx) {
    var versions = getResponseVersions(msg);
    var index = versions.findIndex(function(v) { return v.id === msg.selectedResponseVersionId; });
    var count = versions.length;
    if (count && index < 0) { index = count; count++; }
    if (count < 2) return '';
    return '<span class="inline-flex items-center gap-1 text-xs text-zinc-400">' +
        '<button class="msg-action-btn" data-action="version-prev" data-msg-idx="' + actualIdx + '" aria-label="' + t('response_version_previous') + '"' + (index <= 0 ? ' disabled' : '') + '>‹</button>' +
        '<span>' + t('response_version') + ' ' + (index + 1) + '/' + count + (versions[index] && versions[index].interrupted ? ' · ' + t('response_version_incomplete') : '') + '</span>' +
        '<button class="msg-action-btn" data-action="version-next" data-msg-idx="' + actualIdx + '" aria-label="' + t('response_version_next') + '"' + (index >= count - 1 ? ' disabled' : '') + '>›</button></span>';
}
