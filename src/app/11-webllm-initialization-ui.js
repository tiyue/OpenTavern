// ==================== WebLLM Initialization Progress UI ====================
function startWebLLMInitialization(forcedModelId) {
    var progress = getWebLLMProgressElements();
    var modelId = forcedModelId || getWebLLMModelId();
    var info = WEBLLM_MODEL_INFO[modelId] || { label: modelId, sizeMB: 0 };
    var abortedByUser = false;

    function doCancel() {
        abortedByUser = true;
        cancelWebLLMInitialization(progress);
    }

    (async () => {
        const okToStart = await preflightWebLLMStorageQuota(info);
        if (!okToStart) return;

        if (!progress.modal) {
            ensureWebLLMEngine(modelId).then(function() {
                alert(t('webllm_init_success').replace('{model}', modelId));
            }).catch(function(e) {
                alert((t('webllm_init_failed') || 'Failed: {msg}').replace('{msg}', e.message || e));
                if (state && state.settings) state.settings.inferenceBackend = 'remote-api';
            });
            return;
        }

        resetWebLLMProgressUI(progress);

        if (progress.cancelBtn) progress.cancelBtn.onclick = doCancel;
        if (progress.detectBtn) progress.detectBtn.onclick = function() { detectCurrentWebGPUDevice({ showDialog: true }).catch(function() {}); };
        if (progress.closeBtn) progress.closeBtn.onclick = doCancel;
        if (progress.backdrop) progress.backdrop.onclick = doCancel;

        ensureWebLLMEngine(modelId, function(report) {
            updateWebLLMInitializationProgress(progress, info, report);
        }).then(function() {
            if (!abortedByUser) finishWebLLMInitialization(progress, info, true);
        }).catch(function(e) {
            if (abortedByUser) return;
            var reason = (e && e.message === 'NO_WEBGPU') ? t('webllm_init_no_webgpu') : (e && e.message) || String(e);
            finishWebLLMInitialization(progress, info, false, reason);
        });
    })();
}
