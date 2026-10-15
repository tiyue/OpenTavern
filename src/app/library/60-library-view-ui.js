/**
 * 新手导读（文件：60-library-view-ui.js）
 *
 * 负责什么：这是“资料库与角色卡界面”中的“资料库、视图、界面”部分。
 * 在程序中的位置：它缓存常用页面元素，并渲染本地角色、公共角色和对应操作。
 * 从哪里开始看：主要从 `switchView(view)`、`showLibraryView(libraryV, chatV)`、`showChatView(libraryV, chatV)`、`renderLibrary(无参数)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：渲染函数可能反复运行；事件绑定和临时元素要避免重复创建。
 */
// ==================== Library View / Tab Rendering ====================
function switchView(view) {
    currentView = view;
    var libraryV = document.getElementById('libraryView');
    var chatV = document.getElementById('chatView');
    if (!libraryV || !chatV) return;

    if (view === 'library') {
        showLibraryView(libraryV, chatV);
    } else {
        showChatView(libraryV, chatV);
    }

    if (typeof updateSidebarCloseButton === 'function') updateSidebarCloseButton();
}

function showLibraryView(libraryV, chatV) {
    libraryV.classList.remove('hidden');
    chatV.classList.add('hidden');

    if (typeof renderLibrary === 'function') {
        renderLibrary();
    } else {
        if (typeof renderLibraryGrids === 'function') renderLibraryGrids();
        if (typeof setActiveTab === 'function') setActiveTab(activeLibraryTab || 'my');
    }

    if (typeof renderConversationList === 'function') renderConversationList();
    showLibraryConversationList();
    setLibrarySidebarMode(true);
}

function showChatView(libraryV, chatV) {
    libraryV.classList.add('hidden');
    chatV.classList.remove('hidden');
    showLibraryConversationList();
    setLibrarySidebarMode(false);

    if (typeof renderConversationList === 'function') renderConversationList();
}

function renderLibrary() {
    var lib = document.getElementById('libraryView');
    var chat = document.getElementById('chatView');
    if (lib) lib.classList.remove('hidden');
    if (chat) chat.classList.add('hidden');

    renderLibraryGrids();
    wireLibraryTabButtons();
    setActiveTab(activeLibraryTab);
    syncLibrarySearchInput();
    setLibrarySidebarMode(true);
}
