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
