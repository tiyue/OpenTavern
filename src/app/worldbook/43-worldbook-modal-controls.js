/**
 * 新手导读（文件：43-worldbook-modal-controls.js）
 *
 * 负责什么：这是“世界书编辑界面”中的“世界书、弹窗、控件”部分。
 * 在程序中的位置：它把世界书和条目显示成表单、列表与按钮，并响应用户编辑。
 * 从哪里开始看：主要从 `bindWorldBookModalControls(无参数)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：界面修改后要同步回数据模型并持久化，否则刷新页面会丢失更改。
 */
// ==================== World Book Modal Controls ====================
function bindWorldBookModalControls() {
    dom.wiSearch.addEventListener('input', function() {
        renderWIEntryList(this.value.trim());
    });

    dom.wiBookName.addEventListener('input', function() {
        var wi = getActiveWI();
        wi.name = this.value;
        wiState.dirty = true;
        updateWIDirtyIndicator();
    });

    dom.wiCloseBtn.addEventListener('click', closeWorldBookModal);
    dom.worldBookBackdrop.addEventListener('click', closeWorldBookModal);
    dom.wiAddEntryBtn.addEventListener('click', addNewWIEntry);

    if (dom.wiNewBookBtn) {
        dom.wiNewBookBtn.addEventListener('click', function() {
            const newBook = createNewWorldBook('新建世界书');
            wiState.currentWorldBookId = newBook.id;
            wiState.viewMode = 'entries';
            wiState.dirty = true;
            updateWIDirtyIndicator();
            dom.wiBookName.value = newBook.name;
            renderWIEntryList('');
            showNoSelection();
            updateWorldBookModalHeader();
            persistState(true);
        });
    }

    dom.wiImportBtn.addEventListener('click', function() {
        if (dom.wiImportFile) {
            dom.wiImportFile.click();
        } else {
            console.error('wiImportFile element not found in DOM cache');
        }
    });
    dom.wiExportBtn.addEventListener('click', exportCurrentWorldInfo);
    dom.wiDeleteAllBtn.addEventListener('click', deleteAllWIEntries);

    if (dom.wiImportFile) {
        dom.wiImportFile.addEventListener('change', handleWIFileImport);
    } else {
        console.warn('wiImportFile not cached, import will not work');
    }
}
