/**
 * 新手导读（文件：60-public-card-list-item-ui.js）
 *
 * 负责什么：这是“资料库与角色卡界面”中的“公共、角色卡、列表、项目、界面”部分。
 * 在程序中的位置：它缓存常用页面元素，并渲染本地角色、公共角色和对应操作。
 * 从哪里开始看：主要从 `createCardLibraryImageFallback(card)`、`createCardLibraryImageWrap(card)`、`createCardLibraryItemContent(card, query)`、`createCardLibraryItem(card, query = '')` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：渲染函数可能反复运行；事件绑定和临时元素要避免重复创建。
 */
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
