// ==================== World Book Entry Actions ====================
function addNewWIEntry() {
    var wi = getActiveWI();
    var uid = Date.now();
    var entry = createDefaultWIEntry(uid);
    wi.entries[String(uid)] = entry;
    wiState.dirty = true;
    updateWIDirtyIndicator();
    renderWIEntryList(dom.wiSearch.value.trim());
    selectWIEntry(uid);
}

function duplicateCurrentEntry() {
    if (!wiState.selectedUid) return;
    var wi = getActiveWI();
    var src = wi.entries[wiState.selectedUid];
    if (!src) return;
    var copy = JSON.parse(JSON.stringify(src));
    copy.uid = Date.now();
    copy.comment = (src.comment || 'Entry') + ' (copy)';
    wi.entries[String(copy.uid)] = copy;
    wiState.dirty = true;
    updateWIDirtyIndicator();
    renderWIEntryList(dom.wiSearch.value.trim());
    selectWIEntry(copy.uid);
}

async function deleteCurrentEntry() {
    if (!wiState.selectedUid) return;
    if (!await showGlassConfirm('\u5220\u9664\u5f53\u524d\u6761\u76ee\uff1f', { title: '\u5220\u9664\u4e16\u754c\u4e66\u6761\u76ee', danger: true, okText: '\u5220\u9664' })) return;
    var wi = getActiveWI();
    delete wi.entries[wiState.selectedUid];
    wiState.dirty = true;
    updateWIDirtyIndicator();
    wiState.selectedUid = null;
    renderWIEntryList(dom.wiSearch.value.trim());
    showNoSelection();
}

async function deleteAllWIEntries() {
    if (!await showGlassConfirm(t('world_book_confirm_delete_all'), { title: '\u5220\u9664\u5168\u90e8\u6761\u76ee', danger: true, okText: '\u5220\u9664' })) return;
    var wi = getActiveWI();
    wi.entries = {};
    wiState.selectedUid = null;
    wiState.dirty = true;
    updateWIDirtyIndicator();
    renderWIEntryList('');
    showNoSelection();
}

async function deleteWorldBook(wbId) {
    if (!wbId || !state.worldBooks || !state.worldBooks[wbId]) return;

    var msg = t('world_book_confirm_delete_book') || '确定彻底删除这个世界书？此操作不可撤销。关联到此世界书的对话将自动解除关联。';
    if (!await showGlassConfirm(msg, { title: '\u5220\u9664\u4e16\u754c\u4e66', danger: true, okText: '\u5220\u9664' })) return;

    delete state.worldBooks[wbId];

    if (state.conversations) {
        Object.values(state.conversations).forEach(function(conv) {
            if (conv && Array.isArray(conv.worldBookIds)) {
                conv.worldBookIds = conv.worldBookIds.filter(function(id) { return id !== wbId; });
            }
        });
    }

    if (wiState.currentWorldBookId === wbId) {
        wiState.currentWorldBookId = null;
        wiState.viewMode = 'books';
        wiState.selectedUid = null;
    }

    wiState.dirty = true;
    updateWIDirtyIndicator();
    persistState(true);
    if (typeof updateStorageInfo === 'function') updateStorageInfo();
    renderWorldInfoBadge();

    var filter = (dom.wiSearch && dom.wiSearch.value) ? dom.wiSearch.value.trim() : '';
    renderWorldBookList(filter);
    updateWorldBookModalHeader();
}

function selectWIEntry(uid) {
    wiState.selectedUid = String(uid);
    var entry = getActiveWI().entries[wiState.selectedUid];
    fillEditorFromEntry(entry);
}
