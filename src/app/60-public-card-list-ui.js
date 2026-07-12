/**
 * 新手导读（文件：60-public-card-list-ui.js）
 *
 * 负责什么：这是“资料库与角色卡界面”中的“公共、角色卡、列表、界面”部分。
 * 在程序中的位置：它缓存常用页面元素，并渲染本地角色、公共角色和对应操作。
 * 从哪里开始看：主要从 `showCardLibraryListView(无参数)`、`populateCardLibraryList(无参数)`、`filterCardLibraryList(query)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：渲染函数可能反复运行；事件绑定和临时元素要避免重复创建。
 */
// ==================== Public Card List UI ====================
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

    const cards = getPublicCards();
    const q = normalizeCardLibraryQuery(query);
    const filtered = filterCardLibraryCards(cards, q);

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
