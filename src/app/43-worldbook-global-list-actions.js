// ==================== World Book Global List Actions ====================
function openWorldBookFromList(wb) {
    wiState.currentWorldBookId = wb.id;
    wiState.viewMode = 'entries';
    wiState.selectedUid = null;
    dom.wiBookName.value = wb.name || '';
    renderWIEntryList(dom.wiSearch.value.trim());
    updateWorldBookModalHeader();
}

function unlinkWorldBookFromCurrentConversation(wbId) {
    var currentConv = getActiveConv();
    if (!currentConv) return;
    currentConv.worldBookIds = (currentConv.worldBookIds || []).filter(function(id) { return id !== wbId; });
    wiState.dirty = true;
    updateWIDirtyIndicator();
    persistState(true);
    renderWorldInfoBadge();
    renderWorldBookList(getCurrentWorldBookFilter());
}
