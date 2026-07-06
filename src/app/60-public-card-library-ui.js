function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, function (m) {
        return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m];
    });
}

function highlightMatch(text, query) {
    if (!query || !text) return escapeHtml(text);
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escaped})`, 'gi');
    return escapeHtml(text).replace(regex, '<span class="bg-amber-500/30 text-amber-300 rounded px-0.5">$1</span>');
}

function updateCardLibraryCount(shown, total) {
    const countEl = dom.cardLibraryResultCount;
    if (!countEl) return;
    if (!shown || shown === total) {
        countEl.textContent = `共 ${total} 个`;
    } else {
        countEl.textContent = `找到 ${shown} 个 / 共 ${total}`;
    }
}

function openCardLibrary() {
    // (stub: old left public library removed)
    if (typeof switchView === 'function') switchView('library');
    if (typeof setActiveTab === 'function') setActiveTab('public');
    return;
}

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

function showCardLibraryDetailView() {
    if (dom.cardLibraryListView) dom.cardLibraryListView.classList.add('hidden');
    if (dom.cardLibrarySearchContainer) dom.cardLibrarySearchContainer.classList.add('hidden');
    if (dom.cardLibraryDetailView) dom.cardLibraryDetailView.classList.remove('hidden');
}

function createCardLibraryItem(card, query = '') {
    const item = document.createElement('div');
    item.className = 'glass rounded-2xl p-3 flex gap-3 cursor-pointer hover:bg-white/5 active:bg-white/10 transition-all border border-white/5 hover:border-white/10';

    // 左侧 1:1 预览图容器（自动裁剪为圆角正方形）
    const imgWrap = document.createElement('div');
    imgWrap.className = 'w-16 h-16 sm:w-20 sm:h-20 flex-shrink-0 rounded-2xl overflow-hidden bg-zinc-900 border border-white/10';
    const img = document.createElement('img');
    img.src = card.previewImage || '';
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

function showCardLibraryDetail(card) {
    currentLibraryCard = card;

    // 填充详情
    if (dom.cardLibraryDetailImage) {
        dom.cardLibraryDetailImage.src = card.previewImage || '';
        dom.cardLibraryDetailImage.alt = card.name || '';
        dom.cardLibraryDetailImage.onerror = function() {
            const wrap = dom.cardLibraryDetailImageWrap;
            if (wrap) {
                wrap.innerHTML = `<div class="w-full h-full flex items-center justify-center text-4xl font-bold text-white ot-avatar-fill">${(card.name || '?').charAt(0).toUpperCase()}</div>`;
            }
        };
    }
    if (dom.cardLibraryDetailName) dom.cardLibraryDetailName.textContent = card.name || '';
    if (dom.cardLibraryDetailAuthor) dom.cardLibraryDetailAuthor.textContent = card.author || '—';

    // Tags
    const tagsContainer = dom.cardLibraryDetailTags;
    if (tagsContainer) {
        tagsContainer.innerHTML = '';
        (card.tags || []).forEach(tag => {
            const pill = document.createElement('span');
            pill.className = 'text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-zinc-300 border border-white/10';
            pill.textContent = tag;
            tagsContainer.appendChild(pill);
        });
    }

    // Description (简介)
    if (dom.cardLibraryDetailDesc) {
        dom.cardLibraryDetailDesc.textContent = card.description || '';
    }

    // 绑定导入按钮（每次进入详情重新绑定，避免旧闭包）
    if (dom.cardLibraryImportBtn) {
        dom.cardLibraryImportBtn.onclick = async () => {
            if (!currentLibraryCard) return;
            await importPublicCard(currentLibraryCard);
        };
    }

    if (dom.cardLibraryBackBtn) {
        dom.cardLibraryBackBtn.onclick = () => {
            showCardLibraryListView();
            // 恢复搜索状态
            if (dom.cardLibrarySearch) {
                dom.cardLibrarySearch.value = cardLibrarySearchQuery;
            }
            filterCardLibraryList(cardLibrarySearchQuery);
        };
    }

    showCardLibraryDetailView();
}

async function importPublicCard(cardMeta) {
    const modal = dom.cardLibraryModal;
    try {
        const res = await fetch(cardMeta.jsonUrl);
        if (!res.ok) throw new Error('无法获取角色卡数据 (' + res.status + ')');
        const jsonData = await res.json();

        // 1. 解析角色卡（支持 v1/v2/v3）
        const character = importCharacterCard(jsonData);
        if (!character || !character.name) {
            throw new Error('角色卡格式无效或缺少名称');
        }

        // 2. 自动导入内嵌世界书（如果有）
        let embeddedBook = null;
        try {
            embeddedBook = importCharacterBookFromCard(jsonData, character.name);
            // importCharacterBookFromCard 内部已调用 createNewWorldBook 并写入 state.worldBooks
        } catch (e) {
            console.warn('[Card Library] 嵌入世界书导入失败（不影响角色导入）:', e);
        }

        // 3. 从公共库元数据附加预览图（关键修复：让从公共库导入的角色卡在“我的卡片”里能显示图片）
        if (cardMeta && cardMeta.previewImage) {
            character.previewImage = cardMeta.previewImage;
        }
        if (cardMeta && cardMeta.author && !character.author) {
            character.author = cardMeta.author;
        }

        // 4. 注册到全局角色库
        const key = character.name.trim().toLowerCase();
        if (!state.characters) state.characters = {};
        state.characters[key] = JSON.parse(JSON.stringify(character));

        // 4. 持久化 + 刷新界面
        persistState();
        requestFullRender();

        // 关闭弹窗
        if (modal) modal.classList.add('hidden');

        // 提示（使用现有风格的简单提示）
        const successMsg = t('card_library_import_success') || '角色卡已成功导入到本地库！';
        // 简单 toast 风格
        const toast = document.createElement('div');
        toast.className = 'fixed bottom-4 left-1/2 -translate-x-1/2 z-[200] px-4 py-2 rounded-2xl glass text-sm text-amber-300 border border-amber-500/30 shadow-xl';
        toast.textContent = successMsg;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.transition = 'opacity 0.3s';
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 2200);

        if (currentView === 'library' && typeof renderLibraryGrids === 'function') {
            renderLibraryGrids();
        }

        // 如果新对话选择器当前打开，刷新它
        const picker = document.getElementById('newChatPickerList');
        if (picker && !document.getElementById('newChatPickerModal').classList.contains('hidden')) {
            // 简单粗暴刷新
            showNewChatCharacterPicker();
        }

    } catch (err) {
        console.error('[Card Library] Import failed:', err);
        alert('导入失败：' + (err.message || err));
    }
}

// 侧边栏按钮事件（在 DOM 就绪后绑定）
// (old wireCardLibraryButton removed as public library on left is removed)
