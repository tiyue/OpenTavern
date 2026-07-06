// ==================== World Book Modal Controls ====================
function bindWorldBookModalControls() {
    dom.wiSearch.addEventListener('input', function() {
        renderWIEntryList(this.value.trim());
    });

    dom.wiBookName.addEventListener('input', function() {
        var wi = getActiveWI();
        wi.name = this.value;
        wiState.dirty = true;
        updateWIDirtyIndicator();
    });

    dom.wiCloseBtn.addEventListener('click', closeWorldBookModal);
    dom.worldBookBackdrop.addEventListener('click', closeWorldBookModal);
    dom.wiAddEntryBtn.addEventListener('click', addNewWIEntry);

    if (dom.wiNewBookBtn) {
        dom.wiNewBookBtn.addEventListener('click', function() {
            const newBook = createNewWorldBook('新建世界书');
            wiState.currentWorldBookId = newBook.id;
            wiState.viewMode = 'entries';
            wiState.dirty = true;
            updateWIDirtyIndicator();
            dom.wiBookName.value = newBook.name;
            renderWIEntryList('');
            showNoSelection();
            updateWorldBookModalHeader();
            persistState(true);
        });
    }

    dom.wiImportBtn.addEventListener('click', function() {
        if (dom.wiImportFile) {
            dom.wiImportFile.click();
        } else {
            console.error('wiImportFile element not found in DOM cache');
        }
    });
    dom.wiExportBtn.addEventListener('click', exportCurrentWorldInfo);
    dom.wiDeleteAllBtn.addEventListener('click', deleteAllWIEntries);

    if (dom.wiImportFile) {
        dom.wiImportFile.addEventListener('change', handleWIFileImport);
    } else {
        console.warn('wiImportFile not cached, import will not work');
    }
}
