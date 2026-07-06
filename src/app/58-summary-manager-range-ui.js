// ==================== Summary Manager Range UI ====================
function getSummaryManagerRegularMessages(conv) {
    return conv && Array.isArray(conv.messages)
        ? conv.messages.filter(function(m) { return m.role !== 'system'; })
        : [];
}

function getRecentSummarySelection(regularMsgs) {
    var turns = parseInt(dom.summaryRecentTurns.value) || 8;
    turns = Math.min(turns, Math.floor(regularMsgs.length / 2));
    if (turns < 1) turns = 1;
    var turnCount = turns * 2;
    var subset = regularMsgs.slice(-turnCount);
    return {
        subset: subset,
        startIdx: regularMsgs.indexOf(subset[0]),
        endIdx: regularMsgs.indexOf(subset[subset.length - 1])
    };
}

function getCustomSummarySelection(regularMsgs) {
    var s = parseInt(dom.rangeStart.value) || 1;
    var e = parseInt(dom.rangeEnd.value) || 2;
    var sIdx = Math.max(0, s - 1);
    var eIdx = Math.min(regularMsgs.length - 1, e - 1);
    if (sIdx > eIdx) return null;
    return {
        subset: regularMsgs.slice(sIdx, eIdx + 1),
        startIdx: sIdx,
        endIdx: eIdx
    };
}

function getActiveSummarySelection(regularMsgs) {
    var isRecentMode = dom.modeRecentPanel && !dom.modeRecentPanel.classList.contains('hidden');
    return isRecentMode
        ? getRecentSummarySelection(regularMsgs)
        : getCustomSummarySelection(regularMsgs);
}

function previewCustomRange() {
    if (!dom.rangePreview) return;
    var conv = getActiveConv();
    if (!conv) return;

    var regularMsgs = getSummaryManagerRegularMessages(conv);
    var selection = getCustomSummarySelection(regularMsgs);

    if (!selection || selection.subset.length === 0) {
        dom.rangePreview.innerHTML = '<span class="text-red-400">' + t('summary_range_invalid') + '</span>';
        return;
    }

    dom.rangePreview.innerHTML = buildSummaryRangePreviewHtml(selection.subset);
}

function buildSummaryRangePreviewHtml(subset) {
    var previewText = subset.slice(0, 2).map(function(m) {
        return (m.role === 'user' ? 'You' : 'Assistant') + ': ' + m.content.slice(0, 60) + (m.content.length > 60 ? '...' : '');
    }).join('<br>');
    var countStr = t('summary_preview_count').replace('{n}', subset.length);
    return countStr + '<br><span class="opacity-70">' + previewText + '</span>';
}
