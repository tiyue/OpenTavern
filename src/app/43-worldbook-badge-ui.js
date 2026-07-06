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
