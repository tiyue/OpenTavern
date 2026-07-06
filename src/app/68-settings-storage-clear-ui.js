function bindSettingsStorageClearControls(backend) {
    bindClearAllStorageButton(backend);
    bindClearWebLLMCacheButton();
}

function bindClearAllStorageButton(backend) {
    const clearBtn = document.getElementById('clearOPFSBtn');
    if (!clearBtn) return;

    clearBtn.style.display = 'flex';
    clearBtn.textContent = t('clear_opfs_data') || '清除所有用户数据（OPFS + LS 快照）';
    if (backend === 'idb') {
        clearBtn.style.background = 'rgba(239,68,68,0.15)';
        clearBtn.style.color = '';
    } else {
        clearBtn.style.background = 'rgba(245,158,11,0.15)';
        clearBtn.style.color = '#fbbf24';
    }

    clearBtn.onclick = async function() {
        if (!await showGlassConfirm('\u786e\u5b9a\u8981\u6c38\u4e45\u5220\u9664\u6240\u6709\u7528\u6237\u6570\u636e\u5417\uff1f\n\u5305\u62ec\u89d2\u8272\u5361\u3001\u5bf9\u8bdd\u3001\u4e16\u754c\u4e66\u3001WebLLM \u6a21\u578b\u7f13\u5b58\u7b49\u3002\n\u6b64\u64cd\u4f5c\u4e0d\u53ef\u6062\u590d\uff0c\u9875\u9762\u5c06\u91cd\u65b0\u52a0\u8f7d\u3002', { title: '\u6e05\u9664\u6240\u6709\u7528\u6237\u6570\u636e', danger: true, okText: '\u6c38\u4e45\u5220\u9664' })) {
            return;
        }

        try {
            if (typeof StorageService !== 'undefined' && typeof StorageService.clearAllData === 'function') {
                await StorageService.clearAllData();
            } else {
                if (typeof OPFSStorage !== 'undefined' && OPFSStorage.clear) await OPFSStorage.clear();
                try {
                    localStorage.removeItem(STORAGE_KEY);
                    localStorage.removeItem('opentavern-last-backup');
                    Object.keys(localStorage).forEach(k => { if (k.startsWith('opentavern')) localStorage.removeItem(k); });
                    const empty = JSON.stringify({lastSaved: Date.now(), conversations: {}, characters: {}, worldBooks: {}});
                    localStorage.setItem(STORAGE_KEY, empty);
                } catch (e) {}
            }

            try {
                if (typeof updateStorageInfo === 'function') updateStorageInfo();
                const usageEl = document.getElementById('storageUsage');
                const bar = document.getElementById('storageUsageBar');
                if (usageEl) usageEl.textContent = '0.0 MB / ~0 GB (\u5df2\u6e05\u9664)';
                if (bar) bar.style.width = '0%';
            } catch (_) {}

            alert('\u6240\u6709\u7528\u6237\u6570\u636e\u5df2\u6e05\u9664\u3002\u9875\u9762\u5373\u5c06\u91cd\u65b0\u52a0\u8f7d...');
            location.reload();
        } catch (err) {
            console.error('[Storage] \u6e05\u9664\u6240\u6709\u6570\u636e\u5931\u8d25', err);
            alert('\u6e05\u9664\u5931\u8d25\uff1a' + (err.message || err));
        }
    };
}

function bindClearWebLLMCacheButton() {
    const clearWebLLMBtn = document.getElementById('clearWebLLMBtn');
    if (!clearWebLLMBtn) return;

    clearWebLLMBtn.onclick = async function() {
        if (!await showGlassConfirm('\u786e\u5b9a\u8981\u6e05\u9664 WebLLM \u4e0b\u8f7d\u7684\u6a21\u578b\u7f13\u5b58\u5417\uff1f\n\u8fd9\u4f1a\u91ca\u653e\u5927\u91cf\u7a7a\u95f4\uff0c\u4f46\u4e0b\u6b21\u4f7f\u7528\u672c\u5730\u6a21\u578b\u65f6\u9700\u8981\u91cd\u65b0\u4e0b\u8f7d\u3002', { title: '\u6e05\u9664 WebLLM \u6a21\u578b\u7f13\u5b58', okText: '\u6e05\u9664' })) return;
        if (typeof clearWebLLMCache === 'function') {
            await clearWebLLMCache();
        }
    };
}
