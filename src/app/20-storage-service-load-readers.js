/**
 * 新手导读（文件：20-storage-service-load-readers.js）
 *
 * 负责什么：这是“本地存储系统”中的“存储、存储服务、读取、读取器”部分。
 * 在程序中的位置：它在 OPFS、IndexedDB 和 localStorage 之间读写同一份应用快照。
 * 从哪里开始看：主要从 `canReadStorageServiceOPFSCandidate(service)`、`collectStorageServiceOPFSCandidate(service, options, candidates)`、`collectStorageServiceIDBCandidate(service, options, candidates)`、`collectStorageServiceLocalCandidate(service, candidates)`、`collectStorageServiceLegacyIDBCandidate(service, candidates)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：这是用户数据安全相关代码；任何修改都要考虑写入失败、旧数据和回退路径。
 */
// ==================== StorageService Load Candidate Readers ====================
function canReadStorageServiceOPFSCandidate(service) {
    return !storageIsFileProtocol() && (service._opfsReadableAvailable || (navigator.storage && navigator.storage.getDirectory));
}

async function collectStorageServiceOPFSCandidate(service, options, candidates) {
    try {
        if (!canReadStorageServiceOPFSCandidate(service)) return;
        const data = await OPFSStorage.loadAll();
        if (service._isValidSnapshot(data)) candidates.push({ backend: 'opfs', data });
    } catch (e) {
        if (options.warnOPFS !== false) console.warn('[Storage] OPFS recovery read failed:', e && e.message);
    }
}

async function collectStorageServiceIDBCandidate(service, options, candidates) {
    if (!service._idbAvailable) return;
    try {
        const data = await IDBStorage.loadAll({ fresh: true });
        service._idbFailed = false;
        service._idbFailureReason = null;
        service._idbAvailable = true;
        if (service._isValidSnapshot(data)) candidates.push({ backend: 'idb', data });
    } catch (e) {
        service._idbFailureReason = e && e.message ? e.message : String(e);
        if (options.warnIDB !== false) console.warn('[Storage] IDB load failed; keeping IndexedDB retryable:', e && e.message);
    }
}

function collectStorageServiceLocalCandidate(service, candidates) {
    const data = service._readLocalSnapshot();
    if (data) candidates.push({ backend: 'localStorage', data });
}

async function collectStorageServiceLegacyIDBCandidate(service, candidates) {
    if (typeof readLegacyIndexedDB !== 'function') return;
    try {
        const legacy = await readLegacyIndexedDB();
        if (service._isValidSnapshot(legacy)) candidates.push({ backend: 'legacy-idb', data: legacy });
    } catch (_) {}
}
