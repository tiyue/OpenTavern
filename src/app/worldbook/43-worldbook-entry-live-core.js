/**
 * 新手导读（文件：43-worldbook-entry-live-core.js）
 *
 * 负责什么：这是“世界书编辑界面”中的“世界书、条目、即时编辑、核心逻辑”部分。
 * 在程序中的位置：它把世界书和条目显示成表单、列表与按钮，并响应用户编辑。
 * 从哪里开始看：主要从 `getSelectedWorldBookEntry(无参数)`、`setWorldBookEntryPathValue(entry, path, value)`、`syncWorldBookEntryExtensionField(entry, prop, value)`、`markWorldBookEntryDirtyAndRenderList(无参数)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：界面修改后要同步回数据模型并持久化，否则刷新页面会丢失更改。
 */
// ==================== World Book Entry Live Binding Core ====================
function getSelectedWorldBookEntry() {
    if (!wiState.selectedUid) return null;
    var wi = getActiveWI();
    return wi && wi.entries ? wi.entries[wiState.selectedUid] : null;
}

function setWorldBookEntryPathValue(entry, path, value) {
    if (!entry || !path) return;
    if (path.indexOf('.') > -1) {
        var parts = path.split('.');
        if (!entry[parts[0]]) entry[parts[0]] = {};
        entry[parts[0]][parts[1]] = value;
    } else {
        entry[path] = value;
    }
}

function syncWorldBookEntryExtensionField(entry, prop, value) {
    if (!entry || !entry.extensions) return;
    if (prop === 'position' || prop === 'depth' || prop === 'role' || prop === 'probability') {
        entry.extensions[prop] = value;
    }
}

function markWorldBookEntryDirtyAndRenderList() {
    wiState.dirty = true;
    renderWIEntryList(dom.wiSearch.value.trim());
}
