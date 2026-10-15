/**
 * 新手导读（文件：58-summary-manager-generation-ui.js）
 *
 * 负责什么：这是“总结管理器界面”中的“总结、管理器、内容生成、界面”部分。
 * 在程序中的位置：它让用户选择消息范围、查看已有总结并启动手动总结。
 * 从哪里开始看：主要从 `doGenerateSummary(无参数)`、`setSummaryManagerGenerating(active)`、`setSummaryManagerRangeInvalid(无参数)`、`finishSummaryManagerGeneration(err)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：范围显示使用人类可读编号，而内部数组从 0 开始，转换时要防止差一位。
 */
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
