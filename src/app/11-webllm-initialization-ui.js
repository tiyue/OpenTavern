/**
 * 新手导读（文件：11-webllm-initialization-ui.js）
 *
 * 负责什么：这是“浏览器能力与本地模型”中的“浏览器本地大模型、初始化、界面”部分。
 * 在程序中的位置：它在设置或生成流程中检测设备、准备 WebLLM，并把状态交给界面层。
 * 从哪里开始看：主要从 `startWebLLMInitialization(forcedModelId)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：设备能力是异步获得的；修改时要同时考虑成功、失败和用户取消。
 */
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
