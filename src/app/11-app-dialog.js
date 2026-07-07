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
