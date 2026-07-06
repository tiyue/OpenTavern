// ==================== World Book Activation Collection ====================
function collectWorldInfoActivationEntries(conv) {
    var entries = [];
    if (!conv) return entries;

    if (Array.isArray(conv.worldBookIds) && conv.worldBookIds.length > 0) {
        conv.worldBookIds.forEach(function(wbId) {
            var wb = state.worldBooks && state.worldBooks[wbId];
            if (wb && wb.entries) {
                Object.keys(wb.entries).forEach(function(uid) {
                    var entry = normalizeWIEntry(wb.entries[uid]) || JSON.parse(JSON.stringify(wb.entries[uid]));
                    entry._sourceWorldBookId = wbId;
                    entries.push(entry);
                });
            }
        });
    }

    if (conv.worldInfo && conv.worldInfo.entries) {
        Object.keys(conv.worldInfo.entries).forEach(function(uid) {
            var entry = normalizeWIEntry(conv.worldInfo.entries[uid]) || JSON.parse(JSON.stringify(conv.worldInfo.entries[uid]));
            entries.push(entry);
        });
    }

    return entries;
}

function buildCombinedWorldInfo(entries) {
    var wi = { entries: {} };
    entries.forEach(function(e) {
        var uid = e.uid != null ? String(e.uid) : Date.now().toString();
        wi.entries[uid] = e;
    });
    return wi;
}

function getEnabledWorldInfoEntries(wi) {
    return Object.keys(wi.entries).map(function(k) { return wi.entries[k]; })
        .filter(function(e) { return e && !e.disable; });
}
