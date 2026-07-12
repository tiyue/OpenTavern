/**
 * 新手导读（文件：11-webllm-initialization-helpers.js）
 *
 * 负责什么：这是“浏览器能力与本地模型”中的“浏览器本地大模型、初始化、辅助函数”部分。
 * 在程序中的位置：它在设置或生成流程中检测设备、准备 WebLLM，并把状态交给界面层。
 * 从哪里开始看：主要从 `finishWebLLMInitialization(elements, info, success, errMsg)`、`cancelWebLLMInitialization(elements)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：设备能力是异步获得的；修改时要同时考虑成功、失败和用户取消。
 */
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
