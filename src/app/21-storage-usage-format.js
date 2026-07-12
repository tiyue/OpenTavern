/**
 * 新手导读（文件：21-storage-usage-format.js）
 *
 * 负责什么：这是“存储状态与缓存工具”中的“存储、用量、格式”部分。
 * 在程序中的位置：它把容量、后端状态和缓存操作转换成用户能看到的界面信息。
 * 从哪里开始看：主要从 `buildStorageUsageText(info)`、`buildStorageHintText(info, fallbackBackend)`、`getStoragePressurePercent(info)`、`styleStorageBackendBadge(el, backend)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：清理操作不可撤销，必须保留确认步骤和错误提示。
 */
// ==================== Storage Usage Formatting ====================
function buildStorageUsageText(info) {
    info = info || {};
    const backendLabel = getStorageBackendLabel(info.backend || StorageService.getBackend());
    const appMB = formatStorageMB(info.used || 0);
    const parts = [`\u5e94\u7528\u5feb\u7167 ${appMB} MB (${backendLabel})`];

    if (info.webllmUsed > 0) {
        parts.push(`\u6a21\u578b\u7f13\u5b58 ${formatStorageMB(info.webllmUsed)} MB`);
    }

    if (info.originUsed > 0 || info.quota > 0) {
        const originMB = formatStorageMB(info.originUsed || ((info.used || 0) + (info.webllmUsed || 0)));
        if (info.quota && info.quota > 0) {
            const quotaGB = (info.quota / 1024 / 1024 / 1024).toFixed(1);
            parts.push(`\u6d4f\u89c8\u5668\u603b\u7528\u91cf ${originMB} MB / \u914d\u989d ~${quotaGB} GB`);
        } else {
            parts.push(`\u6d4f\u89c8\u5668\u603b\u7528\u91cf ${originMB} MB`);
        }
    } else if (info.quota && info.quota > 0) {
        const quotaGB = (info.quota / 1024 / 1024 / 1024).toFixed(1);
        parts.push(`\u914d\u989d ~${quotaGB} GB`);
    }

    if (info.persisted === false) parts.push('\u975e\u6301\u4e45\u6388\u6743');
    parts.push(getOPFSStatusText(info));
    return parts.join(' · ');
}

function buildStorageHintText(info, fallbackBackend) {
    info = info || {};
    const backendLabel = getStorageBackendLabel(info.backend || fallbackBackend || StorageService.getBackend());
    const base = `\u4e3b\u5b58\u50a8\u4f7f\u7528 ${backendLabel}\uff0clocalStorage \u4fdd\u7559\u5e94\u6025\u5feb\u7167`;
    if (isStorageInfoFileProtocolMode(info)) {
        return `${base}\uff1b\u672c\u5730\u6587\u4ef6\u6a21\u5f0f\u5df2\u8df3\u8fc7 OPFS\u3002`;
    }
    return `${base}\uff1b${getOPFSStatusText(info)}\u3002`;
}

function getStoragePressurePercent(info) {
    info = info || {};
    const appUsed = info.used || 0;
    const overall = (info.originUsed && info.originUsed > 0)
        ? info.originUsed
        : (appUsed + (info.webllmUsed || 0));
    return (info.quota && info.quota > 0)
        ? Math.min((overall / info.quota) * 100, 100)
        : Math.min(overall / (100 * 1024 * 1024), 100);
}

function styleStorageBackendBadge(el, backend) {
    if (!el) return;
    if (backend === 'idb') {
        el.style.background = 'rgba(59,130,246,0.15)';
        el.style.color = '#60a5fa';
    } else {
        el.style.background = 'rgba(245,158,11,0.15)';
        el.style.color = '#fbbf24';
    }
}
