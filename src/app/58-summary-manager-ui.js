// ==================== 总结管理器（问题3 完整实现） ====================
// renderSummaryManagerList：渲染左侧历史列表（与旧 renderSummaryHistory 逻辑类似，但目标容器不同）
function renderSummaryManagerList() {
    var conv = getActiveConv();
    if (!conv || !dom.summaryManagerList) return;
    var summaries = conv.summaries || [];

    if (summaries.length === 0) {
        dom.summaryManagerList.innerHTML = '<p class="text-sm text-zinc-500 text-center py-8" data-i18n="summary_no_history">' + t('summary_no_history') + '</p>';
        return;
    }

    var html = '';
    var currentMsgCount = conv.messages.filter(function(m){ return m.role !== 'system'; }).length;

    for (var i = summaries.length - 1; i >= 0; i--) {
        var s = summaries[i];
        var rangeText;

        // 裁剪后旧摘要的索引会严重失真，这里做保护性显示
        if (typeof s.coveredEnd === 'number' && s.coveredEnd > currentMsgCount + 50) {
            rangeText = '历史摘要（已压缩）';
        } else {
            rangeText = t('summary_covered') + (s.coveredStart + 1) + t('summary_to') + (s.coveredEnd + 1) + t('summary_turns_suffix') +
                        (s.coveredStart < 0 ? ' ' + t('summary_covered_legacy') : '');
        }
        var date = new Date(s.created).toLocaleString();
        html += '<div class="glass rounded-xl p-3 group" data-summary-id="' + s.id + '">';
        html += '<div class="flex items-center justify-between mb-1.5">';
        html += '<span class="text-[10px] text-zinc-500">' + date + ' &middot; ' + rangeText + '</span>';
        html += '<div class="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-all">';
        html += '<button class="summary-edit-btn w-5 h-5 rounded-lg flex items-center justify-center text-zinc-500 hover:text-amber-400 hover:bg-amber-500/10 transition-all text-[10px]" data-edit-id="' + s.id + '" title="' + t('summary_edit') + '">&#9998;</button>';
        html += '<button class="summary-del-btn w-5 h-5 rounded-lg flex items-center justify-center text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-all text-xs" data-del-id="' + s.id + '" title="Delete">&times;</button>';
        html += '</div></div>';
        html += '<p class="text-xs text-zinc-300 leading-relaxed summary-text" data-text-id="' + s.id + '">' + escapeHtml(s.text) + '</p>';
        html += '</div>';
    }
    dom.summaryManagerList.innerHTML = html;

    // 绑定编辑/删除（与旧逻辑一致）
    dom.summaryManagerList.querySelectorAll('.summary-edit-btn').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            var id = btn.getAttribute('data-edit-id');
            editSummary(id); // 复用旧的 editSummary（它操作 summaryHistoryList，但我们会让它更健壮）
        });
    });
    dom.summaryManagerList.querySelectorAll('.summary-del-btn').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            var id = btn.getAttribute('data-del-id');
            deleteSummary(id);
            // 删除后刷新管理器列表
            setTimeout(renderSummaryManagerList, 50);
        });
    });
}

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
