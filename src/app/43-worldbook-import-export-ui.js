function handleWIFileImport(e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(ev) {
        try {
            var json = JSON.parse(ev.target.result);
            var normalized = normalizeImportedWorldInfo(json);

            // Phase 4: In global manager mode, import as a completely new independent world book
            if (wiState.viewMode === 'books' || !wiState.currentWorldBookId) {
                const newBook = createNewWorldBook(normalized.name || 'Imported World Book');
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

                // Immediate persist: imported world books must be durable immediately (user complaint: they get persisted but then "cannot be deleted" if timing is bad).
                persistState(true);

                alert('已作为新世界书导入（' + Object.keys(newBook.entries).length + ' 条目）');
            } else {
                // Legacy / current book import
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
                alert('世界书导入成功（' + Object.keys(wi.entries).length + ' 条目）');
            }
        } catch (err) {
            alert('导入失败: ' + err.message);
        }
        if (dom.wiImportFile) dom.wiImportFile.value = '';
    };
    reader.readAsText(file);
}

function exportCurrentWorldInfo() {
    var wi = getActiveWI();
    var data = entriesToSTFormat(wi);
    var name = (wi.name || 'world_info').replace(/[^a-zA-Z0-9一-鿿]/g, '_');
    downloadJsonFile(data, name + '.json');
    recordBackupMade(); // Phase 4
}

// Simple render hook for count badge (Phase 3: support multiple global world books)
function renderWorldInfoBadge() {
    var el = dom.wiEntryCount;
    if (!el) return;

    var conv = getActiveConv();
    if (!conv) {
        el.textContent = '';
        el.title = '';
        return;
    }

    var count = 0;

    // New model: count entries from all assigned world books
    if (Array.isArray(conv.worldBookIds) && conv.worldBookIds.length > 0) {
        conv.worldBookIds.forEach(function(wbId) {
            var wb = state.worldBooks && state.worldBooks[wbId];
            if (wb && wb.entries) {
                count += Object.keys(wb.entries).length;
            }
        });
    }

    // Legacy fallback
    if (conv.worldInfo && conv.worldInfo.entries) {
        count += Object.keys(conv.worldInfo.entries).length;
    }

    el.textContent = count > 0 ? count : '';
    el.title = count + ' ' + t('world_book_entry') + (conv.worldBookIds && conv.worldBookIds.length > 1 ? ' (来自 ' + conv.worldBookIds.length + ' 个世界书)' : '');
}

function renderWorldInfoBudgetWarning() {
    var el = dom.wiBudgetWarning;
    var textEl = dom.wiBudgetWarningText;
    var dismissBtn = dom.wiBudgetWarningDismiss;
    if (!el || !textEl || !dismissBtn) return;

    var conv = getActiveConv();
    if (!conv || !conv._wiBudgetWarning) {
        el.classList.add('hidden');
        return;
    }

    textEl.textContent = t('wi_budget_warning');
    dismissBtn.textContent = t('wi_budget_warning_dismiss');

    el.classList.remove('hidden');

    // Wire dismiss once
    if (!dismissBtn._wired) {
        dismissBtn.addEventListener('click', function() {
            if (conv) conv._wiBudgetWarning = false;
            el.classList.add('hidden');
        });
        dismissBtn._wired = true;
    }
}
