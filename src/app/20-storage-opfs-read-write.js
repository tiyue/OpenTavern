/**
 * 新手导读（文件：20-storage-opfs-read-write.js）
 *
 * 负责什么：这是“本地存储系统”中的“存储、OPFS 文件存储、读取、写入”部分。
 * 在程序中的位置：它在 OPFS、IndexedDB 和 localStorage 之间读写同一份应用快照。
 * 从哪里开始看：主要从 `loadAllOPFSStorage(storage)`、`saveAllOPFSStorage(storage, data)`、`doSaveAllOPFSStorage(storage, data)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：这是用户数据安全相关代码；任何修改都要考虑写入失败、旧数据和回退路径。
 */
// ==================== OPFS Storage Read/Write ====================
async function loadAllOPFSStorage(storage) {
    if (storage._isFileProtocol()) return null;

    try {
        return parseOPFSStorageData(await readOPFSStorageText(storage));
    } catch (e) {
        handleOPFSStorageIOError(storage, e, 'loadAll');
        return null;
    }
}

async function saveAllOPFSStorage(storage, data) {
    if (storage._isFileProtocol()) return;

    return queueOPFSStorageWrite(storage, () => storage._doSaveAll(data));
}

async function doSaveAllOPFSStorage(storage, data) {
    try {
        await writeOPFSStorageData(storage, data);
    } catch (e) {
        handleOPFSStorageIOError(storage, e, 'saveAll');
        throw e;
    }
}
