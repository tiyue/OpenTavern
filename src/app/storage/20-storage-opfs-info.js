/**
 * 新手导读（文件：20-storage-opfs-info.js）
 *
 * 负责什么：这是“本地存储系统”中的“存储、OPFS 文件存储、信息”部分。
 * 在程序中的位置：它在 OPFS、IndexedDB 和 localStorage 之间读写同一份应用快照。
 * 从哪里开始看：主要从 `getOPFSStorageInfo(storage)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：这是用户数据安全相关代码；任何修改都要考虑写入失败、旧数据和回退路径。
 */
// ==================== OPFS Storage Info ====================
async function getOPFSStorageInfo(storage) {
    if (storage._isFileProtocol()) {
        return {
            backend: 'opfs',
            used: 0,
            quota: null,
            fileProtocol: true,
            opfsAvailable: false,
            opfsSkipped: true,
            opfsSkippedReason: 'file-protocol'
        };
    }

    try {
        const est = (navigator.storage && navigator.storage.estimate) ? await navigator.storage.estimate() : { usage: 0, quota: null };
        let ourSize = 0;
        try {
            const root = await storage._getRoot();
            const fh = await root.getFileHandle(storage._fileName);
            const f = await fh.getFile();
            ourSize = f.size || 0;
        } catch (_) {}
        return {
            backend: 'opfs',
            used: ourSize,
            quota: est.quota,
            originUsed: est.usage
        };
    } catch (e) {}
    return { backend: 'opfs', used: 0, quota: null };
}
