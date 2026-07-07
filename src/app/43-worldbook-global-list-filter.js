// ==================== World Book Global List Filter ====================
function getFilteredWorldBookList(filter) {
    if (!state.worldBooks) state.worldBooks = {};

    var books = Object.values(state.worldBooks);
    if (!filter) return books;

    var f = filter.toLowerCase();
    return books.filter(function(wb) {
        return (wb.name || '').toLowerCase().indexOf(f) !== -1;
    });
}
