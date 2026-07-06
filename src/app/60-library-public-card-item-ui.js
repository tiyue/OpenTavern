// ==================== Public Library Card Items ====================
function createPublicLibraryCard(card) {
    const cardEl = document.createElement('div');
    cardEl.className = 'glass rounded-2xl overflow-hidden cursor-pointer hover:bg-white/5 transition-all border border-white/5 hover:border-white/10 flex flex-col';

    cardEl.appendChild(createPublicLibraryCardPreview(card));
    cardEl.appendChild(createPublicLibraryCardInfo(card));
    cardEl.addEventListener('click', () => {
        showPublicCardDetail(card);
    });

    return cardEl;
}

function createPublicLibraryCardPreview(card) {
    const preview = document.createElement('div');
    preview.className = 'aspect-[3/4] w-full overflow-hidden rounded-t-2xl bg-zinc-900';

    const img = document.createElement('img');
    img.src = resolvePublicCardAssetUrl(card.previewImage);
    img.className = 'w-full h-full object-cover';
    img.alt = card.name || '';
    img.onerror = () => {
        preview.innerHTML = '';
        preview.appendChild(createPublicLibraryCardFallback(card));
    };
    preview.appendChild(img);
    return preview;
}

function createPublicLibraryCardFallback(card) {
    const fallback = document.createElement('div');
    fallback.className = 'w-full h-full flex items-center justify-center text-5xl font-bold text-white ot-avatar-fill';
    fallback.textContent = (card.name || '?').charAt(0).toUpperCase();
    return fallback;
}

function createPublicLibraryCardInfo(card) {
    const info = document.createElement('div');
    info.className = 'p-2';

    const name = document.createElement('div');
    name.className = 'text-sm font-medium text-zinc-100 truncate';
    name.textContent = card.name || 'Unnamed';

    const tags = document.createElement('div');
    tags.className = 'text-[10px] text-zinc-400 mt-0.5 truncate';
    tags.textContent = (card.tags || []).slice(0, 3).join(' · ');

    info.appendChild(name);
    info.appendChild(tags);
    return info;
}
