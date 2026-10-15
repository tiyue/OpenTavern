/**
 * 新手导读（文件：11-app-dialog-events.js）
 *
 * 负责什么：这是“应用对话框”中的“应用、对话框、事件”部分。
 * 在程序中的位置：它在设置或生成流程中提供对话框、提醒与确认，并把状态交给界面层。
 * 从哪里开始看：主要从 `bindAppDialogControls(elements, showCancel, cleanup)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：设备能力是异步获得的；修改时要同时考虑成功、失败和用户取消。
 */
// ==================== App Dialog Event Helpers ====================
function bindAppDialogControls(elements, showCancel, cleanup) {
    function onKeyDown(ev) {
        if (ev.key === 'Escape') cleanup(showCancel ? false : true);
    }

    if (elements.cancelBtn) elements.cancelBtn.onclick = function() { cleanup(false); };
    if (elements.okBtn) elements.okBtn.onclick = function() { cleanup(true); };
    if (elements.backdrop) elements.backdrop.onclick = function() { cleanup(showCancel ? false : true); };
    document.addEventListener('keydown', onKeyDown, true);

    return function unbindAppDialogControls() {
        if (elements.cancelBtn) elements.cancelBtn.onclick = null;
        if (elements.okBtn) elements.okBtn.onclick = null;
        if (elements.backdrop) elements.backdrop.onclick = null;
        document.removeEventListener('keydown', onKeyDown, true);
    };
}
