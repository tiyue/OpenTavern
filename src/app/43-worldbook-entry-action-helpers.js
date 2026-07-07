// ==================== World Book Entry Action Helpers ====================
function getWIEntryActionFilter() {
    return (dom.wiSearch && dom.wiSearch.value) ? dom.wiSearch.value.trim() : '';
}

function markWIEntryActionDirtyAndRender(filter) {
    wiState.dirty = true;
    updateWIDirtyIndicator();
    renderWIEntryList(filter != null ? filter : getWIEntryActionFilter());
}

function createDuplicateWIEntry(src, uid) {
    var copy = JSON.parse(JSON.stringify(src));
    copy.uid = uid;
    copy.comment = (src.comment || 'Entry') + ' (copy)';
    return copy;
}

function unlinkWorldBookFromConversations(wbId) {
    if (!state.conversations) return;
    Object.values(state.conversations).forEach(function(conv) {
        if (conv && Array.isArray(conv.worldBookIds)) {
            conv.worldBookIds = conv.worldBookIds.filter(function(id) { return id !== wbId; });
        }
    });
}

function resetWorldBookSelectionAfterDelete(wbId) {
    if (wiState.currentWorldBookId !== wbId) return;
    wiState.currentWorldBookId = null;
    wiState.viewMode = 'books';
    wiState.selectedUid = null;
}

function refreshWorldBookDeleteViews() {
    wiState.dirty = true;
    updateWIDirtyIndicator();
    persistState(true);
    if (typeof updateStorageInfo === 'function') updateStorageInfo();
    renderWorldInfoBadge();
    renderWorldBookList(getWIEntryActionFilter());
    updateWorldBookModalHeader();
}
