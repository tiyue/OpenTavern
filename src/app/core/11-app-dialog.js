/**
 * 新手导读（文件：11-app-dialog.js）
 *
 * 负责什么：这是“应用对话框”中的“应用、对话框”部分。
 * 在程序中的位置：它在设置或生成流程中提供对话框、提醒与确认，并把状态交给界面层。
 * 从哪里开始看：主要从 `showGlassDialog(options)`、`showGlassAlert(message, options)`、`showGlassConfirm(message, options)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：设备能力是异步获得的；修改时要同时考虑成功、失败和用户取消。
 */
// ==================== App Dialog Helpers ====================
let _appDialogQueue = Promise.resolve();

function showGlassDialog(options) {
    options = options || {};
    const run = function() {
        return new Promise(function(resolve) {
            const elements = getAppDialogElements();
            if (!elements.modal) {
                resolve(resolveNativeAppDialogFallback(options));
                return;
            }

            const showCancel = !!options.showCancel;
            applyAppDialogOptions(elements, options);
            var unbind = function() {};

            function cleanup(value) {
                elements.modal.classList.add('hidden');
                unbind();
                resolve(value);
            }

            unbind = bindAppDialogControls(elements, showCancel, cleanup);
            elements.modal.classList.remove('hidden');
            focusAppDialogDefaultButton(elements, showCancel);
        });
    };
    const next = _appDialogQueue.then(run, run);
    _appDialogQueue = next.catch(function() {});
    return next;
}

function showGlassAlert(message, options) {
    options = Object.assign({ showCancel: false }, options || {}, { message: message });
    return showGlassDialog(options);
}

function showGlassConfirm(message, options) {
    options = Object.assign({ showCancel: true }, options || {}, { message: message });
    return showGlassDialog(options);
}

window.showGlassAlert = showGlassAlert;
window.showGlassConfirm = showGlassConfirm;
window.alert = function(message) { showGlassAlert(message); };
