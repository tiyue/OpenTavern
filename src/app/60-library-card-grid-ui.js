function getCardOrientation(tags) {
    const t = (tags || []).join(' ').toLowerCase();
    const hasFemale = /女|female|futa|娘|女仆|姬/.test(t);
    const hasMale = /男|male|攻|男主|男友/.test(t);
    if (hasFemale && !hasMale) return 'male';
    if (hasMale && !hasFemale) return 'female';
    return 'both';
}

function passesLibraryFilter(card) {
    const q = (librarySearchQuery || '').toLowerCase().trim();
    if (q) {
        const nameMatch = (card.name || '').toLowerCase().includes(q);
        const tagsMatch = (card.tags || []).some(t => (t || '').toLowerCase().includes(q));
        const descMatch = (card.description || card.personality || '').toLowerCase().includes(q);
        const authorMatch = (card.author || '').toLowerCase().includes(q);
        if (!(nameMatch || tagsMatch || descMatch || authorMatch)) return false;
    }
    if (libraryFilter !== 'all') {
        const o = getCardOrientation(card.tags || []);
        if (libraryFilter === 'male' && o !== 'male' && o !== 'both') return false;
        if (libraryFilter === 'female' && o !== 'female' && o !== 'both') return false;
    }
    return true;
}

function triggerCardImageUpload(char) {
    if (!char || !char.name) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.onchange = function() {
        const file = input.files && input.files[0];
        if (!file) {
            document.body.removeChild(input);
            return;
        }
        const reader = new FileReader();
        reader.onload = function(ev) {
            const dataUrl = ev.target.result;
            const key = (char.name || '').trim().toLowerCase();
            if (state.characters && state.characters[key]) {
                state.characters[key].previewImage = dataUrl;
                persistState(true);
                if (typeof renderMyCards === 'function') renderMyCards();
                // Refresh active chat avatars if this card is loaded
                try {
                    if (currentCharacterName && currentCharacterName.trim().toLowerCase() === key) {
                        const chAvatar = document.getElementById('charAvatar');
                        if (chAvatar) {
                            chAvatar.innerHTML = `<img src="${dataUrl}" class="w-full h-full object-cover rounded-xl" alt="${(char.name || '').replace(/"/g,'&quot;')}">`;
                            chAvatar.className = 'w-9 h-9 rounded-xl overflow-hidden bg-zinc-900 flex-shrink-0 border border-white/10';
                        }
                        const cardAvatar = document.getElementById('charCardAvatar');
                        if (cardAvatar) {
                            cardAvatar.innerHTML = `<img src="${dataUrl}" class="w-full h-full object-cover rounded-lg" alt="${(char.name || '').replace(/"/g,'&quot;')}">`;
                            cardAvatar.className = 'w-7 h-7 rounded-lg overflow-hidden bg-zinc-900 flex-shrink-0 border border-white/10';
                        }
                    }
                } catch (e) {}
            }
            document.body.removeChild(input);
        };
        reader.onerror = function() {
            try { document.body.removeChild(input); } catch (_) {}
        };
        reader.readAsDataURL(file);
    };
    input.click();
}

