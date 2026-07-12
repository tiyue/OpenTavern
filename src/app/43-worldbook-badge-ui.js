/**
 * 新手导读（文件：43-worldbook-badge-ui.js）
 *
 * 负责什么：这是“世界书编辑界面”中的“世界书、标记、界面”部分。
 * 在程序中的位置：它把世界书和条目显示成表单、列表与按钮，并响应用户编辑。
 * 从哪里开始看：主要从 `renderWorldInfoBadge(无参数)`、`buildWorldInfoBadgeSourceSuffix(conv)`、`renderWorldInfoBudgetWarning(无参数)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：界面修改后要同步回数据模型并持久化，否则刷新页面会丢失更改。
 */
// ==================== World Book Badge UI ====================
function renderWorldInfoBadge() {
    var el = dom.wiEntryCount;
    if (!el) return;

    var conv = getActiveConv();
    if (!conv) {
        el.textContent = '';
        el.title = '';
        return;
    }

    var count = 0;

    if (Array.isArray(conv.worldBookIds) && conv.worldBookIds.length > 0) {
        conv.worldBookIds.forEach(function(wbId) {
            var wb = state.worldBooks && state.worldBooks[wbId];
            if (wb && wb.entries) {
                count += Object.keys(wb.entries).length;
            }
        });
    }

    if (conv.worldInfo && conv.worldInfo.entries) {
        count += Object.keys(conv.worldInfo.entries).length;
    }

    el.textContent = count > 0 ? count : '';
    el.title = count + ' ' + t('world_book_entry') + buildWorldInfoBadgeSourceSuffix(conv);
}

function buildWorldInfoBadgeSourceSuffix(conv) {
    if (!conv.worldBookIds || conv.worldBookIds.length <= 1) return '';
    return ' (\u6765\u81ea ' + conv.worldBookIds.length + ' \u4e2a\u4e16\u754c\u4e66)';
}

function renderWorldInfoBudgetWarning() {
    var el = dom.wiBudgetWarning;
    var textEl = dom.wiBudgetWarningText;
    var dismissBtn = dom.wiBudgetWarningDismiss;
    if (!el || !textEl || !dismissBtn) return;

    var conv = getActiveConv();
    if (!conv || !conv._wiBudgetWarning) {
        el.classList.add('hidden');
        return;
    }

    textEl.textContent = t('wi_budget_warning');
    dismissBtn.textContent = t('wi_budget_warning_dismiss');

    el.classList.remove('hidden');

    if (!dismissBtn._wired) {
        dismissBtn.addEventListener('click', function() {
            if (conv) conv._wiBudgetWarning = false;
            el.classList.add('hidden');
        });
        dismissBtn._wired = true;
    }
}
