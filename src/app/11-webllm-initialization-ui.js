// ==================== WebLLM Initialization Progress UI ====================
function startWebLLMInitialization(forcedModelId) {
    var progressModal = document.getElementById('webllmProgressModal');
    var progressBar = document.getElementById('webllmProgressBar');
    var progressStatus = document.getElementById('webllmProgressStatus');
    var progressPercent = document.getElementById('webllmProgressPercent');
    var cancelBtn = document.getElementById('webllmProgressCancelBtn');
    var detectBtn = document.getElementById('webllmDetectDeviceBtn');
    var closeBtn = document.getElementById('webllmProgressCloseBtn');
    var backdrop = document.getElementById('webllmProgressBackdrop');
    var modelId = forcedModelId || getWebLLMModelId();
    var info = WEBLLM_MODEL_INFO[modelId] || { label: modelId, sizeMB: 0 };
    var abortedByUser = false;

    async function preflightStorageQuota() {
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

    function updateProgress(report) {
        if (!progressModal || progressModal.classList.contains('hidden')) return;
        var pct = Math.max(0, Math.min(100, Math.round((report.progress || 0) * 100)));
        if (progressBar) progressBar.style.width = pct + '%';
        if (progressPercent) progressPercent.textContent = pct + '%';
        var txt = report.text || (pct < 100 ? '下载/初始化中...' : '完成');
        if (progressStatus) progressStatus.textContent = txt + ' (' + info.label + ')';
    }

    function cleanupHandlers() {
        if (cancelBtn) cancelBtn.onclick = null;
        if (detectBtn) detectBtn.onclick = null;
        if (closeBtn) closeBtn.onclick = null;
        if (backdrop) backdrop.onclick = null;
    }

    function finish(success, errMsg) {
        if (progressModal) progressModal.classList.add('hidden');
        cleanupHandlers();

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

    function doCancel() {
        abortedByUser = true;
        if (progressModal) progressModal.classList.add('hidden');
        if (state && state.settings) state.settings.inferenceBackend = 'remote-api';
        persistState();
        webllmEngine = null;
        webllmCurrentModel = null;
        cleanupHandlers();
    }

    (async () => {
        const okToStart = await preflightStorageQuota();
        if (!okToStart) return;

        if (!progressModal) {
            ensureWebLLMEngine(modelId).then(function() {
                alert(t('webllm_init_success').replace('{model}', modelId));
            }).catch(function(e) {
                alert((t('webllm_init_failed') || 'Failed: {msg}').replace('{msg}', e.message || e));
                if (state && state.settings) state.settings.inferenceBackend = 'remote-api';
            });
            return;
        }

        if (progressBar) progressBar.style.width = '0%';
        if (progressPercent) progressPercent.textContent = '0%';
        if (progressStatus) progressStatus.textContent = '正在准备下载...';
        progressModal.classList.remove('hidden');

        if (cancelBtn) cancelBtn.onclick = doCancel;
        if (detectBtn) detectBtn.onclick = function() { detectCurrentWebGPUDevice({ showDialog: true }).catch(function() {}); };
        if (closeBtn) closeBtn.onclick = doCancel;
        if (backdrop) backdrop.onclick = doCancel;

        ensureWebLLMEngine(modelId, updateProgress).then(function() {
            if (!abortedByUser) finish(true);
        }).catch(function(e) {
            if (abortedByUser) return;
            var reason = (e && e.message === 'NO_WEBGPU') ? t('webllm_init_no_webgpu') : (e && e.message) || String(e);
            finish(false, reason);
        });
    })();
}
