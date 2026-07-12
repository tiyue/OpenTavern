/**
 * 新手导读（文件：43-worldbook-entry-live-scalar.js）
 *
 * 负责什么：这是“世界书编辑界面”中的“世界书、条目、即时编辑、普通字段”部分。
 * 在程序中的位置：它把世界书和条目显示成表单、列表与按钮，并响应用户编辑。
 * 从哪里开始看：主要从 `bindWIEntryLiveInput(id, prop, isNum)`、`bindWorldBookEntryScalarFields(无参数)`、`bindWorldBookEntryContentField(无参数)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：界面修改后要同步回数据模型并持久化，否则刷新页面会丢失更改。
 */
// ==================== World Book Entry Scalar Field Bindings ====================
function bindWIEntryLiveInput(id, prop, isNum) {
    var el = dom[id];
    if (!el) return;
    el.addEventListener('input', function() {
        var entry = getSelectedWorldBookEntry();
        if (!entry) return;
        var val = isNum ? (parseInt(this.value, 10) || 0) : this.value;
        entry[prop] = val;
        syncWorldBookEntryExtensionField(entry, prop, val);
        markWorldBookEntryDirtyAndRenderList();
    });
}

function bindWorldBookEntryScalarFields() {
    bindWIEntryLiveInput('wiComment', 'comment');
    bindWIEntryLiveInput('wiOrder', 'order', true);
    bindWIEntryLiveInput('wiAutomationId', 'automationId');
    bindWIEntryLiveInput('wiGroup', 'group');
    bindWIEntryLiveInput('wiGroupWeight', 'groupWeight', true);
    bindWIEntryLiveInput('wiOutletName', 'outletName');
    bindWIEntryLiveInput('wiDepth', 'depth', true);
    bindWIEntryLiveInput('wiSticky', 'sticky', true);
    bindWIEntryLiveInput('wiCooldown', 'cooldown', true);
    bindWIEntryLiveInput('wiDelay', 'delay', true);
    bindWIEntryLiveInput('wiScanDepth', 'scanDepth', true);
}

function bindWorldBookEntryContentField() {
    if (dom.wiContent) {
        dom.wiContent.addEventListener('input', function() {
            var entry = getSelectedWorldBookEntry();
            if (!entry) return;
            entry.content = this.value;
            wiState.dirty = true;
            updateWIDirtyIndicator();
        });
    }
}
