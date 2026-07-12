/**
 * 新手导读（文件：20-storage-service-opfs-init-helpers.js）
 *
 * 负责什么：这是“本地存储系统”中的“存储、存储服务、OPFS 文件存储、初始化、辅助函数”部分。
 * 在程序中的位置：它在 OPFS、IndexedDB 和 localStorage 之间读写同一份应用快照。
 * 从哪里开始看：主要从 `resetStorageServiceOPFSState(service)`、`markStorageServiceOPFSSkipped(service, reason)`、`markStorageServiceOPFSFailed(service, reason)`、`getStorageServiceOPFSSkipReason(service)`、`assertStorageServiceOPFSSupported(无参数)`、`isStorageServiceOPFSFileProtocolError(message)`，以及另外 2 个内部步骤 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：这是用户数据安全相关代码；任何修改都要考虑写入失败、旧数据和回退路径。
 */
// ==================== StorageService OPFS Initialization Helpers ====================
function resetStorageServiceOPFSState(service) {
    service._opfsReadableAvailable = false;
    service._opfsMirrorAvailable = false;
    service._opfsSkipped = false;
    service._opfsSkippedReason = null;
    service._opfsFailed = false;
    service._opfsFailureReason = null;
}

function markStorageServiceOPFSSkipped(service, reason) {
    service._opfsSkipped = true;
    service._opfsSkippedReason = reason;
    service._opfsFailed = false;
    service._opfsFailureReason = null;
}

function markStorageServiceOPFSFailed(service, reason) {
    service._opfsFailed = true;
    service._opfsFailureReason = reason;
}

function getStorageServiceOPFSSkipReason(service) {
    if (!service._useOPFS) return 'disabled';
    if (storageIsFileProtocol()) return 'file-protocol';
    return null;
}

function assertStorageServiceOPFSSupported() {
    if (!window.isSecureContext) throw new Error('insecure-context');
    if (!navigator.storage || !navigator.storage.getDirectory) throw new Error('OPFS not supported');
}

function isStorageServiceOPFSFileProtocolError(message) {
    return storageIsFileProtocol() || /file:|file-protocol|blocked on file/i.test(message || '');
}

function markStorageServiceOPFSSafariReadOnly(service) {
    markStorageServiceOPFSFailed(service, 'Safari OPFS writes are disabled; IndexedDB is canonical.');
    console.warn('[Storage] Safari detected: OPFS will be read for recovery only, not used for writes.');
}

function applyStorageServiceOPFSProbeResult(service, probe) {
    if (probe && probe.ok) {
        service._opfsMirrorAvailable = true;
        console.log('[Storage] OPFS writable mirror initialized successfully');
        return;
    }
    markStorageServiceOPFSFailed(service, (probe && probe.reason) || 'OPFS write probe failed');
    console.warn('[Storage] OPFS write probe failed; keeping IndexedDB/localStorage canonical:', service._opfsFailureReason);
}
