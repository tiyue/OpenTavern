// ==================== Storage Usage Formatting ====================
function getStorageBackendLabel(backend) {
    if (backend === 'opfs') return 'OPFS';
    if (backend === 'idb') return 'IndexedDB';
    if (backend === 'legacy-idb') return '\u65e7\u7248 IndexedDB';
    return 'localStorage';
}

function formatStorageMB(bytes) {
    return ((bytes || 0) / 1024 / 1024).toFixed(1);
}

function isStorageInfoFileProtocolMode(info) {
    return !!(info && (info.fileProtocol || info.opfsSkippedReason === 'file-protocol')) ||
        (typeof storageIsFileProtocol === 'function' && storageIsFileProtocol());
}

function getOPFSStatusText(info) {
    var isFileMode = isStorageInfoFileProtocolMode(info);
    if (isFileMode) {
        return '\u672c\u5730\u6587\u4ef6\u6a21\u5f0f\uff1aOPFS \u5df2\u8df3\u8fc7\uff0c\u6570\u636e\u4fdd\u5b58\u5230 IndexedDB/localStorage';
    }
    if (info && info.opfsSkipped) {
        return 'OPFS \u5df2\u8df3\u8fc7\uff1a\u6570\u636e\u4fdd\u5b58\u5230 IndexedDB/localStorage';
    }
    if (!info || !info.opfsAvailable) {
        var reason = String(info && info.opfsFailureReason || '').toLowerCase();
        if (/file:|file-protocol|blocked on file/.test(reason)) return '\u672c\u5730\u6587\u4ef6\u6a21\u5f0f\uff1aOPFS \u5df2\u8df3\u8fc7\uff0c\u6570\u636e\u4fdd\u5b58\u5230 IndexedDB/localStorage';
        return 'OPFS \u672a\u542f\u7528\uff1a\u6570\u636e\u4fdd\u5b58\u5230 IndexedDB/localStorage';
    }
    if (info.opfsMirrorAvailable) return 'OPFS: \u955c\u50cf\u53ef\u5199';
    if (info.safariOpfsReadOnly) return 'OPFS: Safari \u4ec5\u4f5c\u6062\u590d\u6765\u6e90';
    return 'OPFS: \u4ec5\u4f5c\u6062\u590d\u6765\u6e90';
}

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
