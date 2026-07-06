// ==================== Auto Summarization Threshold Helpers ====================
function isUnderContextPressure(messageCount) {
    var contextMax = state.settings.contextLength || 20;
    return messageCount > contextMax;
}

function getAutoSummaryThreshold(settings) {
    return (settings && settings.summaryThreshold) || 12;
}

function getAutoSummaryTargetKeep(threshold) {
    return Math.max(4, Math.floor(threshold * 0.38));
}

function getAutoSummaryMinBatch(threshold) {
    return Math.max(5, Math.floor(threshold * 0.38));
}

function getMaxSummaryCoveredEnd(summaries) {
    var max = -1;
    if (!summaries || summaries.length === 0) return max;

    summaries.forEach(function(s) {
        if (typeof s.coveredEnd === 'number' && s.coveredEnd > max) {
            max = s.coveredEnd;
        }
    });
    return max;
}

function getActualVisibleCountForSummary() {
    var conv = getActiveConv();
    if (!conv) return 0;

    var regularMsgs = getAutoSummaryRegularMessages(conv);
    var lastCovered = getMaxSummaryCoveredEnd(conv.summaries || []);

    var visible = (lastCovered >= 0)
        ? Math.max(0, regularMsgs.length - lastCovered - 1)
        : regularMsgs.length;

    var max = state.settings.contextLength || 20;
    if (visible > max) {
        visible = max;
    }
    return visible;
}
