// ==================== Storage OPFS Status Text ====================
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

