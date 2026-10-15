/**
 * 新手导读（文件：60-library-my-card-actions-ui.js）
 *
 * 负责什么：这是“资料库与角色卡界面”中的“资料库、我的、角色卡、操作、界面”部分。
 * 在程序中的位置：它缓存常用页面元素，并渲染本地角色、公共角色和对应操作。
 * 从哪里开始看：主要从 `appendMyCardActionTiles(grid)`、`createMyCardActionTile(options)`、`openMyCardImportModal(无参数)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：渲染函数可能反复运行；事件绑定和临时元素要避免重复创建。
 */
// ==================== My Library Card Action Tiles ====================
function appendMyCardActionTiles(grid) {
    getMyCardActionTileConfigs().forEach(function(options) {
        grid.appendChild(createMyCardActionTile(options));
    });
}

function createMyCardActionTile(options) {
    const card = document.createElement('div');
    card.className = 'my-card-action-tile glass rounded-2xl overflow-hidden cursor-pointer hover:bg-white/5 transition-all border border-dashed border-amber-500/50 flex flex-col items-center justify-center text-center p-4 aspect-[3/4]';
    card.innerHTML = `
        <div class="${options.iconClass}">${options.iconHtml}</div>
        <div class="text-sm font-medium">${options.title}</div>
        <div class="text-[10px] text-zinc-400 mt-1">${options.subtitle}</div>
    `;
    card.addEventListener('click', options.onClick);
    return card;
}

function openMyCardImportModal() {
    if (!dom.importModal) return;
    dom.importModal.classList.remove('hidden');
    resetMyCardImportModalControls();
}
