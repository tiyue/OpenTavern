/**
 * 新手导读（文件：43-worldbook-entry-list-association-ui.js）
 *
 * 负责什么：这是“世界书编辑界面”中的“世界书、条目、列表、关联、界面”部分。
 * 在程序中的位置：它把世界书和条目显示成表单、列表与按钮，并响应用户编辑。
 * 从哪里开始看：主要从 `refreshWorldBookEntryAssociationViews(无参数)`、`appendWorldBookAssociationRow(container)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：界面修改后要同步回数据模型并持久化，否则刷新页面会丢失更改。
 */
// ==================== World Book Entry List Association UI ====================
function refreshWorldBookEntryAssociationViews() {
    wiState.dirty = true;
    updateWIDirtyIndicator();
    persistState(true);
    renderWorldInfoBadge();
    renderWorldBookList(getCurrentWorldBookFilter());
    renderWIEntryList(getCurrentWorldBookFilter());
}

function appendWorldBookAssociationRow(container) {
    var currentConv = getActiveConv();
    var linked = currentConv && Array.isArray(currentConv.worldBookIds) && currentConv.worldBookIds.includes(wiState.currentWorldBookId);
    var assocRow = document.createElement('div');
    assocRow.className = 'px-2 py-1 mb-2 text-xs flex items-center gap-2';

    if (linked) {
        assocRow.innerHTML = `
            <span class="text-emerald-400">&#10003; ${t('world_book_linked')}</span>
            <button class="px-2 py-0.5 text-[10px] rounded bg-red-500/10 text-red-400 hover:bg-red-500/20">${t('world_book_unlink')}</button>
        `;
        assocRow.querySelector('button').addEventListener('click', function() {
            if (!currentConv) return;
            currentConv.worldBookIds = (currentConv.worldBookIds || []).filter(id => id !== wiState.currentWorldBookId);
            refreshWorldBookEntryAssociationViews();
        });
    } else {
        assocRow.innerHTML = `
            <button class="px-2 py-0.5 text-[10px] rounded bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20">${t('world_book_link_to_current')}</button>
        `;
        assocRow.querySelector('button').addEventListener('click', function() {
            if (!currentConv) return;
            currentConv.worldBookIds = currentConv.worldBookIds || [];
            if (!currentConv.worldBookIds.includes(wiState.currentWorldBookId)) {
                currentConv.worldBookIds.push(wiState.currentWorldBookId);
            }
            refreshWorldBookEntryAssociationViews();
        });
    }

    container.appendChild(assocRow);
}
