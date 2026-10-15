/**
 * 新手导读（文件：55-summary-history-render.js）
 *
 * 负责什么：这是“总结历史界面”中的“总结、历史记录、渲染”部分。
 * 在程序中的位置：它展示已有总结并提供查看、编辑和删除操作。
 * 从哪里开始看：主要从 `getSummaryHistoryMessageCount(conv)`、`buildSummaryHistoryRangeText(summary, currentMsgCount)`、`buildSummaryHistoryItemHtml(summary, currentMsgCount)`、`bindSummaryHistoryActions(container)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：删除总结会改变后续提示词内容，操作后必须保存并重新渲染。
 */
// 摘要历史渲染辅助：计算消息数量并生成摘要列表项的显示内容。
function getSummaryHistoryMessageCount(conv) {
    return (conv.messages || []).filter(function(m) { return m.role !== 'system'; }).length;
}

function buildSummaryHistoryRangeText(summary, currentMsgCount) {
    if (typeof summary.coveredEnd === 'number' && summary.coveredEnd > currentMsgCount + 50) {
        return '历史摘要（已压缩）';
    }
    return t('summary_covered') + (summary.coveredStart + 1) + t('summary_to') + (summary.coveredEnd + 1) + t('summary_turns_suffix');
}

function buildSummaryHistoryItemHtml(summary, currentMsgCount) {
    summary.validity = getSummaryValidity(summary, getActiveConv());
    var rangeText = buildSummaryHistoryRangeText(summary, currentMsgCount);
    var date = new Date(summary.created).toLocaleString();
    var html = '<div class="glass rounded-xl p-4 group" data-summary-id="' + summary.id + '">';
    html += '<div class="flex items-center justify-between mb-2">';
    html += '<span class="text-[10px] text-zinc-500">' + date + ' &middot; ' + rangeText + '</span>';
    html += '<div class="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-all">';
    html += '<button class="summary-edit-btn w-5 h-5 rounded-lg flex items-center justify-center text-zinc-500 hover:text-amber-400 hover:bg-amber-500/10 transition-all text-[10px]" data-edit-id="' + summary.id + '" title="' + t('summary_edit') + '">&#9998;</button>';
    html += '<button class="summary-del-btn w-5 h-5 rounded-lg flex items-center justify-center text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-all text-xs" data-del-id="' + summary.id + '" title="Delete">&times;</button>';
    html += '</div></div>';
    html += '<div class="mb-2 leading-relaxed">' + renderSummaryValidityLabel(summary) + '</div>';
    html += '<p class="text-xs text-zinc-300 leading-relaxed summary-text" data-text-id="' + summary.id + '">' + escapeHtml(summary.text) + '</p>';
    html += '</div>';
    return html;
}

function bindSummaryHistoryActions(container) {
    container.querySelectorAll('.summary-edit-btn').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            var id = btn.getAttribute('data-edit-id');
            editSummary(id);
        });
    });
    container.querySelectorAll('.summary-del-btn').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            var id = btn.getAttribute('data-del-id');
            deleteSummary(id);
        });
    });
}
