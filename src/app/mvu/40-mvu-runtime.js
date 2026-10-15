
function canonicalMvuRuntimeValue(value) {
    return JSON.stringify(value, function(_key, current) {
        if (!current || typeof current !== 'object' || Array.isArray(current)) return current;
        var sorted = Object.create(null);
        Object.keys(current).sort().forEach(function(key) { sorted[key] = current[key]; });
        return sorted;
    });
}

function getMvuContextStamp(conv) {
    var initial = getMvuInitialResult(conv).data;
    var storedInitial = conv && conv.mvu && mvuOwn(conv.mvu, 'initial') ? mvuValidateJsonValue(conv.mvu.initial) : null;
    var sources = (conv && Array.isArray(conv.messages) ? conv.messages : []).map(function(message) {
        if (!message || typeof message !== 'object') return null;
        var manual = mvuOwn(message, 'mvuManualData') ? mvuValidateJsonValue(message.mvuManualData) : null;
        var selected = getMvuSelectedResponseVersion(message);
        var selectedManual = selected && mvuOwn(selected.message, 'mvuManualData') ? mvuValidateJsonValue(selected.message.mvuManualData) : null;
        return [message.id || '', getMessageRevision(message), message.selectedResponseVersionId || '', message.interrupted === true,
            !!(selected && selected.interrupted), message.mvuManualVersionId || '', message.mvuManualSwipeId == null ? null : message.mvuManualSwipeId,
            manual && manual.valid ? manual.data : manual && manual.diagnostics,
            selected && selected.message.mvuManualVersionId || '', selectedManual && selectedManual.valid ? selectedManual.data : selectedManual && selectedManual.diagnostics];
    });
    return canonicalMvuRuntimeValue({ initial: initial, storedInitial: storedInitial && storedInitial.valid ? storedInitial.data : storedInitial && storedInitial.diagnostics, sources: sources });
}

function captureMvuSources(conv) {
    return { id: conv && conv.id, stamp: getMvuContextStamp(conv) };
}

function validateMvuSources(conv, sources) {
    return !!conv && !!sources && conv.id === sources.id && getMvuContextStamp(conv) === sources.stamp;
}

function getMvuManualState(message, diagnostics) {
    if (!mvuOwn(message, 'mvuManualData')) return null;
    if (message.mvuManualVersionId !== getMvuMessageVersionId(message) ||
        (message.selectedResponseVersionId && (!getMvuSelectedResponseVersion(message) || !mvuResponseVersionMatches(message, getMvuSelectedResponseVersion(message))))) {
        diagnostics.push(mvuDiagnostic('mvu-manual-version', '人工覆盖版本未确认，保留原数据但不应用'));
        return null;
    }
    var checked = validateMvuData(message.mvuManualData);
    if (!checked.valid) { diagnostics.push.apply(diagnostics, checked.diagnostics); return null; }
    return checked.data;
}

function replayMvuMessage(data, message, diagnostics) {
    if (!message || message.role !== 'assistant' || message.stage === 'second') return data;
    var selected = getMvuSelectedResponseVersion(message);
    if (message.interrupted === true || selected && selected.interrupted === true) return data;
    var applied = applyMvuContent(data, String(message.content || ''));
    diagnostics.push.apply(diagnostics, applied.diagnostics);
    return getMvuManualState(message, diagnostics) || applied.data;
}

function cacheMvuRuntimeSnapshot(record, index, data) {
    var snapshot = cloneMvuRuntimeValue(data), bytes = mvuUtf8Length(JSON.stringify(snapshot));
    if (record.snapshots.has(index)) record.bytes -= record.snapshots.get(index).bytes;
    record.snapshots.delete(index);
    record.snapshots.set(index, { data: snapshot, bytes: bytes });
    record.bytes += bytes;
    while (record.snapshots.size > MVU_MAX_RUNTIME_SNAPSHOTS || record.bytes > MVU_MAX_RUNTIME_CACHE_BYTES) {
        var oldest = record.snapshots.keys().next().value;
        record.bytes -= record.snapshots.get(oldest).bytes;
        record.snapshots.delete(oldest);
    }
}

