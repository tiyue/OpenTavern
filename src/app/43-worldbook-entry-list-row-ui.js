// ==================== World Book Entry List Row UI ====================
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
                '<button class="wi-list-del opacity-40 hover:opacity-100 text-red-400 px-1" data-uid="' + uidStr + '">&times;</button>' +
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
