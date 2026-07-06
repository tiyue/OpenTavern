// ==================== World Book Entry List Filtering ====================
function getCurrentWorldBookFilter() {
    return dom.wiSearch ? dom.wiSearch.value.trim() : '';
}

function getFilteredWorldInfoEntries(wi, filter) {
    var entries = Object.keys(wi.entries).map(function(k) {
        return normalizeWIEntry(wi.entries[k]) || wi.entries[k];
    });

    if (filter) {
        var f = filter.toLowerCase();
        entries = entries.filter(function(e) {
            var keys = (e.key || []).join(' ').toLowerCase();
            var sec = (e.keysecondary || []).join(' ').toLowerCase();
            var cmt = (e.comment || '').toLowerCase();
            return keys.indexOf(f) !== -1 || sec.indexOf(f) !== -1 || cmt.indexOf(f) !== -1;
        });
    }

    entries.sort(function(a, b) { return (b.order || 0) - (a.order || 0); });
    return entries;
}
