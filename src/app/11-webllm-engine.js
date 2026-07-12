/**
 * 新手导读（文件：11-webllm-engine.js）
 *
 * 负责什么：这是“浏览器能力与本地模型”中的“浏览器本地大模型、引擎”部分。
 * 在程序中的位置：它在设置或生成流程中检测设备、准备 WebLLM，并把状态交给界面层。
 * 从哪里开始看：主要从 `isWebLLMBackend(无参数)`、`getWebLLMModelId(无参数)`、`ensureWebLLMEngine(modelId, onProgress)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：设备能力是异步获得的；修改时要同时考虑成功、失败和用户取消。
 */
// WebLLM 引擎门面：判断本地推理模式并协调模型初始化、缓存和生成状态。
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
