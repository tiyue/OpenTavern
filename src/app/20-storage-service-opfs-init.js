/**
 * 新手导读（文件：20-storage-service-opfs-init.js）
 *
 * 负责什么：这是“本地存储系统”中的“存储、存储服务、OPFS 文件存储、初始化”部分。
 * 在程序中的位置：它在 OPFS、IndexedDB 和 localStorage 之间读写同一份应用快照。
 * 从哪里开始看：主要从 `initStorageServiceOPFS(service)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：这是用户数据安全相关代码；任何修改都要考虑写入失败、旧数据和回退路径。
 */
// ==================== StorageService OPFS Initialization ====================
async function initStorageServiceOPFS(service) {
    try {
        const skipReason = getStorageServiceOPFSSkipReason(service);
        if (skipReason) {
            markStorageServiceOPFSSkipped(service, skipReason);
            return;
        }
        assertStorageServiceOPFSSupported();

        await OPFSStorage._getRoot();
        service._opfsReadableAvailable = true;

        if (service._isSafari()) {
            markStorageServiceOPFSSafariReadOnly(service);
            return;
        }

        const probe = await OPFSStorage.probeWritable();
        applyStorageServiceOPFSProbeResult(service, probe);
    } catch (e) {
        const msg = e && e.message ? e.message : String(e);
        if (isStorageServiceOPFSFileProtocolError(msg)) {
            markStorageServiceOPFSSkipped(service, 'file-protocol');
            return;
        }
        markStorageServiceOPFSFailed(service, msg);
        console.info('[Storage] OPFS unavailable; IndexedDB/localStorage remain canonical:', msg);
    }
}
