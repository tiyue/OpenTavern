/**
 * 新手导读（文件：55-summary-history-ui.js）
 *
 * 负责什么：这是“总结历史界面”中的“总结、历史记录、界面”部分。
 * 在程序中的位置：它展示已有总结并提供查看、编辑和删除操作。
 * 从哪里开始看：主要从 `renderSummaryHistory(无参数)`、`editSummary(id)`、`deleteSummary(id)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：删除总结会改变后续提示词内容，操作后必须保存并重新渲染。
 */
// 摘要历史界面：展示已有摘要并提供编辑、删除和范围预览入口。
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
