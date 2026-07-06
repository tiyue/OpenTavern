// ==================== Summary Manager Workflow UI ====================
// 预览自定义范围（实时计算当前 regularMsgs 的切片）
function previewCustomRange() {
    if (!dom.rangePreview) return;
    var conv = getActiveConv();
    if (!conv) return;

    var regularMsgs = conv.messages.filter(function(m) { return m.role !== 'system'; });
    var start = parseInt(dom.rangeStart.value) || 1;
    var end = parseInt(dom.rangeEnd.value) || 2;

    // 转成 0-based
    var sIdx = Math.max(0, start - 1);
    var eIdx = Math.min(regularMsgs.length - 1, end - 1);

    if (sIdx > eIdx || regularMsgs.length === 0) {
        dom.rangePreview.innerHTML = '<span class="text-red-400">' + t('summary_range_invalid') + '</span>';
        return;
    }

    var subset = regularMsgs.slice(sIdx, eIdx + 1);
    var previewText = subset.slice(0, 2).map(function(m) {
        return (m.role === 'user' ? 'You' : 'Assistant') + ': ' + m.content.slice(0, 60) + (m.content.length > 60 ? '...' : '');
    }).join('<br>');

    var countStr = t('summary_preview_count').replace('{n}', subset.length);
    dom.rangePreview.innerHTML = countStr + '<br><span class="opacity-70">' + previewText + '</span>';
}

// 执行生成（根据当前激活的模式）
function doGenerateSummary() {
    var conv = getActiveConv();
    if (!conv || !dom.summaryGenerateBtn) return;

    var regularMsgs = conv.messages.filter(function(m) { return m.role !== 'system'; });
    if (regularMsgs.length < 2) {
        alert(t('nothing_to_archive'));
        return;
    }

    var isRecentMode = dom.modeRecentPanel && !dom.modeRecentPanel.classList.contains('hidden');

    dom.summaryManagerStatus.textContent = t('summary_generating');
    dom.summaryGenerateBtn.disabled = true;

    var subset, startIdx, endIdx;

    if (isRecentMode) {
        var turns = parseInt(dom.summaryRecentTurns.value) || 8;
        turns = Math.min(turns, Math.floor(regularMsgs.length / 2));
        if (turns < 1) turns = 1;
        var turnCount = turns * 2;
        subset = regularMsgs.slice(-turnCount);
        startIdx = regularMsgs.indexOf(subset[0]);
        endIdx = regularMsgs.indexOf(subset[subset.length - 1]);
    } else {
        // 自定义范围
        var s = parseInt(dom.rangeStart.value) || 1;
        var e = parseInt(dom.rangeEnd.value) || 2;
        var sIdx = Math.max(0, s - 1);
        var eIdx = Math.min(regularMsgs.length - 1, e - 1);
        if (sIdx > eIdx) {
            dom.summaryManagerStatus.textContent = t('summary_range_invalid');
            dom.summaryGenerateBtn.disabled = false;
            return;
        }
        subset = regularMsgs.slice(sIdx, eIdx + 1);
        startIdx = sIdx;
        endIdx = eIdx;
    }

    if (!subset || subset.length < 2) {
        dom.summaryManagerStatus.textContent = t('summary_range_invalid');
        dom.summaryGenerateBtn.disabled = false;
        return;
    }

    performSummarization(subset, startIdx, endIdx, function(err) {
        dom.summaryGenerateBtn.disabled = false;
        dom.summaryManagerStatus.textContent = '';
        if (err) {
            alert('Summary error: ' + (err.message || err));
            return;
        }
        // 刷新列表 + 关闭可能打开的旧小窗 + 更新 token 条
        renderSummaryManagerList();
        renderTokenBar();
        // 同时刷新主聊天（因为消息被裁剪了）
        if (typeof requestRender === 'function') {
            requestRender(['activeConvId']);
        }
    });
}

// 打开总结管理器（统一入口）
function openSummaryManager() {
    var conv = getActiveConv();
    if (!conv) return;
    var regularMsgs = conv.messages.filter(function(m) { return m.role !== 'system'; });
    if (regularMsgs.length < 2) { alert(t('nothing_to_archive')); return; }

    // 默认进入“最近 N 轮”模式
    if (dom.modeRecentPanel) dom.modeRecentPanel.classList.remove('hidden');
    if (dom.modeRangePanel) dom.modeRangePanel.classList.add('hidden');
    if (dom.modeRecentBtn) dom.modeRecentBtn.classList.add('bg-white/10', 'text-zinc-100');
    if (dom.modeRangeBtn) dom.modeRangeBtn.classList.remove('bg-white/10', 'text-zinc-100');

    // 预填默认值
    if (dom.summaryRecentTurns) {
        dom.summaryRecentTurns.value = Math.min(8, Math.floor(regularMsgs.length / 2));
    }
    if (dom.rangeStart) dom.rangeStart.value = 1;
    if (dom.rangeEnd) dom.rangeEnd.value = Math.min(12, regularMsgs.length);

    if (dom.summaryManagerStatus) dom.summaryManagerStatus.textContent = '';
    if (dom.rangePreview) dom.rangePreview.innerHTML = '';

    renderSummaryManagerList();
    dom.summaryManagerModal.classList.remove('hidden');
}
