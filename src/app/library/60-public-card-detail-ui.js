/**
 * 新手导读（文件：60-public-card-detail-ui.js）
 *
 * 负责什么：这是“资料库与角色卡界面”中的“公共、角色卡、详情、界面”部分。
 * 在程序中的位置：它缓存常用页面元素，并渲染本地角色、公共角色和对应操作。
 * 从哪里开始看：主要从 `showCardLibraryDetailView(无参数)`、`showCardLibraryDetail(card)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：渲染函数可能反复运行；事件绑定和临时元素要避免重复创建。
 */
// ==================== Public Card Detail UI ====================
function showCardLibraryDetailView() {
    if (dom.cardLibraryListView) dom.cardLibraryListView.classList.add('hidden');
    if (dom.cardLibrarySearchContainer) dom.cardLibrarySearchContainer.classList.add('hidden');
    if (dom.cardLibraryDetailView) dom.cardLibraryDetailView.classList.remove('hidden');
}

function showCardLibraryDetail(card) {
    currentLibraryCard = card;

    // 填充详情
    if (dom.cardLibraryDetailImage) {
        dom.cardLibraryDetailImage.src = resolvePublicCardImageUrl(card);
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
