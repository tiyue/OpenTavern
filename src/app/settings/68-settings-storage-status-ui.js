/**
 * 新手导读（文件：68-settings-storage-status-ui.js）
 *
 * 负责什么：这是“设置界面”中的“设置、存储、状态、界面”部分。
 * 在程序中的位置：它把当前设置填入表单，读取用户修改，再触发保存后的联动效果。
 * 从哪里开始看：主要从 `bindSettingsStorageStatusControls(backend)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：表单值都是字符串或勾选状态，写回前要转换成正确的数字、布尔值和枚举。
 */
// 存储状态设置：展示当前后端、容量使用量和持久化授权状态。
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
            hintEl.textContent = buildStorageHintText(info || {}, backend);
            hintEl.style.color = backend === 'idb' ? '#60a5fa' : '#fbbf24';
        }).catch(function() {
            hintEl.textContent = backend === 'idb'
                ? 'IndexedDB \u4e3b\u5b58\u50a8\uff0clocalStorage \u4fdd\u7559\u5e94\u6025\u5feb\u7167\u3002'
                : 'localStorage \u5e94\u6025\u5feb\u7167\u6b63\u5728\u4f7f\u7528\uff0c\u5efa\u8bae\u5b9a\u671f\u5bfc\u51fa\u5907\u4efd\u3002';
            hintEl.style.color = backend === 'idb' ? '#60a5fa' : '#fbbf24';
        });
    }
}
