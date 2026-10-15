/**
 * 新手导读（文件：20-storage-service-helpers.js）
 *
 * 负责什么：这是“本地存储系统”中的“存储、存储服务、辅助函数”部分。
 * 在程序中的位置：它在 OPFS、IndexedDB 和 localStorage 之间读写同一份应用快照。
 * 从哪里开始看：主要从 `storageIsQuotaError(e)`、`storageDetectSafari(无参数)`、`storageGetLocationProtocol(无参数)`、`storageIsFileProtocol(无参数)`、`storageHasUserData(data)`、`storageIsValidSnapshot(data)`，以及另外 2 个内部步骤 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：这是用户数据安全相关代码；任何修改都要考虑写入失败、旧数据和回退路径。
 */
// ==================== StorageService Helpers ====================
function storageIsQuotaError(e) {
    if (!e) return false;
    const msg = (e.message || '').toLowerCase();
    return e.name === 'QuotaExceededError' ||
           e.code === 22 ||
           msg.includes('quota') ||
           msg.includes('exceeded');
}

function storageDetectSafari() {
    try {
        const ua = navigator.userAgent || '';
        const vendor = navigator.vendor || '';
        const isAppleWebKit = /AppleWebKit/i.test(ua);
        const isChromium = /CriOS|Chrome|Chromium|Edg|OPR|Firefox|FxiOS/i.test(ua);
        return /Safari/i.test(ua) && /Apple/i.test(vendor) && isAppleWebKit && !isChromium;
    } catch (_) {
        return false;
    }
}

function storageGetLocationProtocol() {
    try {
        if (typeof location !== 'undefined' && location && location.protocol) return location.protocol;
        if (typeof window !== 'undefined' && window.location && window.location.protocol) return window.location.protocol;
    } catch (_) {}
    return '';
}

function storageIsFileProtocol() {
    return storageGetLocationProtocol() === 'file:';
}

function storageHasUserData(data) {
    return !!(data && (
        Object.keys(data.conversations || {}).length > 0 ||
        Object.keys(data.characters || {}).length > 0 ||
        Object.keys(data.worldBooks || {}).length > 0
    ));
}

function storageIsValidSnapshot(data) {
    return !!(data && (
        storageHasUserData(data) ||
        (data.settings && Object.keys(data.settings || {}).length > 0)
    ));
}

function storageSnapshotTime(data) {
    const n = data && data.lastSaved ? Number(data.lastSaved) : 0;
    return Number.isFinite(n) ? n : 0;
}

function storageCloneForPersist(data) {
    return data ? JSON.parse(JSON.stringify(data)) : data;
}
