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
    img.src = resolvePublicCardImageUrl(card);
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
    fallback.textContent = getLibraryCardInitial(card);
    return fallback;
}

function createPublicLibraryCardInfo(card) {
    return createLibraryCardInfo(card);
}
