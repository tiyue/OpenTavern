/**
 * 新手导读（文件：20-storage-opfs-probe.js）
 *
 * 负责什么：这是“本地存储系统”中的“存储、OPFS 文件存储、连通性测试”部分。
 * 在程序中的位置：它在 OPFS、IndexedDB 和 localStorage 之间读写同一份应用快照。
 * 从哪里开始看：主要从 `probeOPFSStorageWritable(storage)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：这是用户数据安全相关代码；任何修改都要考虑写入失败、旧数据和回退路径。
 */
// ==================== OPFS Writable Probe ====================
async function probeOPFSStorageWritable(storage) {
    if (storage._probeResult) return storage._probeResult;
    if (storage._probePromise) return storage._probePromise;

    storage._probePromise = (async () => {
        const probeName = '__opentavern-opfs-probe__.json';
        const payload = JSON.stringify({ ok: true, t: Date.now() });
        try {
            const root = await storage._getRoot();
            const fh = await root.getFileHandle(probeName, { create: true });
            const writable = await fh.createWritable();
            await writable.write(payload);
            await writable.close();

            const file = await fh.getFile();
            const text = await file.text();
            if (text !== payload) throw new Error('OPFS probe verification failed');

            try { await root.removeEntry(probeName); } catch (_) {}
            storage._probeResult = { ok: true, reason: null };
            return storage._probeResult;
        } catch (e) {
            storage._probeResult = {
                ok: false,
                reason: e && e.message ? e.message : String(e)
            };
            return storage._probeResult;
        } finally {
            storage._probePromise = null;
        }
    })();

    return storage._probePromise;
}
