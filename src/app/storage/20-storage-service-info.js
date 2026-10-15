/**
 * 新手导读（文件：20-storage-service-info.js）
 *
 * 负责什么：这是“本地存储系统”中的“存储、存储服务、信息”部分。
 * 在程序中的位置：它在 OPFS、IndexedDB 和 localStorage 之间读写同一份应用快照。
 * 从哪里开始看：主要从 `getStorageServiceInfo(service)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：这是用户数据安全相关代码；任何修改都要考虑写入失败、旧数据和回退路径。
 */
// ==================== StorageService Info ====================
async function getStorageServiceInfo(service) {
    try {
        const appUsed = await readStorageServiceAppUsage(service);
        const browserInfo = await readStorageServiceBrowserQuota();
        return {
            backend: service.getBackend(),
            used: appUsed,
            totalUsed: appUsed,
            originUsed: browserInfo.originUsed,
            quota: browserInfo.quota,
            persisted: browserInfo.persisted,
            fileProtocol: storageIsFileProtocol(),
            idbAvailable: service._idbAvailable || ('indexedDB' in window),
            idbLastError: service._idbFailureReason,
            opfsAvailable: service._opfsReadableAvailable,
            opfsMirrorAvailable: service._opfsMirrorAvailable,
            opfsSkipped: service._opfsSkipped,
            opfsSkippedReason: service._opfsSkippedReason,
            opfsFailureReason: service._opfsFailureReason,
            safariOpfsReadOnly: service._isSafari() && service._opfsReadableAvailable
        };
    } catch (e) {}
    return getStorageServiceFallbackInfo(service);
}
