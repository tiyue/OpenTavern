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



function createCardLibraryItem(card, query = '') {
    const item = document.createElement('div');
    item.className = 'glass rounded-2xl p-3 flex gap-3 cursor-pointer hover:bg-white/5 active:bg-white/10 transition-all border border-white/5 hover:border-white/10';

    // 左侧 1:1 预览图容器（自动裁剪为圆角正方形）
    const imgWrap = document.createElement('div');
    imgWrap.className = 'w-16 h-16 sm:w-20 sm:h-20 flex-shrink-0 rounded-2xl overflow-hidden bg-zinc-900 border border-white/10';
    const img = document.createElement('img');
    img.src = resolvePublicCardAssetUrl(card.previewImage);
    img.className = 'w-full h-full object-cover';
    img.alt = card.name || 'preview';
    img.loading = 'lazy';
    img.onerror = function() {
        // 图片加载失败时显示首字母占位
        imgWrap.innerHTML = `<div class="w-full h-full flex items-center justify-center text-xl font-bold text-white ot-avatar-fill">${(card.name || '?').charAt(0).toUpperCase()}</div>`;
    };
    imgWrap.appendChild(img);

    // 右侧内容
    const content = document.createElement('div');
    content.className = 'flex-1 min-w-0 flex flex-col justify-center';

    const nameEl = document.createElement('div');
    nameEl.className = 'text-sm sm:text-base font-medium text-zinc-100 truncate';
    nameEl.innerHTML = highlightMatch(card.name || 'Unnamed', query);

    const tagsEl = document.createElement('div');
    tagsEl.className = 'text-[10px] sm:text-xs text-zinc-400 mt-0.5 truncate';
    const tagStr = (card.tags || []).slice(0, 4).map(t => highlightMatch(t, query)).join(' · ');
    tagsEl.innerHTML = tagStr || '';

    content.appendChild(nameEl);
    content.appendChild(tagsEl);

    item.appendChild(imgWrap);
    item.appendChild(content);

    // 点击进入详情
    item.addEventListener('click', () => {
        showCardLibraryDetail(card);
    });

    return item;
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

    const q = (query || '').toLowerCase().trim();

    const cards = getPublicCards();
    const filtered = cards.filter(card => {
        if (!q) return true;
        const nameMatch = (card.name || '').toLowerCase().includes(q);
        const authorMatch = (card.author || '').toLowerCase().includes(q);
        const descMatch = (card.description || '').toLowerCase().includes(q);
        const tagsMatch = (card.tags || []).some(t => (t || '').toLowerCase().includes(q));
        return nameMatch || authorMatch || descMatch || tagsMatch;
    });

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
