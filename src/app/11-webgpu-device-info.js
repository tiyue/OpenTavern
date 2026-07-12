/**
 * 新手导读（文件：11-webgpu-device-info.js）
 *
 * 负责什么：这是“浏览器能力与本地模型”中的“WebGPU 设备、信息”部分。
 * 在程序中的位置：它在设置或生成流程中检测设备、准备 WebLLM，并把状态交给界面层。
 * 从哪里开始看：主要从 `getPlainAdapterInfo(info)`、`readWebGPUAdapterInfo(adapter)`、`formatWebGPUDeviceReport(report)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：设备能力是异步获得的；修改时要同时考虑成功、失败和用户取消。
 */
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
