// Phase 2: Render the list of all global world books in the left panel
function renderWorldBookList(filter) {
    var container = dom.wiEntryList;
    if (!container) return;
    container.innerHTML = '';

    if (!state.worldBooks) state.worldBooks = {};

    var books = Object.values(state.worldBooks);

    if (filter) {
        var f = filter.toLowerCase();
        books = books.filter(function(wb) {
            return (wb.name || '').toLowerCase().indexOf(f) !== -1;
        });
    }

    if (books.length === 0) {
        var empty = document.createElement('div');
        empty.className = 'text-xs text-zinc-500 px-2 py-6 text-center';
        empty.textContent = t('world_book_no_books_hint');
        container.appendChild(empty);
        dom.wiEntryStats.textContent = '0 ' + t('world_book_entry');
        return;
    }

    // Show which books are linked to current conversation
    var currentConv = getActiveConv();
    var linkedIds = (currentConv && currentConv.worldBookIds) ? currentConv.worldBookIds : [];

    books.forEach(function(wb) {
        var isActive = wiState.currentWorldBookId === wb.id;
        var isLinked = linkedIds.includes(wb.id);

        var row = document.createElement('div');
        row.className = 'group px-2.5 py-2 rounded-xl border border-white/5 hover:border-white/10 cursor-pointer flex flex-col gap-1 ' + 
                        (isActive ? 'bg-amber-500/10 border-amber-500/30' : 'bg-black/20');

        row.innerHTML = `
            <div class="flex items-center justify-between">
                <div class="min-w-0 flex-1">
                    <div class="text-sm font-medium text-zinc-200 truncate">${escapeHtml(wb.name || '未命名世界书')}</div>
                    <div class="text-[10px] text-zinc-400">${Object.keys(wb.entries || {}).length} 条目</div>
                </div>
                <div class="flex items-center gap-1 flex-shrink-0">
                    ${isLinked ? `
                        <span class="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400">已关联</span>
                        <button class="world-book-unlink-btn opacity-0 group-hover:opacity-100 px-1.5 py-0 text-[10px] rounded bg-red-500/10 text-red-400 hover:bg-red-500/20" title="${t('world_book_unlink') || '取消关联'}">取消</button>
                    ` : ''}
                    <button class="world-book-del-btn opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center text-red-400 hover:text-red-500 hover:bg-red-500/10 rounded text-xs transition-all" title="${t('world_book_delete_book') || '删除世界书'}">×</button>
                </div>
            </div>
        `;

        // Click row to open the book (but not on the delete button)
        row.addEventListener('click', function(e) {
            if (e.target.closest('.world-book-del-btn')) return; // let delete handler take it
            wiState.currentWorldBookId = wb.id;
            wiState.viewMode = 'entries';
            wiState.selectedUid = null;
            dom.wiBookName.value = wb.name || '';
            renderWIEntryList(dom.wiSearch.value.trim());
            updateWorldBookModalHeader();
        });

        // Delete button handler
        var delBtn = row.querySelector('.world-book-del-btn');
        if (delBtn) {
            delBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                deleteWorldBook(wb.id);
            });
        }

        // Unlink button handler (if present)
        var unlinkBtn = row.querySelector('.world-book-unlink-btn');
        if (unlinkBtn) {
            unlinkBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                var currentConv = getActiveConv();
                if (!currentConv) return;
                currentConv.worldBookIds = (currentConv.worldBookIds || []).filter(function(id) { return id !== wb.id; });
                wiState.dirty = true;
                updateWIDirtyIndicator();
                persistState(true);
                renderWorldInfoBadge();
                // Re-render list to update badges
                var f = (dom.wiSearch && dom.wiSearch.value) ? dom.wiSearch.value.trim() : '';
                renderWorldBookList(f);
            });
        }

        container.appendChild(row);
    });

    dom.wiEntryStats.textContent = books.length + ' ' + t('world_book_entry');
}

// Helper to refresh the left panel based on current view mode
function refreshWorldBookLeftPanel() {
    const filter = dom.wiSearch ? dom.wiSearch.value.trim() : '';
    if (wiState.viewMode === 'books' || !wiState.currentWorldBookId) {
        renderWorldBookList(filter);
    } else {
        renderWIEntryList(filter);
    }
}
