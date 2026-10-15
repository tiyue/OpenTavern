/**
 * 新手导读（文件：58-summary-manager-open-ui.js）
 *
 * 负责什么：这是“总结管理器界面”中的“总结、管理器、打开、界面”部分。
 * 在程序中的位置：它让用户选择消息范围、查看已有总结并启动手动总结。
 * 从哪里开始看：主要从 `openSummaryManager(无参数)`、`resetSummaryManagerMode(无参数)`、`initializeSummaryManagerDefaults(regularMsgs)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：范围显示使用人类可读编号，而内部数组从 0 开始，转换时要防止差一位。
 */
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
