// ==================== WebLLM Initialization State Helpers ====================
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
