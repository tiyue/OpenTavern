// ==================== Summary Manager Events ====================
function closeSummaryManager() {
    dom.summaryManagerModal.classList.add('hidden');
}

function showSummaryRecentMode() {
    dom.modeRecentPanel.classList.remove('hidden');
    dom.modeRangePanel.classList.add('hidden');
    dom.modeRecentBtn.classList.add('bg-white/10', 'text-zinc-100');
    dom.modeRangeBtn.classList.remove('bg-white/10', 'text-zinc-100');
    if (dom.rangePreview) dom.rangePreview.innerHTML = '';
}

function showSummaryRangeMode() {
    dom.modeRecentPanel.classList.add('hidden');
    dom.modeRangePanel.classList.remove('hidden');
    dom.modeRangeBtn.classList.add('bg-white/10', 'text-zinc-100');
    dom.modeRecentBtn.classList.remove('bg-white/10', 'text-zinc-100');
}

function bindSummaryManagerWorkflowEvents() {
    dom.summarizeBtn.addEventListener('click', openSummaryManager);

    if (dom.summaryManagerCloseBtn) {
        dom.summaryManagerCloseBtn.addEventListener('click', closeSummaryManager);
    }
    if (dom.summaryManagerBackdrop) {
        dom.summaryManagerBackdrop.addEventListener('click', closeSummaryManager);
    }

    if (dom.modeRecentBtn) {
        dom.modeRecentBtn.addEventListener('click', showSummaryRecentMode);
    }
    if (dom.modeRangeBtn) {
        dom.modeRangeBtn.addEventListener('click', showSummaryRangeMode);
    }

    if (dom.previewRangeBtn) {
        dom.previewRangeBtn.addEventListener('click', previewCustomRange);
    }
    if (dom.rangeStart) {
        dom.rangeStart.addEventListener('input', previewCustomRange);
    }
    if (dom.rangeEnd) {
        dom.rangeEnd.addEventListener('input', previewCustomRange);
    }

    if (dom.summaryGenerateBtn) {
        dom.summaryGenerateBtn.addEventListener('click', doGenerateSummary);
    }
}
