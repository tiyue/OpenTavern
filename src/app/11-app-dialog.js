// ==================== App Dialog Helpers ====================
const nativeAlert = window.alert ? window.alert.bind(window) : null;
const nativeConfirm = window.confirm ? window.confirm.bind(window) : null;
let _appDialogQueue = Promise.resolve();

function showGlassDialog(options) {
    options = options || {};
    const run = function() {
        return new Promise(function(resolve) {
            const modal = document.getElementById('appDialogModal');
            if (!modal) {
                if (options.showCancel && nativeConfirm) resolve(nativeConfirm(String(options.message || '')));
                else {
                    if (nativeAlert) nativeAlert(String(options.message || ''));
                    resolve(true);
                }
                return;
            }

            const backdrop = document.getElementById('appDialogBackdrop');
            const titleEl = document.getElementById('appDialogTitle');
            const messageEl = document.getElementById('appDialogMessage');
            const iconEl = document.getElementById('appDialogIcon');
            const cancelBtn = document.getElementById('appDialogCancelBtn');
            const okBtn = document.getElementById('appDialogOkBtn');
            const showCancel = !!options.showCancel;

            if (titleEl) titleEl.textContent = options.title || (showCancel ? '\u8bf7\u786e\u8ba4' : '\u63d0\u793a');
            if (messageEl) messageEl.textContent = String(options.message || '');
            if (iconEl) {
                iconEl.textContent = options.icon || (showCancel ? '?' : '!');
                iconEl.className = 'w-9 h-9 rounded-2xl flex items-center justify-center text-lg flex-shrink-0 ' +
                    (options.danger ? 'bg-red-500/15 text-red-300' : 'bg-amber-500/15 text-amber-300');
            }
            if (cancelBtn) {
                cancelBtn.style.display = showCancel ? '' : 'none';
                cancelBtn.textContent = options.cancelText || '\u53d6\u6d88';
            }
            if (okBtn) {
                okBtn.textContent = options.okText || '\u786e\u5b9a';
                okBtn.className = 'px-4 py-2.5 rounded-xl text-sm font-semibold text-white shadow-lg transition-all ' +
                    (options.danger ? 'bg-red-500 hover:bg-red-400 active:bg-red-600 shadow-red-500/20' : 'bg-amber-500 hover:bg-amber-400 active:bg-amber-600 shadow-amber-500/20');
            }

            function cleanup(value) {
                modal.classList.add('hidden');
                if (cancelBtn) cancelBtn.onclick = null;
                if (okBtn) okBtn.onclick = null;
                if (backdrop) backdrop.onclick = null;
                document.removeEventListener('keydown', onKeyDown, true);
                resolve(value);
            }

            function onKeyDown(ev) {
                if (ev.key === 'Escape') cleanup(showCancel ? false : true);
            }

            if (cancelBtn) cancelBtn.onclick = function() { cleanup(false); };
            if (okBtn) okBtn.onclick = function() { cleanup(true); };
            if (backdrop) backdrop.onclick = function() { cleanup(showCancel ? false : true); };
            document.addEventListener('keydown', onKeyDown, true);
            modal.classList.remove('hidden');
            setTimeout(function() {
                try { (showCancel && cancelBtn ? cancelBtn : okBtn).focus(); } catch (_) {}
            }, 0);
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
