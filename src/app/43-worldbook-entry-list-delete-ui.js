// ==================== World Book Entry List Delete UI ====================
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
