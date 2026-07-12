/**
 * 新手导读（文件：20-storage-opfs-clear.js）
 *
 * 负责什么：这是“本地存储系统”中的“存储、OPFS 文件存储、清理”部分。
 * 在程序中的位置：它在 OPFS、IndexedDB 和 localStorage 之间读写同一份应用快照。
 * 从哪里开始看：主要从 `createEmptyOPFSSnapshot(无参数)`、`resetOPFSStorageFile(root, fileName)`、`clearOPFSStorage(storage)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：这是用户数据安全相关代码；任何修改都要考虑写入失败、旧数据和回退路径。
 */
// ==================== OPFS Storage Clear ====================
function createEmptyOPFSSnapshot() {
    return {
        lastSaved: Date.now(),
        conversations: {},
        characters: {},
        worldBooks: {},
        conversationOrder: [],
        activeConvId: null,
        settings: {}
    };
}

async function resetOPFSStorageFile(root, fileName) {
    try {
        const fh = await root.getFileHandle(fileName, { create: true });
        const w = await fh.createWritable();
        await w.write(JSON.stringify(createEmptyOPFSSnapshot()));
        await w.close();
    } catch (_) {}
}

async function clearOPFSStorage(storage) {
    if (storage._isFileProtocol()) return;

    try {
        const root = await navigator.storage.getDirectory();
        try {
            await root.removeEntry(storage._fileName);
        } catch (removeErr) {
            if (removeErr && removeErr.name !== 'NotFoundError') {
                await resetOPFSStorageFile(root, storage._fileName);
            }
        }
        storage._root = null;
    } catch (e) {}
}
