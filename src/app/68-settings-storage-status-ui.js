function bindSettingsStorageStatusControls(backend) {
    const backendEl = document.getElementById('storageBackend');
    const usageEl = document.getElementById('storageUsage');

    if (backendEl) {
        backendEl.textContent = t('storage_backend') + ' (' + getStorageBackendLabel(backend) + ')';
        styleStorageBackendBadge(backendEl, backend);
    }

    if (usageEl) {
        StorageService.getStorageInfo().then(function(info) {
            const bar = document.getElementById('storageUsageBar');
            if (info) {
                usageEl.textContent = buildStorageUsageText(info);
                const percent = getStoragePressurePercent(info);
                if (bar) bar.style.width = percent + '%';
                if (percent > 85) {
                    if (bar) bar.style.background = '#f87171';
                    usageEl.style.color = '#f87171';
                } else if (percent > 70) {
                    if (bar) bar.style.background = '#fbbf24';
                    usageEl.style.color = '#fbbf24';
                } else {
                    if (bar) bar.style.background = '#f59e0b';
                    usageEl.style.color = '';
                }
            } else {
                usageEl.textContent = backend === 'idb' ? 'IndexedDB \u4e3b\u5b58\u50a8' : 'localStorage \u5e94\u6025\u5feb\u7167';
                if (bar) bar.style.width = '0%';
            }
        }).catch(function() {
            usageEl.textContent = '\u65e0\u6cd5\u8bfb\u53d6\u5b58\u50a8\u7528\u91cf';
            const bar = document.getElementById('storageUsageBar');
            if (bar) bar.style.width = '0%';
        });
    }

    const hintEl = document.getElementById('storageHint');
    if (hintEl) {
        StorageService.getStorageInfo().then(function(info) {
            const canonical = getStorageBackendLabel((info && info.backend) || backend);
            const opfs = getOPFSStatusText(info || {});
            hintEl.textContent = `\u4e3b\u5b58\u50a8\u4f7f\u7528 ${canonical}\uff0clocalStorage \u4fdd\u7559\u5e94\u6025\u5feb\u7167\uff0c${opfs}\u3002`;
            hintEl.style.color = backend === 'idb' ? '#60a5fa' : '#fbbf24';
        }).catch(function() {
            hintEl.textContent = backend === 'idb'
                ? 'IndexedDB \u4e3b\u5b58\u50a8\uff0clocalStorage \u4fdd\u7559\u5e94\u6025\u5feb\u7167\u3002'
                : 'localStorage \u5e94\u6025\u5feb\u7167\u6b63\u5728\u4f7f\u7528\uff0c\u5efa\u8bae\u5b9a\u671f\u5bfc\u51fa\u5907\u4efd\u3002';
            hintEl.style.color = backend === 'idb' ? '#60a5fa' : '#fbbf24';
        });
    }
}
