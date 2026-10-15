/**
 * 新手导读（文件：43-worldbook-entry-actions.js）
 *
 * 负责什么：这是“世界书编辑界面”中的“世界书、条目、操作”部分。
 * 在程序中的位置：它把世界书和条目显示成表单、列表与按钮，并响应用户编辑。
 * 从哪里开始看：主要从 `addNewWIEntry(无参数)`、`duplicateCurrentEntry(无参数)`、`deleteCurrentEntry(无参数)`、`deleteAllWIEntries(无参数)`、`deleteWorldBook(wbId)`、`selectWIEntry(uid)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：界面修改后要同步回数据模型并持久化，否则刷新页面会丢失更改。
 */
// ==================== World Book Entry Actions ====================
function addNewWIEntry() {
    var wi = getActiveWI();
    var uid = Date.now();
    var entry = createDefaultWIEntry(uid);
    wi.entries[String(uid)] = entry;
    markWIEntryActionDirtyAndRender();
    selectWIEntry(uid);
}

function duplicateCurrentEntry() {
    if (!wiState.selectedUid) return;
    var wi = getActiveWI();
    var src = wi.entries[wiState.selectedUid];
    if (!src) return;
    var copy = createDuplicateWIEntry(src, Date.now());
    wi.entries[String(copy.uid)] = copy;
    markWIEntryActionDirtyAndRender();
    selectWIEntry(copy.uid);
}

async function deleteCurrentEntry() {
    if (!wiState.selectedUid) return;
    if (!await showGlassConfirm('\u5220\u9664\u5f53\u524d\u6761\u76ee\uff1f', { title: '\u5220\u9664\u4e16\u754c\u4e66\u6761\u76ee', danger: true, okText: '\u5220\u9664' })) return;
    var wi = getActiveWI();
    delete wi.entries[wiState.selectedUid];
    wiState.selectedUid = null;
    markWIEntryActionDirtyAndRender();
    showNoSelection();
}

async function deleteAllWIEntries() {
    if (!await showGlassConfirm(t('world_book_confirm_delete_all'), { title: '\u5220\u9664\u5168\u90e8\u6761\u76ee', danger: true, okText: '\u5220\u9664' })) return;
    var wi = getActiveWI();
    wi.entries = {};
    wiState.selectedUid = null;
    markWIEntryActionDirtyAndRender('');
    showNoSelection();
}

async function deleteWorldBook(wbId) {
    if (!wbId || !state.worldBooks || !state.worldBooks[wbId]) return;

    var msg = t('world_book_confirm_delete_book') || '确定彻底删除这个世界书？此操作不可撤销。关联到此世界书的对话将自动解除关联。';
    if (!await showGlassConfirm(msg, { title: '\u5220\u9664\u4e16\u754c\u4e66', danger: true, okText: '\u5220\u9664' })) return;

    delete state.worldBooks[wbId];
    unlinkWorldBookFromConversations(wbId);
    resetWorldBookSelectionAfterDelete(wbId);
    refreshWorldBookDeleteViews();
}

function selectWIEntry(uid) {
    wiState.selectedUid = String(uid);
    var entry = getActiveWI().entries[wiState.selectedUid];
    fillEditorFromEntry(entry);
}
