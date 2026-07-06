function renderPublicCards() {
    const grid = document.getElementById('publicCardsGrid');
    if (!grid) return;
    grid.innerHTML = '';

    const filteredPublic = getPublicCards().filter(card => passesLibraryFilter(card));
    filteredPublic.forEach(card => {
        const cardEl = document.createElement('div');
        cardEl.className = 'glass rounded-2xl overflow-hidden cursor-pointer hover:bg-white/5 transition-all border border-white/5 hover:border-white/10 flex flex-col';

        // Preview 3:4
        const preview = document.createElement('div');
        preview.className = 'aspect-[3/4] w-full overflow-hidden rounded-t-2xl bg-zinc-900';
        const img = document.createElement('img');
        img.src = resolvePublicCardAssetUrl(card.previewImage);
        img.className = 'w-full h-full object-cover';
        img.alt = card.name;
        img.onerror = () => {
            preview.innerHTML = `<div class="w-full h-full flex items-center justify-center text-5xl font-bold text-white ot-avatar-fill">${(card.name || '?').charAt(0).toUpperCase()}</div>`;
        };
        preview.appendChild(img);

        // Info directly below preview
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

        cardEl.appendChild(preview);
        cardEl.appendChild(info);

        cardEl.addEventListener('click', () => {
            // Public: open detail (name, tags, desc, author), then import option
            showPublicCardDetail(card);
        });

        grid.appendChild(cardEl);
    });
}

function renderLibraryGrids() {
    renderMyCards();
    renderPublicCards();
}

function showPublicCardDetail(card) {
    // Reuse or create a simple detail. For now, use a new modal or alert for simplicity, but to match, we'll create a simple overlay detail.
    // To keep simple and reuse existing style, we'll use a dedicated function that shows a glass modal-like div or reuse old detail if possible.
    // For this, we'll create a temporary detail using existing modal pattern or simple.

    // Simple implementation: use a modal similar to old one, but in-page for now we can use alert for prototype, but better proper.
    // Let's make a simple detail by showing in a new div or use the old cardLibraryDetailView but since it's in old modal, we'll make a new one.

    // For cleanliness, create a detail modal on the fly or use JS to show info and buttons.
    // To avoid complexity, we'll use a dedicated simple modal HTML that we can add.

    // For this response, we'll implement a basic detail using a new element or reuse.
    // To make it work, let's add a simple detail modal in HTML later, for now use console and direct import for test, but to follow, we'll make a function that opens a detail.

    // Better: create a detail modal HTML if not, but to proceed, we'll use the old library detail by temporarily using the old functions, but to follow spec, we'll make a dedicated.

    // For efficiency, we'll create the detail as a modal using existing glass style.

    let detailModal = document.getElementById('publicCardDetailModal');
    if (!detailModal) {
        detailModal = document.createElement('div');
        detailModal.id = 'publicCardDetailModal';
        detailModal.className = 'modal-overlay fixed inset-0 z-[150] flex items-center justify-center hidden';
        detailModal.innerHTML = `
            <div class="absolute inset-0 bg-black/65 backdrop-blur-sm" id="publicDetailBackdrop"></div>
            <div class="relative glass rounded-3xl w-[92%] max-w-md p-6 shadow-2xl animate-fade-in">
                <div class="flex justify-between items-center mb-4">
                    <h3 id="publicDetailName" class="text-xl font-bold"></h3>
                    <button id="publicDetailClose" class="text-xl leading-none text-zinc-400 hover:text-zinc-200">&times;</button>
                </div>
                <div id="publicDetailAuthor" class="text-xs text-zinc-400 mb-2"></div>
                <div class="mb-3">
                    <div class="text-[10px] text-zinc-400 uppercase mb-1">标签</div>
                    <div id="publicDetailTags" class="flex flex-wrap gap-1 text-xs"></div>
                </div>
                <div class="mb-4">
                    <div class="text-[10px] text-zinc-400 uppercase mb-1">简介</div>
                    <div id="publicDetailDesc" class="text-sm text-zinc-200 leading-relaxed max-h-40 overflow-auto"></div>
                </div>
                <div class="flex gap-3">
                    <button id="publicDetailImport" class="flex-1 px-4 py-2.5 rounded-2xl text-sm font-semibold bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-white shadow shadow-amber-500/30 transition-all">导入并开始聊天</button>
                </div>
            </div>
        `;
        document.body.appendChild(detailModal);
    }

    // Fill
    document.getElementById('publicDetailName').textContent = card.name || '';
    document.getElementById('publicDetailAuthor').innerHTML = `<span data-i18n="card_library_author_label">作者</span>: ${card.author || '—'}`;
    const tagsDiv = document.getElementById('publicDetailTags');
    tagsDiv.innerHTML = '';
    (card.tags || []).forEach(t => {
        const s = document.createElement('span');
        s.className = 'px-2 py-0.5 bg-white/10 rounded text-xs';
        s.textContent = t;
        tagsDiv.appendChild(s);
    });
    document.getElementById('publicDetailDesc').textContent = card.description || '';

    // Show
    detailModal.classList.remove('hidden');

    // Bind
    const close = () => detailModal.classList.add('hidden');
    document.getElementById('publicDetailClose').onclick = close;
    document.getElementById('publicDetailBackdrop').onclick = close;
    document.getElementById('publicDetailImport').onclick = async () => {
        close();
        await importPublicCard(card); // reuse existing import
        // After import, the character is in state.characters, switch to chat with it
        const importedChar = state.characters[(card.name || '').toLowerCase().trim()];
        if (importedChar) {
            loadOrCreateChatForCharacter(importedChar);
        }
    };
}
