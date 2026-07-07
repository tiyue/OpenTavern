// ==================== App Dialog DOM Helpers ====================
function getAppDialogElements() {
    return {
        modal: document.getElementById('appDialogModal'),
        backdrop: document.getElementById('appDialogBackdrop'),
        titleEl: document.getElementById('appDialogTitle'),
        messageEl: document.getElementById('appDialogMessage'),
        iconEl: document.getElementById('appDialogIcon'),
        cancelBtn: document.getElementById('appDialogCancelBtn'),
        okBtn: document.getElementById('appDialogOkBtn')
    };
}

function applyAppDialogOptions(elements, options) {
    const showCancel = !!options.showCancel;

    if (elements.titleEl) elements.titleEl.textContent = options.title || (showCancel ? '\u8bf7\u786e\u8ba4' : '\u63d0\u793a');
    if (elements.messageEl) elements.messageEl.textContent = String(options.message || '');
    if (elements.iconEl) {
        elements.iconEl.textContent = options.icon || (showCancel ? '?' : '!');
        elements.iconEl.className = 'w-9 h-9 rounded-2xl flex items-center justify-center text-lg flex-shrink-0 ' +
            (options.danger ? 'bg-red-500/15 text-red-300' : 'bg-amber-500/15 text-amber-300');
    }
    if (elements.cancelBtn) {
        elements.cancelBtn.style.display = showCancel ? '' : 'none';
        elements.cancelBtn.textContent = options.cancelText || '\u53d6\u6d88';
    }
    if (elements.okBtn) {
        elements.okBtn.textContent = options.okText || '\u786e\u5b9a';
        elements.okBtn.className = 'px-4 py-2.5 rounded-xl text-sm font-semibold text-white shadow-lg transition-all ' +
            (options.danger ? 'bg-red-500 hover:bg-red-400 active:bg-red-600 shadow-red-500/20' : 'bg-amber-500 hover:bg-amber-400 active:bg-amber-600 shadow-amber-500/20');
    }
}

function focusAppDialogDefaultButton(elements, showCancel) {
    setTimeout(function() {
        try { (showCancel && elements.cancelBtn ? elements.cancelBtn : elements.okBtn).focus(); } catch (_) {}
    }, 0);
}
