/**
 * 新手导读（文件：43-worldbook-entry-trigger-bindings.js）
 *
 * 负责什么：这是“世界书编辑界面”中的“世界书、条目、触发条件、事件绑定”部分。
 * 在程序中的位置：它把世界书和条目显示成表单、列表与按钮，并响应用户编辑。
 * 从哪里开始看：主要从 `bindWorldBookEntryKeywordControls(无参数)`、`bindWorldBookEntryTriggerControls(无参数)`、`bindWorldBookCharacterFilterControls(无参数)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：界面修改后要同步回数据模型并持久化，否则刷新页面会丢失更改。
 */
// ==================== World Book Entry Keyword & Trigger Bindings ====================
function bindWorldBookEntryKeywordControls() {
    dom.wiAddKeyBtn.addEventListener('click', function() {
        addWIKeyFromInput(true);
    });
    dom.wiKeyInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            addWIKeyFromInput(true);
        }
    });
    dom.wiAddSecBtn.addEventListener('click', function() {
        addWIKeyFromInput(false);
    });
    dom.wiSecInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            addWIKeyFromInput(false);
        }
    });

    dom.wiDuplicateBtn.addEventListener('click', duplicateCurrentEntry);
    dom.wiDeleteEntryBtn.addEventListener('click', deleteCurrentEntry);
}

function bindWorldBookEntryTriggerControls() {
    document.getElementById('wiEditorForm').addEventListener('change', function(e) {
        if (!e.target.classList.contains('wi-trigger') || !wiState.selectedUid) return;
        var entry = getActiveWI().entries[wiState.selectedUid];
        if (!entry.triggers) entry.triggers = [];
        var val = e.target.value;
        if (e.target.checked) {
            if (entry.triggers.indexOf(val) === -1) entry.triggers.push(val);
        } else {
            entry.triggers = entry.triggers.filter(function(v) { return v !== val; });
        }
        wiState.dirty = true;
    });
}

function bindWorldBookCharacterFilterControls() {
    if (dom.wiCharNames) {
        dom.wiCharNames.addEventListener('input', function() {
            if (!wiState.selectedUid) return;
            var entry = getActiveWI().entries[wiState.selectedUid];
            var cf = entry.characterFilter || (entry.characterFilter = { isExclude: false, names: [], tags: [] });
            cf.names = (this.value || '').split(',').map(function(s){return s.trim();}).filter(Boolean);
            wiState.dirty = true;
        });
    }
    if (dom.wiCharTags) {
        dom.wiCharTags.addEventListener('input', function() {
            if (!wiState.selectedUid) return;
            var entry = getActiveWI().entries[wiState.selectedUid];
            var cf = entry.characterFilter || (entry.characterFilter = { isExclude: false, names: [], tags: [] });
            cf.tags = (this.value || '').split(',').map(function(s){return s.trim();}).filter(Boolean);
            wiState.dirty = true;
        });
    }
}
