// ==================== World Book Import UI ====================
function handleWIFileImport(e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(ev) {
        try {
            var json = JSON.parse(ev.target.result);
            var normalized = normalizeImportedWorldInfo(json);

            if (wiState.viewMode === 'books' || !wiState.currentWorldBookId) {
                importWorldInfoAsNewBook(normalized);
            } else {
                importWorldInfoIntoCurrentBook(normalized);
            }
        } catch (err) {
            alert('\u5bfc\u5165\u5931\u8d25: ' + err.message);
        }
        if (dom.wiImportFile) dom.wiImportFile.value = '';
    };
    reader.readAsText(file);
}

function importWorldInfoAsNewBook(normalized) {
    var newBook = createNewWorldBook(normalized.name || 'Imported World Book');
    newBook.entries = normalized.entries;
    if (normalized.name) newBook.name = normalized.name;

    wiState.currentWorldBookId = newBook.id;
    wiState.viewMode = 'entries';
    wiState.dirty = true;
    updateWIDirtyIndicator();

    if (dom.wiBookName) dom.wiBookName.value = newBook.name;
    if (dom.wiSearch) dom.wiSearch.value = '';

    renderWIEntryList('');
    showNoSelection();
    updateWorldBookModalHeader();
    renderWorldInfoBadge();
    persistState(true);

    alert('\u5df2\u4f5c\u4e3a\u65b0\u4e16\u754c\u4e66\u5bfc\u5165\uff08' + Object.keys(newBook.entries).length + ' \u6761\u76ee\uff09');
}

function importWorldInfoIntoCurrentBook(normalized) {
    var wi = getActiveWI();
    wi.entries = normalized.entries;
    if (normalized.name) {
        wi.name = normalized.name;
        if (dom.wiBookName) dom.wiBookName.value = normalized.name;
    }
    wiState.dirty = true;
    updateWIDirtyIndicator();

    if (dom.wiSearch) dom.wiSearch.value = '';
    renderWIEntryList('');
    showNoSelection();
    renderWorldInfoBadge();
    persistState(true);
    alert('\u4e16\u754c\u4e66\u5bfc\u5165\u6210\u529f\uff08' + Object.keys(wi.entries).length + ' \u6761\u76ee\uff09');
}
