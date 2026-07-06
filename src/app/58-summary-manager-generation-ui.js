// ==================== Summary Manager Generation UI ====================
function doGenerateSummary() {
    var conv = getActiveConv();
    if (!conv || !dom.summaryGenerateBtn) return;

    var regularMsgs = getSummaryManagerRegularMessages(conv);
    if (regularMsgs.length < 2) {
        alert(t('nothing_to_archive'));
        return;
    }

    setSummaryManagerGenerating(true);
    var selection = getActiveSummarySelection(regularMsgs);
    if (!selection || !selection.subset || selection.subset.length < 2) {
        setSummaryManagerRangeInvalid();
        return;
    }

    performSummarization(selection.subset, selection.startIdx, selection.endIdx, function(err) {
        finishSummaryManagerGeneration(err);
    });
}

function setSummaryManagerGenerating(active) {
    if (dom.summaryManagerStatus) dom.summaryManagerStatus.textContent = active ? t('summary_generating') : '';
    if (dom.summaryGenerateBtn) dom.summaryGenerateBtn.disabled = !!active;
}

function setSummaryManagerRangeInvalid() {
    if (dom.summaryManagerStatus) dom.summaryManagerStatus.textContent = t('summary_range_invalid');
    if (dom.summaryGenerateBtn) dom.summaryGenerateBtn.disabled = false;
}

function finishSummaryManagerGeneration(err) {
    setSummaryManagerGenerating(false);
    if (err) {
        alert('Summary error: ' + (err.message || err));
        return;
    }
    renderSummaryManagerList();
    renderTokenBar();
    if (typeof requestRender === 'function') {
        requestRender(['activeConvId']);
    }
}
