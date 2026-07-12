/**
 * 新手导读（文件：60-library-sidebar-ui.js）
 *
 * 负责什么：这是“资料库与角色卡界面”中的“资料库、侧边栏、界面”部分。
 * 在程序中的位置：它缓存常用页面元素，并渲染本地角色、公共角色和对应操作。
 * 从哪里开始看：主要从 `showLibraryConversationList(无参数)`、`getSidebarSectionByI18n(key)`、`setSidebarSectionVisible(key, visible)`、`setLibrarySidebarMode(enabled)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：渲染函数可能反复运行；事件绑定和临时元素要避免重复创建。
 */
// ==================== Library Sidebar Mode UI ====================
function showLibraryConversationList() {
    var convListEl = document.getElementById('convList');
    if (convListEl) convListEl.style.display = '';
}

function getSidebarSectionByI18n(key) {
    var title = document.querySelector('#sidebar span[data-i18n="' + key + '"]');
    return title ? title.closest('.glass') : null;
}

function setSidebarSectionVisible(key, visible) {
    var block = getSidebarSectionByI18n(key);
    if (block) block.style.display = visible ? '' : 'none';
}

function setLibrarySidebarMode(enabled) {
    setSidebarSectionVisible('char_card_title', !enabled);
    setSidebarSectionVisible('world_book', !enabled);

    if (enabled) {
        var fallbackWorldBlock = document.querySelector('#sidebar .glass.rounded-xl.px-3.py-2');
        if (fallbackWorldBlock) fallbackWorldBlock.style.display = 'none';
    }

    var sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.toggle('library-mode', !!enabled);
}
