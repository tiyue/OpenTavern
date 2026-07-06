// ==================== World Book Entry Live Binding Core ====================
function getSelectedWorldBookEntry() {
    if (!wiState.selectedUid) return null;
    var wi = getActiveWI();
    return wi && wi.entries ? wi.entries[wiState.selectedUid] : null;
}

function setWorldBookEntryPathValue(entry, path, value) {
    if (!entry || !path) return;
    if (path.indexOf('.') > -1) {
        var parts = path.split('.');
        if (!entry[parts[0]]) entry[parts[0]] = {};
        entry[parts[0]][parts[1]] = value;
    } else {
        entry[path] = value;
    }
}

function syncWorldBookEntryExtensionField(entry, prop, value) {
    if (!entry || !entry.extensions) return;
    if (prop === 'position' || prop === 'depth' || prop === 'role' || prop === 'probability') {
        entry.extensions[prop] = value;
    }
}

function markWorldBookEntryDirtyAndRenderList() {
    wiState.dirty = true;
    renderWIEntryList(dom.wiSearch.value.trim());
}
