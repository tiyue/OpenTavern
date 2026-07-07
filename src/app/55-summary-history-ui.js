function renderSummaryHistory() {
    var conv = getActiveConv();
    if (!conv || !dom.summaryHistoryList) return;
    var summaries = conv.summaries || [];

    if (summaries.length === 0) {
        dom.summaryHistoryList.innerHTML = '<p class="text-sm text-zinc-500 text-center py-12" data-i18n="summary_no_history">' + t('summary_no_history') + '</p>';
        return;
    }

    var html = '';
    var currentMsgCount = getSummaryHistoryMessageCount(conv);

    for (var i = summaries.length - 1; i >= 0; i--) {
        html += buildSummaryHistoryItemHtml(summaries[i], currentMsgCount);
    }
    dom.summaryHistoryList.innerHTML = html;
    bindSummaryHistoryActions(dom.summaryHistoryList);
}

function editSummary(id) {
    var conv = getActiveConv();
    if (!conv) return;
    var s = conv.summaries.find(function(s) { return s.id === id; });
    if (!s) return;

    // 优先在管理器列表中找，其次在旧历史列表中找
    var textEl = null;
    if (dom.summaryManagerList) textEl = dom.summaryManagerList.querySelector('[data-text-id="' + id + '"]');
    if (!textEl && dom.summaryHistoryList) textEl = dom.summaryHistoryList.querySelector('[data-text-id="' + id + '"]');
    if (!textEl) return;

    var currentText = s.text;
    textEl.innerHTML = '<textarea class="w-full min-h-[80px] px-3 py-2 glass rounded-xl text-xs text-zinc-200 focus:outline-none focus:ring-2 focus:ring-amber-500/30 transition-all resize-none">' + escapeHtml(currentText) + '</textarea>';
    var textarea = textEl.querySelector('textarea');
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);

    function save() {
        s.text = textarea.value.trim();
        conv.updated = Date.now();
        persistState();
        if (typeof updateStorageInfo === 'function') updateStorageInfo(); // 【Storage Fix】
        renderSummaryHistory();
        if (dom.summaryManagerModal && !dom.summaryManagerModal.classList.contains('hidden')) {
            renderSummaryManagerList();
        }
    }
    textarea.addEventListener('blur', save);
    textarea.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(); }
        if (e.key === 'Escape') { textarea.value = currentText; save(); }
    });
}

async function deleteSummary(id) {
    if (!await showGlassConfirm(t('summary_delete_confirm'), { title: '\u5220\u9664\u6458\u8981', danger: true, okText: '\u5220\u9664' })) return;
    var conv = getActiveConv();
    if (!conv) return;
    conv.summaries = conv.summaries.filter(function(s) { return s.id !== id; });
    conv.updated = Date.now();
    persistState();
    renderSummaryHistory();
    // 同时刷新管理器列表（如果打开着）
    if (dom.summaryManagerModal && !dom.summaryManagerModal.classList.contains('hidden')) {
        renderSummaryManagerList();
    }
}
