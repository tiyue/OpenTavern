/**
 * 新手导读（文件：43-worldbook-entry-action-helpers.js）
 *
 * 负责什么：这是“世界书编辑界面”中的“世界书、条目、操作、辅助函数”部分。
 * 在程序中的位置：它把世界书和条目显示成表单、列表与按钮，并响应用户编辑。
 * 从哪里开始看：主要从 `getWIEntryActionFilter(无参数)`、`markWIEntryActionDirtyAndRender(filter)`、`createDuplicateWIEntry(src, uid)`、`unlinkWorldBookFromConversations(wbId)`、`resetWorldBookSelectionAfterDelete(wbId)`、`refreshWorldBookDeleteViews(无参数)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：界面修改后要同步回数据模型并持久化，否则刷新页面会丢失更改。
 */
// ==================== World Book Entry Action Helpers ====================
function getWIEntryActionFilter() {
    return (dom.wiSearch && dom.wiSearch.value) ? dom.wiSearch.value.trim() : '';
}

function markWIEntryActionDirtyAndRender(filter) {
    wiState.dirty = true;
    updateWIDirtyIndicator();
    renderWIEntryList(filter != null ? filter : getWIEntryActionFilter());
}

function createDuplicateWIEntry(src, uid) {
    var copy = JSON.parse(JSON.stringify(src));
    copy.uid = uid;
    copy.comment = (src.comment || 'Entry') + ' (copy)';
    return copy;
}

function unlinkWorldBookFromConversations(wbId) {
    if (!state.conversations) return;
    Object.values(state.conversations).forEach(function(conv) {
        if (conv && Array.isArray(conv.worldBookIds)) {
            conv.worldBookIds = conv.worldBookIds.filter(function(id) { return id !== wbId; });
        }
    });
}

function resetWorldBookSelectionAfterDelete(wbId) {
    if (wiState.currentWorldBookId !== wbId) return;
    wiState.currentWorldBookId = null;
    wiState.viewMode = 'books';
    wiState.selectedUid = null;
}

function refreshWorldBookDeleteViews() {
    wiState.dirty = true;
    updateWIDirtyIndicator();
    persistState(true);
    if (typeof updateStorageInfo === 'function') updateStorageInfo();
    renderWorldInfoBadge();
    renderWorldBookList(getWIEntryActionFilter());
    updateWorldBookModalHeader();
}
