/**
 * 新手导读（文件：11-app-dialog-dom.js）
 *
 * 负责什么：这是“应用对话框”中的“应用、对话框、页面元素”部分。
 * 在程序中的位置：它在设置或生成流程中提供对话框、提醒与确认，并把状态交给界面层。
 * 从哪里开始看：主要从 `getAppDialogElements(无参数)`、`applyAppDialogOptions(elements, options)`、`focusAppDialogDefaultButton(elements, showCancel)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：设备能力是异步获得的；修改时要同时考虑成功、失败和用户取消。
 */
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
