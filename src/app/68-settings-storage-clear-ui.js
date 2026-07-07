function bindSettingsStorageClearControls(backend) {
    bindClearAllStorageButton(backend);
    bindClearWebLLMCacheButton();
}

function bindClearAllStorageButton(backend) {
    const clearBtn = document.getElementById('clearOPFSBtn');
    if (!clearBtn) return;

    applyClearAllStorageButtonState(clearBtn, backend);

    clearBtn.onclick = async function() {
        const confirmConfig = getClearAllStorageConfirmConfig();
        if (!await showGlassConfirm(confirmConfig.message, confirmConfig.options)) {
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
                renderStorageUsageClearedState();
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
        const confirmConfig = getClearWebLLMCacheConfirmConfig();
        if (!await showGlassConfirm(confirmConfig.message, confirmConfig.options)) return;
        if (typeof clearWebLLMCache === 'function') {
            await clearWebLLMCache();
        }
    };
}
