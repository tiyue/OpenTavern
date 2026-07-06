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
