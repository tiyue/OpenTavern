// ==================== World Book Global List Row UI ====================
function renderWorldBookListEmpty(container) {
    var empty = document.createElement('div');
    empty.className = 'text-xs text-zinc-500 px-2 py-6 text-center';
    empty.textContent = t('world_book_no_books_hint');
    container.appendChild(empty);
    dom.wiEntryStats.textContent = '0 ' + t('world_book_entry');
}

function createWorldBookListRow(wb, linkedIds) {
    var isActive = wiState.currentWorldBookId === wb.id;
    var isLinked = linkedIds.includes(wb.id);
    var row = document.createElement('div');
    row.className = 'group px-2.5 py-2 rounded-xl border border-white/5 hover:border-white/10 cursor-pointer flex flex-col gap-1 ' +
        (isActive ? 'bg-amber-500/10 border-amber-500/30' : 'bg-black/20');

    row.innerHTML = `
        <div class="flex items-center justify-between">
            <div class="min-w-0 flex-1">
                <div class="text-sm font-medium text-zinc-200 truncate">${escapeHtml(wb.name || '\u672a\u547d\u540d\u4e16\u754c\u4e66')}</div>
                <div class="text-[10px] text-zinc-400">${Object.keys(wb.entries || {}).length} ${t('world_book_entry')}</div>
            </div>
            <div class="flex items-center gap-1 flex-shrink-0">
                ${isLinked ? `
                    <span class="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400">${t('world_book_linked')}</span>
                    <button class="world-book-unlink-btn opacity-0 group-hover:opacity-100 px-1.5 py-0 text-[10px] rounded bg-red-500/10 text-red-400 hover:bg-red-500/20" title="${t('world_book_unlink')}">${t('world_book_unlink')}</button>
                ` : ''}
                <button class="world-book-del-btn opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center text-red-400 hover:text-red-500 hover:bg-red-500/10 rounded text-xs transition-all" title="${t('world_book_delete_book')}">&times;</button>
            </div>
        </div>
    `;

    row.addEventListener('click', function(e) {
        if (e.target.closest('.world-book-del-btn') || e.target.closest('.world-book-unlink-btn')) return;
        openWorldBookFromList(wb);
    });

    var delBtn = row.querySelector('.world-book-del-btn');
    if (delBtn) {
        delBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            deleteWorldBook(wb.id);
        });
    }

    var unlinkBtn = row.querySelector('.world-book-unlink-btn');
    if (unlinkBtn) {
        unlinkBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            unlinkWorldBookFromCurrentConversation(wb.id);
        });
    }

    return row;
}
