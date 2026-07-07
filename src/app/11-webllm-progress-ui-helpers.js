// ==================== WebLLM Progress UI Helpers ====================
function getWebLLMProgressElements() {
    return {
        modal: document.getElementById('webllmProgressModal'),
        bar: document.getElementById('webllmProgressBar'),
        status: document.getElementById('webllmProgressStatus'),
        percent: document.getElementById('webllmProgressPercent'),
        cancelBtn: document.getElementById('webllmProgressCancelBtn'),
        detectBtn: document.getElementById('webllmDetectDeviceBtn'),
        closeBtn: document.getElementById('webllmProgressCloseBtn'),
        backdrop: document.getElementById('webllmProgressBackdrop')
    };
}

function updateWebLLMInitializationProgress(elements, info, report) {
    if (!elements.modal || elements.modal.classList.contains('hidden')) return;
    var pct = Math.max(0, Math.min(100, Math.round((report.progress || 0) * 100)));
    if (elements.bar) elements.bar.style.width = pct + '%';
    if (elements.percent) elements.percent.textContent = pct + '%';
    var txt = report.text || (pct < 100 ? '\u4e0b\u8f7d/\u521d\u59cb\u5316\u4e2d...' : '\u5b8c\u6210');
    if (elements.status) elements.status.textContent = txt + ' (' + info.label + ')';
}

function cleanupWebLLMProgressHandlers(elements) {
    if (elements.cancelBtn) elements.cancelBtn.onclick = null;
    if (elements.detectBtn) elements.detectBtn.onclick = null;
    if (elements.closeBtn) elements.closeBtn.onclick = null;
    if (elements.backdrop) elements.backdrop.onclick = null;
}

function resetWebLLMProgressUI(elements) {
    if (elements.bar) elements.bar.style.width = '0%';
    if (elements.percent) elements.percent.textContent = '0%';
    if (elements.status) elements.status.textContent = '\u6b63\u5728\u51c6\u5907\u4e0b\u8f7d...';
    elements.modal.classList.remove('hidden');
}
