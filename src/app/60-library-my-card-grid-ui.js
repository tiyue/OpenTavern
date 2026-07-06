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