function renderMyCards() {
    const grid = document.getElementById('myCardsGrid');
    if (!grid) return;
    grid.innerHTML = '';

    // Special action cards placed at the front (as requested)
    // "Create New" tile
    const createCard = document.createElement('div');
    createCard.className = 'glass rounded-2xl overflow-hidden cursor-pointer hover:bg-white/5 transition-all border border-dashed border-amber-500/50 flex flex-col items-center justify-center text-center p-4 aspect-[3/4]';
    createCard.innerHTML = `
        <div class="text-4xl mb-2 text-amber-400">＋</div>
        <div class="text-sm font-medium">新建角色</div>
        <div class="text-[10px] text-zinc-400 mt-1">手动创建</div>
    `;
    createCard.addEventListener('click', () => {
        if (typeof openCharacterEditor === 'function') openCharacterEditor();
    });
    grid.appendChild(createCard);

    // "Import" tile
    const importCard = document.createElement('div');
    importCard.className = 'glass rounded-2xl overflow-hidden cursor-pointer hover:bg-white/5 transition-all border border-dashed border-amber-500/50 flex flex-col items-center justify-center text-center p-4 aspect-[3/4]';
    importCard.innerHTML = `
        <div class="text-xs mb-2 uppercase tracking-wider text-zinc-500">Import</div>
        <div class="text-sm font-medium">导入角色卡</div>
        <div class="text-[10px] text-zinc-400 mt-1">从文件</div>
    `;
    importCard.addEventListener('click', () => {
        if (dom.importModal) {
            dom.importModal.classList.remove('hidden');
            if (dom.importStatus) dom.importStatus.classList.add('hidden');
            if (dom.importFileInput) dom.importFileInput.value = '';
        }
    });
    grid.appendChild(importCard);

    let chars = Object.values(state.characters || {}).filter(c => passesLibraryFilter({
        name: c.name,
        tags: c.tags,
        description: c.description || c.personality,
        author: c.author || c.creator || c.creator_notes || ''
    }));

    chars.forEach(char => {
        const cardEl = document.createElement('div');
        cardEl.className = 'glass rounded-2xl overflow-hidden cursor-pointer hover:bg-white/5 transition-all border border-white/5 hover:border-white/10 flex flex-col group';

        // Preview area 3:4 (top) — relative for absolute controls
        // 支持从公共库导入的 previewImage + 用户自定义上传的图片（data: URL）
        const preview = document.createElement('div');
        const pSrc = char.previewImage || char.avatar;
        const letter = (char.name || '?').charAt(0).toUpperCase();

        if (pSrc) {
            preview.className = 'aspect-[3/4] w-full overflow-hidden bg-zinc-900 rounded-t-2xl relative';
            const img = document.createElement('img');
            img.src = pSrc;
            img.className = 'w-full h-full object-cover';
            img.alt = char.name || '';
            img.onerror = () => {
                preview.className = 'aspect-[3/4] w-full ot-avatar-fill flex items-center justify-center text-5xl font-bold text-white rounded-t-2xl relative';
                preview.textContent = letter;
            };
            preview.appendChild(img);
        } else {
            preview.className = 'aspect-[3/4] w-full ot-avatar-fill flex items-center justify-center text-5xl font-bold text-white rounded-t-2xl relative';
            preview.textContent = letter;
        }

        // Top-right controls: image import button (left) + delete button (right)
        // Image button is always tappable (safe), delete reveals on hover (destructive)
        const controls = document.createElement('div');
        controls.className = 'absolute top-1 right-1 flex items-center gap-1 z-10';

        const imgBtn = document.createElement('button');
        imgBtn.className = 'char-img-btn text-white/70 hover:text-amber-300 active:text-amber-400 text-sm leading-none p-0.5 transition-all opacity-0 md:opacity-0 group-hover:opacity-100 md:group-hover:opacity-100 active:opacity-100 pointer-events-none group-hover:pointer-events-auto active:pointer-events-auto';
        imgBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>';
        imgBtn.title = '导入图片';
        imgBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            triggerCardImageUpload(char);
        });
        controls.appendChild(imgBtn);

        const delBtn = document.createElement('button');
        // Hidden by default. On desktop: visible and clickable on group-hover.
        // On mobile (touch): pointer-events:none keeps it invisible, single tap on card opens chat.
        delBtn.className = 'char-delete-btn text-white/80 hover:text-red-400 active:text-red-500 text-xl font-bold leading-none p-1 transition-all opacity-0 md:opacity-0 group-hover:opacity-100 md:group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto';
        delBtn.innerHTML = '×';
        delBtn.title = '移除角色卡';
        delBtn.addEventListener('click', async (e) => {
            // Only fires on desktop hover (when pointer-events:auto via .group:hover CSS).
            // On mobile, pointer-events:none prevents this handler from ever running.
            e.stopPropagation();
            const displayName = char.name || '该角色卡';
            if (!await showGlassConfirm(`\u786e\u5b9a\u4ece\u89d2\u8272\u5e93\u4e2d\u5220\u9664\u300c${displayName}\u300d\uff1f\n\u5df2\u6709\u5bf9\u8bdd\u4e2d\u7684\u89d2\u8272\u5361\u6570\u636e\u4e0d\u4f1a\u53d7\u5f71\u54cd\u3002`, { title: '\u5220\u9664\u89d2\u8272\u5361', danger: true, okText: '\u5220\u9664' })) {
                return;
            }
            const key = (char.name || '').trim().toLowerCase();
            deleteCharacterFromLibrary(key);
            if (typeof renderMyCards === 'function') renderMyCards();
        });
        controls.appendChild(delBtn);

        preview.appendChild(controls);

        // Name and tags directly below the preview
        const info = document.createElement('div');
        info.className = 'p-2';
        const name = document.createElement('div');
        name.className = 'text-sm font-medium text-zinc-100 truncate';
        name.textContent = char.name || 'Unnamed';

        const tags = document.createElement('div');
        tags.className = 'text-[10px] text-zinc-400 mt-0.5 truncate';
        tags.textContent = (char.tags || []).slice(0, 3).join(' · ');

        info.appendChild(name);
        info.appendChild(tags);

        cardEl.appendChild(preview);
        cardEl.appendChild(info);

        cardEl.addEventListener('click', (e) => {
            // Skip if clicking on the image button or delete button (they have their own handlers).
            // Image button is safe to tap (opens file picker), delete is hover-only on desktop.
            if (e.target.closest('.char-img-btn') || e.target.closest('.char-delete-btn') || e.target.closest('button[title="移除角色卡"]')) return;

            // Single tap directly opens chat
            loadOrCreateChatForCharacter(char);
        });

        grid.appendChild(cardEl);
    });
}

function renderPublicCards() {
    const grid = document.getElementById('publicCardsGrid');
    if (!grid) return;
    grid.innerHTML = '';

    const filteredPublic = PUBLIC_CARDS.filter(card => passesLibraryFilter(card));
    filteredPublic.forEach(card => {
        const cardEl = document.createElement('div');
        cardEl.className = 'glass rounded-2xl overflow-hidden cursor-pointer hover:bg-white/5 transition-all border border-white/5 hover:border-white/10 flex flex-col';

        // Preview 3:4
        const preview = document.createElement('div');
        preview.className = 'aspect-[3/4] w-full overflow-hidden rounded-t-2xl bg-zinc-900';
        const img = document.createElement('img');
        img.src = card.previewImage || '';
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
