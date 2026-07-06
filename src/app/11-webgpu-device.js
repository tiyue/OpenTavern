// ==================== WebGPU Device Helpers ====================
let webgpuLastDeviceReport = null;

function getPlainAdapterInfo(info) {
    if (!info) return {};
    return {
        vendor: info.vendor || '',
        architecture: info.architecture || '',
        device: info.device || '',
        description: info.description || ''
    };
}

async function requestHighPerformanceWebGPUAdapter() {
    if (!navigator.gpu) throw new Error('NO_WEBGPU');
    let adapter = null;
    try {
        adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    } catch (e) {
        console.warn('[WebGPU] high-performance requestAdapter failed:', e);
    }
    if (!adapter) adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error('\u6d4f\u89c8\u5668\u6ca1\u6709\u8fd4\u56de WebGPU Adapter');
    return adapter;
}

async function readWebGPUAdapterInfo(adapter) {
    try {
        if (adapter && adapter.info) return getPlainAdapterInfo(adapter.info);
        if (adapter && typeof adapter.requestAdapterInfo === 'function') {
            return getPlainAdapterInfo(await adapter.requestAdapterInfo());
        }
    } catch (e) {
        console.warn('[WebGPU] adapter info unavailable:', e);
    }
    return {};
}

function formatWebGPUDeviceReport(report) {
    if (!report) return '';
    const info = report.info || {};
    const parts = [];
    if (info.description) parts.push(info.description);
    if (info.vendor) parts.push('Vendor: ' + info.vendor);
    if (info.device) parts.push('Device: ' + info.device);
    if (info.architecture) parts.push('Arch: ' + info.architecture);
    if (report.features && report.features.length) parts.push('Features: ' + report.features.slice(0, 8).join(', '));
    if (report.maxBufferSize) parts.push('Max buffer: ' + Math.round(report.maxBufferSize / 1024 / 1024) + ' MB');
    return parts.length ? parts.join('\n') : '\u5df2\u83b7\u53d6 WebGPU \u8bbe\u5907\uff0c\u4f46\u6d4f\u89c8\u5668\u672a\u66b4\u9732\u663e\u5361\u540d\u79f0\u3002';
}

async function detectCurrentWebGPUDevice(options) {
    options = options || {};
    const statusEl = options.statusEl || document.getElementById('webgpuDeviceInfo');
    if (statusEl) {
        statusEl.textContent = '\u6b63\u5728\u8bf7\u6c42\u9ad8\u6027\u80fd WebGPU adapter...';
        statusEl.style.color = '#fbbf24';
    }
    try {
        const adapter = await requestHighPerformanceWebGPUAdapter();
        const info = await readWebGPUAdapterInfo(adapter);
        const device = await adapter.requestDevice();
        const report = {
            info: info,
            features: Array.from(adapter.features || []),
            maxBufferSize: adapter.limits && adapter.limits.maxBufferSize,
            requestedPowerPreference: 'high-performance',
            detectedAt: Date.now()
        };
        try { if (device && typeof device.destroy === 'function') device.destroy(); } catch (_) {}
        webgpuLastDeviceReport = report;
        const text = formatWebGPUDeviceReport(report);
        if (statusEl) {
            statusEl.textContent = text;
            statusEl.style.color = '#a1a1aa';
        }
        if (options.showDialog) {
            await showGlassAlert(text, { title: 'WebGPU \u8bbe\u5907\u68c0\u6d4b', icon: 'GPU' });
        }
        return report;
    } catch (e) {
        const msg = (e && e.message === 'NO_WEBGPU')
            ? '\u5f53\u524d\u6d4f\u89c8\u5668\u6216\u9875\u9762\u73af\u5883\u4e0d\u652f\u6301 WebGPU\u3002'
            : ('WebGPU \u8bbe\u5907\u68c0\u6d4b\u5931\u8d25\uff1a' + ((e && e.message) || e));
        if (statusEl) {
            statusEl.textContent = msg;
            statusEl.style.color = '#f87171';
        }
        if (options.showDialog) await showGlassAlert(msg, { title: 'WebGPU \u8bbe\u5907\u68c0\u6d4b', danger: true });
        throw e;
    }
}

async function withHighPerformanceWebGPUAdapterRequest(fn) {
    if (!navigator.gpu || typeof navigator.gpu.requestAdapter !== 'function') {
        return fn();
    }
    const gpu = navigator.gpu;
    const original = gpu.requestAdapter.bind(gpu);
    const proto = Object.getPrototypeOf(gpu);
    const protoDesc = proto ? Object.getOwnPropertyDescriptor(proto, 'requestAdapter') : null;
    let patchTarget = null;
    const wrapped = function(options) {
        const nextOptions = Object.assign({}, options || {}, { powerPreference: 'high-performance' });
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
        if (patchTarget === 'prototype' && proto) {
            try {
                if (protoDesc) Object.defineProperty(proto, 'requestAdapter', protoDesc);
                else delete proto.requestAdapter;
            } catch (_) {}
        } else if (patchTarget) {
            try { gpu.requestAdapter = original; } catch (_) {
                try { Object.defineProperty(gpu, 'requestAdapter', { configurable: true, value: original }); } catch (__) {}
            }
        }
    }
}

window.detectCurrentWebGPUDevice = detectCurrentWebGPUDevice;
