/**
 * 新手导读（文件：71-event-character-data-bindings.js）
 *
 * 负责什么：这是“页面事件绑定”中的“事件、角色、数据、事件绑定”部分。
 * 在程序中的位置：它把按钮、输入框、快捷键和侧边栏操作连接到对应业务函数。
 * 从哪里开始看：主要从 `bindCharacterAndDataEvents(无参数)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：绑定前要确认元素存在；动态创建的元素通常需要事件委托。
 */
// ==================== Character and Data Event Bindings ====================
function bindCharacterAndDataEvents() {
    dom.charCreateBtn.addEventListener('click', openCharacterEditor);

    dom.charImportBtn.addEventListener('click', function() {
        dom.importModal.classList.remove('hidden');
        dom.importStatus.classList.add('hidden');
        dom.importFileInput.value = '';
    });

    dom.charEditBtn.addEventListener('click', openCharacterEditor);
    dom.charEditorCloseBtn.addEventListener('click', function() { dom.charEditorModal.classList.add('hidden'); });
    dom.charEditorBackdrop.addEventListener('click', function() { dom.charEditorModal.classList.add('hidden'); });
    dom.charEditorCancelBtn.addEventListener('click', function() { dom.charEditorModal.classList.add('hidden'); });
    dom.charEditorSaveBtn.addEventListener('click', saveCharacterEdits);
    if (dom.charEditRegexEnabled && dom.charEditRegexPromptEnabled) {
        dom.charEditRegexEnabled.addEventListener('change', function() {
            dom.charEditRegexPromptEnabled.disabled = !dom.charEditRegexEnabled.checked;
            if (!dom.charEditRegexEnabled.checked) dom.charEditRegexPromptEnabled.checked = false;
        });
    }

    dom.exportAllBtn.addEventListener('click', exportAllConversations);

    dom.importConvBtn.addEventListener('click', function() { dom.convImportFile.click(); });
    dom.convImportFile.addEventListener('change', function(e) {
        var file = e.target.files[0];
        if (file) importConversations(file);
        dom.convImportFile.value = '';
    });

    dom.charRemoveBtn.addEventListener('click', removeCharacter);
    dom.charExportBtn.addEventListener('click', openCharacterExportFormats);
    dom.worldBookBtn.addEventListener('click', openWorldBookModal);
}
