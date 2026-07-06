// ==================== World Book Entry List Helpers ====================
function appendBackToWorldBookListRow(container) {
    var backRow = document.createElement('div');
    backRow.className = 'text-xs text-amber-400 px-2 py-1 mb-2 cursor-pointer hover:underline flex items-center gap-1';
    backRow.innerHTML = t('world_book_back_to_list');
    backRow.addEventListener('click', function() {
        wiState.viewMode = 'books';
        wiState.currentWorldBookId = null;
        wiState.selectedUid = null;
        renderWIEntryList(getCurrentWorldBookFilter());
        updateWorldBookModalHeader();
    });
    container.appendChild(backRow);
}

function refreshWorldBookEntryAssociationViews() {
    wiState.dirty = true;
    updateWIDirtyIndicator();
    persistState(true);
    renderWorldInfoBadge();
    renderWorldBookList(getCurrentWorldBookFilter());
    renderWIEntryList(getCurrentWorldBookFilter());
}

function appendWorldBookAssociationRow(container) {
    var currentConv = getActiveConv();
    var linked = currentConv && Array.isArray(currentConv.worldBookIds) && currentConv.worldBookIds.includes(wiState.currentWorldBookId);
    var assocRow = document.createElement('div');
    assocRow.className = 'px-2 py-1 mb-2 text-xs flex items-center gap-2';

    if (linked) {
        assocRow.innerHTML = `
            <span class="text-emerald-400">鉁?${t('world_book_linked')}</span>
            <button class="px-2 py-0.5 text-[10px] rounded bg-red-500/10 text-red-400 hover:bg-red-500/20">${t('world_book_unlink')}</button>
        `;
        assocRow.querySelector('button').addEventListener('click', function() {
            if (!currentConv) return;
            currentConv.worldBookIds = (currentConv.worldBookIds || []).filter(id => id !== wiState.currentWorldBookId);
            refreshWorldBookEntryAssociationViews();
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
            refreshWorldBookEntryAssociationViews();
        });
    }

    container.appendChild(assocRow);
}

function appendDeleteWorldBookRow(container) {
    var delBookRow = document.createElement('div');
    delBookRow.className = 'px-2 py-1 text-xs';
    delBookRow.innerHTML = `
        <button class="px-2 py-0.5 text-[10px] rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 w-full text-left">${t('world_book_delete_book') || 'Delete world book'}</button>
    `;
    delBookRow.querySelector('button').addEventListener('click', function() {
        if (wiState.currentWorldBookId) {
            deleteWorldBook(wiState.currentWorldBookId);
        }
    });
    container.appendChild(delBookRow);
}

function appendWorldBookEntryListHeader(container) {
    if (!wiState.currentWorldBookId) return;
    appendBackToWorldBookListRow(container);
    appendWorldBookAssociationRow(container);
    appendDeleteWorldBookRow(container);
}

function renderWorldBookEntryListEmpty(container) {
    var empty = document.createElement('div');
    empty.className = 'text-xs text-zinc-500 px-2 py-6 text-center';
    empty.textContent = t('world_book_no_entries');
    container.appendChild(empty);
    dom.wiEntryStats.textContent = '0 ' + t('world_book_entry');
}

function createWorldBookEntryListRow(entry, wi) {
    var uidStr = String(entry.uid);
    var row = document.createElement('div');
    row.className = 'group px-2.5 py-2 rounded-xl border border-white/5 hover:border-white/10 cursor-pointer flex flex-col gap-1 ' + (wiState.selectedUid === uidStr ? 'bg-amber-500/10 border-amber-500/30' : 'bg-black/20');
    row.innerHTML =
        '<div class="flex items-start justify-between gap-2">' +
            '<div class="flex items-center gap-2 min-w-0">' +
                '<input type="checkbox" class="wi-list-toggle accent-amber-500 mt-0.5" data-uid="' + uidStr + '" ' + (entry.disable ? '' : 'checked') + '>' +
                '<div class="min-w-0">' +
                    '<div class="text-xs font-medium text-zinc-200 truncate">' + escapeHtml(entry.comment || '(no memo)') + '</div>' +
                    '<div class="text-[10px] text-emerald-400/70 truncate">' + escapeHtml((entry.key || []).slice(0,3).join(', ') || (entry.constant ? 'constant' : '-')) + '</div>' +
                '</div>' +
            '</div>' +
            '<div class="flex items-center gap-1 text-[10px] text-right flex-shrink-0">' +
                '<span class="tabular-nums text-zinc-400">' + (entry.order != null ? entry.order : 100) + '</span>' +
                '<button class="wi-list-del opacity-40 hover:opacity-100 text-red-400 px-1" data-uid="' + uidStr + '">鉁?/button>' +
            '</div>' +
        '</div>';

    row.addEventListener('click', function(e) {
        if (e.target.classList.contains('wi-list-toggle') || e.target.classList.contains('wi-list-del')) return;
        selectWIEntry(uidStr);
    });

    row.querySelector('.wi-list-toggle').addEventListener('change', function(ev) {
        ev.stopPropagation();
        var e = wi.entries[uidStr];
        e.disable = !this.checked;
        wiState.dirty = true;
        updateWIDirtyIndicator();
        renderWIEntryList(getCurrentWorldBookFilter());
    });

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
        renderWIEntryList(getCurrentWorldBookFilter());
    });

    return row;
}
