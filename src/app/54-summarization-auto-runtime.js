// ==================== Auto Summarization Runtime ====================
function autoSummarize() {
    if (!state.settings.summaryEnabled) return;

    var conv = getActiveConv();
    if (!conv) return;

    var selection = buildAutoSummarySelection(conv, state.settings, getActualVisibleCountForSummary);
    if (!selection) return;

    performSummarization(selection.subset, selection.startIdx, selection.endIdx, function() {
        renderTokenBar();
    });
}
