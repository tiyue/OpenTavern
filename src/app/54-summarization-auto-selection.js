// ==================== Auto Summarization Selection Helpers ====================
function getAutoSummaryRegularMessages(conv) {
    return conv && Array.isArray(conv.messages)
        ? conv.messages.filter(function(m) { return m.role !== 'system'; })
        : [];
}

function shouldAutoSummarizeByBacklog(currentVisibleCount, targetKeep, minSummarizeBatch) {
    return currentVisibleCount > targetKeep + minSummarizeBatch;
}

function shouldAutoSummarizeByVisibleCount(actualVisibleCount, threshold) {
    return typeof actualVisibleCount === 'number' && actualVisibleCount >= threshold;
}

function buildAutoSummarySelection(conv, settings, getFallbackVisibleCount) {
    var allRegular = getAutoSummaryRegularMessages(conv);
    if (allRegular.length < 6) return null;

    var threshold = getAutoSummaryThreshold(settings);
    var lastCovered = getMaxSummaryCoveredEnd(conv.summaries || []);
    var currentVisibleCount = Math.max(0, allRegular.length - lastCovered - 1);
    var targetKeep = getAutoSummaryTargetKeep(threshold);
    var minSummarizeBatch = getAutoSummaryMinBatch(threshold);

    var shouldSummarize = shouldAutoSummarizeByBacklog(
        currentVisibleCount,
        targetKeep,
        minSummarizeBatch
    );

    if (!shouldSummarize && typeof getFallbackVisibleCount === 'function') {
        shouldSummarize = shouldAutoSummarizeByVisibleCount(getFallbackVisibleCount(), threshold);
    }

    if (!shouldSummarize) return null;

    var newCoveredEnd = allRegular.length - targetKeep - 1;
    if (newCoveredEnd <= lastCovered) return null;

    var toSummarize = allRegular.slice(lastCovered + 1, newCoveredEnd + 1);
    if (toSummarize.length < 5) return null;

    return {
        subset: toSummarize,
        startIdx: lastCovered + 1,
        endIdx: newCoveredEnd,
        threshold: threshold,
        targetKeep: targetKeep,
        minSummarizeBatch: minSummarizeBatch,
        currentVisibleCount: currentVisibleCount
    };
}
