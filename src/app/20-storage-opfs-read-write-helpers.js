/**
 * 新手导读（文件：20-storage-opfs-read-write-helpers.js）
 *
 * 负责什么：这是“本地存储系统”中的“存储、OPFS 文件存储、读取、写入、辅助函数”部分。
 * 在程序中的位置：它在 OPFS、IndexedDB 和 localStorage 之间读写同一份应用快照。
 * 从哪里开始看：主要从 `readOPFSStorageText(storage)`、`parseOPFSStorageData(text)`、`queueOPFSStorageWrite(storage, writeOperation)`、`writeOPFSStorageData(storage, data)`、`handleOPFSStorageIOError(storage, e, operationName)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：这是用户数据安全相关代码；任何修改都要考虑写入失败、旧数据和回退路径。
 */
// ==================== OPFS Storage Read/Write Helpers ====================
async function readOPFSStorageText(storage) {
    const root = await storage._getRoot();
    let fileHandle;
    try {
        fileHandle = await root.getFileHandle(storage._fileName);
    } catch (e) {
        return null;
    }
    const file = await fileHandle.getFile();
    return await file.text();
}

function parseOPFSStorageData(text) {
    if (!text) return null;
    const data = JSON.parse(text);
    if (!data.lastSaved) data.lastSaved = Date.now();
    return data;
}

function queueOPFSStorageWrite(storage, writeOperation) {
    const prev = storage._writeLock || Promise.resolve();
    storage._writeLock = prev.then(writeOperation, writeOperation);
    return storage._writeLock;
}

async function writeOPFSStorageData(storage, data) {
    const root = await storage._getRoot();
    const fileHandle = await root.getFileHandle(storage._fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(data));
    await writable.close();
}

function handleOPFSStorageIOError(storage, e, operationName) {
    if (isKnownOPFSUnsupportedError(e)) {
        warnOPFSUnsupportedOnce(storage);
    } else {
        console.error(`[OPFS] ${operationName} failed:`, e);
    }
}
