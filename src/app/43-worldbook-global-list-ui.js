// ==================== World Book Global List UI ====================
function renderWorldBookList(filter) {
    var container = dom.wiEntryList;
    if (!container) return;
    container.innerHTML = '';

    var books = getFilteredWorldBookList(filter);

    if (books.length === 0) {
        renderWorldBookListEmpty(container);
        return;
    }

    var currentConv = getActiveConv();
    var linkedIds = (currentConv && currentConv.worldBookIds) ? currentConv.worldBookIds : [];

    books.forEach(function(wb) {
        container.appendChild(createWorldBookListRow(wb, linkedIds));
    });

    dom.wiEntryStats.textContent = books.length + ' ' + t('world_book_entry');
}

function refreshWorldBookLeftPanel() {
    var filter = dom.wiSearch ? dom.wiSearch.value.trim() : '';
    if (wiState.viewMode === 'books' || !wiState.currentWorldBookId) {
        renderWorldBookList(filter);
    } else {
        renderWIEntryList(filter);
    }
}
