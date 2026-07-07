// ==================== OPFS Unsupported Environment Helpers ====================
function isKnownOPFSUnsupportedError(e) {
    return !!(e && (
        e.name === 'SecurityError' ||
        /file:|file-protocol|unsafe|OPFS (blocked|unavailable)/i.test(e.message || '')
    ));
}

function warnOPFSUnsupportedOnce(storage) {
    if (opfsStorageIsFileProtocol()) return;
    if (!storage._warnedUnsupported) {
        console.warn('[OPFS] Skipped in this environment; using fallback storage.');
        storage._warnedUnsupported = true;
    }
}
