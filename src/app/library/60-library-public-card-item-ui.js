/**
 * 新手导读（文件：60-library-public-card-item-ui.js）
 *
 * 负责什么：这是“资料库与角色卡界面”中的“资料库、公共、角色卡、项目、界面”部分。
 * 在程序中的位置：它缓存常用页面元素，并渲染本地角色、公共角色和对应操作。
 * 从哪里开始看：主要从 `createPublicLibraryCard(card)`、`createPublicLibraryCardPreview(card)`、`createPublicLibraryCardFallback(card)`、`createPublicLibraryCardInfo(card)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：渲染函数可能反复运行；事件绑定和临时元素要避免重复创建。
 */
// ==================== Public Library Card Items ====================
function createPublicLibraryCard(card) {
    const cardEl = document.createElement('button');
    cardEl.type = 'button';
    cardEl.className = 'glass rounded-2xl overflow-hidden cursor-pointer hover:bg-white/5 transition-all border border-white/5 hover:border-white/10 flex flex-col text-left min-w-0';
    cardEl.setAttribute('aria-label', card.name || '');

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
