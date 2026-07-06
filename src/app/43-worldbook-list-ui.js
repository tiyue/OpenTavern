function addNewWIEntry() {
    var wi = getActiveWI();
    var uid = Date.now();
    var entry = createDefaultWIEntry(uid);
    wi.entries[String(uid)] = entry;
    wiState.dirty = true;
    updateWIDirtyIndicator();
    renderWIEntryList(dom.wiSearch.value.trim());
    selectWIEntry(uid);
}

function duplicateCurrentEntry() {
    if (!wiState.selectedUid) return;
    var wi = getActiveWI();
    var src = wi.entries[wiState.selectedUid];
    if (!src) return;
    var copy = JSON.parse(JSON.stringify(src));
    copy.uid = Date.now();
    copy.comment = (src.comment || 'Entry') + ' (copy)';
    wi.entries[String(copy.uid)] = copy;
    wiState.dirty = true;
    updateWIDirtyIndicator();
    renderWIEntryList(dom.wiSearch.value.trim());
    selectWIEntry(copy.uid);
}

async function deleteCurrentEntry() {
    if (!wiState.selectedUid) return;
    if (!await showGlassConfirm('\u5220\u9664\u5f53\u524d\u6761\u76ee\uff1f', { title: '\u5220\u9664\u4e16\u754c\u4e66\u6761\u76ee', danger: true, okText: '\u5220\u9664' })) return;
    var wi = getActiveWI();
    delete wi.entries[wiState.selectedUid];
    wiState.dirty = true;
    updateWIDirtyIndicator();
    wiState.selectedUid = null;
    renderWIEntryList(dom.wiSearch.value.trim());
    showNoSelection();
}

async function deleteAllWIEntries() {
    if (!await showGlassConfirm(t('world_book_confirm_delete_all'), { title: '\u5220\u9664\u5168\u90e8\u6761\u76ee', danger: true, okText: '\u5220\u9664' })) return;
    var wi = getActiveWI();
    wi.entries = {};
    wiState.selectedUid = null;
    wiState.dirty = true;
    updateWIDirtyIndicator();
    renderWIEntryList('');
    showNoSelection();
}

async function deleteWorldBook(wbId) {
    if (!wbId || !state.worldBooks || !state.worldBooks[wbId]) return;

    var wb = state.worldBooks[wbId];
    var entryCount = Object.keys(wb.entries || {}).length;
    var msg = t('world_book_confirm_delete_book') || '确定彻底删除这个世界书？此操作不可撤销。关联到此世界书的对话将自动解除关联。';

    if (!await showGlassConfirm(msg, { title: '\u5220\u9664\u4e16\u754c\u4e66', danger: true, okText: '\u5220\u9664' })) return;

    // Remove the book
    delete state.worldBooks[wbId];

    // Unlink from all conversations
    if (state.conversations) {
        Object.values(state.conversations).forEach(function(conv) {
            if (conv && Array.isArray(conv.worldBookIds)) {
                conv.worldBookIds = conv.worldBookIds.filter(function(id) { return id !== wbId; });
            }
        });
    }

    // If this was the currently selected book, reset to list view
    if (wiState.currentWorldBookId === wbId) {
        wiState.currentWorldBookId = null;
        wiState.viewMode = 'books';
        wiState.selectedUid = null;
    }

    wiState.dirty = true;
    updateWIDirtyIndicator();
    // Immediate persist so the deletion sticks even if user closes tab or refreshes soon after.
    persistState(true);
    if (typeof updateStorageInfo === 'function') updateStorageInfo(); // 【Storage Fix】
    renderWorldInfoBadge();

    // Refresh the list
    var filter = (dom.wiSearch && dom.wiSearch.value) ? dom.wiSearch.value.trim() : '';
    renderWorldBookList(filter);

    // If we were in entries view for this book, go back to list
    if (dom.wiEntryList) {
        // already refreshed above if needed
    }
    updateWorldBookModalHeader();
}

