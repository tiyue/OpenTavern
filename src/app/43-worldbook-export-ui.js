// ==================== World Book Export UI ====================
function sanitizeWorldInfoFileName(name) {
    return String(name || 'world_info')
        .replace(/[^\w\u4e00-\u9fff-]+/g, '_')
        .replace(/^_+|_+$/g, '') || 'world_info';
}

function exportCurrentWorldInfo() {
    var wi = getActiveWI();
    if (!wi) return;
    var data = entriesToSTFormat(wi);
    var name = sanitizeWorldInfoFileName(wi.name || 'world_info');
    downloadJsonFile(data, name + '.json');
    recordBackupMade();
}
