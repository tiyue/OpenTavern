/**
 * 新手导读（文件：43-worldbook-list-ui.js）
 *
 * 负责什么：这是“世界书编辑界面”中的“世界书、列表、界面”部分。
 * 在程序中的位置：它把世界书和条目显示成表单、列表与按钮，并响应用户编辑。
 * 从哪里开始看：主要从 `renderWIEntryList(filter)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：界面修改后要同步回数据模型并持久化，否则刷新页面会丢失更改。
 */
// 世界书列表界面：过滤、排序并渲染当前世界书的条目列表。
function renderWIEntryList(filter) {
    var container = dom.wiEntryList;
    if (!container) return;
    container.innerHTML = '';

    if (wiState.viewMode === 'books' || !wiState.currentWorldBookId) {
        renderWorldBookList(filter);
        return;
    }

    var wi = getActiveWI();
    if (!wi) {
        container.innerHTML = '<p class="text-xs text-zinc-500 p-2">' + t('world_book_select_or_create') + '</p>';
        return;
    }

    var entries = getFilteredWorldInfoEntries(wi, filter);
    appendWorldBookEntryListHeader(container);

    if (entries.length === 0) {
        renderWorldBookEntryListEmpty(container);
        return;
    }

    entries.forEach(function(entry) {
        container.appendChild(createWorldBookEntryListRow(entry, wi));
    });

    if (wiState.viewMode !== 'books') {
        dom.wiEntryStats.textContent = entries.length + ' ' + t('world_book_entry');
    }
}