function selectWIEntry(uid) {
    wiState.selectedUid = String(uid);
    var entry = getActiveWI().entries[wiState.selectedUid];
    fillEditorFromEntry(entry);
}

function renderWIEntryList(filter) {
    var container = dom.wiEntryList;
    if (!container) return;
    container.innerHTML = '';

    // Phase 2: If we're in "books" mode, show the world book list instead
    if (wiState.viewMode === 'books' || !wiState.currentWorldBookId) {
        renderWorldBookList(filter);
        return;
    }

    var wi = getActiveWI();
    if (!wi) {
        container.innerHTML = '<p class="text-xs text-zinc-500 p-2">' + t('world_book_select_or_create') + '</p>';
        return;
    }

    var entries = Object.keys(wi.entries).map(function(k){
        return normalizeWIEntry(wi.entries[k]) || wi.entries[k];
    });

    if (filter) {
        var f = filter.toLowerCase();
        entries = entries.filter(function(e) {
            var keys = (e.key || []).join(' ').toLowerCase();
            var sec = (e.keysecondary || []).join(' ').toLowerCase();
            var cmt = (e.comment || '').toLowerCase();
            return keys.indexOf(f) !== -1 || sec.indexOf(f) !== -1 || cmt.indexOf(f) !== -1;
        });
    }

    // sort by order desc (higher order = later insertion per ST convention)
    entries.sort(function(a, b) { return (b.order || 0) - (a.order || 0); });

    // Phase 2: Show "back to book list" when viewing a specific world's entries
    if (wiState.currentWorldBookId) {
        var backRow = document.createElement('div');
        backRow.className = 'text-xs text-amber-400 px-2 py-1 mb-2 cursor-pointer hover:underline flex items-center gap-1';
        backRow.innerHTML = t('world_book_back_to_list');
        backRow.addEventListener('click', function() {
            wiState.viewMode = 'books';
            wiState.currentWorldBookId = null;
            wiState.selectedUid = null;
            renderWIEntryList(dom.wiSearch.value.trim());
            updateWorldBookModalHeader();
        });
        container.appendChild(backRow);

        // Phase 2: Simple association controls
        var currentConv = getActiveConv();
        var linked = currentConv && Array.isArray(currentConv.worldBookIds) && currentConv.worldBookIds.includes(wiState.currentWorldBookId);

        var assocRow = document.createElement('div');
        assocRow.className = 'px-2 py-1 mb-2 text-xs flex items-center gap-2';

        if (linked) {
            assocRow.innerHTML = `
                <span class="text-emerald-400">✓ ${t('world_book_linked')}</span>
                <button class="px-2 py-0.5 text-[10px] rounded bg-red-500/10 text-red-400 hover:bg-red-500/20">${t('world_book_unlink')}</button>
            `;
            assocRow.querySelector('button').addEventListener('click', function() {
                if (!currentConv) return;
                currentConv.worldBookIds = (currentConv.worldBookIds || []).filter(id => id !== wiState.currentWorldBookId);
                wiState.dirty = true;
                updateWIDirtyIndicator();
                persistState(true);
                renderWorldInfoBadge();
                renderWorldBookList(dom.wiSearch.value.trim());
                renderWIEntryList(dom.wiSearch.value.trim());
            });
        } else {
            assocRow.innerHTML = `
                <button class="px-2 py-0.5 text-[10px] rounded bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20">${t('world_book_link_to_current')}</button>
            `;
            assocRow.querySelector('button').addEventListener('click', function() {
                if (!currentConv) return;
                currentConv.worldBookIds = currentConv.worldBookIds || [];
                if (!currentConv.worldBookIds.includes(wiState.currentWorldBookId)) {
                    currentConv.worldBookIds.push(wiState.currentWorldBookId);
                }
                wiState.dirty = true;
                updateWIDirtyIndicator();
                persistState(true);
                renderWorldInfoBadge();
                renderWorldBookList(dom.wiSearch.value.trim());
                renderWIEntryList(dom.wiSearch.value.trim());
            });
        }

        container.appendChild(assocRow);

        // Add direct "delete entire book" for thorough cleanup
        var delBookRow = document.createElement('div');
        delBookRow.className = 'px-2 py-1 text-xs';
        delBookRow.innerHTML = `
            <button class="px-2 py-0.5 text-[10px] rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 w-full text-left">${t('world_book_delete_book') || '删除世界书'}</button>
        `;
        delBookRow.querySelector('button').addEventListener('click', function() {
            if (wiState.currentWorldBookId) {
                deleteWorldBook(wiState.currentWorldBookId);
            }
        });
        container.appendChild(delBookRow);
    }

    if (entries.length === 0) {
        var empty = document.createElement('div');
        empty.className = 'text-xs text-zinc-500 px-2 py-6 text-center';
        empty.textContent = t('world_book_no_entries');
        container.appendChild(empty);
        dom.wiEntryStats.textContent = '0 ' + t('world_book_entry');
        return;
    }

    entries.forEach(function(entry) {
        var uidStr = String(entry.uid);
        var row = document.createElement('div');
        row.className = 'group px-2.5 py-2 rounded-xl border border-white/5 hover:border-white/10 cursor-pointer flex flex-col gap-1 ' + (wiState.selectedUid === uidStr ? 'bg-amber-500/10 border-amber-500/30' : 'bg-black/20');
        row.innerHTML = 
            '<div class="flex items-start justify-between gap-2">' +
                '<div class="flex items-center gap-2 min-w-0">' +
                    '<input type="checkbox" class="wi-list-toggle accent-amber-500 mt-0.5" data-uid="' + uidStr + '" ' + (entry.disable ? '' : 'checked') + '>' +
                    '<div class="min-w-0">' +
                        '<div class="text-xs font-medium text-zinc-200 truncate">' + escapeHtml(entry.comment || '(no memo)') + '</div>' +
                        '<div class="text-[10px] text-emerald-400/70 truncate">' + escapeHtml((entry.key || []).slice(0,3).join(', ') || (entry.constant ? '恒常' : '—')) + '</div>' +
                    '</div>' +
                '</div>' +
                '<div class="flex items-center gap-1 text-[10px] text-right flex-shrink-0">' +
                    '<span class="tabular-nums text-zinc-400">' + (entry.order != null ? entry.order : 100) + '</span>' +
                    '<button class="wi-list-del opacity-40 hover:opacity-100 text-red-400 px-1" data-uid="' + uidStr + '">✕</button>' +
                '</div>' +
            '</div>';

        row.addEventListener('click', function(e) {
            if (e.target.classList.contains('wi-list-toggle') || e.target.classList.contains('wi-list-del')) return;
            selectWIEntry(uidStr);
        });

        // toggle enable/disable
        row.querySelector('.wi-list-toggle').addEventListener('change', function(ev) {
            ev.stopPropagation();
            var e = wi.entries[uidStr];
            e.disable = !this.checked;
            wiState.dirty = true;
            updateWIDirtyIndicator();
            renderWIEntryList(dom.wiSearch.value.trim());
        });

        // delete from list
        row.querySelector('.wi-list-del').addEventListener('click', async function(ev) {
            ev.stopPropagation();
            if (!await showGlassConfirm('\u5220\u9664\u6b64\u6761\u76ee\uff1f', { title: '\u5220\u9664\u4e16\u754c\u4e66\u6761\u76ee', danger: true, okText: '\u5220\u9664' })) return;
            delete wi.entries[uidStr];
            wiState.dirty = true;
            updateWIDirtyIndicator();
            if (wiState.selectedUid === uidStr) {
                wiState.selectedUid = null;
                showNoSelection();
            }
            renderWIEntryList(dom.wiSearch.value.trim());
        });

        container.appendChild(row);
    });

    if (wiState.viewMode !== 'books') {
        dom.wiEntryStats.textContent = entries.length + ' ' + t('world_book_entry');
    }
}

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
