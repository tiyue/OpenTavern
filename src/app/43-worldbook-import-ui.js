/**
 * 新手导读（文件：43-worldbook-import-ui.js）
 *
 * 负责什么：这是“世界书编辑界面”中的“世界书、导入、界面”部分。
 * 在程序中的位置：它把世界书和条目显示成表单、列表与按钮，并响应用户编辑。
 * 从哪里开始看：主要从 `handleWIFileImport(e)`、`importWorldInfoAsNewBook(normalized)`、`importWorldInfoIntoCurrentBook(normalized)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：界面修改后要同步回数据模型并持久化，否则刷新页面会丢失更改。
 */
// ==================== World Book Import UI ====================
function handleWIFileImport(e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(ev) {
        try {
            var json = JSON.parse(ev.target.result);
            var normalized = normalizeImportedWorldInfo(json);

            if (wiState.viewMode === 'books' || !wiState.currentWorldBookId) {
                importWorldInfoAsNewBook(normalized);
            } else {
                importWorldInfoIntoCurrentBook(normalized);
            }
        } catch (err) {
            alert('\u5bfc\u5165\u5931\u8d25: ' + err.message);
        }
        if (dom.wiImportFile) dom.wiImportFile.value = '';
    };
    reader.readAsText(file);
}

function importWorldInfoAsNewBook(normalized) {
    var newBook = createNewWorldBook(normalized.name || 'Imported World Book');
    newBook.entries = normalized.entries;
    if (normalized.name) newBook.name = normalized.name;

    wiState.currentWorldBookId = newBook.id;
    wiState.viewMode = 'entries';
    wiState.dirty = true;
    updateWIDirtyIndicator();

    if (dom.wiBookName) dom.wiBookName.value = newBook.name;
    if (dom.wiSearch) dom.wiSearch.value = '';

    renderWIEntryList('');
    showNoSelection();
    updateWorldBookModalHeader();
    renderWorldInfoBadge();
    persistState(true);

    alert('\u5df2\u4f5c\u4e3a\u65b0\u4e16\u754c\u4e66\u5bfc\u5165\uff08' + Object.keys(newBook.entries).length + ' \u6761\u76ee\uff09');
}

function importWorldInfoIntoCurrentBook(normalized) {
    var wi = getActiveWI();
    wi.entries = normalized.entries;
    if (normalized.name) {
        wi.name = normalized.name;
        if (dom.wiBookName) dom.wiBookName.value = normalized.name;
    }
    wiState.dirty = true;
    updateWIDirtyIndicator();

    if (dom.wiSearch) dom.wiSearch.value = '';
    renderWIEntryList('');
    showNoSelection();
    renderWorldInfoBadge();
    persistState(true);
    alert('\u4e16\u754c\u4e66\u5bfc\u5165\u6210\u529f\uff08' + Object.keys(wi.entries).length + ' \u6761\u76ee\uff09');
}
