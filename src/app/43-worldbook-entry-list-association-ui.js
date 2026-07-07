// ==================== World Book Entry List Association UI ====================
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
            <span class="text-emerald-400">&#10003; ${t('world_book_linked')}</span>
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
