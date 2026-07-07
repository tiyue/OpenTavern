// ==================== World Book Entry List Header UI ====================
function appendWorldBookEntryListHeader(container) {
    if (!wiState.currentWorldBookId) return;
    appendBackToWorldBookListRow(container);
    appendWorldBookAssociationRow(container);
    appendDeleteWorldBookRow(container);
}
