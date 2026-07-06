// ==================== WebGPU Device Detection ====================
async function detectCurrentWebGPUDevice(options) {
    options = options || {};
    var statusEl = options.statusEl || document.getElementById('webgpuDeviceInfo');
    setWebGPUDeviceStatus(statusEl, '\u6b63\u5728\u8bf7\u6c42\u9ad8\u6027\u80fd WebGPU adapter...', '#fbbf24');

    try {
        var adapter = await requestHighPerformanceWebGPUAdapter();
        var info = await readWebGPUAdapterInfo(adapter);
        var device = await adapter.requestDevice();
        var report = {
            info: info,
            features: Array.from(adapter.features || []),
            maxBufferSize: adapter.limits && adapter.limits.maxBufferSize,
            requestedPowerPreference: 'high-performance',
            detectedAt: Date.now()
        };
        try { if (device && typeof device.destroy === 'function') device.destroy(); } catch (_) {}
        webgpuLastDeviceReport = report;

        var text = formatWebGPUDeviceReport(report);
        setWebGPUDeviceStatus(statusEl, text, '#a1a1aa');
        if (options.showDialog) {
            await showGlassAlert(text, { title: 'WebGPU \u8bbe\u5907\u68c0\u6d4b', icon: 'GPU' });
        }
        return report;
    } catch (e) {
        var msg = getWebGPUDetectionErrorMessage(e);
        setWebGPUDeviceStatus(statusEl, msg, '#f87171');
        if (options.showDialog) await showGlassAlert(msg, { title: 'WebGPU \u8bbe\u5907\u68c0\u6d4b', danger: true });
        throw e;
    }
}

function setWebGPUDeviceStatus(statusEl, text, color) {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.style.color = color;
}

function getWebGPUDetectionErrorMessage(e) {
    return (e && e.message === 'NO_WEBGPU')
        ? '\u5f53\u524d\u6d4f\u89c8\u5668\u6216\u9875\u9762\u73af\u5883\u4e0d\u652f\u6301 WebGPU\u3002'
        : ('WebGPU \u8bbe\u5907\u68c0\u6d4b\u5931\u8d25\uff1a' + ((e && e.message) || e));
}

window.detectCurrentWebGPUDevice = detectCurrentWebGPUDevice;
