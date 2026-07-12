/**
 * 新手导读（文件：60-library-public-card-grid-ui.js）
 *
 * 负责什么：这是“资料库与角色卡界面”中的“资料库、公共、角色卡、网格、界面”部分。
 * 在程序中的位置：它缓存常用页面元素，并渲染本地角色、公共角色和对应操作。
 * 从哪里开始看：主要从 `renderPublicCards(无参数)`、`renderLibraryGrids(无参数)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：渲染函数可能反复运行；事件绑定和临时元素要避免重复创建。
 */
// 公共角色卡网格：渲染服务器卡片、加载状态和详情入口。
function renderPublicCards() {
    const grid = document.getElementById('publicCardsGrid');
    if (!grid) return;

    grid.innerHTML = '';
    getFilteredPublicLibraryCards().forEach(card => {
        grid.appendChild(createPublicLibraryCard(card));
    });
}

function renderLibraryGrids() {
    renderMyCards();
    renderPublicCards();
}
