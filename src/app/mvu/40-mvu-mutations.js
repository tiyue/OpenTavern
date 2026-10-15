
function clearMvuManualOverride(message) {
    if (message) ['mvuManualData', 'mvuManualVersionId', 'mvuManualSwipeId'].forEach(function(key) { delete message[key]; });
    return message;
}

function mvuResponseVersionMatches(message, version) {
    if (!message || !version || !version.message) return false;
    var expected = mvuOwn(message, 'mvuManualData') ? message.mvuManualData : null;
    var saved = mvuOwn(version.message, 'mvuManualData') ? version.message.mvuManualData : null;
    return canonicalMvuRuntimeValue(expected) === canonicalMvuRuntimeValue(saved) &&
        (!expected || version.message.mvuManualVersionId === version.id && message.mvuManualVersionId === getMvuMessageVersionId(message));
}

function bindMvuResponseVersion(conv, message, version) {
    if (!version || !version.message) return version;
    if (getMessageRevision(message) !== getMessageRevision(version.message)) clearMvuManualOverride(version.message);
    else {
        var manual = getMvuManualState(message, []);
        if (manual) { version.message.mvuManualData = cloneMvuRuntimeValue(manual); version.message.mvuManualVersionId = version.id; }
    }
    var first = getMvuMainMessages(conv)[0];
    if (first && first.id === message.id) version.mvuInitial = getMvuInitialData(conv);
    return version;
}

function prepareMvuGreetingCandidate(conv, version, options) {
    options = Object.assign({}, options || {});
    if (!version || !version.message) return version;
    if (options.rebuildInitial === false) version.mvuInitial = getMvuInitialData(conv);
    else {
        if (!mvuOwn(options, 'greetingText')) options.greetingText = version.message.content;
        version.mvuInitial = cloneMvuRuntimeValue(buildMvuInitialData(conv, options).data);
    }
    return version;
}

async function replaceMvuDataForMessage(conv, message, value, options) {
    options = options || {};
    var checked = validateMvuData(value);
    if (!checked.valid) throw new Error(checked.diagnostics.map(function(item) { return item.message; }).join('；'));
    var index = message == null ? (conv && conv.messages || []).findLastIndex(function(item) { return item && item.role === 'assistant' && item.stage !== 'second'; }) : getMvuMessageIndex(conv, message);
    var original = conv && conv.messages && conv.messages[index];
    if (!isLiveConversation(conv) || !original || original.role !== 'assistant' || original.stage === 'second' || conv._messageCommitInProgress) throw new Error('变量写入目标已变化或正在保存');
    var sources = captureMvuSources(conv);
    if (options.expectedStamp != null && options.expectedStamp !== sources.stamp) throw new Error('变量写入基线已变化');
    function permitted() { return typeof options.validate !== 'function' || options.validate() !== false; }
    if (!permitted()) throw new Error('变量写入许可已失效');
    var candidate = Object.assign({}, conv, { messages: cloneMvuRuntimeValue(conv.messages), summaries: cloneMvuRuntimeValue(conv.summaries || []) });
    var target = candidate.messages[index], selected = getMvuSelectedResponseVersion(target);
    if (target.selectedResponseVersionId && !selected) throw new Error('变量写入的回复版本未确认');
    target.mvuManualData = cloneMvuRuntimeValue(checked.data);
    target.mvuManualVersionId = getMvuMessageVersionId(target);
    if (selected) {
        selected.message.mvuManualData = cloneMvuRuntimeValue(checked.data);
        selected.message.mvuManualVersionId = selected.id;
    }
    candidate.updated = Date.now();
    refreshMvuCandidate(candidate);
    var beforeMessage = cloneMvuRuntimeValue(original), beforeUpdated = conv.updated, committedStamp = null;
    function copyManual(destination, source) {
        ['mvuManualData', 'mvuManualVersionId', 'mvuManualSwipeId'].forEach(function(key) {
            if (mvuOwn(source, key)) destination[key] = cloneMvuRuntimeValue(source[key]);
            else delete destination[key];
        });
        var id = source.selectedResponseVersionId;
        if (id && Array.isArray(destination.responseVersions) && Array.isArray(source.responseVersions)) {
            var sourceVersion = source.responseVersions.find(function(version) { return version.id === id; });
            destination.responseVersions = destination.responseVersions.map(function(version) {
                if (version.id !== id || !sourceVersion) return version;
                var copy = cloneMvuRuntimeValue(version);
                ['mvuManualData', 'mvuManualVersionId', 'mvuManualSwipeId'].forEach(function(key) {
                    if (mvuOwn(sourceVersion.message, key)) copy.message[key] = cloneMvuRuntimeValue(sourceVersion.message[key]);
                    else delete copy.message[key];
                });
                return copy;
            });
        }
    }
    function commit(current, validateOnly) {
        if (!validateMvuSources(current, sources) || !permitted()) return false;
        if (validateOnly) return true;
        var liveMessage = current.messages.find(function(item) { return item.id === original.id; });
        if (!liveMessage) return false;
        copyManual(liveMessage, target);
        if (current.updated === beforeUpdated) current.updated = candidate.updated;
        if (!commitMvuCandidate(current, candidate)) return false;
        if (current === conv) committedStamp = getMvuContextStamp(current);
        return true;
    }
    await persistConversationMutation(conv, function(current) {
        if (!committedStamp || getMvuContextStamp(current) !== committedStamp) return;
        var liveMessage = current.messages.find(function(item) { return item.id === original.id; });
        if (liveMessage) copyManual(liveMessage, beforeMessage);
        if (current.updated === candidate.updated) current.updated = beforeUpdated;
        ensureConversationMvu(current);
    }, candidate, commit);
    if (typeof appStore !== 'undefined' && appStore && typeof appStore.notify === 'function') {
        try { appStore.notify('conversations'); } catch (error) { if (typeof reportPersistPostSaveError === 'function') reportPersistPostSaveError('MVU notification', error); }
    }
    return getMvuDataForMessage(conv, original.id);
}
