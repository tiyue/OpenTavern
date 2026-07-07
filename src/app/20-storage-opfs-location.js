// ==================== OPFS Location Helpers ====================
function getOPFSLocationProtocol() {
    try {
        if (typeof location !== 'undefined' && location && location.protocol) return location.protocol;
        if (typeof window !== 'undefined' && window.location && window.location.protocol) return window.location.protocol;
    } catch (_) {}
    return '';
}

function opfsStorageIsFileProtocol() {
    return getOPFSLocationProtocol() === 'file:';
}
