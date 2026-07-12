/**
 * 新手导读（文件：43-worldbook-global-list-actions.js）
 *
 * 负责什么：这是“世界书编辑界面”中的“世界书、全局、列表、操作”部分。
 * 在程序中的位置：它把世界书和条目显示成表单、列表与按钮，并响应用户编辑。
 * 从哪里开始看：主要从 `openWorldBookFromList(wb)`、`unlinkWorldBookFromCurrentConversation(wbId)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：界面修改后要同步回数据模型并持久化，否则刷新页面会丢失更改。
 */
// ==================== World Book Global List Actions ====================
function openWorldBookFromList(wb) {
    wiState.currentWorldBookId = wb.id;
    wiState.viewMode = 'entries';
    wiState.selectedUid = null;
    dom.wiBookName.value = wb.name || '';
    renderWIEntryList(dom.wiSearch.value.trim());
    updateWorldBookModalHeader();
}

function unlinkWorldBookFromCurrentConversation(wbId) {
    var currentConv = getActiveConv();
    if (!currentConv) return;
    currentConv.worldBookIds = (currentConv.worldBookIds || []).filter(function(id) { return id !== wbId; });
    wiState.dirty = true;
    updateWIDirtyIndicator();
    persistState(true);
    renderWorldInfoBadge();
    renderWorldBookList(getCurrentWorldBookFilter());
}
