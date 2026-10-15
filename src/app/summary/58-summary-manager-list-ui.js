/**
 * 新手导读（文件：58-summary-manager-list-ui.js）
 *
 * 负责什么：这是“总结管理器界面”中的“总结、管理器、列表、界面”部分。
 * 在程序中的位置：它让用户选择消息范围、查看已有总结并启动手动总结。
 * 从哪里开始看：主要从 `renderSummaryManagerList(无参数)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：范围显示使用人类可读编号，而内部数组从 0 开始，转换时要防止差一位。
 */
// ==================== Summary Manager List UI ====================
function renderSummaryManagerList() {
    var conv = getActiveConv();
    if (!conv || !dom.summaryManagerList) return;
    refreshSummaryValidity(conv);
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
        html += '<div class="mb-1.5 leading-relaxed">' + renderSummaryValidityLabel(s) + '</div>';
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
