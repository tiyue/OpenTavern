/**
 * 新手导读（文件：58-summary-manager-range-ui.js）
 *
 * 负责什么：这是“总结管理器界面”中的“总结、管理器、范围、界面”部分。
 * 在程序中的位置：它让用户选择消息范围、查看已有总结并启动手动总结。
 * 从哪里开始看：主要从 `getSummaryManagerRegularMessages(conv)`、`getRecentSummarySelection(regularMsgs)`、`getCustomSummarySelection(regularMsgs)`、`getActiveSummarySelection(regularMsgs)`、`previewCustomRange(无参数)`、`buildSummaryRangePreviewHtml(subset)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：范围显示使用人类可读编号，而内部数组从 0 开始，转换时要防止差一位。
 */
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
