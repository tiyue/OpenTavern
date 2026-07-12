/**
 * 新手导读（文件：11-webgpu-adapter.js）
 *
 * 负责什么：这是“浏览器能力与本地模型”中的“WebGPU 设备、适配器”部分。
 * 在程序中的位置：它在设置或生成流程中检测设备、准备 WebLLM，并把状态交给界面层。
 * 从哪里开始看：主要从 `requestHighPerformanceWebGPUAdapter(无参数)`、`withHighPerformanceWebGPUAdapterRequest(fn)`、`restoreWebGPURequestAdapter(gpu, original, proto, protoDesc, patchTarget)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：设备能力是异步获得的；修改时要同时考虑成功、失败和用户取消。
 */
// ==================== WebGPU Adapter Helpers ====================
async function requestHighPerformanceWebGPUAdapter() {
    if (!navigator.gpu) throw new Error('NO_WEBGPU');
    var adapter = null;
    try {
        adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    } catch (e) {
        console.warn('[WebGPU] high-performance requestAdapter failed:', e);
    }
    if (!adapter) adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error('\u6d4f\u89c8\u5668\u6ca1\u6709\u8fd4\u56de WebGPU Adapter');
    return adapter;
}

async function withHighPerformanceWebGPUAdapterRequest(fn) {
    if (!navigator.gpu || typeof navigator.gpu.requestAdapter !== 'function') {
        return fn();
    }
    var gpu = navigator.gpu;
    var original = gpu.requestAdapter.bind(gpu);
    var proto = Object.getPrototypeOf(gpu);
    var protoDesc = proto ? Object.getOwnPropertyDescriptor(proto, 'requestAdapter') : null;
    var patchTarget = null;
    var wrapped = function(options) {
        var nextOptions = Object.assign({}, options || {}, { powerPreference: 'high-performance' });
        return original(nextOptions);
    };
    try {
        gpu.requestAdapter = wrapped;
        if (gpu.requestAdapter === wrapped) patchTarget = 'instance';
    } catch (_) {}
    if (!patchTarget) {
        try {
            Object.defineProperty(gpu, 'requestAdapter', { configurable: true, value: wrapped });
            if (gpu.requestAdapter === wrapped) patchTarget = 'instance-define';
        } catch (_) {}
    }
    if (!patchTarget && proto) {
        try {
            Object.defineProperty(proto, 'requestAdapter', { configurable: true, value: wrapped });
            if (gpu.requestAdapter === wrapped) patchTarget = 'prototype';
        } catch (_) {}
    }
    if (!patchTarget) console.warn('[WebGPU] Unable to wrap requestAdapter; browser may ignore high-performance preference patch.');
    try {
        return await fn();
    } finally {
        restoreWebGPURequestAdapter(gpu, original, proto, protoDesc, patchTarget);
    }
}

function restoreWebGPURequestAdapter(gpu, original, proto, protoDesc, patchTarget) {
    if (patchTarget === 'prototype' && proto) {
        try {
            if (protoDesc) Object.defineProperty(proto, 'requestAdapter', protoDesc);
            else delete proto.requestAdapter;
        } catch (_) {}
        return;
    }
    if (patchTarget) {
        try {
            gpu.requestAdapter = original;
        } catch (_) {
            try { Object.defineProperty(gpu, 'requestAdapter', { configurable: true, value: original }); } catch (__) {}
        }
    }
}
