// ==================== WebLLM Initialization UI Helpers ====================
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

async function preflightWebLLMStorageQuota(info) {
    try {
        const needMB = info.sizeMB || 900;
        const sInfo = await StorageService.getStorageInfo();
        if (sInfo && sInfo.quota != null) {
            const currentUsed = (sInfo.originUsed && sInfo.originUsed > 0)
                ? sInfo.originUsed
                : ((sInfo.totalUsed != null) ? sInfo.totalUsed : (sInfo.used || 0));
            const freeEst = sInfo.quota - currentUsed;
            if (freeEst < needMB * 1024 * 1024 * 1.6) {
                const ok = await showGlassConfirm(`\u5b58\u50a8\u7a7a\u95f4\u53ef\u80fd\u4e0d\u8db3\uff08\u6a21\u578b\u7ea6 ${needMB}MB\uff09\u3002\u5efa\u8bae\u5148\u6e05\u7406 WebLLM \u7f13\u5b58\u6216\u5bfc\u51fa\u5907\u4efd\u518d\u7ee7\u7eed\u3002\n\u4ecd\u8981\u7ee7\u7eed\u5417\uff1f`, { title: '\u5b58\u50a8\u7a7a\u95f4\u63d0\u9192' });
                if (!ok) {
                    if (state && state.settings) state.settings.inferenceBackend = 'remote-api';
                    if (typeof persistState === 'function') await persistState(true);
                    return false;
                }
            }
        }
    } catch (_) {}
    return true;
}

function updateWebLLMInitializationProgress(elements, info, report) {
    if (!elements.modal || elements.modal.classList.contains('hidden')) return;
    var pct = Math.max(0, Math.min(100, Math.round((report.progress || 0) * 100)));
    if (elements.bar) elements.bar.style.width = pct + '%';
    if (elements.percent) elements.percent.textContent = pct + '%';
    var txt = report.text || (pct < 100 ? '下载/初始化中...' : '完成');
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
    if (elements.status) elements.status.textContent = '正在准备下载...';
    elements.modal.classList.remove('hidden');
}

function finishWebLLMInitialization(elements, info, success, errMsg) {
    if (elements.modal) elements.modal.classList.add('hidden');
    cleanupWebLLMProgressHandlers(elements);

    if (!success) {
        if (state && state.settings) state.settings.inferenceBackend = 'remote-api';
        persistState();
        var msg = (t('webllm_init_failed') || '本地模型初始化失败：{msg}。已自动切回远程 API。')
            .replace('{msg}', errMsg || '未知错误');
        alert(msg);
    } else {
        try {
            var okMsg = t('webllm_init_success').replace('{model}', info.label);
            console.log('[WebLLM]', okMsg);
        } catch (e) {}
    }
}

function cancelWebLLMInitialization(elements) {
    if (elements.modal) elements.modal.classList.add('hidden');
    if (state && state.settings) state.settings.inferenceBackend = 'remote-api';
    persistState();
    webllmEngine = null;
    webllmCurrentModel = null;
    cleanupWebLLMProgressHandlers(elements);
}
