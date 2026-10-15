/**
 * 新手导读（文件：11-app-dialog-native.js）
 *
 * 负责什么：这是“应用对话框”中的“应用、对话框、浏览器原生能力”部分。
 * 在程序中的位置：它在设置或生成流程中提供对话框、提醒与确认，并把状态交给界面层。
 * 从哪里开始看：主要从 `resolveNativeAppDialogFallback(options)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：设备能力是异步获得的；修改时要同时考虑成功、失败和用户取消。
 */
// ==================== App Dialog Native Fallback ====================
const nativeAlert = window.alert ? window.alert.bind(window) : null;
const nativeConfirm = window.confirm ? window.confirm.bind(window) : null;

function resolveNativeAppDialogFallback(options) {
    if (options.showCancel && nativeConfirm) return nativeConfirm(String(options.message || ''));
    if (nativeAlert) nativeAlert(String(options.message || ''));
    return true;
}
