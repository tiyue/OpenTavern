/**
 * 新手导读（文件：66-summary-manager-events.js）
 *
 * 负责什么：这是“导入与弹窗事件”中的“总结、管理器、事件”部分。
 * 在程序中的位置：它把文件选择、提示词查看器和总结管理器的按钮连接到业务函数。
 * 从哪里开始看：主要从 `closeSummaryManager(无参数)`、`showSummaryRecentMode(无参数)`、`showSummaryRangeMode(无参数)`、`bindSummaryManagerWorkflowEvents(无参数)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：事件处理函数要防止重复触发，并在异步操作期间正确显示状态。
 */
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
