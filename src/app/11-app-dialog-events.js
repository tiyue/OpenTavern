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
