/**
 * 新手导读（文件：43-worldbook-entry-list-delete-ui.js）
 *
 * 负责什么：这是“世界书编辑界面”中的“世界书、条目、列表、删除、界面”部分。
 * 在程序中的位置：它把世界书和条目显示成表单、列表与按钮，并响应用户编辑。
 * 从哪里开始看：主要从 `appendDeleteWorldBookRow(container)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：界面修改后要同步回数据模型并持久化，否则刷新页面会丢失更改。
 */
// ==================== World Book Entry List Delete UI ====================
function appendDeleteWorldBookRow(container) {
    var delBookRow = document.createElement('div');
    delBookRow.className = 'px-2 py-1 text-xs';
    delBookRow.innerHTML = `
        <button class="px-2 py-0.5 text-[10px] rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 w-full text-left">${t('world_book_delete_book') || 'Delete world book'}</button>
    `;
    delBookRow.querySelector('button').addEventListener('click', function() {
        if (wiState.currentWorldBookId) {
            deleteWorldBook(wiState.currentWorldBookId);
        }
    });
    container.appendChild(delBookRow);
}
