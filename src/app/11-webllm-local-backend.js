// ==================== WebLLM 懒加载相关（关键：页面初始化时绝不执行任何 import 或初始化） ====================
let webllmEngine = null;           // MLCEngine 实例，只有在用户确认后才创建
let webllmCurrentModel = null;     // 当前已加载的模型 ID
const WEBLLM_MODEL_INFO = {
    'Llama-3.2-1B-Instruct-q4f16_1-MLC': { label: 'Llama-3.2-1B', sizeMB: 850 },
    'Llama-3.2-3B-Instruct-q4f16_1-MLC': { label: 'Llama-3.2-3B', sizeMB: 2100 }
};


const nativeAlert = window.alert ? window.alert.bind(window) : null;
const nativeConfirm = window.confirm ? window.confirm.bind(window) : null;
let _appDialogQueue = Promise.resolve();
let webgpuLastDeviceReport = null;

function showGlassDialog(options) {
    options = options || {};
    const run = function() {
        return new Promise(function(resolve) {
            const modal = document.getElementById('appDialogModal');
            if (!modal) {
                if (options.showCancel && nativeConfirm) resolve(nativeConfirm(String(options.message || '')));
                else { if (nativeAlert) nativeAlert(String(options.message || '')); resolve(true); }
                return;
            }

            const backdrop = document.getElementById('appDialogBackdrop');
            const titleEl = document.getElementById('appDialogTitle');
            const messageEl = document.getElementById('appDialogMessage');
            const iconEl = document.getElementById('appDialogIcon');
            const cancelBtn = document.getElementById('appDialogCancelBtn');
            const okBtn = document.getElementById('appDialogOkBtn');
            const showCancel = !!options.showCancel;

            if (titleEl) titleEl.textContent = options.title || (showCancel ? '\u8bf7\u786e\u8ba4' : '\u63d0\u793a');
            if (messageEl) messageEl.textContent = String(options.message || '');
            if (iconEl) {
                iconEl.textContent = options.icon || (showCancel ? '?' : '!');
                iconEl.className = 'w-9 h-9 rounded-2xl flex items-center justify-center text-lg flex-shrink-0 ' +
                    (options.danger ? 'bg-red-500/15 text-red-300' : 'bg-amber-500/15 text-amber-300');
            }
            if (cancelBtn) {
                cancelBtn.style.display = showCancel ? '' : 'none';
                cancelBtn.textContent = options.cancelText || '\u53d6\u6d88';
            }
            if (okBtn) {
                okBtn.textContent = options.okText || '\u786e\u5b9a';
                okBtn.className = 'px-4 py-2.5 rounded-xl text-sm font-semibold text-white shadow-lg transition-all ' +
                    (options.danger ? 'bg-red-500 hover:bg-red-400 active:bg-red-600 shadow-red-500/20' : 'bg-amber-500 hover:bg-amber-400 active:bg-amber-600 shadow-amber-500/20');
            }

            function cleanup(value) {
                modal.classList.add('hidden');
                if (cancelBtn) cancelBtn.onclick = null;
                if (okBtn) okBtn.onclick = null;
                if (backdrop) backdrop.onclick = null;
                document.removeEventListener('keydown', onKeyDown, true);
                resolve(value);
            }
            function onKeyDown(ev) {
                if (ev.key === 'Escape') cleanup(showCancel ? false : true);
            }

            if (cancelBtn) cancelBtn.onclick = function() { cleanup(false); };
            if (okBtn) okBtn.onclick = function() { cleanup(true); };
            if (backdrop) backdrop.onclick = function() { cleanup(showCancel ? false : true); };
            document.addEventListener('keydown', onKeyDown, true);
            modal.classList.remove('hidden');
            setTimeout(function() { try { (showCancel && cancelBtn ? cancelBtn : okBtn).focus(); } catch (_) {} }, 0);
        });
    };
    const next = _appDialogQueue.then(run, run);
    _appDialogQueue = next.catch(function() {});
    return next;
}

function showGlassAlert(message, options) {
    options = Object.assign({ showCancel: false }, options || {}, { message: message });
    return showGlassDialog(options);
}

function showGlassConfirm(message, options) {
    options = Object.assign({ showCancel: true }, options || {}, { message: message });
    return showGlassDialog(options);
}

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

window.showGlassAlert = showGlassAlert;
window.showGlassConfirm = showGlassConfirm;
window.detectCurrentWebGPUDevice = detectCurrentWebGPUDevice;
window.alert = function(message) { showGlassAlert(message); };
