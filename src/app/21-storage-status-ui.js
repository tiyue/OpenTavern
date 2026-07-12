/**
 * 新手导读（文件：21-storage-status-ui.js）
 *
 * 负责什么：这是“存储状态与缓存工具”中的“存储、状态、界面”部分。
 * 在程序中的位置：它把容量、后端状态和缓存操作转换成用户能看到的界面信息。
 * 从哪里开始看：主要从 `updateStorageInfo(无参数)`、`showOrHideStorageWarning(percent)`、`updateStorageStatusUI(无参数)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：清理操作不可撤销，必须保留确认步骤和错误提示。
 */
// ==================== Storage Status UI ====================
function updateStorageInfo() {
    if (typeof updateStorageStatusUI === 'function') {
        try { updateStorageStatusUI(); } catch (_) {}
    }

    const usageEl = document.getElementById('storageUsage');
    const bar = document.getElementById('storageUsageBar');
    const backendEl = document.getElementById('storageBackend');

    StorageService.getStorageInfo().then(info => {
        const backend = StorageService.getBackend();
        styleStorageBackendBadge(backendEl, backend);
        applyStorageUsageElements(info, backend, usageEl, bar);
    }).catch(() => {});
}

let _storageWarningEl = null;

function showOrHideStorageWarning(percent) {
    const THRESHOLD = 75;
    const shouldShow = percent > THRESHOLD;

    if (shouldShow) {
        if (!_storageWarningEl) {
            _storageWarningEl = document.createElement('div');
            _storageWarningEl.style.cssText = 'position:fixed;bottom:48px;left:50%;transform:translateX(-50%);z-index:99998;background:rgba(239,68,68,0.92);color:white;padding:6px 14px;border-radius:999px;font-size:12px;box-shadow:0 2px 8px rgba(0,0,0,0.4);display:flex;align-items:center;gap:8px;';
            _storageWarningEl.innerHTML = `存储使用率较高 (${percent.toFixed(0)}%)，建议导出备份或清理`;
            document.body.appendChild(_storageWarningEl);

            _storageWarningEl.onclick = () => {
                const s = document.getElementById('settingsModal');
                if (s) { s.classList.remove('hidden'); }
                if (_storageWarningEl) _storageWarningEl.style.display = 'none';
            };
        } else {
            _storageWarningEl.style.display = 'flex';
            _storageWarningEl.innerHTML = `存储使用率较高 (${percent.toFixed(0)}%)，建议导出备份或清理`;
        }
    } else if (_storageWarningEl) {
        _storageWarningEl.style.display = 'none';
    }
}

function updateStorageStatusUI() {
    const el = document.getElementById('storageStatus');
    if (!el) return;

    const backend = StorageService.getBackend();
    const isIDB = backend === 'idb';
    el.textContent = isIDB ? 'IDB' : 'LS';
    styleStorageBackendBadge(el, backend);

    StorageService.getStorageInfo().then(info => {
        applyStorageStatusInfo(el, info, backend);
    }).catch(() => {
        el.title = backend === 'idb' ? 'IndexedDB \u4e3b\u5b58\u50a8' : 'localStorage \u5e94\u6025\u5feb\u7167';
    });

    bindStorageStatusClick(el);
}
