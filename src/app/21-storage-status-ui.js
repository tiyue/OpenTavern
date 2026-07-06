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

        if (usageEl && info) {
            usageEl.textContent = buildStorageUsageText(info);
            const percent = getStoragePressurePercent(info);
            if (bar) bar.style.width = percent + '%';

            if (percent > 85) {
                if (bar) bar.style.background = '#f87171';
                usageEl.style.color = '#f87171';
            } else if (percent > 75) {
                if (bar) bar.style.background = '#fbbf24';
                usageEl.style.color = '#fbbf24';
            } else {
                if (bar) bar.style.background = '#f59e0b';
                usageEl.style.color = '';
            }
            showOrHideStorageWarning(percent);
        } else if (usageEl) {
            usageEl.textContent = backend === 'idb' ? 'IndexedDB \u4e3b\u5b58\u50a8' : 'localStorage \u5e94\u6025\u5feb\u7167';
            if (bar) bar.style.width = '0%';
        }
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
        let tip = `\u4e3b\u5b58\u50a8\u540e\u7aef: ${getStorageBackendLabel(info.backend || backend)}`;
        tip += ` · \u5e94\u7528\u5feb\u7167 ${formatStorageMB(info.used || 0)} MB`;
        if (info.webllmUsed > 0) tip += ` · \u6a21\u578b\u7f13\u5b58 ${formatStorageMB(info.webllmUsed)} MB`;
        tip += ` · ${getOPFSStatusText(info)}`;
        if (info.persisted === false) tip += ' · \u975e\u6301\u4e45\u6388\u6743';

        const percent = getStoragePressurePercent(info);
        if (percent > 85) {
            el.style.background = 'rgba(239,68,68,0.25)';
            el.style.color = '#f87171';
            tip += ` (${t('storage_high_warning') || '\u5b58\u50a8\u538b\u529b\u8f83\u9ad8'})`;
        } else if (percent > 75) {
            el.style.background = 'rgba(245,158,11,0.25)';
            el.style.color = '#fbbf24';
        }
        el.title = tip;
    }).catch(() => {
        el.title = backend === 'idb' ? 'IndexedDB \u4e3b\u5b58\u50a8' : 'localStorage \u5e94\u6025\u5feb\u7167';
    });

    if (!el._storageClickBound) {
        el._storageClickBound = true;
        el.addEventListener('click', function() {
            const modal = document.getElementById('settingsModal');
            if (modal) modal.classList.remove('hidden');
        });
    }
}
