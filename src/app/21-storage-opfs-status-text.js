/**
 * 新手导读（文件：21-storage-opfs-status-text.js）
 *
 * 负责什么：这是“存储状态与缓存工具”中的“存储、OPFS 文件存储、状态、文本”部分。
 * 在程序中的位置：它把容量、后端状态和缓存操作转换成用户能看到的界面信息。
 * 从哪里开始看：主要从 `getStorageBackendLabel(backend)`、`formatStorageMB(bytes)`、`isStorageInfoFileProtocolMode(info)`、`getOPFSStatusText(info)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：清理操作不可撤销，必须保留确认步骤和错误提示。
 */
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