function getMvuReplayRecord(conv) {
    if (!conv || typeof conv !== 'object') return { initial: createEmptyMvuData(), current: createEmptyMvuData(), diagnostics: [], snapshots: new Map(), messages: [] };
    var stamp = getMvuContextStamp(conv), cached = mvuRuntimeCache.get(conv);
    if (cached && cached.stamp === stamp) return cached;
    var initial = getMvuInitialResult(conv), data = normalizeMvuData(initial.data);
    var report = mvuRuntimeInitialReports.get(conv);
    var record = { stamp: stamp, initial: cloneMvuRuntimeValue(data), current: null, diagnostics: (report ? report.diagnostics : initial.diagnostics).map(function(item) { return Object.assign({}, item, { messageIndex: -1 }); }), snapshots: new Map(), bytes: 0, messages: Array.isArray(conv.messages) ? conv.messages.slice() : [] };
    record.messages.forEach(function(message, index) {
        var diagnostics = [];
        data = replayMvuMessage(data, message, diagnostics);
        diagnostics.forEach(function(item) { record.diagnostics.push(Object.assign({}, item, { messageId: message && message.id, messageIndex: index })); });
        if ((index + 1) % 100 === 0) cacheMvuRuntimeSnapshot(record, index, data);
    });
    record.current = cloneMvuRuntimeValue(data);
    mvuRuntimeCache.set(conv, record);
    return record;
}

function getMvuMessageIndex(conv, message) {
    var messages = conv && Array.isArray(conv.messages) ? conv.messages : [];
    if (message == null) return messages.length - 1;
    var id = typeof message === 'string' ? message : message && message.id;
    return messages.findIndex(function(item) { return item === message || typeof id === 'string' && item && item.id === id; });
}

function getMvuDataForMessage(conv, message) {
    var record = getMvuReplayRecord(conv), index = getMvuMessageIndex(conv, message);
    if (message != null && index < 0) return cloneMvuRuntimeValue(record.initial);
    if (index === record.messages.length - 1) return cloneMvuRuntimeValue(record.current);
    if (record.snapshots.has(index)) return cloneMvuRuntimeValue(record.snapshots.get(index).data);
    var start = -1, data = record.initial;
    record.snapshots.forEach(function(snapshot, position) { if (position <= index && position > start) { start = position; data = snapshot.data; } });
    data = cloneMvuRuntimeValue(data);
    for (var i = start + 1; i <= index; i++) data = replayMvuMessage(data, record.messages[i], []);
    cacheMvuRuntimeSnapshot(record, index, data);
    return cloneMvuRuntimeValue(data);
}

function getMvuDiagnostics(conv, message) {
    var index = getMvuMessageIndex(conv, message);
    return cloneMvuRuntimeValue(getMvuReplayRecord(conv).diagnostics.filter(function(item) { return item.messageIndex <= index; }));
}

function clearMvuRuntimeCache(conv) {
    if (conv) { mvuRuntimeCache.delete(conv); mvuRuntimeInitialReports.delete(conv); }
    else { mvuRuntimeCache = new WeakMap(); mvuRuntimeInitialReports = new WeakMap(); }
}

function ensureConversationMvu(conv, options) {
    if (!conv || typeof conv !== 'object') return null;
    options = options || {};
    var explicit = mvuOwn(options, 'initial') ? validateMvuData(options.initial) : null;
    var initial = explicit ? { data: explicit.valid ? explicit.data : createEmptyMvuData(), diagnostics: explicit.diagnostics, sources: [] }
        : options.rebuildInitial ? buildMvuInitialData(conv, options) : getMvuInitialResult(conv);
    var old = mvuIsObject(conv.mvu) ? conv.mvu : {};
    conv.mvu = Object.assign(Object.create(null), old, { version: 1, initial: cloneMvuRuntimeValue(initial.data), current: createEmptyMvuData(), initializedAt: Number(old.initializedAt) || Date.now() });
    mvuRuntimeInitialReports.set(conv, initial);
    mvuRuntimeCache.delete(conv);
    conv.mvu.current = getMvuDataForMessage(conv, null);
    return conv.mvu;
}

function refreshMvuCandidate(candidate, options) {
    ensureConversationMvu(candidate, options);
    return candidate;
}

function commitMvuCandidate(target, candidate) {
    if (!target || !candidate || !candidate.mvu) return false;
    var checked = validateMvuData(candidate.mvu.initial);
    if (!checked.valid) return false;
    ensureConversationMvu(target, { initial: checked.data });
    return true;
}
