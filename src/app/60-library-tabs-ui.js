/**
 * 新手导读（文件：60-library-tabs-ui.js）
 *
 * 负责什么：这是“资料库与角色卡界面”中的“资料库、标签页、界面”部分。
 * 在程序中的位置：它缓存常用页面元素，并渲染本地角色、公共角色和对应操作。
 * 从哪里开始看：主要从 `setActiveTab(tab)`、`getLibraryTabElements(无参数)`、`setLibraryTabGridVisibility(elements, showMy)`、`setLibraryTabButtonActive(button, active)`、`wireLibraryTabButtons(无参数)`、`wireLibraryTabButton(button, tab)`，以及另外 3 个内部步骤 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：渲染函数可能反复运行；事件绑定和临时元素要避免重复创建。
 */
// ==================== Library Tabs UI ====================
var LIBRARY_TAB_ACTIVE_CLASSES = ['active', 'border-b-2', 'border-amber-500', 'text-amber-400'];

function setActiveTab(tab) {
    activeLibraryTab = tab;
    var elements = getLibraryTabElements();
    var showMy = tab === 'my';

    setLibraryTabGridVisibility(elements, showMy);
    setLibraryTabButtonActive(elements.tabMy, showMy);
    setLibraryTabButtonActive(elements.tabPub, !showMy);
}

function getLibraryTabElements() {
    return {
        myGrid: document.getElementById('myCardsGrid'),
        pubGrid: document.getElementById('publicCardsGrid'),
        tabMy: document.getElementById('tabMy'),
        tabPub: document.getElementById('tabPublic')
    };
}

function setLibraryTabGridVisibility(elements, showMy) {
    if (elements.myGrid) elements.myGrid.classList.toggle('hidden', !showMy);
    if (elements.pubGrid) elements.pubGrid.classList.toggle('hidden', showMy);
}

function setLibraryTabButtonActive(button, active) {
    if (!button) return;
    LIBRARY_TAB_ACTIVE_CLASSES.forEach(function(cls) {
        button.classList.toggle(cls, !!active);
    });
}

function wireLibraryTabButtons() {
    var elements = getLibraryTabElements();
    wireLibraryTabButton(elements.tabMy, 'my');
    wireLibraryTabButton(elements.tabPub, 'public');
}

function wireLibraryTabButton(button, tab) {
    if (!button || button._wired) return;
    button._wired = true;
    button.addEventListener('click', function() {
        setActiveTab(tab);
    });
}

function syncLibraryFilterButtons() {
    document.querySelectorAll('#libraryView [data-filter]').forEach(function(button) {
        syncLibraryFilterButton(button);
    });
}

function syncLibraryFilterButton(button) {
    var active = button.dataset.filter === libraryFilter;
    button.classList.toggle('bg-amber-500/20', active);
    button.classList.toggle('text-amber-300', active);
}

function syncLibrarySearchInput() {
    var libSearchSync = document.getElementById('librarySearch');
    if (libSearchSync) libSearchSync.value = librarySearchQuery || '';
}
