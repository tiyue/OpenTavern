/**
 * 新手导读（文件：71-event-library-bindings.js）
 *
 * 负责什么：这是“页面事件绑定”中的“事件、资料库、事件绑定”部分。
 * 在程序中的位置：它把按钮、输入框、快捷键和侧边栏操作连接到对应业务函数。
 * 从哪里开始看：主要从 `bindLibraryEvents(无参数)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：绑定前要确认元素存在；动态创建的元素通常需要事件委托。
 */
// ==================== Library Event Bindings ====================
function bindLibraryEvents() {
    wireLibraryTabButtons();

    var libSearch = document.getElementById('librarySearch');
    if (libSearch) {
        libSearch.oninput = function() {
            librarySearchQuery = libSearch.value;
            if (typeof renderLibraryGrids === 'function') renderLibraryGrids();
        };
    }

    var backButton = document.getElementById('publicSeriesBackBtn');
    if (backButton) backButton.addEventListener('click', backToPublicSeriesList);

    var filterToggle = document.getElementById('academyFilterToggle');
    var filterMenu = document.getElementById('academyFilterMenu');
    if (filterToggle && filterMenu) {
        filterToggle.addEventListener('click', function(event) {
            event.stopPropagation();
            var opening = filterMenu.classList.contains('hidden');
            filterMenu.classList.toggle('hidden', !opening);
            filterToggle.setAttribute('aria-expanded', opening ? 'true' : 'false');
        });
        filterMenu.addEventListener('click', function(event) { event.stopPropagation(); });
        document.addEventListener('click', closeAcademyFilterMenu);
    }
}
