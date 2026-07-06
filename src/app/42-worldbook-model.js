// ==================== World Info Active Model ====================
function getWorldInfo(conv) {
    if (!conv) return null;

    if (Array.isArray(conv.worldBookIds) && conv.worldBookIds.length > 0) {
        return getMergedWorldInfoForConv(conv);
    }

    if (!conv.worldInfo) {
        conv.worldInfo = { name: '', entries: {} };
    }
    if (!conv.worldInfo.entries) conv.worldInfo.entries = {};
    return conv.worldInfo;
}

function getMergedWorldInfoForConv(conv) {
    if (!conv.worldInfo) {
        conv.worldInfo = { name: '', entries: {} };
    }
    return conv.worldInfo;
}
