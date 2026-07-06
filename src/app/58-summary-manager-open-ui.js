// ==================== Summary Manager Open UI ====================
function openSummaryManager() {
    var conv = getActiveConv();
    if (!conv) return;
    var regularMsgs = getSummaryManagerRegularMessages(conv);
    if (regularMsgs.length < 2) {
        alert(t('nothing_to_archive'));
        return;
    }

    resetSummaryManagerMode();
    initializeSummaryManagerDefaults(regularMsgs);
    renderSummaryManagerList();
    dom.summaryManagerModal.classList.remove('hidden');
}

function resetSummaryManagerMode() {
    if (dom.modeRecentPanel) dom.modeRecentPanel.classList.remove('hidden');
    if (dom.modeRangePanel) dom.modeRangePanel.classList.add('hidden');
    if (dom.modeRecentBtn) dom.modeRecentBtn.classList.add('bg-white/10', 'text-zinc-100');
    if (dom.modeRangeBtn) dom.modeRangeBtn.classList.remove('bg-white/10', 'text-zinc-100');
}

function initializeSummaryManagerDefaults(regularMsgs) {
    if (dom.summaryRecentTurns) {
        dom.summaryRecentTurns.value = Math.min(8, Math.floor(regularMsgs.length / 2));
    }
    if (dom.rangeStart) dom.rangeStart.value = 1;
    if (dom.rangeEnd) dom.rangeEnd.value = Math.min(12, regularMsgs.length);
    if (dom.summaryManagerStatus) dom.summaryManagerStatus.textContent = '';
    if (dom.rangePreview) dom.rangePreview.innerHTML = '';
}
