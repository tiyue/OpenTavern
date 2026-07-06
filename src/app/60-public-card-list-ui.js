// ==================== Public Card List UI ====================
function showCardLibraryListView() {
    if (dom.cardLibraryListView) dom.cardLibraryListView.classList.remove('hidden');
    if (dom.cardLibrarySearchContainer) dom.cardLibrarySearchContainer.classList.remove('hidden');
    if (dom.cardLibraryDetailView) dom.cardLibraryDetailView.classList.add('hidden');
    if (dom.cardLibraryEmpty) dom.cardLibraryEmpty.classList.add('hidden');
    currentLibraryCard = null;

    // 确保列表可见时有内容（filter 会处理匹配渲染）
    const listView = dom.cardLibraryListView;
    if (listView && listView.children.length === 0) {
        filterCardLibraryList('');
    }
}

function populateCardLibraryList() {
    const container = dom.cardLibraryListView;
    const empty = dom.cardLibraryEmpty;
    if (!container) return;

    container.innerHTML = '';
    if (empty) empty.classList.add('hidden');

    const cards = getPublicCards();
    cards.forEach(card => {
        const item = createCardLibraryItem(card, '');
        container.appendChild(item);
    });

    updateCardLibraryCount(cards.length, cards.length);
}

function filterCardLibraryList(query) {
    const container = dom.cardLibraryListView;
    const empty = dom.cardLibraryEmpty;
    if (!container) return;

    const cards = getPublicCards();
    const q = normalizeCardLibraryQuery(query);
    const filtered = filterCardLibraryCards(cards, q);

    container.innerHTML = '';
    if (empty) empty.classList.add('hidden');

    if (filtered.length === 0) {
        if (empty) empty.classList.remove('hidden');
        updateCardLibraryCount(0, cards.length);
        return;
    }

    filtered.forEach(card => {
        const item = createCardLibraryItem(card, q);
        container.appendChild(item);
    });

    updateCardLibraryCount(filtered.length, cards.length);
}
