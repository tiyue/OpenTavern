// 摘要覆盖只认可实际来源，不以旧数字范围证明内容仍然有效。
function getSummaryRegularMessages(conv) {
    return (conv && Array.isArray(conv.messages) ? conv.messages : []).filter(function(msg) {
        return msg && msg.role !== 'system';
    });
}

function isSummarySourceMessage(msg) {
    return !!msg && msg.stage !== 'second' && String(msg.content || '').trim().length > 0;
}

function captureSummarySources(messages) {
    return messages.filter(isSummarySourceMessage).map(function(msg) {
        return { id: msg.id, revision: getMessageRevision(msg) };
    });
}

function getSummarySourceRange(summary, regular) {
    if (!summary || summary.summaryVersion !== 2 || !Array.isArray(summary.sourceMessages) ||
        summary.sourceMessages.length < 2 || summary.sourceAmbiguous || !String(summary.text || '').trim()) return null;
    var positions = new Map();
    regular.forEach(function(msg, index) { if (msg && msg.id) positions.set(msg.id, index); });
    var indexes = [];
    for (var i = 0; i < summary.sourceMessages.length; i++) {
        var source = summary.sourceMessages[i];
        var index = source && positions.get(source.id);
        if (!Number.isInteger(index) || (i && index <= indexes[i - 1]) ||
            source.revision !== getMessageRevision(regular[index]) || !isSummarySourceMessage(regular[index])) return null;
        indexes.push(index);
    }
    var start = indexes[0], end = indexes[indexes.length - 1];
    if (regular.slice(start, end + 1).filter(isSummarySourceMessage).length !== indexes.length) return null;
    return { start: start, end: end };
}

function getSummaryValidity(summary, conv) {
    if (!summary || summary.summaryVersion !== 2 || !Array.isArray(summary.sourceMessages)) return 'unverified';
    return getSummarySourceRange(summary, getSummaryRegularMessages(conv)) ? 'valid' : 'invalid';
}

function refreshSummaryValidity(conv) {
    if (!conv) return;
    (conv.summaries || []).forEach(function(summary) { summary.validity = getSummaryValidity(summary, conv); });
}

function getValidConversationSummaries(conv) {
    return (conv && conv.summaries || []).filter(function(summary) { return getSummaryValidity(summary, conv) === 'valid'; });
}

function renderSummaryValidityLabel(summary) {
    var key = summary.validity === 'valid' ? 'summary_valid' : summary.validity === 'invalid' ? 'summary_invalid' : 'summary_unverified';
    return '<span class="text-xs text-zinc-400">' + escapeHtml(t(key)) + '</span>';
}
