// ==================== WebGPU Device Info Helpers ====================
function getPlainAdapterInfo(info) {
    if (!info) return {};
    return {
        vendor: info.vendor || '',
        architecture: info.architecture || '',
        device: info.device || '',
        description: info.description || ''
    };
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
    var info = report.info || {};
    var parts = [];
    if (info.description) parts.push(info.description);
    if (info.vendor) parts.push('Vendor: ' + info.vendor);
    if (info.device) parts.push('Device: ' + info.device);
    if (info.architecture) parts.push('Arch: ' + info.architecture);
    if (report.features && report.features.length) parts.push('Features: ' + report.features.slice(0, 8).join(', '));
    if (report.maxBufferSize) parts.push('Max buffer: ' + Math.round(report.maxBufferSize / 1024 / 1024) + ' MB');
    return parts.length ? parts.join('\n') : '\u5df2\u83b7\u53d6 WebGPU \u8bbe\u5907\uff0c\u4f46\u6d4f\u89c8\u5668\u672a\u66b4\u9732\u663e\u5361\u540d\u79f0\u3002';
}
