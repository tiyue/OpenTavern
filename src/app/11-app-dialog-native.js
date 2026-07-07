// ==================== App Dialog Native Fallback ====================
const nativeAlert = window.alert ? window.alert.bind(window) : null;
const nativeConfirm = window.confirm ? window.confirm.bind(window) : null;

function resolveNativeAppDialogFallback(options) {
    if (options.showCancel && nativeConfirm) return nativeConfirm(String(options.message || ''));
    if (nativeAlert) nativeAlert(String(options.message || ''));
    return true;
}
