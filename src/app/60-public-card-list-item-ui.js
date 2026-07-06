// ==================== Public Card List Item UI ====================
function createCardLibraryImageFallback(card) {
    return '<div class="w-full h-full flex items-center justify-center text-xl font-bold text-white ot-avatar-fill">' +
        escapeHtml((card.name || '?').charAt(0).toUpperCase()) +
        '</div>';
}

function createCardLibraryImageWrap(card) {
    const imgWrap = document.createElement('div');
    imgWrap.className = 'w-16 h-16 sm:w-20 sm:h-20 flex-shrink-0 rounded-2xl overflow-hidden bg-zinc-900 border border-white/10';
    const img = document.createElement('img');
    img.src = resolvePublicCardImageUrl(card);
    img.className = 'w-full h-full object-cover';
    img.alt = card.name || 'preview';
    img.loading = 'lazy';
    img.onerror = function() {
        imgWrap.innerHTML = createCardLibraryImageFallback(card);
    };
    imgWrap.appendChild(img);
    return imgWrap;
}

function createCardLibraryItemContent(card, query) {
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
    return content;
}

function createCardLibraryItem(card, query = '') {
    const item = document.createElement('div');
    item.className = 'glass rounded-2xl p-3 flex gap-3 cursor-pointer hover:bg-white/5 active:bg-white/10 transition-all border border-white/5 hover:border-white/10';
    item.appendChild(createCardLibraryImageWrap(card));
    item.appendChild(createCardLibraryItemContent(card, query));
    item.addEventListener('click', () => {
        showCardLibraryDetail(card);
    });
    return item;
}
