function renderWIEntryList(filter) {
    var container = dom.wiEntryList;
    if (!container) return;
    container.innerHTML = '';

    if (wiState.viewMode === 'books' || !wiState.currentWorldBookId) {
        renderWorldBookList(filter);
        return;
    }

    var wi = getActiveWI();
    if (!wi) {
        container.innerHTML = '<p class="text-xs text-zinc-500 p-2">' + t('world_book_select_or_create') + '</p>';
        return;
    }

    var entries = getFilteredWorldInfoEntries(wi, filter);
    appendWorldBookEntryListHeader(container);

    if (entries.length === 0) {
        renderWorldBookEntryListEmpty(container);
        return;
    }

    entries.forEach(function(entry) {
        container.appendChild(createWorldBookEntryListRow(entry, wi));
    });

    if (wiState.viewMode !== 'books') {
        dom.wiEntryStats.textContent = entries.length + ' ' + t('world_book_entry');
    }
}
