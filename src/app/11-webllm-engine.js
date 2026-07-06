function isWebLLMBackend() {
    return !!(state && state.settings && state.settings.inferenceBackend === 'webllm');
}

function getWebLLMModelId() {
    if (!state || !state.settings) return 'Llama-3.2-1B-Instruct-q4f16_1-MLC';
    return state.settings.webllmModel || 'Llama-3.2-1B-Instruct-q4f16_1-MLC';
}

// 动态加载 WebLLM 并初始化引擎（仅在“继续”后调用）
async function ensureWebLLMEngine(modelId, onProgress) {
    if (webllmEngine && webllmCurrentModel === modelId) {
        if (onProgress) onProgress({ progress: 1, text: '已就绪' });
        return webllmEngine;
    }

    // 动态 import —— 这是唯一允许出现 WebLLM 代码执行的地方（用户主动触发后）
    let webllm;
    try {
        webllm = await import('https://esm.run/@mlc-ai/web-llm');
    } catch (e) {
        throw new Error('无法加载 WebLLM 库：' + (e.message || e));
    }

    const CreateMLCEngine = webllm.CreateMLCEngine;
    if (!CreateMLCEngine) {
        throw new Error('WebLLM 库加载异常（缺少 CreateMLCEngine）');
    }

    // WebGPU 能力检测（必须）
    if (!navigator.gpu) {
        throw new Error('NO_WEBGPU');
    }

    // 进度回调包装
    function progressCallback(report) {
        if (onProgress) onProgress(report);
    }

    try {
        const engine = await withHighPerformanceWebGPUAdapterRequest(function() {
            return CreateMLCEngine(modelId, {
                initProgressCallback: progressCallback
            });
        });
        try {
            if (engine && engine.device && engine.device.adapterInfo) {
                webgpuLastDeviceReport = { info: getPlainAdapterInfo(engine.device.adapterInfo), detectedAt: Date.now(), source: 'WebLLM engine' };
            }
        } catch (_) {}
        webllmEngine = engine;
        webllmCurrentModel = modelId;

        // 成功后更新 state（以便 UI 感知）
        if (state && state.settings) {
            state.settings.inferenceBackend = 'webllm';
            state.settings.webllmModel = modelId;
        }
        return engine;
    } catch (e) {
        webllmEngine = null;
        webllmCurrentModel = null;
        throw e;
    }
}
