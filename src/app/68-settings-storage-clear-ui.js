/**
 * 新手导读（文件：68-settings-storage-clear-ui.js）
 *
 * 负责什么：这是“设置界面”中的“设置、存储、清理、界面”部分。
 * 在程序中的位置：它把当前设置填入表单，读取用户修改，再触发保存后的联动效果。
 * 从哪里开始看：主要从 `bindSettingsStorageClearControls(backend)`、`bindClearAllStorageButton(backend)`、`bindClearWebLLMCacheButton(无参数)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：表单值都是字符串或勾选状态，写回前要转换成正确的数字、布尔值和枚举。
 */
// 存储清理设置：绑定清空应用数据与 WebLLM 缓存的确认流程。
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
