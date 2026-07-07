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
    var rangeText = buildSummaryHistoryRangeText(summary, currentMsgCount);
    var date = new Date(summary.created).toLocaleString();
    var html = '<div class="glass rounded-xl p-4 group" data-summary-id="' + summary.id + '">';
    html += '<div class="flex items-center justify-between mb-2">';
    html += '<span class="text-[10px] text-zinc-500">' + date + ' &middot; ' + rangeText + '</span>';
    html += '<div class="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-all">';
    html += '<button class="summary-edit-btn w-5 h-5 rounded-lg flex items-center justify-center text-zinc-500 hover:text-amber-400 hover:bg-amber-500/10 transition-all text-[10px]" data-edit-id="' + summary.id + '" title="' + t('summary_edit') + '">&#9998;</button>';
    html += '<button class="summary-del-btn w-5 h-5 rounded-lg flex items-center justify-center text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-all text-xs" data-del-id="' + summary.id + '" title="Delete">&times;</button>';
    html += '</div></div>';
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

