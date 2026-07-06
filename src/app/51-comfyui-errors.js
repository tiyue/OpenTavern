// ==================== ComfyUI Error Helpers ====================
function formatComfyError(e) {
    var msg = (e && e.message) || String(e || '');
    if (/failed to fetch|networkerror|load failed/i.test(msg)) {
        return t('comfy_error_fetch_hint') + '\n\n' + msg;
    }
    return msg;
}
