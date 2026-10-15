/**
 * 新手导读（文件：21-storage-status-render.js）
 *
 * 负责什么：这是“存储状态与缓存工具”中的“存储、状态、渲染”部分。
 * 在程序中的位置：它把容量、后端状态和缓存操作转换成用户能看到的界面信息。
 * 从哪里开始看：主要从 `applyStoragePressureStyles(usageEl, bar, percent)`、`applyStorageUsageElements(info, backend, usageEl, bar)`、`buildStorageStatusTitle(info, backend)`、`applyStorageStatusInfo(el, info, backend)`、`bindStorageStatusClick(el)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：清理操作不可撤销，必须保留确认步骤和错误提示。
 */
// ==================== Storage Status Render Helpers ====================
function applyStoragePressureStyles(usageEl, bar, percent) {
    if (percent > 85) {
        if (bar) bar.style.background = '#f87171';
        if (usageEl) usageEl.style.color = '#f87171';
    } else if (percent > 75) {
        if (bar) bar.style.background = '#fbbf24';
        if (usageEl) usageEl.style.color = '#fbbf24';
    } else {
        if (bar) bar.style.background = '#f59e0b';
        if (usageEl) usageEl.style.color = '';
    }
}

function applyStorageUsageElements(info, backend, usageEl, bar) {
    if (usageEl && info) {
        usageEl.textContent = buildStorageUsageText(info);
        const percent = getStoragePressurePercent(info);
        if (bar) bar.style.width = percent + '%';
        applyStoragePressureStyles(usageEl, bar, percent);
        showOrHideStorageWarning(percent);
        return;
    }

    if (usageEl) {
        usageEl.textContent = backend === 'idb' ? 'IndexedDB \u4e3b\u5b58\u50a8' : 'localStorage \u5e94\u6025\u5feb\u7167';
        if (bar) bar.style.width = '0%';
    }
}

function buildStorageStatusTitle(info, backend) {
    let tip = `\u4e3b\u5b58\u50a8\u540e\u7aef: ${getStorageBackendLabel(info.backend || backend)}`;
    tip += ` · 应用快照 ${formatStorageMB(info.used || 0)} MB`;
    tip += ` · ${getOPFSStatusText(info)}`;
    if (info.persisted === false) tip += ' · \u975e\u6301\u4e45\u6388\u6743';
    return tip;
}

function applyStorageStatusInfo(el, info, backend) {
    var percent = getStoragePressurePercent(info);
    var tip = buildStorageStatusTitle(info, backend);
    if (percent > 85) {
        el.style.background = 'rgba(239,68,68,0.25)';
        el.style.color = '#f87171';
        tip += ` (${t('storage_high_warning') || '\u5b58\u50a8\u538b\u529b\u8f83\u9ad8'})`;
    } else if (percent > 75) {
        el.style.background = 'rgba(245,158,11,0.25)';
        el.style.color = '#fbbf24';
    }
    el.title = tip;
}

function bindStorageStatusClick(el) {
    if (el._storageClickBound) return;
    el._storageClickBound = true;
    el.addEventListener('click', function() {
        const modal = document.getElementById('settingsModal');
        if (modal) modal.classList.remove('hidden');
    });
}
